// Production static file server.
// This file has NO import from "vite" — safe to load in production where
// vite is not installed (devDependency only).
import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // In production the esbuild output lands at dist/index.js, so
  // import.meta.dirname === /app/dist  →  /app/dist/public (vite build output)
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `[serveStatic] Could not find build directory: ${distPath}. Run 'pnpm build' first.`
    );
  }

  app.use(express.static(distPath));

  // SPA fallback — send index.html for any unmatched route
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
