# devcatch
키워드 기반 관련 뉴스를 훅으로 알려주는 봇


## 의미 기반 추천

관심 키워드는 `src/keywords.ts`에서 관리합니다. 키워드마다 검색 질의 임베딩을 만들고 기사 제목·RSS 요약의 문서 임베딩과 비교합니다. 각 기사의 가장 높은 코사인 유사도가 `MIN_SIMILARITY` 이상일 때만 최신성 보너스와 출처별 개수 제한을 적용합니다. 유사도는 추천 확률이 아닙니다. 기본 0.55는 초기 조정값이며 정답이 아니므로 알림 품질을 보고 조정하세요.

Gemini REST API의 `gemini-embedding-001` 모델과 768차원 벡터를 사용합니다. 질의는 RETRIEVAL_QUERY, 기사는 RETRIEVAL_DOCUMENT로 생성합니다. 다른 모델은 작업 유형 호환성을 확인한 뒤 코드와 설정을 함께 변경해야 합니다.

### 실행

1. `.env.example`을 참고해 로컬 `.env`에 WEBHOOK_URL과 GEMINI_API_KEY를 설정합니다.
2. `npm ci`로 설치하고 `npm run run`으로 실행합니다.
3. GitHub Actions에서는 Repository Secrets에 WEBHOOK_URL과 GEMINI_API_KEY를 등록합니다.
4. 새 `data/embeddings.json`도 함께 커밋·푸시해야 합니다.

### 캐시와 비용

오래된 기사와 발송 완료 기사를 먼저 제외하고 최신 후보 최대 100개만 처리합니다. API 요청에는 비용 또는 사용량 제한이 적용될 수 있습니다. 캐시는 모델·차원·검색 역할·입력 내용의 해시로 구분하므로 입력이나 모델이 달라지면 다시 생성합니다. 현재 후보와 관심사 벡터만 보관해 파일 크기를 제한합니다. RSS 요약은 최대 3,500자까지 사용합니다.

Actions는 발송 이력과 벡터 캐시를 Git에 저장합니다. API가 중간에 실패해도 이미 생성된 캐시는 저장합니다. 저장소가 공개되어 있다면 관심사와 기사 URL 및 벡터도 공개됩니다. API 키는 캐시에 저장하지 않습니다.

임베딩 생성 실패 시 작업을 실패 처리하며 문자열 검색으로 대체 발송하지 않습니다. Webhook 발송 후 이력 저장·Git push 전에 실패하면 다음 실행에서 중복 발송될 가능성은 남아 있습니다.

### 검증

`npm run typecheck`, `npm run lint`, `npm test`로 검증합니다. 테스트는 가짜 API 응답을 사용하므로 실제 API 요청과 Webhook 발송이 발생하지 않습니다.
