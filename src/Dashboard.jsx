// ═══════════════════════════════════════════════════════════════════
// DASHBOARD — KPIs, chart, insights
// ═══════════════════════════════════════════════════════════════════
import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { C, Stat, SectionCard, ChartTip, Insight, InsightBox, fi, pct, delta } from "./components.jsx";

export default function Dashboard({ analysis, dates, allDays, timeRange }) {
  const { summary, insights } = analysis;
  const dateLabel = dates ? (dates.start === dates.end
    ? new Date(dates.start + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : `${new Date(dates.start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — ${new Date(dates.end + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`) : "";

  const chartData = allDays.map(d => ({
    label: d.dates ? new Date(d.dates.start + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "?",
    date: d.dates?.start || "",
    dayName: d.dates ? new Date(d.dates.start + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" }) : "?",
    revenue: d.items.reduce((s, i) => s + i.gross, 0),
    profit: d.items.filter(i => i.hasCost).reduce((s, i) => s + (i.grossProfit || 0), 0),
  }));

  // Custom tooltip with date and day
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

  const prevDay = allDays.length > 1 ? allDays[allDays.length - 2] : null;
  const prevGross = prevDay ? prevDay.items.reduce((s, i) => s + i.gross, 0) : null;
  const prevProfit = prevDay ? prevDay.items.filter(i => i.hasCost).reduce((s, i) => s + (i.grossProfit || 0), 0) : null;

  return (
    <SectionCard title="Dashboard" icon="📊" accent="rgba(46,80,144,0.15)">
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>{dateLabel} · {timeRange}</div>

      {/* Primary KPIs — clean grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        <Stat label="Revenue" value={fi(summary.totalGross)}
          sub={prevGross ? `${delta(summary.totalGross, prevGross) > 0 ? "+" : ""}${delta(summary.totalGross, prevGross)}%` : null}
          trend={prevGross ? (summary.totalGross > prevGross ? 1 : -1) : 0} />
        <Stat label="Gross Profit" value={fi(summary.trackedProfit)}
          sub={prevProfit ? `${delta(summary.trackedProfit, prevProfit) > 0 ? "+" : ""}${delta(summary.trackedProfit, prevProfit)}%` : null}
          trend={prevProfit ? (summary.trackedProfit > prevProfit ? 1 : -1) : 0} />
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
