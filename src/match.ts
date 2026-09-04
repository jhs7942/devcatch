import type { Article, Recommendation } from './types.js'

type RecommendationOptions = {
    keywords: readonly string[]
    maxArticles: number
    maxArticlesPerSource: number
    articleMaxAgeDays: number
}

/**
 * 신규 기사 중 관심 키워드와 최신성을 기준으로 추천 기사를 선정합니다.
 * 한 출처가 추천 목록을 독점하지 않도록 출처별 최대 개수를 적용합니다.
 *
 * @param articles - 중복 발송 여부가 제거된 후보 기사 목록입니다.
 * @param options - 키워드, 추천 수, 출처별 제한, 기사 최대 보관 기간 설정입니다.
 * @returns 점수 내림차순으로 정렬된 추천 기사 목록입니다.
 */
export function selectRecommendations(
    articles: readonly Article[],
    options: RecommendationOptions
): Recommendation[] {
    // 오래된 글은 제외하고, 발행일이 없는 글은 RSS 품질 차이를 고려해 후보에 남긴다.
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

    // 한 출처의 글이 알림을 독점하지 않도록 출처별 선택 개수를 별도로 관리한다.
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

/**
 * 기사 제목·요약문에서 관심 키워드를 찾고 추천 점수를 계산합니다.
 *
 * @param article - 점수를 계산할 기사입니다.
 * @param keywords - 비교할 정규화된 관심 키워드 목록입니다.
 * @returns 매칭 키워드와 점수를 포함한 추천 기사이며, 일치하는 키워드가 없으면 `null`을 반환합니다.
 */
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

    // 제목의 일치는 요약문보다 관심도가 높다고 보고 더 큰 점수를 부여한다.
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

/**
 * 발행 시점에 따라 최신성 가산점을 계산합니다.
 *
 * @param publishedAt - 기사의 발행일이며, RSS에 없으면 `null`입니다.
 * @returns 24시간 이내 3점, 72시간 이내 2점, 그 외 1점이며 발행일이 없으면 0점입니다.
 */
function getRecencyScore(publishedAt: Date | null): number {
    if (!publishedAt) {
        return 0
    }

    // 같은 키워드 점수라면 더 최신의 기사가 앞에 오도록 가산점을 준다.
    const ageInHours = (Date.now() - publishedAt.getTime()) / (60 * 60 * 1000)

    if (ageInHours <= 24) {
        return 3
    }

    if (ageInHours <= 72) {
        return 2
    }

    return 1
}
