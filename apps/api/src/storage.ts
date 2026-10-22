// Uploaded reports in a private bucket through the S3 API (ADR 0011), so any S3 compatible store works: SeaweedFS
// locally (ADR 0006). Keys are random and hold no personal data; the database row says whose file it is.
import { randomUUID } from 'node:crypto'
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { Config } from './config'

export interface FileStore {
  /** Stores the bytes under a new random key and returns it. */
  put(bytes: Uint8Array, mediaType: string): Promise<string>
  /** Deletes the objects; a key with no object is no error. */
  remove(keys: string[]): Promise<void>
  /** The object's bytes, for the user's export (#40). */
  get(key: string): Promise<Uint8Array>
}

export interface S3FileStore extends FileStore {
  /** Creates the bucket when it is missing, for a local or test store; production provisions its own. */
  ensureBucket(): Promise<void>
  /** Whether an object exists, for tests. */
  has(key: string): Promise<boolean>
}

export function createFileStore(config: Config['s3']): S3FileStore {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    // Path-style addressing (endpoint/bucket/key): SeaweedFS and most self-hosted stores have no bucket subdomains.
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  const Bucket = config.bucket

  return {
    async put(bytes, mediaType) {
      const key = `analyses/${randomUUID()}`
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: mediaType }))
      return key
    },

    async remove(keys) {
      if (keys.length === 0) return
      // One request deletes up to 1000 objects.
      for (let i = 0; i < keys.length; i += 1000) {
        const result = await client.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
          }),
        )
        if (result.Errors?.length) throw new Error(`Could not delete ${String(result.Errors.length)} objects`)
      }
    },

    async get(key) {
      const result = await client.send(new GetObjectCommand({ Bucket, Key: key }))
      if (!result.Body) throw new Error('The object has no body')
      return result.Body.transformToByteArray()
    },

    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }))
      } catch (e) {
        if ((e as { name?: string }).name !== 'NotFound') throw e
        await client.send(new CreateBucketCommand({ Bucket }))
      }
    },

    async has(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket, Key: key }))
        return true
      } catch (e) {
        if ((e as { name?: string }).name === 'NotFound') return false
        throw e
      }
    },
  }
}
