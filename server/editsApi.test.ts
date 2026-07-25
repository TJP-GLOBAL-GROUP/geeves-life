import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB so tests run without a live database ────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    execute: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
        orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
  }),
}));

import express from "express";
import request from "supertest";
import { createEditsApiRouter } from "./endpoints/editsApi";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", createEditsApiRouter());
  return app;
}

describe("Edits API", () => {
  beforeEach(() => {
    process.env.EDIT_SECRET = "test-secret-123";
  });

  it("GET /api/health returns ok:true when DB is up", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe("up");
  });

  it("POST /api/edits returns 401 with wrong secret", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/edits")
      .send({ secret: "wrong-secret", edits: [{ txn_id: 1, to: "PERS" }] });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("POST /api/edits returns 400 when all arrays are empty", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/edits")
      .send({ secret: "test-secret-123", edits: [], splits: [], field_edits: [] });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("POST /api/edits returns 400 for invalid vertical", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/edits")
      .send({ secret: "test-secret-123", edits: [{ txn_id: 1, to: "INVALID" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid vertical/);
  });

  it("POST /api/edits succeeds with valid edit", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/edits")
      .send({
        secret: "test-secret-123",
        edits: [{ txn_id: 5144, to: "PERS", meta: { desc: "test", amount: 42.42, date: "2022-12-25", currency: "USD" } }],
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.applied).toBe("number");
  });

  it("GET /api/edit-log returns rows array", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/edit-log?limit=10");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it("OPTIONS preflight returns 204 with CORS headers", async () => {
    const app = buildApp();
    const res = await request(app)
      .options("/api/edits")
      .set("Origin", "https://explorer.example.com")
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});
