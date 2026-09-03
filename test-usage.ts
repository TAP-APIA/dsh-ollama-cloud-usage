// Standalone verification of usage.ts (parse + fetch with mocked fetch).
import { parseUsage, fetchUsage, usedPercent, remainingPercent } from "./src/usage.ts";

const SAMPLE = {
  activity: { cost: "1.23", period: { type: "last 4 weeks", starting_at: "2026-07-01T00:00:00Z" } },
  limits: {
    session: { usage: 0.98, models: [{ name: "gpt-oss-120b", request_count: 42 }] },
    weekly: { usage: 0.983, models: [{ name: "gpt-oss-120b", request_count: 300 }] },
  },
};

// 1. parseUsage
const parsed = parseUsage(SAMPLE);
console.log("parseUsage:", JSON.stringify(parsed, null, 2));
console.log("session used%:", usedPercent(parsed.session), "remaining%:", remainingPercent(parsed.session));
console.log("weekly used%:", usedPercent(parsed.weekly), "remaining%:", remainingPercent(parsed.weekly));

// 2. fetchUsage with mocked fetch
const originalFetch = globalThis.fetch;
globalThis.fetch = async () =>
  new Response(JSON.stringify(SAMPLE), { status: 200, headers: { "content-type": "application/json" } });

try {
  const snap = await fetchUsage("ollama-test-key");
  console.log("\nfetchUsage ok:", JSON.stringify(snap));
} finally {
  globalThis.fetch = originalFetch;
}

// 3. error path: no key
try {
  await fetchUsage("");
} catch (e) {
  console.log("\nno-key error:", e.code, "-", e.message);
}

// 4. error path: 401
globalThis.fetch = async () => new Response("unauthorized", { status: 401 });
try {
  await fetchUsage("bad-key");
} catch (e) {
  console.log("401 error:", e.code, "-", e.message);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("\nAll checks done.");
