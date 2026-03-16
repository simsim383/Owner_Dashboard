// ═══════════════════════════════════════════════════════════════════
// DASHBOARD — KPIs, chart, insights
// ═══════════════════════════════════════════════════════════════════
import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { C, Stat, SectionCard, ChartTip, Insight, InsightBox, fi, pct, delta } from "./components.jsx";

// timeRange = "Today" | "This Week" | "This Month" (label string from App)
// prevWeekDays = array of day objects for the previous period (passed from App)
export default function Dashboard({ analysis, dates, allDays, timeRange, prevWeekDays }) {
  const { summary, insights } = analysis;

  const dateLabel = dates ? (dates.start === dates.end
    ? new Date(dates.start + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : `${new Date(dates.start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — ${new Date(dates.end + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`) : "";

  // ── Previous period totals ─────────────────────────────────────
  // prevWeekDays covers: yesterday (day), prev 7 days (week), prev month (month)
  const { prevGross, prevProfit, prevLabel } = useMemo(() => {
    if (!prevWeekDays || prevWeekDays.length === 0) {
      return { prevGross: null, prevProfit: null, prevLabel: null };
    }
    const gross = prevWeekDays.reduce((s, d) => s + d.items.reduce((ss, i) => ss + i.gross, 0), 0);
    const profit = prevWeekDays.reduce((s, d) => s + d.items.filter(i => i.hasCost).reduce((ss, i) => ss + (i.grossProfit || 0), 0), 0);
    const label = timeRange === "Today" ? "vs yesterday" : timeRange === "This Week" ? "vs prev 7 days" : "vs last month";
    return { prevGross: gross, prevProfit: profit, prevLabel: label };
  }, [prevWeekDays, timeRange]);

  // ── Chart data (current period days) ──────────────────────────
  const chartData = allDays.map(d => ({
    label: d.dates ? new Date(d.dates.start + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "?",
    date: d.dates?.start || "",
    dayName: d.dates ? new Date(d.dates.start + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" }) : "?",
    revenue: d.items.reduce((s, i) => s + i.gross, 0),
    profit: d.items.filter(i => i.hasCost).reduce((s, i) => s + (i.grossProfit || 0), 0),
  }));

  // Custom tooltip
  const DashTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
        <div style={{ color: C.white, fontWeight: 700, marginBottom: 4 }}>{d.dayName} — {d.date}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color || C.accentLight, fontWeight: 700, marginTop: 2 }}>{p.name}: {fi(p.value)}</div>
        ))}
      </div>
    );
  };

  // ── % change helpers ──────────────────────────────────────────
  const revChange = prevGross && prevGross > 0 ? Math.round(((summary.totalGross - prevGross) / prevGross) * 100) : null;
  const profChange = prevProfit && prevProfit > 0 ? Math.round(((summary.trackedProfit - prevProfit) / prevProfit) * 100) : null;

  const changeSub = (change, label) => {
    if (change === null) return null;
    return `${change >= 0 ? "+" : ""}${change}% ${label}`;
  };

  return (
    <SectionCard title="Dashboard" icon="📊" accent="rgba(46,80,144,0.15)">
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>{dateLabel} · {timeRange}</div>

      {/* Primary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        <Stat
          label="Revenue"
          value={fi(summary.totalGross)}
          sub={changeSub(revChange, prevLabel)}
          trend={revChange !== null ? (revChange >= 0 ? 1 : -1) : 0}
        />
        <Stat
          label="Gross Profit"
          value={fi(summary.trackedProfit)}
          sub={changeSub(profChange, prevLabel)}
          trend={profChange !== null ? (profChange >= 0 ? 1 : -1) : 0}
        />
        <Stat label="Margin" value={pct(summary.trackedMargin)} />
      </div>

      {/* Secondary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <Stat label="Items Sold" value={summary.totalQty.toLocaleString()} small />
        <Stat label="Products" value={summary.productCount.toLocaleString()} small />
        <Stat label="Hidden GP" value={fi(summary.estimatedHidden)} sub={`${summary.untrackedCount} items`} trend={-1} small />
      </div>

      {/* Revenue trend chart */}
      {chartData.length > 1 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Revenue Trend</div>
          <div style={{ height: 180, marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
                <Tooltip content={<DashTip />} />
                <Area type="monotone" dataKey="revenue" stroke={C.accentLight} fill="rgba(59,111,212,0.15)" name="Revenue" />
                <Area type="monotone" dataKey="profit" stroke={C.green} fill="rgba(34,197,94,0.1)" name="Profit" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Insights */}
      {insights && insights.length > 0 && (
        <InsightBox title="Key Insights" icon="🧠">
          {insights.slice(0, 5).map((ins, i) => (
            <Insight key={i} icon={ins.icon} text={ins.text} color={ins.type === "problem" ? C.orangeText : ins.type === "solution" ? C.greenText : C.textPrimary} />
          ))}
        </InsightBox>
      )}
    </SectionCard>
  );
}
