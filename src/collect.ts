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

export async function collectArticles(
    feedSources: readonly FeedSource[],
    timeoutMs: number
): Promise<CollectResult> {
    const results = await Promise.all(
        feedSources.map((source) => collectFeed(source, timeoutMs))
    )

    const failedSources: string[] = []
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

async function collectFeed(
    source: FeedSource,
    timeoutMs: number
): Promise<SourceCollectResult> {
    try {
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
        return null
    }
}

function normalizeUrl(value: string): string {
    const url = new URL(value)

    for (const key of [...url.searchParams.keys()]) {
        if (key.toLowerCase().startsWith('utm_') || key === 'fbclid' || key === 'gclid') {
            url.searchParams.delete(key)
        }
    }

    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'

    return url.toString()
}

function parsePublishedAt(value: string | undefined): Date | null {
    if (!value) {
        return null
    }

    const publishedAt = new Date(value)

    return Number.isNaN(publishedAt.getTime()) ? null : publishedAt
}

function stripHtml(value: string): string {
    return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
