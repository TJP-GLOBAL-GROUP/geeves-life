import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createRequire } from "module";

// NOTE (Cloud Run fix, hardened 2026-07-28): `vite` and `vite.config` must NOT
// appear in the production bundle at all — not even as dynamic import(), which
// esbuild can hoist/code-split into a statically-loaded chunk that crashes the
// container at boot with ERR_MODULE_NOT_FOUND (vite is a devDependency).
// We therefore resolve vite at RUNTIME via createRequire, which esbuild cannot
// trace. This code path only ever executes in development.

export async function setupVite(app: Express, server: Server) {
  const require = createRequire(import.meta.url);
  const { createServer: createViteServer } = require("vite");
  const configFile = path.resolve(import.meta.dirname, "../..", "vite.config.ts");
  const vite = await createViteServer({
    configFile,
    server: {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: true as const,
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
