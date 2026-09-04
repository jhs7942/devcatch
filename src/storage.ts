import { createHash } from 'node:crypto'

import {
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
    type S3ClientConfig,
} from '@aws-sdk/client-s3'

import type { AppConfig } from './config.js'
import type { Article } from './types.js'

type ObjectStorageConfig = AppConfig['objectStorage']

/**
 * Object Storage 발송 이력을 조회해 이전에 보내지 않은 기사만 추립니다.
 *
 * @param articles - 중복 발송 여부를 확인할 기사 목록입니다.
 * @param storageConfig - NCP Object Storage 연결 및 Key prefix 설정입니다.
 * @returns Object Storage에 발송 이력이 없는 기사 목록을 반환합니다.
 * @throws Object Storage 인증·네트워크 오류가 발생하면 예외를 던집니다.
 */
export async function excludeSentArticles(
    articles: readonly Article[],
    storageConfig: ObjectStorageConfig
): Promise<Article[]> {
    // Object Storage에 동일한 URL 해시 Key가 있으면 이미 발송한 기사다.
    const client = createStorageClient(storageConfig)
    const results = await Promise.all(
        articles.map(async (article) => ({
            article,
            hasBeenSent: await hasBeenSent(client, article, storageConfig),
        }))
    )

    return results.filter((result) => !result.hasBeenSent).map((result) => result.article)
}

/**
 * Webhook 전송이 끝난 기사를 Object Storage에 개별 발송 이력으로 기록합니다.
 *
 * @param articles - 발송 완료로 처리할 기사 목록입니다.
 * @param storageConfig - NCP Object Storage 연결 및 Key prefix 설정입니다.
 * @returns 모든 이력 기록이 완료되면 반환값이 없는 Promise를 반환합니다.
 * @throws Object Storage 쓰기·인증 오류가 발생하면 예외를 던집니다.
 */
export async function markArticlesAsSent(
    articles: readonly Article[],
    storageConfig: ObjectStorageConfig
): Promise<void> {
    const client = createStorageClient(storageConfig)

    // 기사별 Object를 따로 기록하므로 하나의 JSON 파일을 읽고 덮어쓸 필요가 없다.
    await Promise.all(
        articles.map((article) =>
            client.send(
                new PutObjectCommand({
                    Bucket: storageConfig.bucketName,
                    Key: getObjectKey(article.url, storageConfig.objectPrefix),
                    ContentType: 'application/json; charset=utf-8',
                    Body: JSON.stringify({
                        url: article.url,
                        title: article.title,
                        sourceName: article.sourceName,
                        sentAt: new Date().toISOString(),
                    }),
                })
            )
        )
    )
}

/**
 * NCP Object Storage와 통신할 S3 호환 클라이언트를 생성합니다.
 *
 * @param storageConfig - endpoint, region, 접근 키를 포함한 저장소 설정입니다.
 * @returns 설정된 S3 클라이언트입니다.
 */
function createStorageClient(storageConfig: ObjectStorageConfig): S3Client {
    const clientConfig: S3ClientConfig = {
        endpoint: storageConfig.endpoint,
        region: storageConfig.region,
        // NCP Object Storage의 S3 호환 endpoint를 버킷 경로 방식으로 사용한다.
        forcePathStyle: true,
        credentials: {
            accessKeyId: storageConfig.accessKey,
            secretAccessKey: storageConfig.secretKey,
        },
    }

    return new S3Client(clientConfig)
}

/**
 * 특정 기사의 URL 해시 Key가 Object Storage에 존재하는지 확인합니다.
 *
 * @param client - 조회에 사용할 S3 클라이언트입니다.
 * @param article - 발송 이력을 확인할 기사입니다.
 * @param storageConfig - 버킷과 Object Key prefix 설정입니다.
 * @returns 이력이 존재하면 `true`, 404로 존재하지 않으면 `false`를 반환합니다.
 * @throws 404 이외의 Object Storage 오류가 발생하면 예외를 던집니다.
 */
async function hasBeenSent(
    client: S3Client,
    article: Article,
    storageConfig: ObjectStorageConfig
): Promise<boolean> {
    try {
        await client.send(
            new HeadObjectCommand({
                Bucket: storageConfig.bucketName,
                Key: getObjectKey(article.url, storageConfig.objectPrefix),
            })
        )

        return true
    } catch (error) {
        // 없는 Key의 404만 '미발송'으로 해석하고, 인증·네트워크 오류는 작업 실패로 전파한다.
        if (getHttpStatusCode(error) === 404) {
            return false
        }

        throw error
    }
}

/**
 * 기사 URL을 SHA-256 해시로 바꿔 안전한 Object Storage Key를 만듭니다.
 *
 * @param articleUrl - 정규화된 기사 URL입니다.
 * @param objectPrefix - 발송 이력을 저장할 Object Storage 경로 prefix입니다.
 * @returns `{prefix}/{sha256}.json` 형식의 Object Key를 반환합니다.
 */
function getObjectKey(articleUrl: string, objectPrefix: string): string {
    // URL에는 경로 구분 문자와 긴 쿼리가 포함될 수 있어 SHA-256 해시를 Object Key 식별자로 쓴다.
    const articleHash = createHash('sha256').update(articleUrl).digest('hex')
    const normalizedPrefix = objectPrefix.replace(/\/+$/, '')

    return `${normalizedPrefix}/${articleHash}.json`
}

/**
 * AWS SDK 오류 객체에서 HTTP 상태 코드를 안전하게 추출합니다.
 *
 * @param error - catch 구문에서 받은 알 수 없는 오류 값입니다.
 * @returns 상태 코드를 찾으면 숫자를, 찾을 수 없으면 `undefined`를 반환합니다.
 */
function getHttpStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== 'object' || !('$metadata' in error)) {
        return undefined
    }

    const metadata = error.$metadata

    if (!metadata || typeof metadata !== 'object' || !('httpStatusCode' in metadata)) {
        return undefined
    }

    return typeof metadata.httpStatusCode === 'number' ? metadata.httpStatusCode : undefined
}
