import type { AppConfig } from './config.js'
import type { Recommendation } from './types.js'

type WebhookConfig = AppConfig['webhook']

export async function sendWebhook(
    recommendations: readonly Recommendation[],
    webhookConfig: WebhookConfig
): Promise<void> {
    const message = formatMessage(recommendations)
    const response = await fetch(webhookConfig.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(createPayload(webhookConfig.url, message)),
    })

    if (!response.ok) {
        throw new Error(`Webhook 전송 실패: HTTP ${response.status} ${response.statusText}`)
    }
}

function createPayload(webhookUrl: string, message: string): Record<string, string> {
    const hostname = new URL(webhookUrl).hostname

    return hostname.endsWith('discord.com') || hostname.endsWith('discordapp.com')
        ? { content: message }
        : { text: message }
}

function formatMessage(recommendations: readonly Recommendation[]): string {
    const lines = ['📰 **DevCatch 개발 뉴스**']

    for (const article of recommendations) {
        const publishedAt = article.publishedAt
            ? article.publishedAt.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
            : '발행일 미상'

        lines.push(
            '',
            `**${article.title}**`,
            `- 출처: ${article.sourceName} · ${publishedAt}`,
            `- 키워드: ${article.matchedKeywords.join(', ')}`,
            article.url
        )
    }

    return lines.join('\n').slice(0, 1_900)
}
