// Private CV bucket for the worker (Railway bucket, S3 API). Keys are never logged.
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import type { CvBucketEnv } from "./env";

export interface CvBucket {
  get(key: string): Promise<Uint8Array>;
  /** Size in bytes, or null when the object does not exist. */
  head(key: string): Promise<number | null>;
  /** Idempotent: deleting a missing key succeeds. */
  delete(key: string): Promise<void>;
  /** One page of keys under a prefix, with the token for the next page. */
  list(
    prefix: string,
    options?: { continuationToken?: string; limit?: number },
  ): Promise<{ objects: { key: string; lastModified: Date | null }[]; nextToken?: string }>;
}

export function createCvBucket(env: CvBucketEnv): CvBucket {
  const client = new S3Client({
    endpoint: env.endpoint,
    region: env.region,
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
    forcePathStyle: false,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = env.bucket;
  return {
    async get(key) {
      const out = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      if (!out.Body) throw new Error("empty object body");
      return out.Body.transformToByteArray();
    },
    async head(key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return out.ContentLength ?? 0;
      } catch (error) {
        if (error instanceof Error && error.name === "NotFound") return null;
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async list(prefix, options = {}) {
      const out = await client.send(
        new ListObjectsV2Command({
          Bucket,
          Prefix: prefix,
          MaxKeys: options.limit ?? 1000,
          ContinuationToken: options.continuationToken,
        }),
      );
      return {
        objects: (out.Contents ?? [])
          .filter((o): o is typeof o & { Key: string } => typeof o.Key === "string")
          .map((o) => ({ key: o.Key, lastModified: o.LastModified ?? null })),
        ...(out.NextContinuationToken ? { nextToken: out.NextContinuationToken } : {}),
      };
    },
  };
}
