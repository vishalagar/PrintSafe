import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.R2_BUCKET_NAME!

export async function uploadEncryptedBlob(
  storageKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    Body: buffer,
    ContentType: mimeType,
  })

  try {
    await r2Client.send(command)
  } catch (err) {
    throw new Error(`R2 upload failed: ${err instanceof Error ? err.message : 'unknown error'}`)
  }
}

export async function getPresignedDownloadUrl(
  storageKey: string,
  expiresIn = 60
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  })

  try {
    return await getSignedUrl(r2Client, command, { expiresIn })
  } catch (err) {
    throw new Error(
      `R2 presign failed: ${err instanceof Error ? err.message : 'unknown error'}`
    )
  }
}

export async function deleteR2Object(storageKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  })

  try {
    await r2Client.send(command)
  } catch (err) {
    throw new Error(
      `R2 delete failed: ${err instanceof Error ? err.message : 'unknown error'}`
    )
  }
}
