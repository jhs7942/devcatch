import 'dotenv/config'
import { z } from 'zod'
import keywords from './keywords.js'
import { feedSources } from './rss.js'

const environmentSchema = z.object({
    WEBHOOK_URL: z.string().url('WEBHOOK_URL은 올바른 URL이어야 합니다.'),

    NCP_OBJECT_STORAGE_ENDPOINT: z
        .string()
        .url()
        .default('https://kr.object.ncloudstorage.com'),
    NCP_OBJECT_STORAGE_REGION: z.string().default('kr-standard'),
    NCP_ACCESS_KEY: z.string().min(1, 'NCP_ACCESS_KEY가 필요합니다.'),
    NCP_SECRET_KEY: z.string().min(1, 'NCP_SECRET_KEY가 필요합니다.'),
    NCP_BUCKET_NAME: z.string().min(1, 'NCP_BUCKET_NAME이 필요합니다.'),

    OBJECT_STORAGE_PREFIX: z
        .string()
        .min(1)
        .default('devcatch/sent'),

    MAX_ARTICLES: z.coerce.number().int().min(1).max(20).default(5),
    MAX_ARTICLES_PER_SOURCE: z.coerce.number().int().min(1).max(5).default(2),
    ARTICLE_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    RSS_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(10_000),
})

const environment = environmentSchema.parse(process.env)

if (keywords.length === 0) {
    throw new Error('keyword.ts에 관심 키워드를 하나 이상 설정해야 합니다.')
}

export const config = {
    keywords: keywords.map((keyword) => keyword.trim().toLowerCase()),

    feedSources,

    webhook: {
        url: environment.WEBHOOK_URL,
    },

    objectStorage: {
        endpoint: environment.NCP_OBJECT_STORAGE_ENDPOINT,
        region: environment.NCP_OBJECT_STORAGE_REGION,
        accessKey: environment.NCP_ACCESS_KEY,
        secretKey: environment.NCP_SECRET_KEY,
        bucketName: environment.NCP_BUCKET_NAME,
        objectPrefix: environment.OBJECT_STORAGE_PREFIX,
    },

    recommendation: {
        maxArticles: environment.MAX_ARTICLES,
        maxArticlesPerSource: environment.MAX_ARTICLES_PER_SOURCE,
        articleMaxAgeDays: environment.ARTICLE_MAX_AGE_DAYS,
    },

    rss: {
        timeoutMs: environment.RSS_TIMEOUT_MS,
    },
} as const

export type AppConfig = typeof config
