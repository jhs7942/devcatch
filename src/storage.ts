import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { AppConfig } from './config.js'
import type { Article } from './types.js'

type HistoryConfig = AppConfig['history']

type SentArticle = {
    url: string
    sentAt: string
}

type SentArticleStore = {
    version: 1
    articles: Record<string, SentArticle>
}

/**
 * 저장소의 JSON 발송 이력을 읽어 이전에 보내지 않은 기사만 추립니다.
 *
 * @param articles - 중복 발송 여부를 확인할 기사 목록입니다.
 * @param historyConfig - JSON 발송 이력 파일 경로 설정입니다.
 * @returns 발송 이력이 없는 기사 목록을 반환합니다.
 * @throws 이력 파일을 읽을 수 없거나 JSON 형식이 잘못되면 예외를 던집니다.
 */
export async function excludeSentArticles(
    articles: readonly Article[],
    historyConfig: HistoryConfig
): Promise<Article[]> {
    const history = await loadHistory(historyConfig.filePath)

    return articles.filter((article) => !(getArticleId(article.url) in history.articles))
}

/**
 * Webhook 전송이 끝난 기사를 로컬 JSON 발송 이력에 기록합니다.
 * GitHub Actions는 변경된 이 파일을 저장소에 커밋해 다음 실행에서도 사용합니다.
 *
 * @param articles - 발송 완료로 처리할 기사 목록입니다.
 * @param historyConfig - JSON 발송 이력 파일 경로 설정입니다.
 * @returns 이력 파일 쓰기가 완료되면 반환값이 없는 Promise를 반환합니다.
 * @throws 이력 파일을 읽거나 쓸 수 없으면 예외를 던집니다.
 */
export async function markArticlesAsSent(
    articles: readonly Article[],
    historyConfig: HistoryConfig
): Promise<void> {
    const history = await loadHistory(historyConfig.filePath)
    const sentAt = new Date().toISOString()

    for (const article of articles) {
        history.articles[getArticleId(article.url)] = {
            url: article.url,
            sentAt,
        }
    }

    await writeHistory(historyConfig.filePath, history)
}

/**
 * 발송 이력 JSON 파일을 읽습니다. 파일이 아직 없으면 빈 이력을 반환합니다.
 *
 * @param filePath - JSON 발송 이력 파일 경로입니다.
 * @returns 파싱된 발송 이력을 반환합니다.
 * @throws 파일은 존재하지만 JSON 형식이 잘못되었으면 예외를 던집니다.
 */
async function loadHistory(filePath: string): Promise<SentArticleStore> {
    try {
        const contents = await readFile(filePath, 'utf8')
        const parsed: unknown = JSON.parse(contents)

        if (!isSentArticleStore(parsed)) {
            throw new Error(`발송 이력 파일 형식이 올바르지 않습니다: ${filePath}`)
        }

        return parsed
    } catch (error) {
        if (isFileNotFoundError(error)) {
            return createEmptyHistory()
        }

        throw error
    }
}

/**
 * 발송 이력을 JSON 파일로 저장합니다.
 *
 * @param filePath - 저장할 JSON 파일 경로입니다.
 * @param history - 저장할 발송 이력입니다.
 * @returns 디렉터리 생성과 파일 쓰기가 완료되면 반환값이 없는 Promise를 반환합니다.
 * @throws 파일 시스템 쓰기 권한이 없거나 저장에 실패하면 예외를 던집니다.
 */
async function writeHistory(filePath: string, history: SentArticleStore): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, `${JSON.stringify(history, null, 2)}\n`, 'utf8')
}

/**
 * 기사 URL을 발송 이력 객체의 안정적인 Key로 변환합니다.
 *
 * @param articleUrl - 정규화된 기사 URL입니다.
 * @returns URL의 SHA-256 해시 문자열을 반환합니다.
 */
function getArticleId(articleUrl: string): string {
    return createHash('sha256').update(articleUrl).digest('hex')
}

/**
 * 알 수 없는 JSON 값이 발송 이력 객체 형식인지 검사합니다.
 *
 * @param value - JSON으로 파싱한 알 수 없는 값입니다.
 * @returns 지원하는 발송 이력 형식이면 `true`를 반환합니다.
 */
function isSentArticleStore(value: unknown): value is SentArticleStore {
    if (!value || typeof value !== 'object') {
        return false
    }

    const candidate = value as { version?: unknown; articles?: unknown }

    return candidate.version === 1 && Boolean(candidate.articles) && typeof candidate.articles === 'object'
}

/**
 * 파일이 아직 생성되지 않았음을 나타내는 오류인지 검사합니다.
 *
 * @param error - 파일 읽기에서 발생한 알 수 없는 오류입니다.
 * @returns 파일 없음 오류(`ENOENT`)면 `true`를 반환합니다.
 */
function isFileNotFoundError(error: unknown): boolean {
    return Boolean(
        error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'ENOENT'
    )
}

/**
 * 최초 실행에 사용할 빈 발송 이력 객체를 생성합니다.
 *
 * @returns 버전과 빈 기사 Key 객체를 포함한 발송 이력입니다.
 */
function createEmptyHistory(): SentArticleStore {
    return {
        version: 1,
        articles: {},
    }
}
