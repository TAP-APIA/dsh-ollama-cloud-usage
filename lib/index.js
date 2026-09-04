// src/usage.ts
var OLLAMA_USAGE_URL = "https://ollama.com/api/usage";
var UsageError = class extends Error {
  code;
  status;
  constructor(code, message, status) {
    super(message);
    this.name = "UsageError";
    this.code = code;
    this.status = status;
  }
};
var MAX_RESPONSE_BYTES = 64 * 1024;
var TIMEOUT_MS = 15e3;
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function boundedUsageFraction(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    return void 0;
  }
  return value <= 1 ? value : value / 100;
}
function boundedRequestCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
function modelBreakdown(value) {
  const obj = objectValue(value);
  if (!obj) return void 0;
  const result = {};
  const name2 = typeof obj.name === "string" ? obj.name.trim() : void 0;
  const requestCount = boundedRequestCount(obj.request_count);
  if (name2) result.name = name2;
  if (requestCount !== void 0) result.requestCount = requestCount;
  return Object.keys(result).length > 0 ? result : void 0;
}
function usageWindow(value) {
  const obj = objectValue(value);
  if (!obj) return void 0;
  const result = { models: [] };
  const usage = boundedUsageFraction(obj.usage);
  if (usage !== void 0) result.usageFraction = usage;
  if (Array.isArray(obj.models)) {
    result.models = obj.models.map(modelBreakdown).filter((e) => e !== void 0);
  }
  return result.usageFraction !== void 0 || result.models.length > 0 ? result : void 0;
}
function parseUsage(value) {
  const root = objectValue(value);
  if (!root) throw new UsageError("invalid", "Ollama usage returned an invalid response.");
  const snapshot = { session: { models: [] }, weekly: { models: [] } };
  const activity = objectValue(root.activity);
  if (activity && typeof activity.cost === "string" && /^[0-9.]{1,20}$/.test(activity.cost)) {
    snapshot.cost = activity.cost;
  }
  const limits = objectValue(root.limits);
  if (!limits) return snapshot;
  const session = usageWindow(limits.session);
  const weekly = usageWindow(limits.weekly);
  if (session) snapshot.session = session;
  if (weekly) snapshot.weekly = weekly;
  return snapshot;
}
function httpError(status) {
  if (status === 401 || status === 403) {
    return new UsageError("auth", "Ollama Cloud authentication was rejected. Check your API key.", status);
  }
  if (status === 429) {
    return new UsageError("http", "Ollama usage is rate limited. Try again later.", status);
  }
  return new UsageError("http", `Ollama usage request failed with status ${status}.`, status);
}
async function attemptOnce(apiKey, signal) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    let response;
    try {
      response = await fetch(OLLAMA_USAGE_URL, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json"
        }
      });
    } catch {
      if (signal?.aborted) throw new UsageError("transport", "Ollama usage request was cancelled.");
      if (timedOut) throw new UsageError("timeout", "Ollama usage request timed out.");
      throw new UsageError("transport", "Ollama usage request failed.");
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => void 0);
      throw httpError(response.status);
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new UsageError("invalid", "Ollama usage returned an oversized response.");
    }
    try {
      return parseUsage(JSON.parse(text));
    } catch (error) {
      if (error instanceof UsageError) throw error;
      throw new UsageError("invalid", "Ollama usage returned malformed JSON.");
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchUsage(apiKey, signal) {
  if (!apiKey) {
    throw new UsageError("auth", "An Ollama Cloud API key is required.");
  }
  const MAX_ATTEMPTS = 3;
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptOnce(apiKey, signal);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof UsageError && (error.code === "transport" || error.code === "timeout");
      if (!retryable || attempt === MAX_ATTEMPTS || signal?.aborted) throw error;
      await sleep(600 * attempt);
    }
  }
  throw lastError;
}

// src/host.ts
var name = "ollama-cloud-usage";
var inject = ["webServer"];
var OLLAMA_KEY_REF = "OLLAMA_CLOUD_API_KEY";
var USAGE_ROUTE = "/api/ollama-usage";
async function resolveApiKey(ctx) {
  const credentials = ctx.get("credentials");
  if (credentials !== void 0) {
    try {
      const hit = await credentials.resolve(OLLAMA_KEY_REF);
      if (hit.value && hit.value.length > 0) return hit.value;
    } catch {
    }
  }
  const env = process.env.OLLAMA_API_KEY?.trim();
  return env ? env : null;
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
function apply(ctx) {
  const webServer = ctx.get("webServer");
  if (webServer === void 0) {
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
        const snapshot = await fetchUsage(key);
        send(res, 200, { ok: true, value: snapshot });
      } catch (error) {
        if (error instanceof UsageError) {
          send(res, 502, { ok: false, error: { code: error.code, message: error.message } });
        } else {
          send(res, 500, { ok: false, error: { code: "internal", message: error instanceof Error ? error.message : String(error) } });
        }
      }
    }
  });
}
export {
  OLLAMA_KEY_REF,
  USAGE_ROUTE,
  apply,
  inject,
  name,
  resolveApiKey
};
//# sourceMappingURL=index.js.map
