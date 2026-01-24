import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = Number(env.VITE_DEV_PORT) || 5173;
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: devPort,
    },
  };
});
