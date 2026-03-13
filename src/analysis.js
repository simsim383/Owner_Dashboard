// ═══════════════════════════════════════════════════════════════════
// ANALYSIS — Data analysis engine
// Aggregates by barcode for week/month views, generates insights
// ═══════════════════════════════════════════════════════════════════

// Aggregate items by barcode — used for week/month views
// Shows each product ONCE with totals
function aggregateByBarcode(items) {
  const map = {};
  items.forEach(i => {
    const key = i.barcode || i.product;
    if (!map[key]) {
      map[key] = { ...i, totalQty: 0, totalGross: 0, totalNet: 0, totalProfit: null, daysSeen: 0 };
    }
    const m = map[key];
    m.totalQty += i.qty;
    m.totalGross += i.gross;
    m.totalNet += i.net;
    if (i.grossProfit != null) {
      m.totalProfit = (m.totalProfit || 0) + i.grossProfit;
    }
    m.daysSeen += 1;
    // Keep the latest margin (it's a percentage, not summable)
    if (i.grossMargin != null) m.avgMargin = i.grossMargin;
  });
  // Recalculate margin from totals for multi-day
  return Object.values(map).map(m => {
    if (m.totalProfit != null && m.totalNet > 0) {
      m.avgMargin = (m.totalProfit / m.totalNet) * 100;
    }
    // Also set the flat fields for compatibility
    m.qty = m.totalQty;
    m.gross = m.totalGross;
    m.net = m.totalNet;
    m.grossProfit = m.totalProfit;
    m.grossMargin = m.avgMargin;
    return m;
  });
}

export function analyzeData(allDays, currentRange, timeRange) {
  const isMultiDay = timeRange !== "day";
  const rawItems = currentRange.items;

  // For week/month: aggregate by barcode so each product shows once
  const items = isMultiDay ? aggregateByBarcode(rawItems) : rawItems;

  const tracked = items.filter(i => i.hasCost);
  const untracked = items.filter(i => !i.hasCost);
  const trackedProfit = tracked.reduce((s, i) => s + (i.grossProfit || 0), 0);
  const trackedNet = tracked.reduce((s, i) => s + i.net, 0);
  const trackedMargin = trackedNet > 0 ? (trackedProfit / trackedNet) * 100 : 0;
  const totalGross = items.reduce((s, i) => s + i.gross, 0);
  const totalNet = items.reduce((s, i) => s + i.net, 0);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const untrackedRev = untracked.reduce((s, i) => s + i.gross, 0);

  // Categories
  const catMap = {};
  items.forEach(i => {
    if (!catMap[i.category]) catMap[i.category] = { name: i.category, gross: 0, net: 0, profit: 0, qty: 0, count: 0, untracked: 0, products: [] };
    const c = catMap[i.category];
    c.gross += i.gross; c.net += i.net; c.profit += i.grossProfit || 0;
    c.qty += i.qty; c.count++; if (!i.hasCost) c.untracked++;
    c.products.push(i);
  });
  const categories = Object.values(catMap).map(c => ({
    ...c,
    margin: c.net > 0 ? (c.profit / c.net) * 100 : 0,
    pctRev: totalGross > 0 ? (c.gross / totalGross) * 100 : 0,
    products: c.products.sort((a, b) => b.gross - a.gross),
  })).sort((a, b) => b.gross - a.gross);

  // Top/bottom per category — Day: top 5 only. Week/Month: top AND bottom 5
  const catTopBottom = {};
  categories.forEach(cat => {
    const wc = cat.products.filter(p => p.hasCost);
    const sorted = [...wc].sort((a, b) => (b.grossProfit || 0) - (a.grossProfit || 0));
    catTopBottom[cat.name] = {
      top: sorted.slice(0, 5),
      bottom: isMultiDay ? sorted.slice(-5).reverse() : [], // only show bottom for week/month
    };
  });

  // Trending: compare with previous period
  const prevItems = allDays.length > 1 ? allDays[allDays.length - 2]?.items || [] : [];
  const prevMap = {};
  prevItems.forEach(i => { prevMap[i.barcode] = i; });
  const trending = items.filter(i => {
    const prev = prevMap[i.barcode];
    return i.qty >= 3 && prev && prev.qty > 0 && ((i.qty - prev.qty) / prev.qty) >= 0.4 && i.hasCost && (i.grossProfit || 0) > 0.5;
  }).map(i => {
    const prev = prevMap[i.barcode];
    return { ...i, prevQty: prev.qty, trendPct: Math.round(((i.qty - prev.qty) / prev.qty) * 100) };
  }).sort((a, b) => b.trendPct - a.trendPct).slice(0, 15);

  // Review: low margin
  const review = tracked.filter(i => i.grossMargin != null && i.grossMargin < 10 && i.grossMargin >= 0 && i.qty >= 1)
    .sort((a, b) => (a.grossMargin || 0) - (b.grossMargin || 0)).slice(0, 15);

  // Erosion: negative or very low margin
  const erosion = tracked.filter(i => i.grossMargin != null && i.grossMargin < 5)
    .sort((a, b) => (a.grossMargin || 0) - (b.grossMargin || 0)).slice(0, 15);

  // Generate insights
  const insights = generateInsights({ totalGross, trackedProfit, trackedMargin, untrackedRev, categories, erosion, trending, untracked, allDays, totalQty });

  // Generate actions
  const actions = generateActions({ untracked, erosion, categories, totalGross, trackedMargin, trending });

  return {
    summary: { totalGross, totalNet, totalQty, productCount: items.length, trackedProfit, trackedMargin, trackedCount: tracked.length, untrackedCount: untracked.length, untrackedRevenue: untrackedRev, estimatedHidden: untrackedRev * (trackedMargin / 100 || 0.25), categoryCount: categories.length },
    categories, trending, review, erosion, catTopBottom, items, tracked, untracked, prevItems, insights, actions,
  };
}

function generateInsights({ totalGross, trackedProfit, trackedMargin, untrackedRev, categories, erosion, trending, untracked, allDays, totalQty }) {
  const insights = [];
  // Hidden profit
  if (untrackedRev > 0) {
    const pctHidden = ((untrackedRev / totalGross) * 100).toFixed(0);
    insights.push({ icon: "⚠️", text: `${pctHidden}% of revenue (£${Math.round(untrackedRev)}) has no cost data — you can't see profit on these items. Fix the top 5 to recover ~£${Math.round(untrackedRev * (trackedMargin / 100) * 0.3)} visibility.`, type: "problem" });
  }
  // Negative margins
  const negItems = erosion.filter(i => (i.grossMargin || 0) < 0);
  if (negItems.length > 0) {
    insights.push({ icon: "🚨", text: `${negItems.length} item${negItems.length > 1 ? "s" : ""} showing negative margin — selling at a loss. Check cost entries in ShopMate for ${negItems[0].product}.`, type: "problem" });
  }
  // Top category
  if (categories.length > 0) {
    const top = categories[0];
    insights.push({ icon: "💰", text: `${top.name} is your biggest revenue driver at £${Math.round(top.gross)} (${top.pctRev.toFixed(0)}% of total) with ${top.margin.toFixed(1)}% margin.`, type: "insight" });
  }
  // Best margin category
  const bestMargin = [...categories].filter(c => c.profit > 0).sort((a, b) => b.margin - a.margin)[0];
  if (bestMargin && bestMargin.name !== categories[0]?.name) {
    insights.push({ icon: "📈", text: `${bestMargin.name} has your highest margin at ${bestMargin.margin.toFixed(1)}% — consider expanding range or shelf space.`, type: "solution" });
  }
  // Trending
  if (trending.length > 0) {
    insights.push({ icon: "🔥", text: `${trending[0].product} is trending +${trending[0].trendPct}% — ensure you have enough stock to meet demand.`, type: "insight" });
  }
  // Daily pattern
  if (allDays.length >= 3) {
    const dailyRevs = allDays.map(d => ({ day: d.dates ? new Date(d.dates.start + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" }) : "?", rev: d.items.reduce((s, i) => s + i.gross, 0) }));
    const busiest = dailyRevs.sort((a, b) => b.rev - a.rev)[0];
    const quietest = dailyRevs.sort((a, b) => a.rev - b.rev)[0];
    insights.push({ icon: "📊", text: `${busiest.day} is your busiest day (£${Math.round(busiest.rev)}). ${quietest.day} is quietest (£${Math.round(quietest.rev)}) — consider reduced staffing.`, type: "insight" });
  }
  return insights;
}

function generateActions({ untracked, erosion, categories, totalGross, trackedMargin, trending }) {
  const actions = [];
  // Fix untracked items
  if (untracked.length > 0) {
    const top3 = untracked.slice(0, 3).map(i => i.product).join(", ");
    actions.push({ action: `Enter cost prices for: ${top3}`, impact: `Recover £${Math.round(untracked.slice(0, 3).reduce((s, i) => s + i.gross, 0) * (trackedMargin / 100))} profit visibility`, priority: "HIGH", time: "10 min" });
  }
  // Fix negative margins
  const negItems = erosion.filter(i => (i.grossMargin || 0) < 0);
  if (negItems.length > 0) {
    actions.push({ action: `Check cost entry for ${negItems[0].product} — showing negative margin`, impact: "Stop selling at a loss", priority: "HIGH", time: "5 min" });
  }
  // Stock trending items
  if (trending.length > 0) {
    actions.push({ action: `Check stock levels on ${trending[0].product} (+${trending[0].trendPct}% demand increase)`, impact: "Don't miss sales on rising demand", priority: "MED", time: "5 min" });
  }
  // Category insight
  const lowMarginCats = categories.filter(c => c.margin > 0 && c.margin < 10 && c.gross > totalGross * 0.05);
  if (lowMarginCats.length > 0) {
    actions.push({ action: `Review pricing in ${lowMarginCats[0].name} — only ${lowMarginCats[0].margin.toFixed(1)}% margin on £${Math.round(lowMarginCats[0].gross)} revenue`, impact: "Improve margin on high-revenue category", priority: "MED", time: "15 min" });
  }
  return actions;
}
