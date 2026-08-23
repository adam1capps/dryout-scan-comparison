import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // The roof scans ship from public/assets and land in dist/assets. Emitting
    // the JS bundle somewhere else keeps the two sets from ever colliding on a
    // filename, and keeps the long-cache header in netlify.toml aimed only at
    // the images it was written for.
    assetsDir: "_app",
    // The scans are already optimised PNGs; leave them as files rather than
    // inlining any of them into the bundle.
    assetsInlineLimit: 0,
  },
});
