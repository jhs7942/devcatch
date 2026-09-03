import type { Article, Recommendation } from './types.js'

type RecommendationOptions = {
    keywords: readonly string[]
    maxArticles: number
    maxArticlesPerSource: number
    articleMaxAgeDays: number
}

export function selectRecommendations(
    articles: readonly Article[],
    options: RecommendationOptions
): Recommendation[] {
    const minimumPublishedAt = Date.now() - options.articleMaxAgeDays * 24 * 60 * 60 * 1000
    const candidates = articles
        .filter((article) => !article.publishedAt || article.publishedAt.getTime() >= minimumPublishedAt)
        .map((article) => scoreArticle(article, options.keywords))
        .filter((article): article is Recommendation => article !== null)
        .sort((left, right) => {
            const scoreDifference = right.score - left.score

            if (scoreDifference !== 0) {
                return scoreDifference
            }

            return (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0)
        })

    const selected: Recommendation[] = []
    const sourceCounts = new Map<string, number>()

    for (const article of candidates) {
        if (selected.length >= options.maxArticles) {
            break
        }

        const sourceCount = sourceCounts.get(article.sourceName) ?? 0

        if (sourceCount >= options.maxArticlesPerSource) {
            continue
        }

        selected.push(article)
        sourceCounts.set(article.sourceName, sourceCount + 1)
    }

    return selected
}

function scoreArticle(article: Article, keywords: readonly string[]): Recommendation | null {
    const title = article.title.toLocaleLowerCase()
    const summary = article.summary.toLocaleLowerCase()
    const matchedKeywords = keywords.filter((keyword) => {
        const normalizedKeyword = keyword.toLocaleLowerCase()

        return title.includes(normalizedKeyword) || summary.includes(normalizedKeyword)
    })

    if (matchedKeywords.length === 0) {
        return null
    }

    const keywordScore = matchedKeywords.reduce((score, keyword) => {
        const normalizedKeyword = keyword.toLocaleLowerCase()

        return score + (title.includes(normalizedKeyword) ? 5 : 0) + (summary.includes(normalizedKeyword) ? 2 : 0)
    }, 0)

    return {
        ...article,
        matchedKeywords,
        score: keywordScore + getRecencyScore(article.publishedAt),
    }
}

function getRecencyScore(publishedAt: Date | null): number {
    if (!publishedAt) {
        return 0
    }

    const ageInHours = (Date.now() - publishedAt.getTime()) / (60 * 60 * 1000)

    if (ageInHours <= 24) {
        return 3
    }

    if (ageInHours <= 72) {
        return 2
    }

    return 1
}
