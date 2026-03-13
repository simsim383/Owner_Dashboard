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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <Stat label="Untracked Rev" value={fi(summary.untrackedRevenue)} sub={`${pct(summary.untrackedRevenue / summary.totalGross * 100)} of total`} trend={-1} />
        <Stat label="Est. Hidden GP" value={fi(summary.estimatedHidden)} sub={`@ ${pct(summary.trackedMargin)}`} trend={-1} />
        <Stat label="Items" value={untracked.length} />
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

// ─── OPERATIONS (with basket spend) ─────────────────────────────
export function OpsSection({ analysis, allDays }) {
  if (allDays.length < 2) return <SectionCard title="Operations" icon="⚙️"><EmptyState msg="Upload multiple days to see patterns" /></SectionCard>;

  const dailyData = allDays.map(d => {
    const gross = d.items.reduce((s, i) => s + i.gross, 0);
    const qty = d.items.reduce((s, i) => s + i.qty, 0);
    const day = d.dates ? new Date(d.dates.start + "T12:00:00") : null;
    return { dayName: day ? day.toLocaleDateString("en-GB", { weekday: "short" }) : "?", gross, qty, transactions: d.transactions, avgBasket: d.avgBasket || (d.transactions ? gross / d.transactions : null) };
  });

  const busiest = [...dailyData].sort((a, b) => b.gross - a.gross)[0];
  const quietest = [...dailyData].sort((a, b) => a.gross - b.gross)[0];
  const avgD = dailyData.reduce((s, d) => s + d.gross, 0) / dailyData.length;
  const avgBasket = dailyData.filter(d => d.avgBasket).length > 0
    ? dailyData.filter(d => d.avgBasket).reduce((s, d) => s + d.avgBasket, 0) / dailyData.filter(d => d.avgBasket).length : null;

  const chartData = dailyData.map(d => ({
    label: d.dayName, revenue: d.gross,
    fill: d.gross > avgD * 1.15 ? C.green : d.gross < avgD * 0.85 ? C.red : C.accentLight,
  }));

  return (
    <SectionCard title="Operational Intelligence" icon="⚙️">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <Stat label="Avg Daily" value={fi(avgD)} small />
        <Stat label="Busiest" value={busiest.dayName} sub={fi(busiest.gross)} small />
        <Stat label="Quietest" value={quietest.dayName} sub={fi(quietest.gross)} small />
        {avgBasket && <Stat label="Avg Basket" value={f(avgBasket)} small />}
      </div>

      <div style={{ height: 180, marginBottom: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
            <Tooltip content={<ChartTip />} />
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

      <InsightBox title="Staffing Insight" icon="👥">
        <Insight icon="📊" text={`${busiest.dayName} is your busiest day — consider 2 staff. ${quietest.dayName} is quietest — single cover may be sufficient.`} />
        {avgBasket && <Insight icon="🛒" text={`Average basket spend is ${f(avgBasket)}. Track this to see if promotions or displays are driving larger baskets.`} />}
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
