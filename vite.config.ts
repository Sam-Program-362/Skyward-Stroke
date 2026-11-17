import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ensures /manifest.webmanifest and /sw.js are served with standard PWA MIME headers.
 */
function pwaHeadersPlugin(): Plugin {
  const applyHeaders = (
    url: string | undefined,
    setHeader: (name: string, value: string) => void
  ) => {
    if (!url) return;
    const cleanPath = url.split("?")[0];
    if (cleanPath === "/manifest.webmanifest") {
      setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    } else if (cleanPath === "/sw.js") {
      setHeader("Content-Type", "application/javascript; charset=utf-8");
      setHeader("Service-Worker-Allowed", "/");
      setHeader("Cache-Control", "no-cache");
    }
  };

  return {
    name: "skyward-pwa-headers",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        applyHeaders(req.url, (k, v) => res.setHeader(k, v));
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        applyHeaders(req.url, (k, v) => res.setHeader(k, v));
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pwaHeadersPlugin()],
  // The dev/preview servers must accept requests proxied for the preview host.
  server: { host: "0.0.0.0", allowedHosts: true },
  preview: { host: "0.0.0.0", allowedHosts: true },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
