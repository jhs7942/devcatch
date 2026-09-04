import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import type { Article, EmbeddedArticle, InterestEmbedding } from './types.js'

export type EmbeddingConfig = {
    apiKey: string
    model: string
    dimensions: number
    cachePath: string
    timeoutMs: number
}
type TaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT'
const vectorSchema = z.array(z.number().finite()).min(1)
const cacheSchema = z.object({
    version: z.literal(1),
    entries: z.record(z.string(), vectorSchema),
})
type Cache = z.infer<typeof cacheSchema>

/**
 * 관심사와 기사 벡터를 조회하거나 생성하고 JSON 캐시에 저장합니다.
 * @param articles - 최신성·미발송 조건을 통과한 기사 배열입니다.
 * @param keywords - 관심 키워드 또는 관심사 문장 배열입니다.
 * @param config - Gemini API 및 캐시 설정입니다.
 * @param request - 테스트에서 대체할 수 있는 HTTP 요청 함수입니다.
 * @returns 기사 벡터와 관심사별 벡터를 반환합니다.
 * @throws 캐시 손상, API 오류, 잘못된 벡터 또는 파일 쓰기 실패 시 예외를 던집니다.
 */
export async function createEmbeddings(
    articles: readonly Article[],
    keywords: readonly string[],
    config: EmbeddingConfig,
    request: typeof fetch = fetch
): Promise<{ articles: EmbeddedArticle[]; interests: InterestEmbedding[] }> {
    if (!articles.length) return { articles: [], interests: [] }
    const cache = await loadCache(config.cachePath)
    const activeEntries: Cache['entries'] = {}
    let hits = 0
    let generated = 0

    /**
     * 입력 내용과 모델 설정이 동일하면 저장된 벡터를 재사용합니다.
     * @param text - 벡터화할 텍스트입니다.
     * @param taskType - 검색 질의 또는 검색 대상 문서 역할입니다.
     * @returns 검증된 벡터를 반환합니다.
     * @throws API 또는 캐시 저장 실패 시 예외를 던집니다.
     */
    async function getVector(text: string, taskType: TaskType): Promise<number[]> {
        const key = createHash('sha256').update(JSON.stringify({
            version: 1, model: config.model, dimensions: config.dimensions, taskType, text,
        })).digest('hex')
        let vector = cache.entries[key]
        if (vector) {
            validateVector(vector, config.dimensions)
            hits++
        } else {
            vector = await embedText(text, taskType, config, request)
            cache.entries[key] = vector
            generated++
            // 뒤의 API 호출이 실패해도 이미 생성한 벡터는 다음 실행에서 재사용합니다.
            await saveCache(config.cachePath, cache)
        }
        activeEntries[key] = vector
        return vector
    }

    const interests: InterestEmbedding[] = []
    for (const keyword of [...new Set(keywords.map((value) => value.trim()).filter(Boolean))]) {
        interests.push({
            keyword,
            vector: await getVector(
                `개발 관심사: ${keyword}. 이 주제의 실무 구현, 성능 개선, 문제 해결을 다루는 기술 문서.`,
                'RETRIEVAL_QUERY'
            ),
        })
    }
    if (!interests.length) throw new Error('관심 키워드가 비어 있습니다.')
    const embeddedArticles: EmbeddedArticle[] = []
    for (const article of articles) {
        embeddedArticles.push({
            article,
            vector: await getVector(
                `제목: ${article.title.slice(0, 500)}\n요약: ${article.summary.slice(0, 3500)}`,
                'RETRIEVAL_DOCUMENT'
            ),
        })
    }
    // 현재 후보·관심사만 보존해 오래된 기사 벡터가 계속 쌓이지 않게 합니다.
    await saveCache(config.cachePath, { version: 1, entries: activeEntries })
    console.info(`[DevCatch] 임베딩 캐시 적중 ${hits}건, 신규 생성 ${generated}건`)
    return { articles: embeddedArticles, interests }
}

/**
 * Gemini REST API로 벡터를 생성하며 429·5xx 응답만 최대 두 번 재시도합니다.
 * @param text - 입력 텍스트입니다.
 * @param taskType - 벡터의 검색 역할입니다.
 * @param config - 모델·차원·인증·시간 제한 설정입니다.
 * @param request - HTTP 요청 함수입니다.
 * @returns 지정 차원의 유한한 비영벡터를 반환합니다.
 * @throws HTTP 실패, 시간 초과, 잘못된 API 응답 시 비밀값 없는 오류를 던집니다.
 */
async function embedText(
    text: string, taskType: TaskType, config: EmbeddingConfig, request: typeof fetch
): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:embedContent`
    for (let attempt = 0; attempt < 3; attempt++) {
        let response: Response
        try {
            response = await request(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
                body: JSON.stringify({
                    model: `models/${config.model}`,
                    content: { parts: [{ text }] },
                    taskType,
                    outputDimensionality: config.dimensions,
                }),
                signal: AbortSignal.timeout(config.timeoutMs),
            })
        } catch {
            throw new Error('Gemini 임베딩 요청이 실패했습니다. 연결 또는 요청 제한 시간을 확인하세요.')
        }
        if (!response.ok) {
            if (attempt < 2 && (response.status === 429 || response.status >= 500)) {
                await delay(1000 * 2 ** attempt)
                continue
            }
            throw new Error(`Gemini 임베딩 API 오류: HTTP ${response.status}`)
        }
        const payload = z.object({ embedding: z.object({ values: vectorSchema }) })
            .safeParse(await response.json())
        if (!payload.success) throw new Error('Gemini 임베딩 응답 형식이 올바르지 않습니다.')
        const vector = payload.data.embedding.values
        validateVector(vector, config.dimensions)
        return vector
    }
    throw new Error('Gemini 임베딩 재시도 횟수를 초과했습니다.')
}

/**
 * 벡터의 차원과 유효성을 확인합니다.
 * @param vector - 검사할 벡터입니다.
 * @param dimensions - 기대하는 벡터 차원입니다.
 * @returns 검증 성공 시 반환값이 없습니다.
 * @throws 차원 불일치, 비유한 수, 영벡터인 경우 예외를 던집니다.
 */
function validateVector(vector: number[], dimensions: number): void {
    if (vector.length !== dimensions || !vector.every(Number.isFinite) ||
        !vector.some((value) => value !== 0)) {
        throw new Error('임베딩 벡터가 요청한 차원 또는 유효성 조건과 다릅니다.')
    }
}

/**
 * 캐시를 검증하며 읽고, 최초 실행이면 빈 캐시를 만듭니다.
 * @param path - 캐시 JSON 경로입니다.
 * @returns 검증된 캐시입니다.
 * @throws 파일 없음 이외의 읽기·파싱 오류는 전파합니다.
 */
async function loadCache(path: string): Promise<Cache> {
    try {
        return cacheSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return { version: 1, entries: {} }
        }
        throw new Error('임베딩 캐시를 읽을 수 없습니다. 파일 권한과 JSON 형식을 확인하세요.', { cause: error })
    }
}

/**
 * 임시 파일 작성 후 교체해 중단 시 원본 캐시가 잘리는 것을 방지합니다.
 * @param path - 저장할 캐시 경로입니다.
 * @param cache - 저장할 캐시 객체입니다.
 * @returns 저장 완료 시 반환값이 없는 Promise입니다.
 * @throws 파일 쓰기·교체 오류를 전파합니다.
 */
async function saveCache(path: string, cache: Cache): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const temporaryPath = `${path}.tmp`
    await writeFile(temporaryPath, JSON.stringify(cache) + '\n', 'utf8')
    await rename(temporaryPath, path)
}
