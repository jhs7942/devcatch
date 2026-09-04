import Parser from 'rss-parser'

import type { FeedSource } from './rss.js'
import type { Article } from './types.js'

type CollectResult = {
    articles: Article[]
    failedSources: string[]
}

type SourceCollectResult =
    | {
          source: FeedSource
          articles: Article[]
          error: null
      }
    | {
          source: FeedSource
          articles: []
          error: unknown
      }

const parser = new Parser()

// 모든 RSS 피드를 병렬 수집한 뒤, 실패한 피드와 정상 기사를 분리해 반환한다.
/**
 * 등록된 RSS 피드를 병렬 수집하고 내부 기사 형식으로 변환합니다.
 * 개별 피드 실패는 전체 작업을 중단하지 않고 실패 출처 목록에 기록합니다.
 *
 * @param feedSources - 수집할 RSS 출처 목록입니다.
 * @param timeoutMs - 각 RSS 요청의 최대 대기 시간(밀리초)입니다.
 * @returns 정상 수집·중복 제거된 기사 목록과 실패한 출처 이름을 반환합니다.
 */
export async function collectArticles(
    feedSources: readonly FeedSource[],
    timeoutMs: number
): Promise<CollectResult> {
    // 한 피드의 실패는 collectFeed 내부에서 결과로 바꾸므로 전체 수집을 중단하지 않는다.
    const results = await Promise.all(
        feedSources.map((source) => collectFeed(source, timeoutMs))
    )

    const failedSources: string[] = []
    // 서로 다른 피드에 같은 글이 실릴 수 있으므로 정규화된 URL을 기준으로 한 번만 남긴다.
    const articlesByUrl = new Map<string, Article>()

    for (const result of results) {
        if (result.error) {
            failedSources.push(result.source.name)

            console.warn(
                `[DevCatch] RSS 수집 실패: ${result.source.name}`,
                result.error
            )

            continue
        }

        for (const article of result.articles) {
            if (!articlesByUrl.has(article.url)) {
                articlesByUrl.set(article.url, article)
            }
        }
    }

    return {
        articles: [...articlesByUrl.values()],
        failedSources,
    }
}

/**
 * RSS 출처 한 곳에서 XML을 내려받아 기사 목록으로 변환합니다.
 *
 * @param source - 수집할 RSS 출처 정보입니다.
 * @param timeoutMs - 요청 최대 대기 시간(밀리초)입니다.
 * @returns 성공 시 기사 목록을, 실패 시 오류를 포함한 빈 기사 목록을 반환합니다.
 * @throws 이 함수는 예외를 외부로 던지지 않고 결과의 `error`에 담습니다.
 */
async function collectFeed(
    source: FeedSource,
    timeoutMs: number
): Promise<SourceCollectResult> {
    try {
        // AbortSignal로 응답 대기 시간을 제한해 멈춘 RSS 서버가 전체 작업을 지연시키지 않게 한다.
        const response = await fetch(source.url, {
            headers: {
                Accept: 'application/rss+xml, application/atom+xml, application/xml',
                'User-Agent': 'DevCatch RSS Reader',
            },
            signal: AbortSignal.timeout(timeoutMs),
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const xml = await response.text()
        const feed = await parser.parseString(xml)

        // RSS마다 필드 이름과 형식이 달라도 서비스 내부 Article 형태로 통일한다.
        const articles = feed.items
            .map((item) => normalizeArticle(item, source))
            .filter((article): article is Article => article !== null)

        return {
            source,
            articles,
            error: null,
        }
    } catch (error) {
        return {
            source,
            articles: [],
            error,
        }
    }
}

/**
 * RSS 항목을 서비스 내부의 공통 기사 형식으로 변환합니다.
 *
 * @param item - `rss-parser`가 파싱한 원본 RSS 항목입니다.
 * @param source - 해당 항목을 제공한 RSS 출처입니다.
 * @returns 유효한 기사 객체를 반환하며, URL이 없거나 잘못되면 `null`을 반환합니다.
 */
function normalizeArticle(item: Parser.Item, source: FeedSource): Article | null {
    if (!item.link) {
        return null
    }

    try {
        return {
            url: normalizeUrl(item.link),
            title: item.title?.trim() || '제목 없음',
            summary: stripHtml(item.contentSnippet ?? item.content ?? item.summary ?? ''),
            sourceName: source.name,
            publishedAt: parsePublishedAt(item.isoDate ?? item.pubDate),
        }
    } catch {
        // 잘못된 URL 하나 때문에 해당 RSS 전체를 실패 처리하지 않는다.
        return null
    }
}

/**
 * 중복 판별을 위해 URL에서 추적 파라미터와 해시를 제거합니다.
 *
 * @param value - RSS가 제공한 원본 기사 URL입니다.
 * @returns 정규화된 기사 URL입니다.
 * @throws URL 형식이 올바르지 않으면 `URL` 생성자가 예외를 던집니다.
 */
function normalizeUrl(value: string): string {
    const url = new URL(value)

    // 추적용 파라미터와 해시는 같은 기사를 다른 URL로 인식하게 하므로 제거한다.
    for (const key of [...url.searchParams.keys()]) {
        if (key.toLowerCase().startsWith('utm_') || key === 'fbclid' || key === 'gclid') {
            url.searchParams.delete(key)
        }
    }

    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'

    return url.toString()
}

/**
 * RSS 발행일 문자열을 유효한 날짜 객체로 변환합니다.
 *
 * @param value - ISO 날짜 또는 일반 발행일 문자열입니다.
 * @returns 유효한 날짜면 `Date`, 없거나 잘못되었으면 `null`을 반환합니다.
 */
function parsePublishedAt(value: string | undefined): Date | null {
    if (!value) {
        return null
    }

    const publishedAt = new Date(value)

    return Number.isNaN(publishedAt.getTime()) ? null : publishedAt
}

/**
 * RSS 요약문에서 HTML 태그와 중복 공백을 제거합니다.
 *
 * @param value - HTML을 포함할 수 있는 원본 요약문입니다.
 * @returns 정리된 일반 텍스트 요약문입니다.
 */
function stripHtml(value: string): string {
    return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
