window.__ModuleLoader__.load({ id: "dsh-ollama-cloud-usage", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var OLLAMA_KEY_REF = "OLLAMA_CLOUD_API_KEY";
var USAGE_ROUTE = "/api/ollama-usage";
function usedPercent(w) {
  return w?.usageFraction === void 0 ? void 0 : w.usageFraction * 100;
}
function pct(v) {
  return v === void 0 ? "\u2014" : `${Math.round(v * 10) / 10}%`;
}
function Ring({ value, size = 16 }) {
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = value === void 0 ? 0 : Math.min(1, Math.max(0, value / 100));
  const color = value === void 0 ? "var(--dsw-alias-label-caption)" : value >= 90 ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-state-business-primary)";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, style: { display: "block" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "var(--dsw-alias-border-l2)", strokeWidth: stroke }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "circle",
      {
        cx: size / 2,
        cy: size / 2,
        r,
        fill: "none",
        stroke: color,
        strokeWidth: stroke,
        strokeLinecap: "round",
        strokeDasharray: c,
        strokeDashoffset: c * (1 - frac),
        transform: `rotate(-90 ${size / 2} ${size / 2})`
      }
    )
  ] });
}
function QuotaRing({ wide, api }) {
  const [usage, setUsage] = (0, import_react.useState)(null);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [noKey, setNoKey] = (0, import_react.useState)(false);
  const [open, setOpen] = (0, import_react.useState)(false);
  const [keyDraft, setKeyDraft] = (0, import_react.useState)("");
  const [saving, setSaving] = (0, import_react.useState)(false);
  const rootRef = (0, import_react.useRef)(null);
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
  (0, import_react.useEffect)(() => {
    void refresh();
  }, []);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const closeOutside = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
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
  const sessionUsed = usedPercent(usage?.session);
  const weeklyUsed = usedPercent(usage?.weekly);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: rootRef, style: { position: "relative", display: "inline-flex", alignItems: "center" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        onClick: () => {
          setOpen((v) => !v);
          void refresh();
        },
        title: `Ollama Cloud 5h:${pct(sessionUsed)} Wk:${pct(weeklyUsed)}`,
        "aria-label": "Ollama Cloud quota",
        style: {
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
          lineHeight: "18px"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ring, { value: sessionUsed }),
          wide && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Ollama" })
        ]
      }
    ),
    open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: 0,
          zIndex: 30,
          minWidth: 260,
          background: "var(--dsw-specific-menu)",
          border: "1px solid var(--dsw-alias-border-inverted)",
          borderRadius: 12,
          boxShadow: "var(--dsw-shadow-lv3)",
          padding: 12,
          color: "var(--dsw-alias-label-primary)",
          fontSize: 13,
          lineHeight: "20px"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 500, marginBottom: 8 }, children: "Ollama Cloud \u914D\u989D" }),
          loading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)" }, children: "\u52A0\u8F7D\u4E2D\u2026" }),
          !loading && noKey && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-secondary)", marginBottom: 8 }, children: "\u5C1A\u672A\u914D\u7F6E API Key\u3002\u8BF7\u5728\u4E0B\u65B9\u7C98\u8D34\u4F60\u7684 Ollama Cloud Key\u3002" }),
          !loading && usage && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "5 \u5C0F\u65F6\u7A97\u53E3", used: sessionUsed }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "7 \u5929\u7A97\u53E3", used: weeklyUsed }),
            usage.cost !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, marginTop: 4 }, children: [
              "\u8FD1 4 \u5468\u8D39\u7528\uFF1A$",
              usage.cost
            ] })
          ] }),
          !loading && error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 12, marginTop: 4 }, children: error }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { borderTop: "1px solid var(--dsw-alias-border-l2)", marginTop: 10, paddingTop: 10 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)", marginBottom: 4 }, children: "API Key" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 6 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "password",
                  value: keyDraft,
                  onChange: (e) => setKeyDraft(e.target.value),
                  placeholder: "ollama-\u2026",
                  style: {
                    flex: 1,
                    minWidth: 0,
                    height: 28,
                    border: "1px solid var(--dsw-alias-border-l2)",
                    borderRadius: 6,
                    padding: "0 8px",
                    fontSize: 13,
                    background: "var(--dsw-alias-bg-layer-1)",
                    color: "var(--dsw-alias-label-primary)"
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  onClick: saveKey,
                  disabled: saving || !keyDraft.trim(),
                  style: {
                    height: 28,
                    padding: "0 10px",
                    border: "none",
                    borderRadius: 6,
                    background: "var(--dsw-alias-button-primary-fill)",
                    color: "var(--dsw-alias-label-primary-foreground)",
                    cursor: "pointer",
                    fontSize: 12
                  },
                  children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"
                }
              )
            ] })
          ] })
        ]
      }
    )
  ] });
}
function Row({ label, used }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", gap: 12 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "var(--dsw-alias-label-secondary)" }, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontVariantNumeric: "tabular-nums" }, children: [
      pct(used),
      " \u5DF2\u7528"
    ] })
  ] });
}
function apply(ctx) {
  ctx.inject(["connection", "slots"], (scope) => {
    const api = scope.connection.api;
    scope.slots.inject(
      "sidebar.footer.action",
      () => scope.slots.register(
        {
          name: "sidebar.footer.action",
          id: "ollama-quota",
          order: 0,
          inject: () => ({ api })
        },
        QuotaRing
      )
    );
  });
}
return module.exports; } });
//# sourceMappingURL=client.js.map
