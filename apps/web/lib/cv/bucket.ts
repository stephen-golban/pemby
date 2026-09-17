// Private CV bucket (Railway bucket, S3 API). Objects are never exposed to browsers.
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type BucketClient = { client: S3Client; bucket: string };

const globalForBucket = globalThis as typeof globalThis & { __pembyCvBucket?: BucketClient };

/** Throws when a bucket variable is missing; the routes turn that into 503 `unavailable`. */
function getBucket(): BucketClient {
  if (!globalForBucket.__pembyCvBucket) {
    const { BUCKET, ENDPOINT, REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY } = process.env;
    if (!BUCKET || !ENDPOINT || !REGION || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
      throw new Error("bucket variables are not set");
    }
    globalForBucket.__pembyCvBucket = {
      bucket: BUCKET,
      client: new S3Client({
        endpoint: ENDPOINT,
        region: REGION,
        credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
        // New Railway buckets use virtual-hosted-style URLs.
        forcePathStyle: false,
        // Only send checksums an S3-compatible store is sure to accept.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
    };
  }
  return globalForBucket.__pembyCvBucket;
}

/** `cv/<userId>/<cvId>`: no extension and no file name. */
export function cvBucketKey(userId: string, cvId: string): string {
  return `cv/${userId}/${cvId}`;
}

export async function putCvObject(key: string, bytes: Uint8Array, contentType: string) {
  const { client, bucket } = getBucket();
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }),
  );
}

/** Idempotent: deleting a missing key succeeds. */
export async function deleteCvObject(key: string) {
  const { client, bucket } = getBucket();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
