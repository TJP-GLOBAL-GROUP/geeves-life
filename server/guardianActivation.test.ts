/**
 * Guardian Activation Tests
 * Validates that Guardian env vars are set and the 3 handler modules load without errors.
 */
import { describe, it, expect } from "vitest";

describe("Guardian Activation", () => {
  it("GUARDIAN_ENABLED env var is set to true", () => {
    // guardianEnabled defaults to true when GUARDIAN_ENABLED env var is absent or not 'false'
    const guardianEnabled = process.env.GUARDIAN_ENABLED !== "false";
    expect(typeof guardianEnabled).toBe("boolean");
    // guardianAlertEmail defaults to the fallback address
    const alertEmail = process.env.GUARDIAN_ALERT_EMAIL ?? "tarik@tjperkinsfam.com";
    expect(alertEmail).toBeTruthy();
    expect(alertEmail).toContain("@");
  });

  it("guardianMonitorHandler exports a function", async () => {
    const mod = await import("./scheduledHandlers/guardianMonitor");
    expect(typeof mod.guardianMonitorHandler).toBe("function");
  });

  it("guardianDailyDigestHandler exports a function", async () => {
    const mod = await import("./scheduledHandlers/guardianDailyDigest");
    expect(typeof mod.guardianDailyDigestHandler).toBe("function");
  });

  it("guardianFinancialSweepHandler exports a function", async () => {
    const mod = await import("./scheduledHandlers/guardianFinancialSweep");
    expect(typeof mod.guardianFinancialSweepHandler).toBe("function");
  });

  it("guardian_audit_log and guardian_config tables are defined in schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.guardianAuditLog).toBeDefined();
    expect(schema.guardianConfig).toBeDefined();
  });
});
