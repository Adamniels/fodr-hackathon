// The test file store: the Compose SeaweedFS (S3_PORT and the identity as in compose.yaml) with a bucket of the tests'
// own, created by the integration tests' global setup.
import type { Config } from '../src/config'

export const testS3Config = (): Config['s3'] => ({
  endpoint: `http://127.0.0.1:${process.env.S3_PORT ?? '8333'}`,
  region: 'us-east-1',
  bucket: 'fodr-test',
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'fodr',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'fodr-dev-secret',
})
