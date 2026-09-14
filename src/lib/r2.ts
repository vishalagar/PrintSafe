import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;

export async function uploadEncryptedBlob(
  storageKey: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    Body: buffer,
    ContentType: mimeType,
  });

  try {
    await r2Client.send(command);
  } catch (err) {
    throw new Error(
      `R2 upload failed: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }
}

// Presigned PUT URL so the browser can send ciphertext directly to R2,
// bypassing the Vercel serverless function body-size limit (~4.5 MB).
// ContentType is fixed as opaque application/octet-stream — the caller's PUT
// request must send the same Content-Type header or the signature won't match.
export async function getPresignedUploadUrl(
  storageKey: string,
  mimeType: string,
  expiresIn = 300,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: mimeType,
  });

  try {
    return await getSignedUrl(r2Client, command, { expiresIn });
  } catch (err) {
    throw new Error(
      `R2 presign upload failed: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }
}

// Checks whether an object actually landed in R2 after a presigned PUT, and
// returns its real size so the confirm step can sanity-check it against the
// size the client declared at /api/upload time. Returns null (not an error)
// when the object doesn't exist yet — that's an expected outcome, not a fault.
export async function headR2Object(
  storageKey: string,
): Promise<{ contentLength: number } | null> {
  const command = new HeadObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });

  try {
    const res = await r2Client.send(command);
    return { contentLength: res.ContentLength ?? 0 };
  } catch (err) {
    const name = err instanceof Error ? err.name : undefined;
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      ?.$metadata?.httpStatusCode;
    if (name === "NotFound" || name === "NoSuchKey" || status === 404) {
      return null;
    }
    throw new Error(
      `R2 head failed: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }
}

export async function getPresignedDownloadUrl(
  storageKey: string,
  expiresIn = 60,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });

  try {
    return await getSignedUrl(r2Client, command, { expiresIn });
  } catch (err) {
    throw new Error(
      `R2 presign failed: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }
}

export async function deleteR2Object(storageKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });

  try {
    await r2Client.send(command);
  } catch (err) {
    throw new Error(
      `R2 delete failed: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }
}
