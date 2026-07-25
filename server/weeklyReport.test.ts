/**
 * Contract tests for POST /api/admin/system-reports/weekly
 *
 * Tests the request/response contract without actually calling Resend or marked.
 * Covers: auth header validation, body validation, and success response shape.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ── Mock Resend ────────────────────────────────────────────────────────────
vi.mock("resend", () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "mock-resend-id-123" },
          error: null,
        }),
      },
    })),
  };
});

// ── Mock marked ────────────────────────────────────────────────────────────
vi.mock("marked", () => ({
  marked: {
    parse: vi.fn().mockResolvedValue("<p>Hello <strong>World</strong></p>"),
  },
}));

// ── Set required env vars before importing handler ─────────────────────────
process.env.SYSTEM_CRON_SECRET = "test-cron-secret-abc123";
process.env.RESEND_API_KEY = "re_test_key";

// Import after env vars are set
const { weeklyReportHandler } = await import("./scheduledHandlers/weeklyReport");

// ── Helpers ────────────────────────────────────────────────────────────────
function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: { "x-cron-secret": "test-cron-secret-abc123" },
    body: { markdownBody: "# Weekly Report\n\nAll systems nominal." },
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; statusCode: number; body: unknown } {
  const ctx = { statusCode: 200, body: {} as unknown };
  const res = {
    status: vi.fn().mockImplementation((code: number) => {
      ctx.statusCode = code;
      return res;
    }),
    json: vi.fn().mockImplementation((data: unknown) => {
      ctx.body = data;
      return res;
    }),
  } as unknown as Response;
  return { res, ...ctx };
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("POST /api/admin/system-reports/weekly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when x-cron-secret header is missing", async () => {
    const req = makeReq({ headers: {} });
    const { res, statusCode } = makeRes();
    await weeklyReportHandler(req, res);
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(401);
  });

  it("returns 401 when x-cron-secret header is wrong", async () => {
    const req = makeReq({ headers: { "x-cron-secret": "wrong-secret" } });
    const { res } = makeRes();
    await weeklyReportHandler(req, res);
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(401);
  });

  it("returns 400 when markdownBody is missing", async () => {
    const req = makeReq({ body: {} });
    const { res } = makeRes();
    await weeklyReportHandler(req, res);
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400);
  });

  it("returns 400 when markdownBody is empty string", async () => {
    const req = makeReq({ body: { markdownBody: "   " } });
    const { res } = makeRes();
    await weeklyReportHandler(req, res);
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400);
  });

  it("returns 200 with success shape on valid request", async () => {
    const req = makeReq();
    const { res } = makeRes();
    await weeklyReportHandler(req, res);

    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall).toMatchObject({
      success: true,
      resendId: "mock-resend-id-123",
      to: "tarik@tjperkinsfam.com",
      from: expect.stringContaining("reports@geeves.life"),
      subject: expect.stringContaining("Weekly Governance Report"),
      sentAt: expect.any(String),
    });
  });

  it("accepts optional subject override in body", async () => {
    const req = makeReq({ body: { markdownBody: "# Report", subject: "Sprint 42 Review" } });
    const { res } = makeRes();
    await weeklyReportHandler(req, res);

    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall.subject).toContain("Sprint 42 Review");
  });
});
