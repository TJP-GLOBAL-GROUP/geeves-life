// File storage helpers — backed by Google Cloud Storage (GCS)
// Credentials are injected from environment variables (GCS_BUCKET_NAME, GOOGLE_APPLICATION_CREDENTIALS_JSON)

import { Storage } from "@google-cloud/storage";
import { ENV } from "./_core/env";

let _storageClient: Storage | null = null;
let _bucketName: string | null = null;

function getGCSClient(): { storage: Storage; bucketName: string } {
  if (_storageClient && _bucketName) {
    return { storage: _storageClient, bucketName: _bucketName };
  }

  const bucketName = ENV.gcsBucketName;
  const credentialsJson = ENV.googleCredentialsJson;

  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME environment variable is not set");
  }
  if (!credentialsJson) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable is not set"
    );
  }

  let credentials: object;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON"
    );
  }

  // Fix PEM header/footer spacing that gets stripped when JSON passes through
  // some interfaces (e.g. "-----BEGINPRIVATEKEY-----" → "-----BEGIN PRIVATE KEY-----")
  const creds = credentials as Record<string, unknown>;
  if (typeof creds.private_key === "string") {
    creds.private_key = creds.private_key
      .replace(/-----BEGIN(\w+)KEY-----/g, "-----BEGIN $1 KEY-----")
      .replace(/-----END(\w+)KEY-----/g, "-----END $1 KEY-----");
  }

  _storageClient = new Storage({ credentials });
  _bucketName = bucketName;
  return { storage: _storageClient, bucketName: _bucketName };
}

/**
 * Upload bytes to GCS and return the storage key and a signed download URL.
 *
 * @param relKey  Relative object key, e.g. "receipts/household-123/receipt-456.pdf"
 * @param data    File bytes (Buffer, Uint8Array, or string)
 * @param contentType  MIME type, defaults to "application/octet-stream"
 * @returns { key, url } where `url` is a signed URL valid for 7 days
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { storage, bucketName } = getGCSClient();
  const key = normalizeKey(relKey);
  const file = storage.bucket(bucketName).file(key);

  const buffer =
    typeof data === "string"
      ? Buffer.from(data, "utf-8")
      : Buffer.from(data as Uint8Array);

  await file.save(buffer, {
    metadata: { contentType },
    resumable: false,
  });

  // Generate a signed URL valid for 7 days
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  return { key, url };
}

/**
 * Get a fresh signed download URL for an existing GCS object.
 *
 * @param relKey  Relative object key previously returned by storagePut
 * @returns { key, url } where `url` is a signed URL valid for 7 days
 */
export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const { storage, bucketName } = getGCSClient();
  const key = normalizeKey(relKey);
  const file = storage.bucket(bucketName).file(key);

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  return { key, url };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}
