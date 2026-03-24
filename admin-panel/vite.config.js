import { defineConfig, loadEnv } from "vite";
import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = Number(env.VITE_DEV_PORT) || 5174;
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: devPort,
      host: "0.0.0.0",
      allowedHosts: ["admin.dev.akbrzda.ru", "panda.akbrzda.ru"],
      hmr: {
        protocol: "wss",
        host: "admin.dev.akbrzda.ru",
        clientPort: 443,
      },
    },
  };
});
