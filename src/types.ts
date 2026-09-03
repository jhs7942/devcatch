export type Article = {
    url: string
    title: string
    summary: string
    sourceName: string
    publishedAt: Date | null
}

export type Recommendation = Article & {
    matchedKeywords: string[]
    score: number
}
