import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 client. R2 is S3-compatible — we use the AWS SDK v3
 * with R2's endpoint. Required env vars:
 *
 *   R2_ACCOUNT_ID         — Cloudflare account ID (not the API token)
 *   R2_ACCESS_KEY_ID      — R2 API token's access key
 *   R2_SECRET_ACCESS_KEY  — R2 API token's secret key
 *   R2_BUCKET_NAME        — bucket name (e.g. "hakivo-audio")
 *   R2_PUBLIC_BASE_URL    — public URL prefix. Use the bucket's r2.dev URL
 *                           or, preferably, a custom domain bound to the
 *                           bucket. Trailing slash optional.
 *
 * Public access: configure the bucket's "Public access" setting in the
 * Cloudflare dashboard to expose r2.dev URLs, OR bind a custom domain.
 * We do NOT generate signed URLs here — that's a future change for
 * private packets.
 */

export type R2Config = {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucketName: string;
  readonly publicBaseUrl: string;
};

export type UploadArgs = {
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly cacheControl?: string;
};

export type UploadResult = {
  readonly key: string;
  readonly publicUrl: string;
  readonly bytes: number;
};

export type R2Uploader = {
  readonly upload: (args: UploadArgs) => Promise<UploadResult>;
};

export function loadR2ConfigFromEnv(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  const missing = [
    !accountId && "R2_ACCOUNT_ID",
    !accessKeyId && "R2_ACCESS_KEY_ID",
    !secretAccessKey && "R2_SECRET_ACCESS_KEY",
    !bucketName && "R2_BUCKET_NAME",
    !publicBaseUrl && "R2_PUBLIC_BASE_URL",
  ].filter((s): s is string => Boolean(s));
  if (missing.length > 0) {
    throw new Error(`R2 env missing: ${missing.join(", ")}`);
  }

  return {
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucketName: bucketName!,
    publicBaseUrl: publicBaseUrl!,
  };
}

export function createR2Uploader(config: R2Config): R2Uploader {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const baseUrl = config.publicBaseUrl.replace(/\/$/, "");

  return {
    async upload({ key, body, contentType, cacheControl }) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: key,
          Body: body,
          ContentType: contentType,
          ...(cacheControl && { CacheControl: cacheControl }),
        }),
      );
      return {
        key,
        publicUrl: `${baseUrl}/${key}`,
        bytes: body.byteLength,
      };
    },
  };
}
