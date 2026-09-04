// 수집 단계부터 저장·추천 단계까지 공통으로 사용하는 내부 기사 형식이다.
export type Article = {
    url: string
    title: string
    summary: string
    sourceName: string
    publishedAt: Date | null
}

// 추천 결과에는 매칭 근거와 정렬에 사용한 점수를 추가한다.
export type Recommendation = Article & {
    similarity: number
    matchedKeywords: string[]
    score: number
}

/** 동일 모델·차원으로 생성된 기사 벡터입니다. */
export type EmbeddedArticle = { article: Article; vector: number[] }

/** 개별 관심사와 해당 검색 질의 벡터입니다. */
export type InterestEmbedding = { keyword: string; vector: number[] }
