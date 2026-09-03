/**
 * Host entry: re-export the host plugin surface from host.ts.
 * Bundled by build.mjs into lib/index.js (the package `main`).
 */
export { apply, inject, name, resolveApiKey, OLLAMA_KEY_REF, USAGE_ROUTE } from "./host.js";
