/**
 * Build script: bundle the host and client halves of the plugin.
 *
 * - Host  → lib/index.js  (ESM, exports `apply`; `@deepseek-ai/cordis` is
 *   type-only so it is erased — no runtime externals).
 * - Client → lib/client.js (CJS closure-factory in the DSH
 *   `window.__ModuleLoader__.load({ id, factory: (require) => ... })` format;
 *   `react` / `react/jsx-runtime` resolve through the loader module table).
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const PLUGIN_ID = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).name;

const watch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  sourcemap: true,
  logLevel: "info",
};

// Host bundle
const host = build({
  ...shared,
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  format: "esm",
  platform: "node",
  target: "node18",
  external: ["@deepseek-ai/cordis"],
});

// Client bundle
const client = build({
  ...shared,
  entryPoints: ["src/client.tsx"],
  outfile: "lib/client.js",
  format: "cjs",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime", "@deepseek-ai/cordis"],
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: "return module.exports; } });",
  },
});

if (watch) {
  await Promise.all([host, client]);
  console.log("watching for changes…");
} else {
  await Promise.all([host, client]);
  console.log("build complete: lib/index.js + lib/client.js");
}
