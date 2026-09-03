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

export async function excludeSentArticles(
    articles: readonly Article[],
    storageConfig: ObjectStorageConfig
): Promise<Article[]> {
    const client = createStorageClient(storageConfig)
    const results = await Promise.all(
        articles.map(async (article) => ({
            article,
            hasBeenSent: await hasBeenSent(client, article, storageConfig),
        }))
    )

    return results.filter((result) => !result.hasBeenSent).map((result) => result.article)
}

export async function markArticlesAsSent(
    articles: readonly Article[],
    storageConfig: ObjectStorageConfig
): Promise<void> {
    const client = createStorageClient(storageConfig)

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

function createStorageClient(storageConfig: ObjectStorageConfig): S3Client {
    const clientConfig: S3ClientConfig = {
        endpoint: storageConfig.endpoint,
        region: storageConfig.region,
        forcePathStyle: true,
        credentials: {
            accessKeyId: storageConfig.accessKey,
            secretAccessKey: storageConfig.secretKey,
        },
    }

    return new S3Client(clientConfig)
}

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
        if (getHttpStatusCode(error) === 404) {
            return false
        }

        throw error
    }
}

function getObjectKey(articleUrl: string, objectPrefix: string): string {
    const articleHash = createHash('sha256').update(articleUrl).digest('hex')
    const normalizedPrefix = objectPrefix.replace(/\/+$/, '')

    return `${normalizedPrefix}/${articleHash}.json`
}

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
