import type { AppConfig } from './config.js'
import type { Recommendation } from './types.js'

type WebhookConfig = AppConfig['webhook']

/**
 * 추천 기사 목록을 Webhook 서비스로 전송합니다.
 * Discord URL에는 `content`, 그 외 Slack 호환 Webhook에는 `text` payload를 사용합니다.
 *
 * @param recommendations - 전송할 추천 기사 목록입니다.
 * @param webhookConfig - Webhook URL 설정입니다.
 * @returns Webhook 응답이 성공하면 반환값이 없는 Promise를 반환합니다.
 * @throws Webhook이 2xx 응답을 반환하지 않으면 전송 실패 예외를 던집니다.
 */
export async function sendWebhook(
    recommendations: readonly Recommendation[],
    webhookConfig: WebhookConfig
): Promise<void> {
    // Webhook 종류에 관계없이 먼저 공통 텍스트 메시지를 만든다.
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

/**
 * Webhook 주소의 호스트에 맞춰 전송 payload 필드명을 결정합니다.
 *
 * @param webhookUrl - 메시지를 전송할 Webhook URL입니다.
 * @param message - 전송할 완성된 텍스트 메시지입니다.
 * @returns Discord용 `{ content }` 또는 Slack 호환용 `{ text }` 객체를 반환합니다.
 * @throws URL 형식이 올바르지 않으면 `URL` 생성자가 예외를 던집니다.
 */
function createPayload(webhookUrl: string, message: string): Record<string, string> {
    const hostname = new URL(webhookUrl).hostname

    // Discord는 content, Slack Incoming Webhook은 text 필드를 사용한다.
    return hostname.endsWith('discord.com') || hostname.endsWith('discordapp.com')
        ? { content: message }
        : { text: message }
}

/**
 * 추천 기사를 사람이 읽기 쉬운 Markdown 메시지로 만듭니다.
 *
 * @param recommendations - 메시지에 포함할 추천 기사 목록입니다.
 * @returns Discord 제한보다 짧게 제한된 뉴스 알림 메시지입니다.
 */
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
            `- 관련 관심사: ${article.matchedKeywords.join(', ')} · 유사도 ${article.similarity.toFixed(3)}`,
            article.url
        )
    }

    // Discord의 메시지 길이 제한(2,000자)보다 여유 있게 잘라 전송 실패를 막는다.
    return lines.join('\n').slice(0, 1_900)
}
