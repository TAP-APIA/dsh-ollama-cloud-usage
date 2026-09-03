/**
 * Client plugin: a persistent Ollama Cloud quota ring in the sidebar footer,
 * with a click-to-open popup showing the 5-hour and weekly windows plus an
 * API-key field.
 *
 * Data channel: the ring fetches `GET /api/ollama-usage` (a route the host
 * plugin registers via `webServer`) on mount and on click — no core RPC needed.
 * The API key is written to the host credentials service via
 * `api.credentials.set` when the user saves it in the popup.
 */
import type { Context } from "@deepseek-ai/cordis";
import { useEffect, useRef, useState } from "react";

const OLLAMA_KEY_REF = "OLLAMA_CLOUD_API_KEY";
const USAGE_ROUTE = "/api/ollama-usage";

interface UsageWindow {
  usageFraction?: number;
  models: { name?: string; requestCount?: number }[];
}
interface UsageSnapshot {
  cost?: string;
  session: UsageWindow;
  weekly: UsageWindow;
}

function usedPercent(w: UsageWindow | undefined): number | undefined {
  return w?.usageFraction === undefined ? undefined : w.usageFraction * 100;
}
function pct(v: number | undefined): string {
  return v === undefined ? "—" : `${Math.round(v * 10) / 10}%`;
}

/** SVG progress ring; `value` is 0–100 (percent used). */
function Ring({ value, size = 16 }: { value: number | undefined; size?: number }) {
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = value === undefined ? 0 : Math.min(1, Math.max(0, value / 100));
  const color =
    value === undefined
      ? "var(--dsw-alias-label-caption)"
      : value >= 90
        ? "var(--dsw-alias-state-error-primary)"
        : "var(--dsw-alias-state-business-primary)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--dsw-alias-border-l2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

interface QuotaRingProps {
  wide: boolean;
  api: {
    credentials: {
      set(req: { ref: string; value: string }): Promise<unknown>;
    };
  };
}

function QuotaRing({ wide, api }: QuotaRingProps) {
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);
  const [open, setOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [popPos, setPopPos] = useState<{ left: number; bottom: number } | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(USAGE_ROUTE);
      const body = await res.json();
      if (body.ok) {
        setUsage(body.value);
        setNoKey(false);
      } else if (body.error?.code === "no-key") {
        setNoKey(true);
        setUsage(null);
      } else {
        setError(body.error?.message ?? "Failed to load quota.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [open]);

  const saveKey = async () => {
    const value = keyDraft.trim();
    if (!value) return;
    setSaving(true);
    try {
      await api.credentials.set({ ref: OLLAMA_KEY_REF, value });
      setKeyDraft("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleOpen = () => {
    if (!open && btnRef.current) {
      // Anchor the popup to the button's viewport rect so it renders OUTSIDE
      // the narrow sidebar (fixed positioning escapes sidebar overflow clipping).
      const r = btnRef.current.getBoundingClientRect();
      const left = Math.min(r.right + 8, window.innerWidth - 290);
      setPopPos({ left: Math.max(8, left), bottom: Math.max(12, window.innerHeight - r.bottom) });
    }
    setOpen((v) => !v);
    void refresh();
  };

  const sessionUsed = usedPercent(usage?.session);
  const weeklyUsed = usedPercent(usage?.weekly);

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        title={`Ollama Cloud 5h:${pct(sessionUsed)} Wk:${pct(weeklyUsed)}`}
        aria-label="Ollama Cloud quota"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 6px",
          borderRadius: 8,
          color: "var(--dsw-alias-label-secondary)",
          fontSize: 12,
          lineHeight: "18px",
        }}
      >
        <Ring value={sessionUsed} />
        {wide && <span>Ollama</span>}
      </button>

      {open && popPos && (
        <div
          style={{
            position: "fixed",
            bottom: popPos.bottom,
            left: popPos.left,
            zIndex: 1000,
            width: 280,
            background: "var(--dsw-specific-menu)",
            border: "1px solid var(--dsw-alias-border-inverted)",
            borderRadius: 12,
            boxShadow: "var(--dsw-shadow-lv3)",
            padding: 12,
            color: "var(--dsw-alias-label-primary)",
            fontSize: 13,
            lineHeight: "20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <span style={{ fontWeight: 500 }}>Ollama Cloud 配额</span>
            {loading && <span style={{ color: "var(--dsw-alias-label-tertiary)", fontSize: 11 }}>刷新中…</span>}
          </div>

          <BarRow label="5 小时窗口" used={sessionUsed} />
          <BarRow label="7 天窗口" used={weeklyUsed} />

          {/* 固定高度的信息行：费用 / 无 key 提示 / 错误，一行省略，避免卡片跳动 */}
          <div
            style={{
              height: 18,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              fontSize: 12,
              marginTop: 2,
              color: error
                ? "var(--dsw-alias-state-error-primary)"
                : "var(--dsw-alias-label-tertiary)",
            }}
          >
            {error
              ? error
              : noKey
                ? "尚未配置 API Key，展开下方输入。"
                : usage?.cost !== undefined
                  ? `近 4 周费用：$${usage.cost}`
                  : ""}
          </div>

          <div style={{ borderTop: "1px solid var(--dsw-alias-border-l2)", marginTop: 8, paddingTop: 8 }}>
            <button
              type="button"
              onClick={() => setKeyOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                color: "var(--dsw-alias-label-secondary)",
                fontSize: 12,
                lineHeight: "18px",
                textAlign: "left",
              }}
            >
              <span style={{ display: "inline-block", transition: "transform .12s", transform: keyOpen ? "rotate(90deg)" : "none" }}>▸</span>
              API Key
            </button>
            {keyOpen && (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input
                  type="password"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="ollama-…"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 28,
                    border: "1px solid var(--dsw-alias-border-l2)",
                    borderRadius: 6,
                    padding: "0 8px",
                    fontSize: 13,
                    background: "var(--dsw-alias-bg-layer-1)",
                    color: "var(--dsw-alias-label-primary)",
                  }}
                />
                <button
                  type="button"
                  onClick={saveKey}
                  disabled={saving || !keyDraft.trim()}
                  style={{
                    height: 28,
                    padding: "0 10px",
                    border: "none",
                    borderRadius: 6,
                    background: "var(--dsw-alias-button-primary-fill)",
                    color: "var(--dsw-alias-label-primary-foreground)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 上下文用量同款横向进度条：标签 + 百分比一行，下面一根圆角条。 */
function BarRow({ label, used }: { label: string; used: number | undefined }) {
  const frac = used === undefined ? 0 : Math.min(1, Math.max(0, used / 100));
  const color =
    used === undefined
      ? "var(--dsw-alias-border-l3)"
      : used >= 90
        ? "var(--dsw-alias-state-error-primary)"
        : "var(--dsw-alias-state-business-primary)";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: "var(--dsw-alias-label-secondary)" }}>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--dsw-alias-label-tertiary)" }}>
          {pct(used)} 已用
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: "var(--dsw-alias-border-l2)",
          marginTop: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${frac * 100}%`,
            height: "100%",
            borderRadius: 3,
            background: color,
            transition: "width .2s",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Client plugin body. Registers the ring into the sidebar footer action list
 * slot (plugin-accessible, no core modification).
 */
export function apply(ctx: Context) {
  ctx.inject(["connection", "slots"], (scope) => {
    const api = scope.connection.api;
    scope.slots.inject("sidebar.footer.action", () =>
      scope.slots.register(
        {
          name: "sidebar.footer.action",
          id: "ollama-quota",
          order: 0,
          inject: () => ({ api }),
        },
        QuotaRing,
      ),
    );
  });
}
