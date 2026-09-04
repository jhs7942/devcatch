import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createEmbeddings } from '../src/embedding.js'
import { cosineSimilarity, getEligibleArticles, selectRecommendations } from '../src/match.js'
import type { Article } from '../src/types.js'

const article: Article = {
    title: '불필요한 화면 렌더링 줄이기', summary: '실무 성능 개선 사례',
    url: 'https://example.com/one', sourceName: '출처 A', publishedAt: null,
}

test('단어가 포함되지 않아도 벡터 관련성으로 선정하고 기준 미달은 제외한다', () => {
    const results = selectRecommendations([
        { article, vector: [1, 0] },
        { article: { ...article, url: 'https://example.com/two', publishedAt: new Date() }, vector: [0, 1] },
    ], [{ keyword: 'React', vector: [1, 0] }], {
        minSimilarity: 0.8, maxArticles: 5, maxArticlesPerSource: 2,
    })
    assert.equal(results.length, 1)
    assert.deepEqual(results[0].matchedKeywords, ['React'])
    assert.equal(results[0].similarity, 1)
    assert.throws(() => cosineSimilarity([1, 0], [1]))
    assert.throws(() => cosineSimilarity([0, 0], [1, 0]))
})

test('출처별 제한과 임베딩 전 날짜 필터를 적용한다', () => {
    const now = Date.now()
    const candidates = getEligibleArticles([
        article,
        { ...article, publishedAt: new Date(now - 10 * 86400000) },
        { ...article, publishedAt: new Date(now + 86400000) },
    ], 7, 100, now)
    assert.equal(candidates.length, 1)
    const results = selectRecommendations([
        { article, vector: [1, 0] },
        { article: { ...article, url: 'https://example.com/two' }, vector: [1, 0] },
        { article: { ...article, sourceName: '출처 B' }, vector: [1, 0] },
    ], [{ keyword: '관심사', vector: [1, 0] }], {
        minSimilarity: 0.8, maxArticles: 5, maxArticlesPerSource: 1,
    })
    assert.equal(results.length, 2)
})

test('모델·입력·검색 역할별 캐시를 사용하며 변경 시 재생성한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'devcatch-embedding-test-'))
    try {
        const config = { apiKey: 'test-only', model: 'gemini-embedding-001', dimensions: 2,
            cachePath: join(directory, 'cache.json'), timeoutMs: 1000 }
        const requests: string[] = []
        const request: typeof fetch = async (_input, init) => {
            const body = JSON.parse(String(init?.body))
            requests.push(body.taskType)
            return new Response(JSON.stringify({ embedding: { values: [1, 0] } }))
        }
        await createEmbeddings([article], ['React'], config, request)
        assert.deepEqual(requests, ['RETRIEVAL_QUERY', 'RETRIEVAL_DOCUMENT'])
        await createEmbeddings([article], ['React'], config, request)
        assert.equal(requests.length, 2)
        await createEmbeddings([{ ...article, summary: '변경된 내용' }], ['React'], config, request)
        assert.equal(requests.length, 3)
        await createEmbeddings([article], ['React'], { ...config, model: 'test-other-model' }, request)
        assert.equal(requests.length, 5)
        await writeFile(config.cachePath, '잘못된 JSON')
        await assert.rejects(createEmbeddings([article], ['React'], config, request), /캐시/)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('빈 후보에는 API를 호출하지 않고 잘못된 응답은 실패 처리한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'devcatch-embedding-invalid-'))
    try {
        const config = { apiKey: 'test-only', model: 'gemini-embedding-001', dimensions: 2,
            cachePath: join(directory, 'cache.json'), timeoutMs: 1000 }
        let calls = 0
        const request: typeof fetch = async () => {
            calls++
            return new Response(JSON.stringify({ embedding: { values: [0, 0] } }))
        }
        await createEmbeddings([], ['React'], config, request)
        assert.equal(calls, 0)
        await assert.rejects(createEmbeddings([article], ['React'], config, request), /벡터/)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})
