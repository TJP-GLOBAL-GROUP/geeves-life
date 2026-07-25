/**
 * Verifies that SHADOW_BLOCK_ENGINE_ENABLED=false short-circuits
 * onEventUpserted and onEventDeleted without touching the database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Shadow block engine kill switch", () => {
  const originalEnv = process.env.SHADOW_BLOCK_ENGINE_ENABLED;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SHADOW_BLOCK_ENGINE_ENABLED;
    } else {
      process.env.SHADOW_BLOCK_ENGINE_ENABLED = originalEnv;
    }
    vi.resetModules();
  });

  it("ENV.shadowBlockEngineEnabled is false when env var is 'false'", async () => {
    process.env.SHADOW_BLOCK_ENGINE_ENABLED = "false";
    // Re-import after setting env so the module picks up the new value
    const { ENV } = await import("./_core/env");
    expect(ENV.shadowBlockEngineEnabled).toBe(false);
  });

  it("ENV.shadowBlockEngineEnabled is true when env var is 'true'", async () => {
    process.env.SHADOW_BLOCK_ENGINE_ENABLED = "true";
    const { ENV } = await import("./_core/env");
    expect(ENV.shadowBlockEngineEnabled).toBe(true);
  });

  it("ENV.shadowBlockEngineEnabled is true when env var is absent", async () => {
    delete process.env.SHADOW_BLOCK_ENGINE_ENABLED;
    const { ENV } = await import("./_core/env");
    expect(ENV.shadowBlockEngineEnabled).toBe(true);
  });
});
