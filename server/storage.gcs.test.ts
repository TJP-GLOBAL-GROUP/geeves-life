/**
 * Vitest tests for GCS-backed storage helpers (server/storage.ts)
 * Uses vi.mock to avoid real GCS calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock @google-cloud/storage before importing storage.ts ──────────────────
const mockGetSignedUrl = vi.fn();
const mockSave = vi.fn();
const mockFile = vi.fn(() => ({
  save: mockSave,
  getSignedUrl: mockGetSignedUrl,
}));
const mockBucket = vi.fn(() => ({ file: mockFile }));

vi.mock("@google-cloud/storage", () => ({
  Storage: vi.fn(() => ({ bucket: mockBucket })),
}));

// ── Mock ENV so we don't need real secrets ──────────────────────────────────
vi.mock("./_core/env", () => ({
  ENV: {
    gcsBucketName: "test-bucket",
    googleCredentialsJson: JSON.stringify({
      type: "service_account",
      project_id: "test-project",
      private_key_id: "key-id",
      private_key: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4PAtEsHAqgBOFnXMbHCqTCRvTHl\n-----END RSA PRIVATE KEY-----\n",
      client_email: "test@test-project.iam.gserviceaccount.com",
      client_id: "123456789",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
    }),
  },
}));

// ── Import AFTER mocks are set up ───────────────────────────────────────────
// We use dynamic import inside each test to get a fresh module per describe
// block; simpler approach: just import once and reset mocks in beforeEach.
import { storagePut, storageGet } from "./storage";

describe("storagePut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue(undefined);
    mockGetSignedUrl.mockResolvedValue(["https://storage.googleapis.com/test-bucket/receipts/file.pdf?X-Goog-Signature=abc"]);
  });

  it("uploads a Buffer and returns key + signed URL", async () => {
    const buf = Buffer.from("hello pdf");
    const result = await storagePut("receipts/file.pdf", buf, "application/pdf");

    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith(expect.any(Buffer), {
      metadata: { contentType: "application/pdf" },
      resumable: false,
    });
    expect(result.key).toBe("receipts/file.pdf");
    expect(result.url).toContain("storage.googleapis.com");
  });

  it("strips leading slashes from the key", async () => {
    const result = await storagePut("/receipts/file.pdf", Buffer.from("x"));
    expect(result.key).toBe("receipts/file.pdf");
    expect(mockFile).toHaveBeenCalledWith("receipts/file.pdf");
  });

  it("accepts a string payload and converts to Buffer", async () => {
    await storagePut("ics/feed.ics", "BEGIN:VCALENDAR\nEND:VCALENDAR", "text/calendar");
    const [savedBuffer] = mockSave.mock.calls[0];
    expect(Buffer.isBuffer(savedBuffer)).toBe(true);
    expect(savedBuffer.toString()).toBe("BEGIN:VCALENDAR\nEND:VCALENDAR");
  });

  it("accepts a Uint8Array payload", async () => {
    const arr = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    await storagePut("docs/hello.bin", arr);
    const [savedBuffer] = mockSave.mock.calls[0];
    expect(Buffer.isBuffer(savedBuffer)).toBe(true);
    expect(savedBuffer.toString()).toBe("Hello");
  });

  it("requests a signed URL with read action and future expiry", async () => {
    const before = Date.now();
    await storagePut("receipts/r.pdf", Buffer.from("x"));
    const [signedUrlOptions] = mockGetSignedUrl.mock.calls[0];
    expect(signedUrlOptions.action).toBe("read");
    expect(signedUrlOptions.expires).toBeGreaterThan(before);
  });
});

describe("storageGet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSignedUrl.mockResolvedValue(["https://storage.googleapis.com/test-bucket/receipts/file.pdf?X-Goog-Signature=xyz"]);
  });

  it("returns key + signed URL for an existing object", async () => {
    const result = await storageGet("receipts/file.pdf");
    expect(result.key).toBe("receipts/file.pdf");
    expect(result.url).toContain("storage.googleapis.com");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("strips leading slashes from the key", async () => {
    const result = await storageGet("/receipts/file.pdf");
    expect(result.key).toBe("receipts/file.pdf");
    expect(mockFile).toHaveBeenCalledWith("receipts/file.pdf");
  });

  it("requests a signed URL with read action", async () => {
    await storageGet("docs/report.pdf");
    const [signedUrlOptions] = mockGetSignedUrl.mock.calls[0];
    expect(signedUrlOptions.action).toBe("read");
  });
});
