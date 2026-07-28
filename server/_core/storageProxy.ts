/**
 * Storage Proxy Stub
 *
 * Registers Express routes for GCS-backed file storage proxy.
 * Currently a no-op — the full implementation will proxy authenticated
 * requests to Google Cloud Storage objects through the app domain.
 *
 * Called in server/_core/index.ts before tRPC setup.
 */

import type { Express } from "express";

export function registerStorageProxy(_app: Express): void {
  // Stub: no routes registered yet.
  // When implemented, this will serve GCS files through /storage/* paths
  // with authenticated access checks.
  //
  // Example:
  //   app.get("/storage/:key", async (req, res) => { ... });
  //
  // For now, files are served directly via signed URLs from storage.ts.
}
