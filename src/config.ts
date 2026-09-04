import 'dotenv/config'
import { z } from 'zod'
import keywords from './keywords.js'
import { feedSources } from './rss.js'

// GitHub Secrets 또는 로컬 .env 값을 프로그램 시작 시점에 검증한다.
const environmentSchema = z.object({
    WEBHOOK_URL: z.string().url('WEBHOOK_URL은 올바른 URL이어야 합니다.'),

    GEMINI_API_KEY: z.string().trim().min(1, 'GEMINI_API_KEY가 필요합니다.'),
    GEMINI_EMBEDDING_MODEL: z.literal('gemini-embedding-001').default('gemini-embedding-001'),
    EMBEDDING_CACHE_PATH: z.string().min(1).default('./data/embeddings.json'),
    EMBEDDING_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
    MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.55),
    MAX_EMBEDDING_ARTICLES: z.coerce.number().int().min(1).max(500).default(100),

    HISTORY_FILE_PATH: z.string().min(1).default('./data/sent-articles.json'),

    MAX_ARTICLES: z.coerce.number().int().min(1).max(20).default(5),
    MAX_ARTICLES_PER_SOURCE: z.coerce.number().int().min(1).max(5).default(2),
    ARTICLE_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    RSS_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(10_000),
})

const environment = environmentSchema.parse(process.env)

// 관심 키워드가 비어 있으면 어떤 기사도 추천할 수 없으므로 즉시 중단한다.
if (keywords.length === 0) {
    throw new Error('keyword.js에 관심 키워드를 하나 이상 설정해야 합니다.')
}

export const config = {
    // 비교 시 대소문자 차이로 누락되지 않도록 키워드를 미리 정규화한다.
    keywords: keywords.map((keyword) => keyword.trim().toLowerCase()),

    feedSources,

    webhook: {
        url: environment.WEBHOOK_URL,
    },

    history: {
        filePath: environment.HISTORY_FILE_PATH,
    },

    embedding: {
        apiKey: environment.GEMINI_API_KEY,
        model: environment.GEMINI_EMBEDDING_MODEL,
        dimensions: 768,
        cachePath: environment.EMBEDDING_CACHE_PATH,
        timeoutMs: environment.EMBEDDING_TIMEOUT_MS,
    },

    recommendation: {
        minSimilarity: environment.MIN_SIMILARITY,
        maxEmbeddingArticles: environment.MAX_EMBEDDING_ARTICLES,
        maxArticles: environment.MAX_ARTICLES,
        maxArticlesPerSource: environment.MAX_ARTICLES_PER_SOURCE,
        articleMaxAgeDays: environment.ARTICLE_MAX_AGE_DAYS,
    },

    rss: {
        timeoutMs: environment.RSS_TIMEOUT_MS,
    },
} as const

export type AppConfig = typeof config
