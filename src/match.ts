import type { Article, EmbeddedArticle, InterestEmbedding, Recommendation } from './types.js'

type RecommendationOptions = {
    minSimilarity: number
    maxArticles: number
    maxArticlesPerSource: number
}

/**
 * 임베딩 API를 호출하기 전에 오래되거나 미래 날짜인 기사를 제외합니다.
 * @param articles - 미발송 기사 배열입니다.
 * @param maxAgeDays - 허용할 최대 경과 일수입니다.
 * @param limit - 한 번에 임베딩할 기사 상한입니다.
 * @param now - 현재 시각(밀리초)입니다.
 * @returns 최신순 후보 배열입니다. 발행일 없는 기사는 마지막에 배치합니다.
 */
export function getEligibleArticles(
    articles: readonly Article[], maxAgeDays: number, limit: number, now = Date.now()
): Article[] {
    return articles.filter(({ publishedAt }) => !publishedAt ||
        (publishedAt.getTime() >= now - maxAgeDays * 86400000 && publishedAt.getTime() <= now))
        .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
        .slice(0, limit)
}

/**
 * 관심사별 유사도 중 최댓값으로 관련성을 판단하고 최신성·출처 제한을 적용합니다.
 * @param articles - 기사와 임베딩 벡터 배열입니다.
 * @param interests - 관심사별 벡터 배열입니다.
 * @param options - 최소 관련성 및 추천 수 제한입니다.
 * @param now - 최신성 계산에 사용할 시각입니다.
 * @returns 관련성 기준을 통과한 추천 기사 배열입니다.
 * @throws 비교하는 벡터가 비정상적이거나 차원이 다르면 오류가 발생합니다.
 */
export function selectRecommendations(
    articles: readonly EmbeddedArticle[],
    interests: readonly InterestEmbedding[],
    options: RecommendationOptions,
    now = Date.now()
): Recommendation[] {
    const ranked: Recommendation[] = []
    for (const { article, vector } of articles) {
        const matches = interests.map((interest) => ({
            keyword: interest.keyword,
            similarity: cosineSimilarity(vector, interest.vector),
        })).sort((a, b) => b.similarity - a.similarity)
        const best = matches[0]
        if (!best || best.similarity < options.minSimilarity) continue

        const ageDays = article.publishedAt
            ? Math.max(0, (now - article.publishedAt.getTime()) / 86400000) : Infinity
        // 관련성 기준을 통과한 글에만 최대 5점의 최신성 보너스를 줍니다.
        const freshness = Number.isFinite(ageDays) ? 5 * Math.exp(-ageDays / 7) : 0
        ranked.push({
            ...article,
            similarity: best.similarity,
            matchedKeywords: matches.filter((match) => match.similarity >= options.minSimilarity)
                .slice(0, 3).map((match) => match.keyword),
            score: best.similarity * 100 + freshness,
        })
    }
    ranked.sort((a, b) => b.score - a.score ||
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    const counts = new Map<string, number>()
    const selected: Recommendation[] = []
    for (const article of ranked) {
        if (selected.length >= options.maxArticles) break
        const count = counts.get(article.sourceName) ?? 0
        if (count >= options.maxArticlesPerSource) continue
        selected.push(article)
        counts.set(article.sourceName, count + 1)
    }
    return selected
}

/**
 * 두 벡터의 코사인 유사도를 계산합니다.
 * @param left - 첫 번째 유한 실수 벡터입니다.
 * @param right - 동일 차원의 두 번째 벡터입니다.
 * @returns -1부터 1까지의 유사도입니다. 확률이나 정확도는 아닙니다.
 * @throws 빈 벡터, 차원 불일치, 비유한 수, 영벡터이면 예외를 던집니다.
 */
export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
    if (!left.length || left.length !== right.length ||
        !left.every(Number.isFinite) || !right.every(Number.isFinite)) {
        throw new Error('임베딩 벡터의 차원 또는 값이 올바르지 않습니다.')
    }
    const normLeft = Math.hypot(...left)
    const normRight = Math.hypot(...right)
    if (!normLeft || !normRight) throw new Error('영벡터는 비교할 수 없습니다.')
    const similarity = left.reduce((sum, value, index) =>
        sum + (value / normLeft) * (right[index] / normRight), 0)
    return Math.max(-1, Math.min(1, similarity))
}
