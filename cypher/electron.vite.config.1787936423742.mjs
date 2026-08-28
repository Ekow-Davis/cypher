// electron.vite.config.ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
var shared = resolve("src/shared");
var electron_vite_config_default = defineConfig({
  main: {
    resolve: { alias: { "@shared": shared } },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    resolve: { alias: { "@shared": shared } },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
        "@shared": shared
      }
    },
    // pdfjs-dist is excluded: it ships ESM with a separate worker file, and
    // pre-bundling it breaks the worker URL resolution.
    optimizeDeps: { include: ["epubjs"], exclude: ["pdfjs-dist"] },
    plugins: [vue(), tailwindcss()]
  }
});
export {
  electron_vite_config_default as default
};
