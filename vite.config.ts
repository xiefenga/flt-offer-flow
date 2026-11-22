import { defineConfig } from "vite";
import stylex from "@stylexjs/unplugin";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [
    babel({ presets: [reactCompilerPreset()] }),
    stylex.vite(),
    react(),
    {
      name: "offer-flow-dev-csp",
      apply: "serve",
      transformIndexHtml(html) {
        // Fast Refresh injects a module preamble and Vite connects over WebSocket.
        return html
          .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
          .replace("connect-src 'none'", "connect-src 'self' ws://127.0.0.1:*");
      },
    },
  ],
});
