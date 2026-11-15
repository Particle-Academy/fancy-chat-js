import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Isomorphic: runs in a browser, a worker and Node. No node: imports in src.
  platform: "neutral",
  treeshake: true,
  // The import graph the no-Prism packaging check reads after a build.
  metafile: true,
});
