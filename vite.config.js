import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "url";
import fs from "fs";
import path from "path";
import process from "process";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

import { version } from "./package.json";

function writeVersionPlugin() {
  return {
    name: "write-version",
    closeBundle() {
      fs.writeFileSync("dist/VERSION", version);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: "",
  build: {
    assetsDir: "resources",
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    writeVersionPlugin(),
    // Custom plugin to serve dummy-data JSON files without sourcemap injection
    {
      name: "dummy-data-json-handler",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith("/dummy-data/")) {
            // Remove query parameters from URL to get the actual file path
            const urlWithoutQuery = req.url.split("?")[0];
            const filePath = path.join(process.cwd(), urlWithoutQuery);

            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              res.end(fs.readFileSync(filePath, "utf8"));
              return;
            }
          }
          next();
        });
      },
    },
    // Custom plugin to serve assets from /var/lib/homer/
    {
      name: "live-assets-handler",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith("/assets/")) {
            // Remove query parameters from URL to get the actual file path
            const urlWithoutQuery = req.url.split("?")[0];
            const relativePath = urlWithoutQuery.replace("/assets/", "");
            const filePath = path.join("/var/lib/homer", relativePath);

            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              // Determine content type based on file extension
              const ext = path.extname(filePath).toLowerCase();
              const contentTypes = {
                '.svg': 'image/svg+xml',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.css': 'text/css',
                '.yml': 'text/yaml',
                '.yaml': 'text/yaml',
                '.json': 'application/json',
              };

              const contentType = contentTypes[ext] || 'application/octet-stream';
              res.setHeader('Content-Type', contentType);

              // Read as binary for images, text for others
              if (ext === '.yml' || ext === '.yaml' || ext === '.css' || ext === '.json') {
                res.end(fs.readFileSync(filePath, "utf8"));
              } else {
                res.end(fs.readFileSync(filePath));
              }
              return;
            }
          }
          next();
        });
      },
    },
    // Custom plugin: server-side proxy for restarting Proxmox LXC containers.
    // The browser only ever calls these same-origin endpoints (no CORS, no token
    // in the client). The API token + service->container map live server-side in
    // /var/lib/homer/proxmox-restart.json (gitignored). The map is the whitelist:
    // only services listed there can be rebooted, by name.
    {
      name: "proxmox-restart-handler",
      configureServer(server) {
        const DATA_FILE = "/var/lib/homer/proxmox-restart.json";

        const sendJson = (res, status, obj) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(obj));
        };

        const loadData = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith("/api/proxmox/")) return next();
          const urlPath = req.url.split("?")[0];

          try {
            // List restartable service names only — no secrets leave the server.
            if (req.method === "GET" && urlPath === "/api/proxmox/services") {
              const data = loadData();
              return sendJson(res, 200, {
                services: Object.keys(data.services || {}),
              });
            }

            // Restart a container, identified by service name (server-side lookup).
            if (req.method === "POST" && urlPath === "/api/proxmox/restart") {
              let body = "";
              for await (const chunk of req) body += chunk;

              let parsed;
              try {
                parsed = JSON.parse(body || "{}");
              } catch {
                return sendJson(res, 400, { error: "Invalid JSON body" });
              }

              const data = loadData();
              const svc = data.services?.[parsed.service];
              if (!svc) {
                return sendJson(res, 403, {
                  error: `Service not allowed: ${parsed.service}`,
                });
              }

              const host = data.hosts?.[svc.host];
              if (!host) {
                return sendJson(res, 500, {
                  error: `Unknown host '${svc.host}' for service ${parsed.service}`,
                });
              }

              const url = `${host.apiBase}/api2/json/nodes/${host.node}/lxc/${svc.vmid}/status/reboot`;
              const pveRes = await fetch(url, {
                method: "POST",
                headers: { Authorization: `PVEAPIToken=${host.token}` },
                // Proxmox uses an internal CA cert; the token is the real
                // security boundary. Server-side call only — never the browser.
                tls: { rejectUnauthorized: false },
              });
              const text = await pveRes.text();

              if (!pveRes.ok) {
                console.warn(
                  `[proxmox-restart] FAILED ${parsed.service} (${svc.host}/${svc.vmid}): ${pveRes.status} ${text.slice(0, 200)}`,
                );
                return sendJson(res, 502, {
                  error: `Proxmox API error (${pveRes.status})`,
                  detail: text.slice(0, 500),
                });
              }
              console.log(
                `[proxmox-restart] OK ${parsed.service} (${svc.host}/${svc.vmid}) rebooted`,
              );
              return sendJson(res, 200, {
                ok: true,
                service: parsed.service,
                vmid: svc.vmid,
              });
            }

            return sendJson(res, 404, { error: "Not found" });
          } catch (e) {
            return sendJson(res, 500, { error: String((e && e.message) || e) });
          }
        });
      },
    },
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      useCredentials: true,
      manifestFilename: "assets/manifest.json",
      manifest: {
        name: "Homer dashboard",
        short_name: "Homer",
        description: "Home Server Dashboard",
        theme_color: "#3367D6",
        start_url: "../",
        scope: "../",
        icons: [
          {
            src: "./icons/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "./icons/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        navigateFallback: null,
      },
    }),
  ],
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./node_modules", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
      },
    },
  },
});
