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
    label: d.dates ? new Date(d.dates.start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "?",
    revenue: d.items.reduce((s, i) => s + i.gross, 0),
    profit: d.items.filter(i => i.hasCost).reduce((s, i) => s + (i.grossProfit || 0), 0),
  }));

  const prevDay = allDays.length > 1 ? allDays[allDays.length - 2] : null;
  const prevGross = prevDay ? prevDay.items.reduce((s, i) => s + i.gross, 0) : null;
  const prevProfit = prevDay ? prevDay.items.filter(i => i.hasCost).reduce((s, i) => s + (i.grossProfit || 0), 0) : null;

  return (
    <SectionCard title="Dashboard" icon="📊" accent="rgba(46,80,144,0.15)">
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>{dateLabel} · {timeRange}</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <Stat label="Revenue" value={fi(summary.totalGross)}
          sub={prevGross ? `${delta(summary.totalGross, prevGross) > 0 ? "+" : ""}${delta(summary.totalGross, prevGross)}% vs prev` : null}
          trend={prevGross ? (summary.totalGross > prevGross ? 1 : -1) : 0} />
        <Stat label="Gross Profit" value={fi(summary.trackedProfit)}
          sub={prevProfit ? `${delta(summary.trackedProfit, prevProfit) > 0 ? "+" : ""}${delta(summary.trackedProfit, prevProfit)}%` : `${summary.trackedCount} tracked`}
          trend={prevProfit ? (summary.trackedProfit > prevProfit ? 1 : -1) : 0} />
        <Stat label="Avg Margin" value={pct(summary.trackedMargin)} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <Stat label="Items Sold" value={summary.totalQty.toLocaleString()} small />
        <Stat label="Products" value={summary.productCount.toLocaleString()} small />
        <Stat label="Hidden Profit" value={fi(summary.estimatedHidden)} sub={`${summary.untrackedCount} items`} trend={-1} small />
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
                <Tooltip content={<ChartTip />} />
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
