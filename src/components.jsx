// ═══════════════════════════════════════════════════════════════════
// COMPONENTS — Design system + shared UI
// ═══════════════════════════════════════════════════════════════════
import { useState } from "react";

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
export const delta = (a, b) => b ? ((a - b) / b * 100).toFixed(1) : "0.0";

const badgeColors = {
  HIGH: { bg: C.greenDim, text: C.greenText, border: "rgba(34,197,94,0.3)" },
  MED: { bg: C.orangeDim, text: C.orangeText, border: "rgba(245,158,11,0.3)" },
  LOW: { bg: C.redDim, text: C.redText, border: "rgba(239,68,68,0.3)" },
  TRACKED: { bg: C.greenDim, text: C.greenText, border: "rgba(34,197,94,0.3)" },
  UNTRACKED: { bg: C.redDim, text: C.redText, border: "rgba(239,68,68,0.3)" },
  ALERT: { bg: C.orangeDim, text: C.orangeText, border: "rgba(245,158,11,0.3)" },
  OK: { bg: C.accentGlow, text: C.accentLight, border: "rgba(59,111,212,0.3)" },
  WIN: { bg: C.greenDim, text: C.greenText, border: "rgba(34,197,94,0.3)" },
  CARRY: { bg: C.redDim, text: C.redText, border: "rgba(239,68,68,0.3)" },
};

export const Badge = ({ type, children }) => {
  const c = badgeColors[type] || { bg: C.accentGlow, text: C.textSecondary, border: C.border };
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, background: c.bg, color: c.text, border: `1px solid ${c.border}`, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
};

export const Stat = ({ label, value, sub, trend, small }) => (
  <div style={{ flex: 1, minWidth: small ? 80 : 110, textAlign: "center" }}>
    <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: small ? 20 : 24, fontWeight: 800, color: C.white, letterSpacing: -0.5 }}>{value}</div>
    {sub && (
      <div style={{ fontSize: 11, marginTop: 2, fontWeight: 600, color: trend > 0 ? C.greenText : trend < 0 ? C.redText : C.textMuted }}>
        {trend > 0 ? "▲" : trend < 0 ? "▼" : ""} {sub}
      </div>
    )}
  </div>
);

export const SectionCard = ({ title, icon, children, accent, noPad }) => (
  <div style={{ background: C.card, borderRadius: 16, marginBottom: 16, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}>
    <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.divider}`, background: accent ? `linear-gradient(135deg, ${C.card}, ${accent})` : C.card }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: C.white, letterSpacing: 0.3 }}>{title}</span>
    </div>
    <div style={{ padding: noPad ? 0 : "14px 16px" }}>{children}</div>
  </div>
);

export const TableRow = ({ cells, header, onClick }) => (
  <div onClick={onClick} style={{ display: "flex", alignItems: "center", padding: "10px 16px", gap: 8, background: header ? "rgba(46,80,144,0.08)" : "transparent", borderBottom: `1px solid ${C.divider}`, cursor: onClick ? "pointer" : "default" }}>
    {cells.map((cell, i) => (
      <div key={i} style={{ flex: cell.flex || 1, fontSize: header ? 10 : 12, fontWeight: header ? 700 : cell.bold ? 700 : 400, color: header ? C.textMuted : cell.color || C.textPrimary, textAlign: cell.align || "left", letterSpacing: header ? 0.8 : 0, textTransform: header ? "uppercase" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {cell.v}
      </div>
    ))}
    {onClick && !header && <div style={{ fontSize: 12, color: C.textMuted, flexShrink: 0 }}>›</div>}
  </div>
);

export const EmptyState = ({ msg }) => (
  <div style={{ padding: 24, textAlign: "center", color: C.textMuted, fontSize: 13 }}>{msg}</div>
);

export const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: C.white, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.accentLight, fontWeight: 700 }}>{p.name}: {f(p.value)}</div>
      ))}
    </div>
  );
};

// ─── INSIGHT BULLET ─────────────────────────────────────────────
// Reusable component for insight/problem/solution bullets
export const Insight = ({ icon, text, color }) => (
  <div style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon || "•"}</span>
    <span style={{ fontSize: 12, color: color || C.textPrimary, lineHeight: 1.6 }}>{text}</span>
  </div>
);

export const InsightBox = ({ title, icon, children, color }) => (
  <div style={{ background: `linear-gradient(135deg, ${color || "rgba(46,80,144,0.12)"}, rgba(59,130,246,0.06))`, borderRadius: 12, padding: "12px 14px", border: `1px solid ${color ? color.replace("0.12", "0.25") : "rgba(46,80,144,0.2)"}`, marginBottom: 12 }}>
    {title && <div style={{ fontSize: 10, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{icon} {title}</div>}
    {children}
  </div>
);

// ─── PRODUCT DETAIL OVERLAY ─────────────────────────────────────
export const ProductDetail = ({ product, onClose, allDays, timeRange }) => {
  const [showDaily, setShowDaily] = useState(false);
  if (!product) return null;
  const name = product.product;
  const cat = product.category || product.cat || "";
  const qty = product.totalQty || product.qty || 0;
  const revenue = product.totalGross || product.gross || 0;
  const profit = product.totalProfit ?? product.grossProfit ?? null;
  const margin = product.avgMargin ?? product.grossMargin ?? null;

  const dailyHistory = (allDays || []).map(d => {
    const match = d.items.find(i => i.barcode === product.barcode || i.product === name);
    return { date: d.dates?.start, dayName: d.dates ? new Date(d.dates.start + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" }) : "?", qty: match?.qty || 0, gross: match?.gross || 0, profit: match?.grossProfit || null };
  });

  // Last week qty = sum from 8-14 days ago in the data
  const last7 = dailyHistory.slice(Math.max(0, dailyHistory.length - 14), Math.max(0, dailyHistory.length - 7));
  const lastWeekQty = last7.length > 0 ? last7.reduce((s, d) => s + d.qty, 0) : null;
  const avgDailyQty = dailyHistory.length > 0 ? (dailyHistory.reduce((s, d) => s + d.qty, 0) / dailyHistory.length).toFixed(1) : "—";
  const qtyChange = lastWeekQty != null && lastWeekQty > 0 ? Math.round(((qty - lastWeekQty) / lastWeekQty) * 100) : null;

  const statBox = (label, value, color, sub) => (
    <div style={{ flex: 1, minWidth: 80, background: C.card, borderRadius: 10, padding: "12px 10px", border: `1px solid ${C.border}`, textAlign: "center" }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || C.white }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, display: "flex", flexDirection: "column", background: C.bg }}>
      <div style={{ padding: "16px 20px 14px", flexShrink: 0, borderBottom: `1px solid ${C.divider}`, background: C.surface }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.white, marginBottom: 6 }}>{name}</div>
            <span style={{ fontSize: 11, color: C.accentLight, background: "rgba(59,111,212,0.15)", padding: "3px 10px", borderRadius: 5, fontWeight: 600 }}>{cat}</span>
          </div>
          <button onClick={onClose} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.textMuted, fontSize: 18, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>✕</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          {statBox("Qty Sold", qty)}
          {statBox("Last Week", lastWeekQty != null ? lastWeekQty : "—", lastWeekQty != null ? C.textSecondary : C.textMuted)}
          {statBox("Revenue", fi(revenue))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          {statBox("Profit", profit != null ? f(profit) : "—", profit > 0 ? C.greenText : profit < 0 ? C.redText : C.textMuted)}
          {statBox("Margin", margin != null ? pct(margin) : "—", margin >= 25 ? C.greenText : margin > 0 && margin < 15 ? C.redText : C.white)}
          {statBox("Avg/Day", avgDailyQty)}
        </div>

        {qtyChange != null && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: qtyChange >= 0 ? C.greenDim : C.redDim, border: `1px solid ${qtyChange >= 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>{qtyChange >= 0 ? "📈" : "📉"}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: qtyChange >= 0 ? C.greenText : C.redText }}>
              {qtyChange >= 0 ? "+" : ""}{qtyChange}% vs last week ({lastWeekQty} → {qty})
            </span>
          </div>
        )}

        <div style={{ padding: "10px 14px", borderRadius: 10, background: product.hasCost === false ? C.redDim : C.greenDim, border: `1px solid ${product.hasCost === false ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: product.hasCost === false ? C.redText : C.greenText }}>
            {product.hasCost === false ? "⚠️ No cost data — profit not tracked" : "✓ Cost data available"}
          </div>
        </div>

        {dailyHistory.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <div onClick={() => setShowDaily(!showDaily)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: showDaily ? "10px 10px 0 0" : 10, background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.white }}>Daily Breakdown ({dailyHistory.length} days)</span>
              <span style={{ fontSize: 12, color: C.textMuted, transform: showDaily ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
            </div>
            {showDaily && (
              <div style={{ padding: "8px 14px 12px", background: C.surface, borderRadius: "0 0 10px 10px", border: `1px solid ${C.border}`, borderTop: "none" }}>
                {dailyHistory.map((d, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.divider}` }}>
                    <span style={{ fontSize: 12, color: C.white, minWidth: 80 }}>{d.dayName} {d.date}</span>
                    <span style={{ fontSize: 12, color: C.textMuted }}>×{d.qty}</span>
                    <span style={{ fontSize: 12, color: C.white, fontWeight: 600 }}>{f(d.gross)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
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
