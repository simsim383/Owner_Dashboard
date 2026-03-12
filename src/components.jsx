// ═══════════════════════════════════════════════════════════════════
// SHOPMATE SALES — components.jsx
// Shared UI components + colour palette + utility functions.
// Mirrors Londis Intelligence design system exactly.
// ═══════════════════════════════════════════════════════════════════

export const C = {
  bg: "#0B1120", surface: "#111827", card: "#1A2332", cardHover: "#1E293B",
  accent: "#2E5090", accentLight: "#3B6FD4", accentGlow: "rgba(59,111,212,0.15)",
  green: "#22C55E", greenDim: "rgba(34,197,94,0.12)", greenText: "#4ADE80",
  red: "#EF4444", redDim: "rgba(239,68,68,0.12)", redText: "#F87171",
  orange: "#F59E0B", orangeDim: "rgba(245,158,11,0.12)", orangeText: "#FBBF24",
  blue: "#3B82F6", blueDim: "rgba(59,130,246,0.12)",
  white: "#F8FAFC", textPrimary: "#E2E8F0", textSecondary: "#94A3B8",
  textMuted: "#64748B", border: "rgba(148,163,184,0.08)",
  divider: "rgba(148,163,184,0.06)", gold: "#D4A843",
};

export const f = (n) => `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fi = (n) => `£${Math.round(Number(n)).toLocaleString("en-GB")}`;
export const pct = (n) => `${Number(n).toFixed(1)}%`;
export const delta = (curr, prev) => prev ? ((curr - prev) / prev * 100).toFixed(1) : "0.0";

const badgeColors = {
  HIGH: { bg: C.greenDim, text: C.greenText, border: "rgba(34,197,94,0.3)" },
  MED: { bg: C.orangeDim, text: C.orangeText, border: "rgba(245,158,11,0.3)" },
  LOW: { bg: C.redDim, text: C.redText, border: "rgba(239,68,68,0.3)" },
  TRACKED: { bg: C.greenDim, text: C.greenText, border: "rgba(34,197,94,0.3)" },
  UNTRACKED: { bg: C.redDim, text: C.redText, border: "rgba(239,68,68,0.3)" },
  NEGATIVE: { bg: C.redDim, text: C.redText, border: "rgba(239,68,68,0.3)" },
  ALERT: { bg: C.orangeDim, text: C.orangeText, border: "rgba(245,158,11,0.3)" },
  OK: { bg: C.accentGlow, text: C.accentLight, border: "rgba(59,111,212,0.3)" },
  ELITE: { bg: C.greenDim, text: C.greenText, border: "rgba(34,197,94,0.3)" },
  THIEF: { bg: C.redDim, text: C.redText, border: "rgba(239,68,68,0.3)" },
};

export const Badge = ({ type, children }) => {
  const c = badgeColors[type] || { bg: C.accentGlow, text: C.textSecondary, border: C.border };
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, background: c.bg, color: c.text, border: `1px solid ${c.border}`, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
};

export const Stat = ({ label, value, sub, trend, small }) => (
  <div style={{ flex: 1, minWidth: small ? 70 : 100, textAlign: "center" }}>
    <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: small ? 18 : 22, fontWeight: 800, color: C.white, letterSpacing: -0.5 }}>{value}</div>
    {sub && (
      <div style={{ fontSize: 10, marginTop: 2, fontWeight: 600, color: trend > 0 ? C.greenText : trend < 0 ? C.redText : C.textMuted }}>
        {trend > 0 ? "▲" : trend < 0 ? "▼" : ""} {sub}
      </div>
    )}
  </div>
);

export const SectionCard = ({ title, icon, children, accent, noPad }) => (
  <div style={{ background: C.card, borderRadius: 16, marginBottom: 16, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}>
    <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.divider}`, background: accent ? `linear-gradient(135deg, ${C.card}, ${accent})` : C.card }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: C.white, letterSpacing: 0.3 }}>{title}</span>
    </div>
    <div style={{ padding: noPad ? 0 : "12px 16px" }}>{children}</div>
  </div>
);

export const TableRow = ({ cells, header, highlight }) => (
  <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", gap: 6, background: header ? "rgba(46,80,144,0.08)" : highlight ? "rgba(34,197,94,0.04)" : "transparent", borderBottom: `1px solid ${C.divider}` }}>
    {cells.map((cell, i) => (
      <div key={i} style={{ flex: cell.flex || 1, fontSize: header ? 9 : 11, fontWeight: header ? 700 : cell.bold ? 700 : 400, color: header ? C.textMuted : cell.color || C.textPrimary, textAlign: cell.align || "left", letterSpacing: header ? 0.8 : 0, textTransform: header ? "uppercase" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {cell.v}
      </div>
    ))}
  </div>
);

export const EmptyState = ({ msg }) => (
  <div style={{ textAlign: "center", padding: 24, color: C.textMuted, fontSize: 12 }}>{msg}</div>
);

export const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 11 }}>
      <div style={{ color: C.white, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.accentLight, fontWeight: 700 }}>{p.name}: {f(p.value)}</div>
      ))}
    </div>
  );
};

export const globalCSS = `
  *::-webkit-scrollbar { display: none; }
  * { scrollbar-width: none; box-sizing: border-box; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
`;
