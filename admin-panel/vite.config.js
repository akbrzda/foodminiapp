import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = Number(env.VITE_DEV_PORT) || 5174;
  return {
    plugins: [vue()],
    server: {
      port: devPort,
    },
  };
});
