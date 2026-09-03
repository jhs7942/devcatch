import { config } from './config.js'
import { runNewsJob } from './run.js'

async function main() {
    const startedAt = new Date()

    console.info(`[DevCatch] 뉴스 수집 시작: ${startedAt.toISOString()}`)

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

    process.exitCode = 1
})
