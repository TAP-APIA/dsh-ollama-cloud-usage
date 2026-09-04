/**
 * Ollama Cloud quota fetch + parse (host side).
 *
 * Ported from `pi-ollama-cloud-usage` (MIT) — the authenticated
 * `GET https://ollama.com/api/usage` surface. This module is dependency-free
 * and runs in the DSH host (Node) process.
 *
 * The response shape (same data as ollama.com/settings):
 *   {
 *     activity: { cost: "1.23", period: { type, starting_at, ending_at } },
 *     limits: {
 *       session: { usage: 0.98, models: [{ name, request_count }] },  // 5h window
 *       weekly:  { usage: 0.983, models: [...] }                       // 7d window
 *     }
 *   }
 * `usage` is a fraction (0.98 = 98% used).
 */

export const OLLAMA_USAGE_URL = "https://ollama.com/api/usage";

export interface UsageModelBreakdown {
  name?: string;
  requestCount?: number;
}

export interface UsageWindow {
  /** Quota fraction used: 0.98 = 98%. Absent when the window is not reported. */
  usageFraction?: number;
  models: UsageModelBreakdown[];
}

export interface UsageSnapshot {
  cost?: string;
  session: UsageWindow;
  weekly: UsageWindow;
}

export class UsageError extends Error {
  readonly code: "auth" | "http" | "invalid" | "timeout" | "transport";
  readonly status?: number;

  constructor(
    code: UsageError["code"],
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "UsageError";
    this.code = code;
    this.status = status;
  }
}

const MAX_RESPONSE_BYTES = 64 * 1024;
const TIMEOUT_MS = 15_000;

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** usage is a fraction (0.98); tolerate a defensive percent-style value (98). */
function boundedUsageFraction(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    return undefined;
  }
  return value <= 1 ? value : value / 100;
}

function boundedRequestCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function modelBreakdown(value: unknown): UsageModelBreakdown | undefined {
  const obj = objectValue(value);
  if (!obj) return undefined;
  const result: UsageModelBreakdown = {};
  const name = typeof obj.name === "string" ? obj.name.trim() : undefined;
  const requestCount = boundedRequestCount(obj.request_count);
  if (name) result.name = name;
  if (requestCount !== undefined) result.requestCount = requestCount;
  return Object.keys(result).length > 0 ? result : undefined;
}

function usageWindow(value: unknown): UsageWindow | undefined {
  const obj = objectValue(value);
  if (!obj) return undefined;
  const result: UsageWindow = { models: [] };
  const usage = boundedUsageFraction(obj.usage);
  if (usage !== undefined) result.usageFraction = usage;
  if (Array.isArray(obj.models)) {
    result.models = obj.models
      .map(modelBreakdown)
      .filter((e): e is UsageModelBreakdown => e !== undefined);
  }
  return result.usageFraction !== undefined || result.models.length > 0
    ? result
    : undefined;
}

export function parseUsage(value: unknown): UsageSnapshot {
  const root = objectValue(value);
  if (!root) throw new UsageError("invalid", "Ollama usage returned an invalid response.");

  const snapshot: UsageSnapshot = { session: { models: [] }, weekly: { models: [] } };

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

function httpError(status: number): UsageError {
  if (status === 401 || status === 403) {
    return new UsageError("auth", "Ollama Cloud authentication was rejected. Check your API key.", status);
  }
  if (status === 429) {
    return new UsageError("http", "Ollama usage is rate limited. Try again later.", status);
  }
  return new UsageError("http", `Ollama usage request failed with status ${status}.`, status);
}

/**
 * Fetch and parse the quota snapshot.
 * @param apiKey - the Ollama Cloud API key (Bearer).
 * @param signal - optional abort signal.
 */
async function attemptOnce(apiKey: string, signal?: AbortSignal): Promise<UsageSnapshot> {
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
    let response: Response;
    try {
      response = await fetch(OLLAMA_USAGE_URL, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });
    } catch {
      if (signal?.aborted) throw new UsageError("transport", "Ollama usage request was cancelled.");
      if (timedOut) throw new UsageError("timeout", "Ollama usage request timed out.");
      throw new UsageError("transport", "Ollama usage request failed.");
    }

    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch and parse the quota snapshot. Transient network failures (transport /
 * timeout — this endpoint is reached over a flaky international link) are
 * retried with a short backoff; auth / http / invalid failures fail fast.
 * @param apiKey - the Ollama Cloud API key (Bearer).
 * @param signal - optional abort signal.
 */
export async function fetchUsage(apiKey: string, signal?: AbortSignal): Promise<UsageSnapshot> {
  if (!apiKey) {
    throw new UsageError("auth", "An Ollama Cloud API key is required.");
  }

  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptOnce(apiKey, signal);
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof UsageError && (error.code === "transport" || error.code === "timeout");
      if (!retryable || attempt === MAX_ATTEMPTS || signal?.aborted) throw error;
      await sleep(600 * attempt);
    }
  }
  throw lastError;
}

/** Quota used as a percentage (0–100), when the window is reported. */
export function usedPercent(usage: UsageWindow | undefined): number | undefined {
  return usage?.usageFraction === undefined ? undefined : usage.usageFraction * 100;
}

/** Quota remaining as a percentage (0–100), rounded to one decimal. */
export function remainingPercent(usage: UsageWindow | undefined): number | undefined {
  const used = usedPercent(usage);
  return used === undefined ? undefined : Math.round(Math.max(0, 100 - used) * 10) / 10;
}
