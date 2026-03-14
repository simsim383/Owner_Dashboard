// ═══════════════════════════════════════════════════════════════════
// SECTIONS — All section components
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { C, Badge, Stat, SectionCard, TableRow, EmptyState, ChartTip, Insight, InsightBox, f, fi, pct } from "./components.jsx";

// ─── CATEGORIES (with revenue chart + expandable top/bottom) ────
export function CategoriesSection({ analysis, timeRange, onSelectProduct }) {
  const [expanded, setExpanded] = useState(null);
  const { categories, catTopBottom } = analysis;
  const isMultiDay = timeRange !== "Today";

  const catData = categories.slice(0, 10).map(c => ({
    name: c.name.length > 14 ? c.name.slice(0, 14) + "…" : c.name,
    gross: c.gross,
  }));

  return (
    <SectionCard title="Categories" icon="📦" noPad>
      {/* Revenue chart */}
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Revenue by Category</div>
        <div style={{ height: 220, marginBottom: 12 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={catData} layout="vertical" margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="gross" fill={C.accentLight} radius={[0, 4, 4, 0]} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category table */}
      <TableRow header cells={[{ v: "Category", flex: 2 }, { v: "Revenue" }, { v: "Profit" }, { v: "Margin" }]} />
      {categories.map((cat, idx) => (
        <div key={cat.name}>
          <TableRow onClick={() => setExpanded(expanded === idx ? null : idx)} cells={[
            { v: cat.name, flex: 2, color: C.white, bold: true },
            { v: fi(cat.gross), bold: true },
            { v: cat.profit > 0 ? fi(cat.profit) : "—", color: cat.profit > 0 ? C.greenText : C.textMuted },
            { v: cat.margin > 0 ? pct(cat.margin) : "—", color: cat.margin >= 25 ? C.greenText : cat.margin < 10 && cat.margin > 0 ? C.redText : C.textPrimary },
          ]} />

          {expanded === idx && catTopBottom[cat.name] && (
            <div style={{ padding: "10px 16px 14px", background: C.surface }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, color: C.textMuted }}>{cat.count} products · {cat.qty} units · {pct(cat.pctRev)} of revenue</div>
                {cat.untracked > 0 && <Badge type="UNTRACKED">{cat.untracked} no cost data</Badge>}
              </div>

              {/* Top 5 */}
              <div style={{ fontSize: 11, fontWeight: 700, color: C.greenText, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>🏆 Top 5</div>
              {catTopBottom[cat.name].top.map((p, i) => (
                <div key={i} onClick={() => onSelectProduct && onSelectProduct(p)} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.divider}`, cursor: "pointer" }}>
                  <span style={{ fontSize: 12, color: C.white, flex: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i + 1}. {p.product}</span>
                  <span style={{ fontSize: 12, color: C.textMuted, minWidth: 35, textAlign: "right" }}>×{p.qty}</span>
                  <span style={{ fontSize: 12, color: C.greenText, fontWeight: 600, minWidth: 55, textAlign: "right" }}>{f(p.grossProfit || 0)}</span>
                </div>
              ))}

              {/* Bottom 5 — only for week/month */}
              {isMultiDay && catTopBottom[cat.name].bottom.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.redText, marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>⚠️ Bottom 5</div>
                  {catTopBottom[cat.name].bottom.map((p, i) => (
                    <div key={i} onClick={() => onSelectProduct && onSelectProduct(p)} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.divider}`, cursor: "pointer" }}>
                      <span style={{ fontSize: 12, color: C.textPrimary, flex: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.product}</span>
                      <span style={{ fontSize: 12, color: C.textMuted, minWidth: 35, textAlign: "right" }}>×{p.qty}</span>
                      <span style={{ fontSize: 12, color: (p.grossProfit || 0) < 0 ? C.redText : C.textMuted, fontWeight: 600, minWidth: 55, textAlign: "right" }}>{p.hasCost ? f(p.grossProfit || 0) : "—"}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </SectionCard>
  );
}

// ─── TRENDING ───────────────────────────────────────────────────
export function TrendingSection({ analysis, onSelectProduct }) {
  const { trending } = analysis;
  if (!trending.length) return <SectionCard title="Trending Up" icon="📈"><EmptyState msg="Upload multiple days to see trending products (40%+ increase vs previous period)" /></SectionCard>;
  return (
    <SectionCard title="Trending Up — 40%+ vs Previous" icon="📈" noPad>
      <div style={{ padding: "10px 16px", fontSize: 12, color: C.textSecondary }}>Products selling significantly more than the previous period.</div>
      <TableRow header cells={[{ v: "Product", flex: 2.5 }, { v: "Qty" }, { v: "Prev" }, { v: "Trend" }, { v: "Profit" }]} />
      {trending.map((p, i) => (
        <TableRow key={i} onClick={() => onSelectProduct && onSelectProduct(p)} cells={[
          { v: p.product, flex: 2.5, color: C.white, bold: true },
          { v: p.qty }, { v: p.prevQty, color: C.textMuted },
          { v: `+${p.trendPct}%`, color: C.greenText, bold: true },
          { v: f(p.grossProfit || 0), color: C.greenText },
        ]} />
      ))}
      <div style={{ padding: "10px 16px" }}>
        <Insight icon="💡" text="Ensure stock levels match rising demand. Consider extra shelf facings for top movers." />
      </div>
    </SectionCard>
  );
}

// ─── REVIEW ─────────────────────────────────────────────────────
export function ReviewSection({ analysis, onSelectProduct }) {
  const { review } = analysis;
  if (!review.length) return <SectionCard title="Review" icon="⚠️"><EmptyState msg="No low-margin items detected" /></SectionCard>;
  return (
    <SectionCard title="Review — Low Margin Items" icon="⚠️" noPad>
      <div style={{ padding: "10px 16px", fontSize: 12, color: C.textSecondary }}>Items with margin below 10%. Consider repricing or replacing.</div>
      <TableRow header cells={[{ v: "Product", flex: 2.5 }, { v: "Qty" }, { v: "Margin" }, { v: "Revenue" }]} />
      {review.map((p, i) => (
        <TableRow key={i} onClick={() => onSelectProduct && onSelectProduct(p)} cells={[
          { v: p.product, flex: 2.5, color: C.white },
          { v: p.qty },
          { v: pct(p.grossMargin || 0), color: p.grossMargin < 5 ? C.redText : C.orangeText, bold: true },
          { v: f(p.gross) },
        ]} />
      ))}
      <div style={{ padding: "10px 16px" }}>
        <Insight icon="💡" text="Low margin doesn't always mean delist — high-velocity items drive footfall. Check if these are traffic builders." />
      </div>
    </SectionCard>
  );
}

// ─── EROSION ────────────────────────────────────────────────────
export function ErosionSection({ analysis, onSelectProduct }) {
  const { erosion } = analysis;
  if (!erosion.length) return <SectionCard title="Margin Erosion" icon="🚨"><EmptyState msg="No critical margin items" /></SectionCard>;
  const neg = erosion.filter(i => (i.grossMargin || 0) < 0);
  return (
    <SectionCard title="Margin Erosion Alert" icon="🚨" noPad>
      <div style={{ padding: "10px 16px", fontSize: 12, color: C.textSecondary }}>Items below 5% margin. Negative margins = selling at a loss.</div>
      {neg.length > 0 && (
        <div style={{ margin: "0 16px 10px", padding: 12, borderRadius: 10, background: C.redDim, border: "1px solid rgba(239,68,68,0.2)" }}>
          <Insight icon="🚨" text={`${neg.length} item${neg.length > 1 ? "s" : ""} selling at a LOSS. Check cost entries in ShopMate — these may be data errors or genuine pricing issues.`} color={C.redText} />
        </div>
      )}
      <TableRow header cells={[{ v: "Product", flex: 2.5 }, { v: "Margin" }, { v: "Qty" }, { v: "Revenue" }]} />
      {erosion.map((p, i) => (
        <TableRow key={i} onClick={() => onSelectProduct && onSelectProduct(p)} cells={[
          { v: p.product, flex: 2.5, color: C.white },
          { v: pct(p.grossMargin || 0), color: (p.grossMargin || 0) < 0 ? C.redText : C.orangeText, bold: true },
          { v: p.qty }, { v: f(p.gross) },
        ]} />
      ))}
    </SectionCard>
  );
}

// ─── TOP SELLERS ────────────────────────────────────────────────
export function TopSellersSection({ analysis, onSelectProduct }) {
  const [sortBy, setSortBy] = useState("profit");
  const topItems = useMemo(() => {
    const t = analysis.tracked;
    if (sortBy === "profit") return [...t].sort((a, b) => (b.grossProfit || 0) - (a.grossProfit || 0)).slice(0, 20);
    if (sortBy === "revenue") return [...analysis.items].sort((a, b) => b.gross - a.gross).slice(0, 20);
    return [...t].sort((a, b) => (b.grossMargin || 0) - (a.grossMargin || 0)).slice(0, 20);
  }, [analysis, sortBy]);

  return (
    <SectionCard title="Top Sellers" icon="💰" noPad>
      <div style={{ padding: "10px 16px", display: "flex", gap: 6 }}>
        {["profit", "revenue", "margin"].map(s => (
          <button key={s} onClick={() => setSortBy(s)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", background: sortBy === s ? C.accentLight : C.surface, color: sortBy === s ? C.white : C.textMuted }}>
            {s === "profit" ? "By Profit" : s === "revenue" ? "By Revenue" : "By Margin"}
          </button>
        ))}
      </div>
      <TableRow header cells={[{ v: "Product", flex: 2.5 }, { v: "Qty" }, { v: sortBy === "margin" ? "Margin" : sortBy === "revenue" ? "Revenue" : "Profit" }, { v: "Cat" }]} />
      {topItems.map((item, i) => (
        <TableRow key={i} onClick={() => onSelectProduct && onSelectProduct(item)} cells={[
          { v: `${i + 1}. ${item.product}`, flex: 2.5, color: i < 3 ? C.white : C.textPrimary, bold: i < 3 },
          { v: item.qty },
          { v: sortBy === "margin" ? pct(item.grossMargin || 0) : sortBy === "revenue" ? f(item.gross) : f(item.grossProfit || 0), color: C.greenText, bold: true },
          { v: item.category.length > 12 ? item.category.slice(0, 12) + "…" : item.category },
        ]} />
      ))}
    </SectionCard>
  );
}

// ─── HIDDEN PROFIT (category click-through) ─────────────────────
export function HiddenProfitSection({ analysis, onSelectProduct }) {
  const [expandedCat, setExpandedCat] = useState(null);
  const { untracked, summary } = analysis;
  const avgM = summary.trackedMargin / 100;

  const catBreak = useMemo(() => {
    const cats = {};
    untracked.forEach(i => {
      if (!cats[i.category]) cats[i.category] = { name: i.category, count: 0, revenue: 0, items: [] };
      cats[i.category].count++;
      cats[i.category].revenue += i.gross;
      cats[i.category].items.push(i);
    });
    return Object.values(cats).sort((a, b) => b.revenue - a.revenue);
  }, [untracked]);

  return (
    <SectionCard title="Hidden Profit" icon="🔍" accent="rgba(239,68,68,0.06)">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <Stat label="Untracked Rev" value={fi(summary.untrackedRevenue)} trend={-1} small />
        <Stat label="Est. Hidden GP" value={fi(summary.estimatedHidden)} trend={-1} small />
        <Stat label="Items" value={untracked.length} small />
      </div>

      <InsightBox title="Quick Win" icon="⚡">
        <Insight icon="💰" text={`Enter cost prices for the top items below to recover £${Math.round(untracked.slice(0, 5).reduce((s, i) => s + i.gross, 0) * avgM)} in profit visibility.`} color={C.greenText} />
      </InsightBox>

      {/* Categories — click to expand */}
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>By Category</div>
      {catBreak.map((cat, idx) => (
        <div key={idx} style={{ marginBottom: 4 }}>
          <div onClick={() => setExpandedCat(expandedCat === idx ? null : idx)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: expandedCat === idx ? "10px 10px 0 0" : 10, background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{cat.name}</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>{cat.count} items · ~{fi(cat.revenue * avgM)} hidden profit</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.orangeText }}>{fi(cat.revenue)}</span>
              <span style={{ fontSize: 12, color: C.textMuted, transform: expandedCat === idx ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
            </div>
          </div>

          {expandedCat === idx && (
            <div style={{ padding: "8px 14px 12px", background: C.surface, borderRadius: "0 0 10px 10px", border: `1px solid ${C.border}`, borderTop: "none" }}>
              {cat.items.sort((a, b) => b.gross - a.gross).map((item, i) => (
                <div key={i} onClick={() => onSelectProduct && onSelectProduct(item)} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.divider}`, cursor: "pointer" }}>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: 12, color: C.white }}>{item.product}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>×{item.qty}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: C.orangeText, fontWeight: 600 }}>{f(item.gross)}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>~{f(item.gross * avgM)} hidden</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </SectionCard>
  );
}

// ─── OPERATIONS (with daily breakdown, basket spend, deep insights) ──
export function OpsSection({ analysis, allDays }) {
  if (allDays.length < 2) return <SectionCard title="Operations" icon="⚙️"><EmptyState msg="Upload multiple days to see patterns" /></SectionCard>;

  const dailyData = allDays.map(d => {
    const gross = d.items.reduce((s, i) => s + i.gross, 0);
    const qty = d.items.reduce((s, i) => s + i.qty, 0);
    const day = d.dates ? new Date(d.dates.start + "T12:00:00") : null;
    return { date: d.dates?.start, dayName: day ? day.toLocaleDateString("en-GB", { weekday: "short" }) : "?", fullDay: day ? day.toLocaleDateString("en-GB", { weekday: "long" }) : "?", gross, qty, transactions: d.transactions, avgBasket: d.avgBasket || (d.transactions ? gross / d.transactions : null), products: d.items.length };
  });

  const busiest = [...dailyData].sort((a, b) => b.gross - a.gross)[0];
  const quietest = [...dailyData].sort((a, b) => a.gross - b.gross)[0];
  const avgD = dailyData.reduce((s, d) => s + d.gross, 0) / dailyData.length;
  const avgBasket = dailyData.filter(d => d.avgBasket).length > 0
    ? dailyData.filter(d => d.avgBasket).reduce((s, d) => s + d.avgBasket, 0) / dailyData.filter(d => d.avgBasket).length : null;
  const bestBasket = dailyData.filter(d => d.avgBasket).length > 0
    ? [...dailyData].filter(d => d.avgBasket).sort((a, b) => b.avgBasket - a.avgBasket)[0] : null;
  const mostTrans = dailyData.filter(d => d.transactions).length > 0
    ? [...dailyData].filter(d => d.transactions).sort((a, b) => b.transactions - a.transactions)[0] : null;

  // Chart data includes transactions and basket for the tooltip
  const chartData = dailyData.map(d => ({
    label: d.dayName, revenue: d.gross, transactions: d.transactions || 0, basket: d.avgBasket || 0, items: d.qty,
    fill: d.gross > avgD * 1.15 ? C.green : d.gross < avgD * 0.85 ? C.red : C.accentLight,
  }));

  // Custom tooltip showing all daily stats
  const OpsTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, minWidth: 140 }}>
        <div style={{ color: C.white, fontWeight: 700, marginBottom: 6 }}>{label}</div>
        <div style={{ color: C.accentLight, fontWeight: 700 }}>Revenue: {fi(d.revenue)}</div>
        <div style={{ color: C.textPrimary, marginTop: 2 }}>Items: {d.items}</div>
        {d.transactions > 0 && <div style={{ color: C.textPrimary, marginTop: 2 }}>Transactions: {d.transactions}</div>}
        {d.basket > 0 && <div style={{ color: C.orangeText, fontWeight: 600, marginTop: 2 }}>Avg basket: {f(d.basket)}</div>}
      </div>
    );
  };

  return (
    <SectionCard title="Operational Intelligence" icon="⚙️">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <Stat label="Avg Daily" value={fi(avgD)} small />
        <Stat label="Busiest" value={busiest.dayName} sub={fi(busiest.gross)} small />
        <Stat label="Quietest" value={quietest.dayName} sub={fi(quietest.gross)} small />
      </div>
      {avgBasket && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <Stat label="Avg Basket" value={f(avgBasket)} small />
          {mostTrans && <Stat label="Most Trans" value={mostTrans.dayName} sub={`${mostTrans.transactions} trans`} small />}
        </div>
      )}

      <div style={{ height: 200, marginBottom: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
            <Tooltip content={<OpsTooltip />} />
            <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {[{ label: "Peak", color: C.green }, { label: "Normal", color: C.accentLight }, { label: "Quiet", color: C.red }].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.textMuted }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />{l.label}
          </div>
        ))}
      </div>

      {/* Deep Insights */}
      <InsightBox title="Deep Insights" icon="🔬" style={{ marginTop: 16 }}>
        <Insight icon="📊" text={`${busiest.fullDay} is your best day (£${Math.round(busiest.gross)}) — ensure full staffing and stock by the night before.`} />
        <Insight icon="💤" text={`${quietest.fullDay} is quietest (£${Math.round(quietest.gross)}) — consider single cover or reduced hours.`} />
        {bestBasket && <Insight icon="🛒" text={`Highest basket spend: ${bestBasket.fullDay} (${f(bestBasket.avgBasket)}) — customers spending more per visit. Good day for promotions.`} />}
        {mostTrans && <Insight icon="👥" text={`Most footfall: ${mostTrans.fullDay} (${mostTrans.transactions} transactions). This is your busiest for customer count — make sure tills are covered.`} />}
        <Insight icon="📈" text={`Revenue spread: £${Math.round(busiest.gross - quietest.gross)} gap between best and worst day (${((busiest.gross - quietest.gross) / avgD * 100).toFixed(0)}% variation). ${(busiest.gross - quietest.gross) / avgD > 0.5 ? "High variation — weekly patterns are strong." : "Fairly consistent trading."}`} />
      </InsightBox>
    </SectionCard>
  );
}

// ─── ACTIONS ────────────────────────────────────────────────────
export function ActionsSection({ analysis }) {
  const { actions } = analysis;
  if (!actions || !actions.length) return <SectionCard title="Action Plan" icon="✅"><EmptyState msg="Upload data to generate actions" /></SectionCard>;

  return (
    <SectionCard title="Action Plan" icon="✅">
      <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 14 }}>
        Prioritised actions based on your sales data. Do the top ones first.
      </div>
      {actions.map((a, i) => (
        <div key={i} style={{ padding: "12px 14px", marginBottom: 8, borderRadius: 10, background: a.priority === "HIGH" ? "rgba(239,68,68,0.06)" : C.surface, border: `1px solid ${a.priority === "HIGH" ? "rgba(239,68,68,0.12)" : C.border}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, background: a.priority === "HIGH" ? C.redDim : C.accentGlow, border: `2px solid ${a.priority === "HIGH" ? "rgba(239,68,68,0.4)" : "rgba(59,111,212,0.4)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: a.priority === "HIGH" ? C.redText : C.accentLight, fontWeight: 700 }}>
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: C.white, fontWeight: 600, lineHeight: 1.4 }}>{a.action}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 11, color: C.greenText }}>{a.impact}</span>
                <span style={{ fontSize: 11, color: C.textMuted }}>⏱ {a.time}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

// ─── SHELF DENSITY (monthly only) ───────────────────────────────
export function ShelfDensitySection({ analysis }) {
  const items = analysis.shelfDensity || [];
  if (!items.length) return <SectionCard title="Shelf Density" icon="🏪"><EmptyState msg="Need week/month data for shelf density" /></SectionCard>;
  const eliteCount = items.filter(i => i.status === "ELITE").length;
  const okCount = items.filter(i => i.status === "OK").length;
  const thiefCount = items.filter(i => i.status === "THIEF").length;
  const sc = (s) => s === "ELITE" ? C.greenText : s === "OK" ? C.orangeText : C.redText;
  const sb = (s) => s === "ELITE" ? C.greenDim : s === "OK" ? C.orangeDim : C.redDim;
  return (
    <SectionCard title="Shelf Space Density" icon="🏪">
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["ELITE", eliteCount, C.greenText, C.greenDim, "rgba(34,197,94,0.2)", "≥1.3x"], ["OK", okCount, C.orangeText, C.orangeDim, "rgba(245,158,11,0.2)", "0.7-1.3x"], ["THIEF", thiefCount, C.redText, C.redDim, "rgba(239,68,68,0.2)", "<0.7x"]].map(([l, n, c, bg, bd, t]) => (
          <div key={l} style={{ flex: 1, textAlign: "center", padding: "10px 8px", borderRadius: 10, background: bg, border: `1px solid ${bd}` }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{n}</div>
            <div style={{ fontSize: 10, color: c, fontWeight: 700, textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>{t}</div>
          </div>
        ))}
      </div>
      {items.map((item, i) => {
        const maxD = items[0]?.density || 10;
        const bw = Math.min((item.density / maxD) * 100, 100);
        return (
          <div key={i} style={{ marginBottom: 8, padding: "8px 0", borderBottom: `1px solid ${C.divider}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.white, minWidth: 110 }}>{item.cat}</span>
                <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: sb(item.status), color: sc(item.status), fontWeight: 700 }}>{item.status}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: sc(item.status) }}>{item.density.toFixed(2)}x</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: C.surface, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${bw}%`, borderRadius: 3, background: sc(item.status), transition: "width 0.5s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 10, color: C.textMuted }}>
              <span>Profit: {item.profitPct}% · Vol: {item.volumePct}%</span>
              <span style={{ fontWeight: 600, color: sc(item.status) }}>{item.action}</span>
            </div>
          </div>
        );
      })}
      <InsightBox title="What This Means" icon="📋">
        <Insight icon="🏆" text="ELITE categories earn more profit per shelf space. Give them more facings." />
        <Insight icon="⚠️" text="THIEF categories don't earn their keep. Reduce range or improve margins." color={C.orangeText} />
      </InsightBox>
      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8 }}>Density = Profit Share ÷ (Volume Share × Friction/5)</div>
    </SectionCard>
  );
}

// ─── COMPETITOR PRICING (monthly — AI web search for real prices) ─
export function CompetitorPricingSection({ analysis }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const topItems = useMemo(() => {
    return [...analysis.items].filter(i => i.hasCost && i.qty >= 3 && !["Tobacco","Lottery","Tobacco Sundr"].includes(i.category))
      .sort((a, b) => b.qty - a.qty).slice(0, 12)
      .map(i => ({ product: i.product, category: i.category, ourPrice: Math.round((i.gross / i.qty) * 100) / 100, qty: i.qty }));
  }, [analysis.items]);

  const fetchPrices = async () => {
    if (!topItems.length) return;
    setLoading(true);
    try {
      const productList = topItems.map(i => `${i.product}: our price £${i.ourPrice.toFixed(2)}, qty ${i.qty}/period`).join("\n");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: (await import("./config.js")).AI_HDR,
        body: JSON.stringify({
          model: (await import("./config.js")).AI_MODEL, max_tokens: 800,
          messages: [{ role: "user", content: `I run a UK convenience store. For these products, find the current Tesco and Asda prices. Search for each one. Products:\n${productList}\n\nRespond ONLY with a JSON array. Each item: {product, ourPrice, tesco, asda, verdict, detail}. verdict = "UPSIDE" if we're cheaper, "IN-LINE" if within 10%, "RISK" if we're 10%+ more expensive. detail = 1 sentence analysis. If you can't find a price, estimate based on typical supermarket pricing. No markdown.` }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      const result = await res.json();
      const text = result.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed)) setData(parsed);
    } catch (e) { console.error("Competitor fetch:", e); }
    setLoading(false);
  };

  const items = data || topItems.map(i => {
    const te = Math.round((i.ourPrice * 0.90) * 100) / 100;
    const ae = Math.round((i.ourPrice * 0.88) * 100) / 100;
    const gap = Math.round((i.ourPrice - Math.min(te, ae)) * 100) / 100;
    return { ...i, tesco: te, asda: ae, verdict: gap <= 0 ? "UPSIDE" : gap < 0.20 ? "IN-LINE" : "RISK", detail: "Estimated — tap 'Fetch Real Prices' for accuracy" };
  });

  const upside = items.filter(i => i.verdict === "UPSIDE").length;
  const inline = items.filter(i => i.verdict === "IN-LINE").length;
  const risk = items.filter(i => i.verdict === "RISK").length;

  return (
    <SectionCard title="Competitor Pricing — vs Tesco & Asda" icon="🏷️" noPad>
      <div style={{ padding: "10px 16px", fontSize: 12, color: C.textSecondary }}>
        {data ? "Real prices fetched via web search." : "Estimated prices shown. Fetch real prices for accuracy."}
      </div>

      {!data && (
        <div style={{ padding: "0 16px 12px" }}>
          <button onClick={fetchPrices} disabled={loading} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: C.accentLight, color: C.white, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Searching Tesco & Asda prices..." : "🔍 Fetch Real Prices"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, padding: "0 16px 12px" }}>
        {[["UPSIDE", upside, C.greenText, C.greenDim, "rgba(34,197,94,0.2)"], ["IN-LINE", inline, C.orangeText, C.orangeDim, "rgba(245,158,11,0.2)"], ["RISK", risk, C.redText, C.redDim, "rgba(239,68,68,0.2)"]].map(([l, n, c, bg, bd]) => (
          <div key={l} style={{ flex: 1, padding: 8, borderRadius: 8, background: bg, textAlign: "center", border: `1px solid ${bd}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{n}</div>
            <div style={{ fontSize: 9, color: c, fontWeight: 600 }}>{l}</div>
          </div>
        ))}
      </div>

      <TableRow header cells={[{ v: "Product", flex: 2.5 }, { v: "Us" }, { v: "Tesco" }, { v: "Asda" }, { v: "" }]} />
      {items.map((item, i) => (
        <div key={i}>
          <TableRow onClick={() => setExpanded(expanded === i ? null : i)} cells={[
            { v: item.product, flex: 2.5, color: C.white, bold: true },
            { v: f(item.ourPrice || 0), bold: true },
            { v: item.tesco ? (data ? f(item.tesco) : `~${f(item.tesco)}`) : "—", color: item.tesco && item.tesco < (item.ourPrice || 0) ? C.greenText : C.textMuted },
            { v: item.asda ? (data ? f(item.asda) : `~${f(item.asda)}`) : "—", color: item.asda && item.asda < (item.ourPrice || 0) ? C.greenText : C.textMuted },
            { v: <Badge type={item.verdict === "UPSIDE" ? "HIGH" : item.verdict === "RISK" ? "LOW" : "MED"}>{item.verdict}</Badge> },
          ]} />
          {expanded === i && item.detail && (
            <div style={{ padding: "10px 16px", background: C.surface, borderBottom: `1px solid ${C.divider}`, fontSize: 12, color: C.textPrimary, lineHeight: 1.6 }}>
              {item.detail}
            </div>
          )}
        </div>
      ))}
    </SectionCard>
  );
}

// ─── CLEAR THE SHELF (slow movers) ──────────────────────────────
export function ClearShelfSection({ analysis }) {
  const [expanded, setExpanded] = useState(null);
  const slowMovers = useMemo(() => {
    if (!analysis.prevItems.length) return [];
    const prevMap = {};
    analysis.prevItems.forEach(i => { prevMap[i.barcode] = i; });
    return analysis.tracked
      .filter(i => { const prev = prevMap[i.barcode]; return prev && prev.qty > 2 && i.qty < prev.qty * 0.5 && i.hasCost; })
      .map(i => { const prev = prevMap[i.barcode]; const drop = Math.round(((i.qty - prev.qty) / prev.qty) * 100); return { ...i, prevQty: prev.qty, drop }; })
      .sort((a, b) => a.drop - b.drop).slice(0, 10);
  }, [analysis]);
  if (!slowMovers.length) return <SectionCard title="Clear the Shelf" icon="🧹"><EmptyState msg="Need previous period data to detect slow movers" /></SectionCard>;
  return (
    <SectionCard title="Clear the Shelf — Slow Movers" icon="🧹" noPad>
      <div style={{ padding: "10px 16px", fontSize: 12, color: C.textSecondary }}>50%+ velocity drop vs previous. Consider promoting or de-listing.</div>
      <TableRow header cells={[{ v: "Product", flex: 2.5 }, { v: "Now" }, { v: "Was" }, { v: "Drop" }]} />
      {slowMovers.map((item, i) => (
        <div key={i}>
          <TableRow onClick={() => setExpanded(expanded === i ? null : i)} cells={[
            { v: item.product, flex: 2.5, color: C.white, bold: true },
            { v: `×${item.qty}` }, { v: `×${item.prevQty}`, color: C.textMuted },
            { v: `${item.drop}%`, color: C.redText, bold: true },
          ]} />
          {expanded === i && (
            <div style={{ padding: "10px 16px", background: C.surface, borderBottom: `1px solid ${C.divider}`, fontSize: 12, color: C.textPrimary, lineHeight: 1.6 }}>
              Dropped {Math.abs(item.drop)}% from {item.prevQty} to {item.qty} units. Try a 5% price cut for 2 weeks — if no recovery, consider de-listing.
            </div>
          )}
        </div>
      ))}
    </SectionCard>
  );
}
