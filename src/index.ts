import { config } from './config.js'
import { runNewsJob } from './run.js'

/**
 * 프로그램의 진입점으로, 검증된 설정을 뉴스 수집 작업에 전달하고 실행 결과를 출력합니다.
 *
 * @returns 완료 시 반환값이 없는 Promise를 반환합니다.
 * @throws 실행 중 발생한 오류는 호출부의 `catch`로 전달됩니다.
 */
async function main(): Promise<void> {
    const startedAt = new Date()

    console.info(`[DevCatch] 뉴스 수집 시작: ${startedAt.toISOString()}`)

    // index.js는 환경 설정을 만들고 실행 작업에 전달하는 진입점 역할만 한다.
    const result = await runNewsJob(config)

    console.info(
        `[DevCatch] 뉴스 수집 완료: ` +
            `수집 ${result.collectedCount}개, ` +
            `추천 ${result.recommendedCount}개, ` +
            `발송 ${result.sentCount}개`
    )

    if (result.failedSources.length > 0) {
        console.warn(`[DevCatch] 수집 실패 피드: ${result.failedSources.join(', ')}`)
    }
}

main().catch((error: unknown) => {
    console.error('[DevCatch] 작업 실행 실패')
    console.error(error)

    // GitHub Actions가 실패한 실행으로 인식하도록 종료 코드만 설정한다.
    process.exitCode = 1
})
