import { readFile } from "node:fs/promises";
import { loadEnv } from "vite";

// configureServer runs only in Vite development, never build or preview.
export function devAdminPlugin() {
  return {
    name: "digarsa-local-admin-setup",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!["/__demo/admin", "/__demo/admin-credentials"].includes(req.url)) return next();
        const origin = `http://${req.headers.host}`;
        const localConnection = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket?.remoteAddress);
        const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || "");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        if (!localConnection || !localHost || (req.headers.origin && req.headers.origin !== origin)) {
          res.statusCode = 403;
          return res.end("Local development only");
        }
        if (req.url === "/__demo/admin") {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.end(await readFile(new URL("./src/dev/adminSetup.html", import.meta.url), "utf8"));
        }
        res.setHeader("Content-Type", "application/json");
        if (req.method !== "POST" || req.headers["x-digarsa-local-setup"] !== "1" || req.headers.origin !== origin) {
          res.statusCode = 403;
          return res.end(JSON.stringify({ error: "Explicit same-origin local setup required." }));
        }
        // No VITE_ prefix: these values never become import.meta.env client data.
        const env = loadEnv("demo-admin", server.config.root, "DIGARSA_DEMO_ADMIN_");
        const password = env.DIGARSA_DEMO_ADMIN_PASSWORD;
        if (!password) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: "Isi DIGARSA_DEMO_ADMIN_PASSWORD di .env.demo-admin.local terlebih dahulu." }));
        }
        return res.end(JSON.stringify({ email: "srikandi@gmail.com", password }));
      });
    },
  };
}
