import { DEV_SUPEROFFICE_URL } from "./src/superoffice-config/superoffice-url.ts";
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devCookies = env.VITE_DEV_COOKIES?.trim() ?? "";

  return {
  server: {
        proxy: {
          '/api': {
            target: DEV_SUPEROFFICE_URL,
            changeOrigin: true,
            headers: {
              Cookie: devCookies
            },
            rewrite: (path) => path.replace(/^\/api/, ''),
        }
      },
    },
  build: {
      rollupOptions: {
        output: {
          assetFileNames: (assetInfo) => {
            if (assetInfo.name === "index.css") return "style.css";
            return assetInfo.name || "style.css";
          },
          entryFileNames: "build.js",
          // CRMScript strings hold one byte per character - an emoji has no such byte, so this
          // escapes it to \u{...} instead of shipping it raw.
          minify: { codegen: { asciiOnly: true } }
        }
      }
    },
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  };
})
