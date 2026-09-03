/**
 * Host plugin: expose Ollama Cloud quota via an HTTP route.
 *
 * Registers a `webServer` route `GET /api/ollama-usage` that the client calls
 * on click (no core modification — `webServer.register` is plugin-accessible).
 * The handler resolves the API key from the DSH credentials service (written by
 * the client via `api.credentials.set`), fetches the quota, and returns JSON.
 */
import type { Context } from "@deepseek-ai/cordis";
import { fetchUsage, UsageError, type UsageSnapshot } from "./usage.js";

/** Credential reference (env-style) where the client stores the Ollama Cloud key. */
export const OLLAMA_KEY_REF = "OLLAMA_CLOUD_API_KEY";

/** The HTTP route this plugin exposes to the browser client. */
export const USAGE_ROUTE = "/api/ollama-usage";

/**
 * Resolve the Ollama Cloud API key from the credentials service, falling back
 * to the OLLAMA_API_KEY environment variable.
 */
export async function resolveApiKey(ctx: Context): Promise<string | null> {
  const credentials = ctx.get("credentials");
  if (credentials !== undefined) {
    try {
      const hit = await credentials.resolve(OLLAMA_KEY_REF as never);
      if (hit.value && hit.value.length > 0) return hit.value;
    } catch {
      // fall through to env
    }
  }
  const env = process.env.OLLAMA_API_KEY?.trim();
  return env ? env : null;
}

function send(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

/**
 * Host plugin body. Mounts the quota route using the plugin-accessible
 * `webServer` service. Dispose the returned function to unregister the route.
 */
export function apply(ctx: Context) {
  const webServer = ctx.get("webServer");
  if (webServer === undefined) {
    ctx.logger.warn("dsh-ollama-cloud-usage: webServer service unavailable; quota route not mounted.");
    return;
  }

  return webServer.register({
    kind: "exact",
    path: USAGE_ROUTE,
    async handler(req, res) {
      if (req.method !== "GET") {
        send(res, 405, { ok: false, error: { code: "method", message: "GET only" } });
        return;
      }

      const key = await resolveApiKey(ctx);
      if (!key) {
        send(res, 400, { ok: false, error: { code: "no-key", message: "No Ollama Cloud API key configured. Enter it in the quota popup." } });
        return;
      }

      try {
        const snapshot: UsageSnapshot = await fetchUsage(key);
        send(res, 200, { ok: true, value: snapshot });
      } catch (error) {
        if (error instanceof UsageError) {
          send(res, 502, { ok: false, error: { code: error.code, message: error.message } });
        } else {
          send(res, 500, { ok: false, error: { code: "internal", message: error instanceof Error ? error.message : String(error) } });
        }
      }
    },
  });
}
