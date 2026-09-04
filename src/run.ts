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

/**
 * 뉴스 알림 유스케이스를 실행합니다.
 * 수집, 중복 제거, 추천 선정, Webhook 전송, 발송 이력 기록을 순서대로 조합합니다.
 *
 * @param config - 실행에 필요한 RSS, 추천, Webhook, Object Storage 설정입니다.
 * @returns 수집·추천·발송 개수와 수집에 실패한 출처 목록을 반환합니다.
 * @throws RSS 중복 확인, Webhook 전송, 발송 이력 기록 중 복구할 수 없는 오류가 발생하면 예외를 던집니다.
 */
export async function runNewsJob(
    config: AppConfig
): Promise<NewsJobResult> {
    // 이 파일은 세부 구현을 갖지 않고 수집 → 중복 제거 → 추천 → 발송의 순서만 조합한다.
    const { articles, failedSources } = await collectArticles(
        config.feedSources,
        config.rss.timeoutMs
    )

    console.log(articles)

    const unsentArticles = await excludeSentArticles(articles, config.history)

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

    // 전송이 성공한 기사만 발송 이력으로 남겨 실패한 알림은 다음 실행에 재시도한다.
    await sendWebhook(recommendations, config.webhook)
    await markArticlesAsSent(recommendations, config.history)

    return {
        collectedCount: articles.length,
        recommendedCount: recommendations.length,
        sentCount: recommendations.length,
        failedSources,
    }
}
