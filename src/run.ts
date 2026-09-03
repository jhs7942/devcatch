import type { AppConfig } from './config.js'
import { collectArticles } from './collect.js'
import { selectRecommendations } from './match.js'
import { excludeSentArticles, markArticlesAsSent } from './storage.js'
import { sendWebhook } from './webhook.js'

export type NewsJobResult = {
    collectedCount: number
    recommendedCount: number
    sentCount: number
    failedSources: string[]
}

export async function runNewsJob(
    config: AppConfig
): Promise<NewsJobResult> {
    const { articles, failedSources } = await collectArticles(
        config.feedSources,
        config.rss.timeoutMs
    )

    const unsentArticles = await excludeSentArticles(articles, config.objectStorage)

    const recommendations = selectRecommendations(unsentArticles, {
        keywords: config.keywords,
        maxArticles: config.recommendation.maxArticles,
        maxArticlesPerSource: config.recommendation.maxArticlesPerSource,
        articleMaxAgeDays: config.recommendation.articleMaxAgeDays,
    })

    if (recommendations.length === 0) {
        return {
            collectedCount: articles.length,
            recommendedCount: 0,
            sentCount: 0,
            failedSources,
        }
    }

    await sendWebhook(recommendations, config.webhook)
    await markArticlesAsSent(recommendations, config.objectStorage)

    return {
        collectedCount: articles.length,
        recommendedCount: recommendations.length,
        sentCount: recommendations.length,
        failedSources,
    }
}
