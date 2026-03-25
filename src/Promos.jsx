// ═══════════════════════════════════════════════════════════════════
// PROMOS v6 — Scored matching + interactive ambiguity review
// AI reads leaflet only. JS scores all candidates. Ambiguous items
// shown to user for confirmation before calculating decisions.
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from "react";
import { C, SectionCard, Badge, EmptyState, fi, f } from "./components.jsx";
import { ANTHROPIC_KEY, AI_HDR } from "./config.js";
import { savePromoScan, loadPromoScans, loadPromoDecisions, loadPromoSkips, loadAllPriceHistory, updatePromoDecision, deletePromoScan, saveCorrection } from "./supabase.js";

const MAX_SCANS_PER_WEEK = 999;
const QUICK_SUPPLIERS = ["Booker 1DS", "Booker 2DS", "Booker 5DS", "Booker RTE", "Costco", "Parfetts", "United Wholesale"];
const SKIP_WORDS = ["pack", "case", "litr", "litre", "bottles", "cans", "packs", "with", "and", "the"];

// ═══════════════════════════════════════════════════════════════════
// VELOCITY ENGINE — 3-window blend with one-off detection
// ═══════════════════════════════════════════════════════════════════
function buildVelocityMap(allDays) {
  if (!allDays || !allDays.length) return {};
  const sorted = [...allDays].sort((a, b) => (a.dates?.start || "").localeCompare(b.dates?.start || ""));
  const last7   = sorted.slice(-7);
  const last28  = sorted.slice(-28);
  const allTime = sorted;

  const agg = (days) => {
    const map = {};
    days.forEach(d => d.items.forEach(i => {
      const key = (i.barcode || i.product).toLowerCase();
      if (!map[key]) map[key] = { product: i.product, barcode: i.barcode, category: i.category, qty: 0, gross: 0 };
      map[key].qty += i.qty;
      map[key].gross += i.gross;
    }));
    return map;
  };

  const weekMap  = agg(last7);
  const monthMap = agg(last28);
  const yearMap  = agg(allTime);
  const allKeys  = new Set([...Object.keys(weekMap), ...Object.keys(monthMap), ...Object.keys(yearMap)]);
  const result   = {};

  allKeys.forEach(key => {
    const w = weekMap[key];
    const m = monthMap[key];
    const y = yearMap[key];

    const weeklyVel  = w ? Math.round((w.qty / Math.max(1, last7.length / 7)) * 10) / 10 : 0;
    const monthlyAvg = m ? Math.round((m.qty / Math.max(1, last28.length / 7)) * 10) / 10 : 0;
    const yearlyAvg  = y ? Math.round((y.qty / Math.max(1, allTime.length / 7)) * 10) / 10 : 0;
    const isOneOff   = weeklyVel >= 3 && yearlyAvg < 0.5 && monthlyAvg < 1;

    let blended;
    if (isOneOff)                         blended = 0;
    else if (weeklyVel > yearlyAvg * 2)   blended = Math.round(((weeklyVel * 0.5) + (monthlyAvg * 0.3) + (yearlyAvg * 0.2)) * 10) / 10;
    else if (weeklyVel < yearlyAvg * 0.5) blended = Math.round(((weeklyVel * 0.2) + (monthlyAvg * 0.3) + (yearlyAvg * 0.5)) * 10) / 10;
    else                                  blended = Math.round(((weeklyVel * 0.4) + (monthlyAvg * 0.35) + (yearlyAvg * 0.25)) * 10) / 10;

    // Spike detection: how inflated is recent vs long-run?
    const spikeRatio = yearlyAvg > 0 ? Math.round((weeklyVel / yearlyAvg) * 10) / 10 : 0;
    const isSpiked   = spikeRatio >= 3 && weeklyVel >= 5; // 3x+ above yearly AND meaningful volume

    const base       = w || m || y;
    const totalQty   = (m || y)?.qty || 1;
    const totalGross = (m || y)?.gross || 0;

    result[key] = {
      product: base.product, barcode: base.barcode, category: base.category,
      weeklyVel, monthlyAvg, yearlyAvg, blended, isOneOff, spikeRatio, isSpiked,
      sellPrice: Math.round((totalGross / totalQty) * 100) / 100,
    };
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// SCORED MATCHING ENGINE
// Returns { match, candidates, confident }
// ═══════════════════════════════════════════════════════════════════
const VARIANT_KEYWORDS = [
  "ice", "cherry", "zero", "diet", "max", "original", "sugar free", "light",
  "orange", "lemon", "lime", "raspberry", "strawberry", "tropical",
  "mint", "menthol", "dark fruit", "pear", "apple", "berry",
  "gold", "silver", "black", "white", "red", "blue",
  "extra cold", "smooth", "extra", "classic", "premium",
];

function scoreMatch(promoName, promoRrp, eposProduct) {
  const name       = (promoName || "").toLowerCase();
  const rrp        = (promoRrp || "").replace(/[^0-9.]/g, "");
  const pmCode     = rrp.replace(".", "");
  const ep         = (eposProduct || "").toLowerCase();
  const promoWords = name.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 1 && !SKIP_WORDS.includes(w));
  const eposWords  = ep.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 1);
  const brand      = promoWords[0];

  // Brand must match as first word — hard requirement
  if (!brand || eposWords[0] !== brand) return -999;

  let score = 0;

  // PM code match
  if (pmCode && pmCode.length >= 2) {
    if (ep.includes("pm" + pmCode))  score += 5;   // PM matches = strong signal
    else if (/pm\d+/.test(ep))       score -= 4;   // Different PM = wrong product
  }

  // Variant keywords
  const promoVariants = VARIANT_KEYWORDS.filter(kw => name.includes(kw));
  const eposVariants  = VARIANT_KEYWORDS.filter(kw => ep.includes(kw));

  for (const kw of promoVariants) {
    if (ep.includes(kw)) score += 3;  // Variant matches
    else                 score -= 5;  // Promo has variant, EPOS doesn't = wrong product
  }

  // Promo has no variant but EPOS does = likely wrong
  if (promoVariants.length === 0 && eposVariants.length > 0) score -= 3;

  // Meaningful word overlap (beyond brand)
  const meaningful = promoWords.slice(1).filter(w => w.length > 3 && !SKIP_WORDS.includes(w));
  for (const w of meaningful) {
    if (eposWords.some(ew => ew === w || ew.includes(w) || w.includes(ew))) score += 1;
  }

  return score;
}

function matchPromoToEpos(promoName, promoRrp, velMap) {
  const name  = (promoName || "").toLowerCase();
  const brand = name.replace(/[^a-z0-9\s]/g, "").split(/\s+/)[0];
  if (!brand) return { match: null, candidates: [], confident: false };

  const scored = [];
  for (const v of Object.values(velMap)) {
    const ep = v.product.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    if (!ep.startsWith(brand)) continue;
    const score = scoreMatch(promoName, promoRrp, v.product);
    if (score > -999) scored.push({ v, score });
  }

  if (!scored.length) return { match: null, candidates: [], confident: false };

  scored.sort((a, b) => b.score - a.score);
  const best   = scored[0];
  const second = scored[1];

  // Confident: score >= 3 AND at least 3 points ahead of second place
  const confident = best.score >= 3 && (!second || best.score - second.score >= 3);

  return {
    match:      confident ? best.v : null,
    candidates: scored.slice(0, 4).map(s => ({ epos: s.v, score: s.score })),
    confident,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PACK STRUCTURE VALIDATOR
// ═══════════════════════════════════════════════════════════════════
function parseUnitsPerCase(caseFormat, aiValue, productName) {
  // Extract sellable units from a format string.
  // KEY RULE: "6x4x440ml" = 6 sellable PACKS (you sell the 4-pack, not individual cans).
  //           "24x440ml"  = 24 individual cans.
  //           "12x500ml"  = 12 individual bottles.
  // The OUTER number is always the sellable unit count.
  const extractFromString = (str) => {
    if (!str) return null;
    const s = str.trim();
    // Triple format "6x4x568ml" or "6x4x440ml" → 6 sellable packs
    const multi = s.match(/^(\d+)x(\d+)x[\d.]+(?:ml|cl|ltr)/i);
    if (multi) return parseInt(multi[1]);
    // Double format "24x440ml", "12x500ml", "6x75cl", "6x2ltr" → first number = units
    const single = s.match(/^(\d+)x[\d.]+(?:ml|cl|ltr)/i);
    if (single) return parseInt(single[1]);
    // Plain volume "70cl", "1ltr" = single bottle
    if (/^[\d.]+(cl|ml|ltr)/i.test(s)) return 1;
    return null;
  };

  // 1. Try case_format first — most reliable when AI fills it correctly
  const fromFormat = extractFromString(caseFormat);
  if (fromFormat !== null) return fromFormat;

  // 2. Try extracting from product_name as fallback
  // IMPORTANT: must match triple format BEFORE double to avoid "4x440ml"
  // matching inside "6x4x440ml". The regex tries triple first.
  if (productName) {
    const tripleMatch = (productName || "").match(/(\d+x\d+x[\d.]+(?:ml|cl|ltr))/i);
    if (tripleMatch) {
      const fromTriple = extractFromString(tripleMatch[1]);
      if (fromTriple !== null) return fromTriple;
    }
    // Only try double format if no triple was found
    const doubleMatch = (productName || "").match(/(\d+x[\d.]+(?:ml|cl|ltr))/i);
    if (doubleMatch) {
      const fromDouble = extractFromString(doubleMatch[1]);
      if (fromDouble !== null) return fromDouble;
    }
  }

  // 3. AI fallback — sanity-capped
  const ai = Number(aiValue) || 1;
  if (ai >= 1 && ai <= 48) return ai;

  return 1;
}

// ═══════════════════════════════════════════════════════════════════
// DECISION ENGINE
// ═══════════════════════════════════════════════════════════════════
function calculateDecisions(matchedProducts, budget) {
  const decisions = [];
  const skips     = [];
  let totalSpend  = 0;
  const COVER_MIN = 3;
  const COVER_MAX = 10;
  const FAST_VEL  = 10;

  matchedProducts.forEach(item => {
    const { product_name, case_price, case_format, rrp_num, epos, eposMatch } = item;
    const vel = epos ? epos.blended : 0;
    const cp  = Number(case_price) || 0;
    const upc = parseUnitsPerCase(case_format, Number(item.units_per_case) || 1, product_name);
    // Use AI-parsed RRP first, fall back to EPOS average sell price if missing
    const aiRrp   = Number(rrp_num) || 0;
    const eposSp  = epos?.sellPrice || 0;
    const rrp     = aiRrp > 0 ? aiRrp : eposSp;
    const rrpSrc  = aiRrp > 0 ? "leaflet" : eposSp > 0 ? "EPOS" : "none";

    const costPerUnitIncVat = (upc > 0 ? cp / upc : cp) * 1.2;
    const por = rrp > 0 ? Math.round(((rrp - costPerUnitIncVat) / rrp) * 1000) / 10 : 0;
    const spikeRatio = epos?.spikeRatio || 0;
    const isSpiked   = epos?.isSpiked || false;
    const baseFields = { product: product_name, eposMatch: eposMatch || "No match", source: item.source || "", casePrice: cp, por, rrp: item.rrp || (rrp > 0 ? `£${rrp.toFixed(2)}` : ""), rrpNum: rrp, upc, spikeRatio, isSpiked };

    const isOneOff  = epos?.isOneOff || false;
    const yearlyAvg = epos?.yearlyAvg || 0;

    if (isOneOff) {
      skips.push({ product: product_name, reason: `One-off — ${epos.weeklyVel}/wk last week, only ${yearlyAvg.toFixed(1)}/wk yearly. Not a real seller.` });
      return;
    }
    if (vel === 0 && yearlyAvg === 0) {
      if (cp > 0 && por >= 20) {
        const totalInc = Math.round(cp * 1.2 * 100) / 100;
        decisions.push({ ...baseFields, vel: 0, qty: 1, cover: "TEST", units: upc, totalInc, decision: "TEST", notes: `No EPOS history. Testing 1 case. ${por}% POR.` });
        totalSpend += totalInc;
      } else {
        skips.push({ product: product_name, reason: `Zero velocity — no sales history.${por > 0 ? ` ${por}% POR.` : ""}` });
      }
      return;
    }
    if (vel < 1 && yearlyAvg < 1) {
      if (por >= 20) {
        const totalInc = Math.round(cp * 1.2 * 100) / 100;
        decisions.push({ ...baseFields, vel: Math.round(vel * 10) / 10, qty: 1, cover: "TEST", units: upc, totalInc, decision: "TEST", notes: `Low velocity (${vel}/wk blended, ${yearlyAvg}/wk yearly). Testing 1 case. ${por}% POR.` });
        totalSpend += totalInc;
      } else {
        skips.push({ product: product_name, reason: `Low velocity (${vel}/wk) and ${por}% POR. Not worth testing.` });
      }
      return;
    }

    let targetWeeks = vel >= FAST_VEL ? 8 : vel >= 4 ? 6 : 4;
    let qty = Math.ceil((vel * targetWeeks) / upc);
    if (qty < 1) qty = 1;
    let coverWeeks = (qty * upc) / vel;

    while (coverWeeks > COVER_MAX && qty > 1) { qty--; coverWeeks = (qty * upc) / vel; }
    const coverFloor = vel >= FAST_VEL ? 4 : COVER_MIN;
    while (coverWeeks < coverFloor) {
      qty++; coverWeeks = (qty * upc) / vel;
      if (coverWeeks > COVER_MAX) { qty--; coverWeeks = (qty * upc) / vel; break; }
    }

    coverWeeks = Math.round(coverWeeks);
    const totalInc = Math.round(cp * qty * 1.2 * 100) / 100;

    decisions.push({
      ...baseFields, vel: Math.round(vel * 10) / 10, qty, upc,
      cover: `~${coverWeeks}wk`, units: qty * upc, totalInc, decision: "BUY",
      notes: `EPOS: ${epos.product} — ${epos.weeklyVel}/wk (7d), ${epos.monthlyAvg}/wk (monthly), ${yearlyAvg}/wk (yearly), blended ${vel}/wk. ${qty} case${qty > 1 ? "s" : ""} x ${upc} = ${qty * upc} units = ~${coverWeeks}wk. ${por}% POR.`,
    });
    totalSpend += totalInc;
  });

  const budgetNum = Number(budget) || 750;

  // ── REBALANCE DOWN: over budget → cut spiked/inflated items first, then highest cover ──
  if (totalSpend > budgetNum * 1.05) {
    // Sort: spiked items first (highest spike ratio), then by cover descending (most overstocked)
    // This protects proven fast movers and cuts seasonal spikes / overordered items first
    const buyItems = decisions.filter(d => d.decision === "BUY" && d.qty > 1)
      .sort((a, b) => {
        // Spiked items always cut first
        if (a.isSpiked !== b.isSpiked) return a.isSpiked ? -1 : 1;
        // Among equals, cut highest cover first (most stock relative to velocity)
        const aCover = a.vel > 0 ? (a.qty * a.upc) / a.vel : 999;
        const bCover = b.vel > 0 ? (b.qty * b.upc) / b.vel : 999;
        return bCover - aCover;
      });
    let iterations = 0;
    const MAX_ITER = 300;
    while (totalSpend > budgetNum * 1.05 && buyItems.length > 0 && iterations < MAX_ITER) {
      iterations++;
      const target = buyItems[0];
      if (target.qty > 1) {
        target.qty--;
        target.units    = target.qty * target.upc;
        target.totalInc = Math.round(target.casePrice * target.qty * 1.2 * 100) / 100;
        target.cover    = `~${Math.round(target.units / target.vel)}wk`;
        totalSpend      = decisions.reduce((s, d) => s + (d.totalInc || 0), 0);
      } else {
        buyItems.shift();
      }
    }
  }

  // ── REBALANCE UP: under budget → increase fastest movers ──
  if (totalSpend < budgetNum * 0.95) {
    const fastItems = decisions.filter(d => d.decision === "BUY").sort((a, b) => b.vel - a.vel);
    let iterations = 0;
    const MAX_ITER = 200;
    outerLoop: for (const fast of fastItems) {
      while (iterations < MAX_ITER) {
        iterations++;
        if (totalSpend >= budgetNum * 0.95) break outerLoop;
        const newCover = ((fast.qty + 1) * fast.upc) / fast.vel;
        if (newCover > COVER_MAX) break; // Hit cap for this item, move to next
        fast.qty++;
        fast.units    = fast.qty * fast.upc;
        fast.totalInc = Math.round(fast.casePrice * fast.qty * 1.2 * 100) / 100;
        fast.cover    = `~${Math.round(newCover)}wk`;
        totalSpend    = decisions.reduce((s, d) => s + (d.totalInc || 0), 0);
      }
    }
  }

  // ── REBUILD NOTES: after all rebalancing, update notes to reflect final quantities ──
  decisions.forEach(d => {
    if (d.decision === "BUY" && d.vel > 0) {
      const originalQty = Math.ceil((d.vel * (d.vel >= FAST_VEL ? 8 : d.vel >= 4 ? 6 : 4)) / d.upc);
      const reduced = d.qty < originalQty ? " [Qty reduced — budget]" : "";
      const spike   = d.isSpiked ? ` ⚠️ SPIKE: ${d.spikeRatio}x above yearly avg — review qty.` : "";
      d.notes = `${d.vel}/wk blended. ${d.qty} case${d.qty > 1 ? "s" : ""} × ${d.upc} = ${d.units} units = ${d.cover}. ${d.por}% POR.${reduced}${spike}`;
    }
  });

  const estRevenue = decisions.reduce((s, d) => s + ((d.rrpNum || 0) * (d.units || 0)), 0);
  const estProfit  = Math.round((estRevenue - totalSpend) * 100) / 100;
  // ROI = profit / spend × 100 (return on investment)
  const roi = totalSpend > 0
    ? Math.round((estProfit / totalSpend) * 1000) / 10
    : 0;

  return {
    decisions, skips,
    totalSpend:  Math.round(totalSpend * 100) / 100,
    remaining:   Math.round((budgetNum - totalSpend) * 100) / 100,
    budgetPct:   Math.round((totalSpend / budgetNum) * 1000) / 10,
    estRevenue:  Math.round(estRevenue * 100) / 100,
    estProfit, roi,
    lines: { buy: decisions.filter(d => d.decision === "BUY").length, test: decisions.filter(d => d.decision === "TEST").length, skip: skips.length },
  };
}

// ═══════════════════════════════════════════════════════════════════
// AI PROMPT — reads leaflet only, no matching
// ═══════════════════════════════════════════════════════════════════
function step1Prompt(supplier) {
  return `Read this wholesale promotion leaflet from ${supplier}. Extract EVERY product shown.

For each product return:
- product_name: Full name including brand, variant and size. e.g. "Smirnoff Ice 12x275ml PM2.29", "Dr Pepper Cherry 12x500ml PM1.40", "Pepsi Max 12x500ml PM1.39"
- case_format: The FULL pack format EXACTLY as printed. e.g. "24x440ml", "12x500ml", "6x4x568ml", "6x2ltr", "6x70cl". This is CRITICAL — always include it.
- case_price: The WHOLESALE CASE PRICE in pounds (ex VAT). The big price shown (WSP). NOT the retail price.
- rrp: The retail or PM price per unit e.g. "PM1.40", "PM7.99", "RRP1.99"
- units_per_case: Sellable units per case. The OUTER number in the format is ALWAYS the answer.
    TRIPLE format (AxBxC): A = sellable units. "6x4x440ml" = 6 (you sell 6 four-packs). NOT 24.
    DOUBLE format (AxB): A = sellable units. "24x440ml" = 24. "12x500ml" = 12. "6x75cl" = 6.
    Examples:
      6x4x568ml → units_per_case: 6   (six 4-packs, sell each 4-pack at PM price)
      6x4x440ml → units_per_case: 6   (six 4-packs — DO NOT multiply 6x4=24, that is WRONG)
      24x440ml  → units_per_case: 24  (twenty-four individual cans)
      12x500ml  → units_per_case: 12  (twelve individual bottles)
      6x2ltr    → units_per_case: 6   (six 2-litre bottles)
      6x75cl    → units_per_case: 6   (six 75cl bottles)
      6x70cl    → units_per_case: 6   (six 70cl bottles)
      6x1ltr    → units_per_case: 6   (six 1-litre bottles)
- deal_notes: Any special offers shown

CRITICAL RULES:
- product_name MUST include the FULL variant. "Smirnoff Ice" not "Smirnoff". "Dr Pepper Cherry" not "Dr Pepper". "K Cider" not "Cider".
- case_format MUST always be filled in. Never leave it blank. Read it from the product description (e.g. "24x440ml", "6x4x440ml").
- case_price is for ONE CASE. "WSP 19.49" means 19.49 for the whole case, not per unit.
- units_per_case MUST match the case_format. "24x440ml" = 24 units. "6x4x440ml" = 6 units (packs). Never put 1 unless it is genuinely a single bottle.
- A slash "/" in a name means a mixed case e.g. "Chardonnay/Merlot" = one case with both. Keep as one product.
- Read ALL prices exactly as printed.

RESPOND with ONLY a valid JSON array, nothing else:
[{"product_name":"","case_format":"","case_price":0,"rrp":"","units_per_case":0,"deal_notes":""}]`;
}

// ═══════════════════════════════════════════════════════════════════
// UI — PROMO ROW (expandable decision card)
// ═══════════════════════════════════════════════════════════════════
function PromoRow({ item, onEdit, priceHistory }) {
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState(false);
  const [newDec, setNewDec]   = useState(item.user_override || item.decision);
  const [notes, setNotes]     = useState(item.user_notes || "");
  const dec   = item.user_override || item.decision;
  const decBg = dec === "BUY" ? C.greenDim : dec === "TEST" ? C.orangeDim : C.redDim;
  const decBd = dec === "BUY" ? "rgba(34,197,94,0.2)" : dec === "TEST" ? "rgba(245,158,11,0.2)" : "rgba(239,68,68,0.2)";
  const cp    = item.casePrice || item.case_price;
  const prev  = priceHistory?.find(h => h.product?.toLowerCase() === item.product?.toLowerCase() && h.scan_id !== item.scan_id);
  const chg   = prev && cp ? Math.round((Number(cp) - Number(prev.case_price)) * 100) / 100 : null;

  return (
    <div style={{ marginBottom: 6 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: open ? "10px 10px 0 0" : 10, background: open ? decBg : C.surface, border: `1px solid ${open ? decBd : C.border}`, cursor: "pointer" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: C.white, fontWeight: 600 }}>{item.product}</div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{item.vel != null ? `${item.vel}/wk` : "—"} · {item.por != null ? `${Math.round(Number(item.por))}% POR` : "—"}</div>
          {item.isSpiked && <div style={{ fontSize: 10, marginTop: 2, color: "#F59E0B", fontWeight: 600 }}>⚠️ {item.spikeRatio}x above yearly avg — possible seasonal spike</div>}
          {item.eposMatch && item.eposMatch !== "No match" && <div style={{ fontSize: 10, color: C.accentLight, marginTop: 1 }}>EPOS: {item.eposMatch}</div>}
          {chg != null && chg !== 0 && <div style={{ fontSize: 10, marginTop: 2, color: chg < 0 ? C.greenText : C.redText, fontWeight: 600 }}>{chg < 0 ? `£${Math.abs(chg).toFixed(2)} CHEAPER` : `£${chg.toFixed(2)} DEARER`} vs last promo</div>}
        </div>
        <Badge type={dec === "BUY" ? "HIGH" : dec === "TEST" ? "MED" : "LOW"}>{dec}</Badge>
      </div>
      {open && (
        <div style={{ padding: "12px 14px", background: decBg, borderRadius: "0 0 10px 10px", border: `1px solid ${decBd}`, borderTop: "none" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {[["Case", cp ? `£${Number(cp).toFixed(2)}` : null], ["Qty", item.qty], ["Cover", item.cover], ["Units", item.units], ["Total", item.totalInc ? f(Number(item.totalInc)) : null], ["RRP", item.rrp]].map(([l, v]) => v ? (
              <div key={l} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "5px 9px" }}>
                <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase" }}>{l}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{v}</div>
              </div>
            ) : null)}
          </div>
          {item.notes && <div style={{ fontSize: 11, color: C.textPrimary, lineHeight: 1.65, marginBottom: 8 }}>{item.notes}</div>}
          {item.user_notes && <div style={{ fontSize: 11, color: C.orangeText, marginBottom: 8 }}>Edited: {item.user_notes}</div>}
          {!editing ? (
            <button onClick={e => { e.stopPropagation(); setEditing(true); }} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Edit</button>
          ) : (
            <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: 8, padding: 10, marginTop: 6 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {["BUY", "TEST", "SKIP"].map(d => (
                  <button key={d} onClick={() => setNewDec(d)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: newDec === d ? (d === "BUY" ? C.green : d === "TEST" ? "#F39C12" : C.red) : C.surface, color: newDec === d ? C.white : C.textMuted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{d}</button>
                ))}
              </div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for change..." style={{ width: "100%", padding: 8, borderRadius: 8, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 11, minHeight: 50, outline: "none", resize: "vertical", fontFamily: "Inter, sans-serif", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={() => setEditing(false)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 11, cursor: "pointer" }}>Cancel</button>
                <button onClick={() => { if (onEdit) onEdit(item, newDec, notes); setEditing(false); }} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: C.accentLight, color: C.white, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Save</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// UI — AMBIGUITY REVIEW SCREEN
// Shows products JS couldn't confidently match. User picks correct
// EPOS line from a scored shortlist, then calculation runs.
// ═══════════════════════════════════════════════════════════════════
// Per-item sub-component so each search field has isolated state
function ReviewItem({ item, index, selection, onPick, velMap }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery]           = useState("");

  // Live search against velMap as user types
  const searchResults = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return [];
    return Object.values(velMap)
      .filter(v => v.product.toLowerCase().includes(q))
      .sort((a, b) => b.blended - a.blended)
      .slice(0, 8);
  }, [query, velMap]);

  const isTypedSelection = selection && !item.candidates.some(c => c.epos === selection);

  return (
    <div style={{ marginBottom: 20, padding: 14, borderRadius: 12, background: C.surface, border: `1px solid ${selection !== undefined ? "rgba(34,197,94,0.3)" : C.border}` }}>

      {/* Leaflet product header */}
      <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>On leaflet</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.white }}>{item.product_name}</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
          {item.case_format} · {item.rrp} · Case £{Number(item.case_price).toFixed(2)} ex VAT
        </div>
      </div>

      <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Which EPOS product is this?</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

        {/* Scored candidates */}
        {item.candidates.map(({ epos, score }, j) => {
          const isSelected = selection === epos;
          const strength   = score >= 5 ? "Strong" : score >= 3 ? "Good" : score >= 0 ? "Weak" : "Poor";
          const strColor   = score >= 5 ? C.greenText : score >= 3 ? C.orangeText : C.textMuted;
          return (
            <button key={j} onClick={() => { onPick(epos); setSearchOpen(false); setQuery(""); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${isSelected ? "rgba(34,197,94,0.6)" : C.border}`, background: isSelected ? "rgba(34,197,94,0.1)" : C.bg, cursor: "pointer", textAlign: "left" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{epos.product}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{epos.weeklyVel}/wk (7d) · {epos.monthlyAvg}/wk (mo) · {epos.yearlyAvg}/wk (yr)</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
                <div style={{ fontSize: 10, color: strColor, fontWeight: 600 }}>{strength}</div>
                {isSelected && <div style={{ width: 18, height: 18, borderRadius: "50%", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.white }}>✓</div>}
              </div>
            </button>
          );
        })}

        {/* Typed search option */}
        {!searchOpen ? (
          <button onClick={() => setSearchOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${isTypedSelection ? "rgba(34,197,94,0.6)" : C.border}`, background: isTypedSelection ? "rgba(34,197,94,0.1)" : C.bg, cursor: "pointer" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${isTypedSelection ? C.green : C.border}`, background: isTypedSelection ? C.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.white, flexShrink: 0 }}>
              {isTypedSelection ? "✓" : "+"}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: isTypedSelection ? C.greenText : C.textMuted }}>
                {isTypedSelection ? selection.product : "Search EPOS manually"}
              </div>
              {isTypedSelection && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>{selection.weeklyVel}/wk (7d) · {selection.monthlyAvg}/wk (mo) · {selection.yearlyAvg}/wk (yr)</div>}
              {!isTypedSelection && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>Not in suggestions? Type to search all EPOS products</div>}
            </div>
          </button>
        ) : (
          <div style={{ padding: 10, borderRadius: 9, border: `1.5px solid ${C.accentLight}`, background: "rgba(59,111,212,0.06)" }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type product name e.g. Smirnoff Ice..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 12, outline: "none", fontFamily: "Inter, sans-serif", boxSizing: "border-box", marginBottom: 8 }}
            />
            {query.length >= 2 && searchResults.length === 0 && (
              <div style={{ fontSize: 11, color: C.textMuted, padding: "6px 4px" }}>No EPOS products found for "{query}"</div>
            )}
            {searchResults.map((epos, k) => (
              <button key={k} onClick={() => { onPick(epos); setSearchOpen(false); setQuery(""); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "9px 10px", marginBottom: 4, borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, cursor: "pointer", textAlign: "left" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{epos.product}</div>
                  <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>{epos.weeklyVel}/wk (7d) · {epos.monthlyAvg}/wk (mo) · {epos.yearlyAvg}/wk (yr)</div>
                </div>
                <div style={{ fontSize: 10, color: C.accentLight, fontWeight: 600, marginLeft: 8, flexShrink: 0 }}>Select</div>
              </button>
            ))}
            <button onClick={() => { setSearchOpen(false); setQuery(""); }} style={{ fontSize: 11, color: C.textMuted, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>Cancel</button>
          </div>
        )}

        {/* Not in EPOS option */}
        <button onClick={() => { onPick(null); setSearchOpen(false); setQuery(""); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${selection === null ? "rgba(239,68,68,0.5)" : C.border}`, background: selection === null ? "rgba(239,68,68,0.08)" : C.bg, cursor: "pointer" }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${selection === null ? C.red : C.border}`, background: selection === null ? C.red : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.white, flexShrink: 0 }}>
            {selection === null ? "✓" : ""}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: selection === null ? C.redText : C.textMuted }}>Not in EPOS</div>
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>Treat as new product — TEST 1 case if POR is good</div>
          </div>
        </button>
      </div>
    </div>
  );
}

function ReviewScreen({ items, onConfirm, velMap }) {
  const [selections, setSelections] = useState(() => items.map(() => undefined));
  const allAnswered = selections.every(s => s !== undefined);
  const remaining   = selections.filter(s => s === undefined).length;

  const pick = (i, epos) => setSelections(prev => { const n = [...prev]; n[i] = epos; return n; });

  return (
    <SectionCard title="Confirm Matches" icon="🔍" accent="rgba(245,158,11,0.06)">
      <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 16, lineHeight: 1.6 }}>
        {items.length} product{items.length !== 1 ? "s" : ""} could not be matched automatically. Pick the correct EPOS product for each one, search manually, or mark as "Not in EPOS".
      </div>

      {items.map((item, i) => (
        <ReviewItem
          key={i}
          item={item}
          index={i}
          selection={selections[i]}
          onPick={(epos) => pick(i, epos)}
          velMap={velMap}
        />
      ))}

      <button
        onClick={() => allAnswered && onConfirm(selections)}
        disabled={!allAnswered}
        style={{ width: "100%", padding: 16, borderRadius: 12, border: "none", background: allAnswered ? C.green : C.surface, color: allAnswered ? C.white : C.textMuted, fontSize: 15, fontWeight: 700, cursor: allAnswered ? "pointer" : "default" }}
      >
        {allAnswered ? "Confirm & Calculate Order List" : `${remaining} product${remaining !== 1 ? "s" : ""} still to confirm`}
      </button>
    </SectionCard>
  );
}

const Mini = ({ label, value, color }) => (
  <div style={{ flex: "1 1 45%", background: C.surface, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.border}` }}>
    <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 800, color: color || C.white }}>{value}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function LeafletScanner({ analysis, clientId, allDays }) {
  const [view, setView]           = useState("menu");
  const [photos, setPhotos]       = useState([]);
  const [previews, setPreviews]   = useState([]);
  const [budget, setBudget]       = useState("750");
  const [supplier, setSupplier]   = useState("");
  const [scanning, setScanning]   = useState(false);
  const [scanStep, setScanStep]   = useState("");
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);
  const [history, setHistory]     = useState([]);
  const [priceHist, setPriceHist] = useState([]);
  const [selScan, setSelScan]     = useState(null);
  const [selDecs, setSelDecs]     = useState([]);
  const [selSkips, setSelSkips]   = useState([]);
  const [saving, setSaving]       = useState(false);

  // State for the review flow
  const [pendingConfident, setPendingConfident] = useState(null);
  const [pendingAmbiguous, setPendingAmbiguous] = useState(null);

  const velMap = useMemo(() => buildVelocityMap(allDays), [allDays]);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      try {
        const [s, p] = await Promise.all([loadPromoScans(clientId), loadAllPriceHistory(clientId)]);
        setHistory(s || []); setPriceHist(p || []);
      } catch (e) { console.error(e); }
    })();
  }, [clientId]);

  const weekStart     = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const scansThisWeek = history.filter(s => new Date(s.created_at) >= weekStart).length;

  const addPhotos = (e) => {
    const files = Array.from(e.target.files || []);
    setPhotos(p => [...p, ...files]);
    files.forEach(file => { const r = new FileReader(); r.onload = ev => setPreviews(p => [...p, ev.target.result]); r.readAsDataURL(file); });
  };
  const rmPhoto = i => { setPhotos(p => p.filter((_, j) => j !== i)); setPreviews(p => p.filter((_, j) => j !== i)); };

  const resetScan = () => {
    setPhotos([]); setPreviews([]); setError(null); setResult(null);
    setPendingConfident(null); setPendingAmbiguous(null);
  };

  // ── SCAN: read leaflet → score → split confident vs ambiguous ───
  const scan = async () => {
    if (!photos.length || !ANTHROPIC_KEY || !supplier.trim()) return;
    setScanning(true); setError(null); setResult(null);

    try {
      const imgs = await Promise.all(photos.map(file => new Promise(res => {
        const r = new FileReader();
        r.onload = () => res({ type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: r.result.split(",")[1] } });
        r.readAsDataURL(file);
      })));

      setScanStep("Reading leaflet...");
      const s1 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 8000, messages: [{ role: "user", content: [...imgs, { type: "text", text: step1Prompt(supplier) }] }] }),
      });
      if (!s1.ok) throw new Error(`Read failed: ${s1.status}`);
      const s1json = await s1.json();
      if (s1json.error) throw new Error(`Read error: ${s1json.error.message || s1json.error.type}`);

      let s1text = (s1json.content?.filter(b => b.type === "text").map(b => b.text).join("") || "").replace(/```json|```/g, "").trim();
      const j1s = s1text.indexOf("["); const j1e = s1text.lastIndexOf("]");
      if (j1s < 0) throw new Error("No products found. Try a clearer photo.");
      s1text = s1text.slice(j1s, j1e + 1);

      let extracted;
      try { extracted = JSON.parse(s1text); }
      catch { throw new Error("Too many products for one scan — try one photo at a time."); }
      if (!Array.isArray(extracted) || !extracted.length) throw new Error("No products found. Try a clearer photo.");

      setScanStep("Scoring EPOS matches...");

      const confident = [];
      const ambiguous = [];

      extracted.forEach(prod => {
        const { match, candidates, confident: isConfident } = matchPromoToEpos(prod.product_name, prod.rrp, velMap);
        const rrpNum = (() => {
          const raw = (prod.rrp || "").toString().trim();
          // Try direct float parse after stripping currency symbols and PM/RRP prefix
          // Handles: "PM£1.40", "PM 1.40", "£1.40", "RRP£1.99", "1.40", "PM140"
          const cleaned = raw.replace(/[£$€\s]/g, "").replace(/^(PM|RRP|pm|rrp)/i, "");
          // If it has a decimal point, parse directly: "1.40" → 1.40
          if (cleaned.includes(".")) return parseFloat(cleaned) || 0;
          // No decimal — could be "140" meaning £1.40, or "699" meaning £6.99
          // Heuristic: if number > 99, it's pence notation (divide by 100)
          const n = parseFloat(cleaned) || 0;
          if (n === 0) return 0;
          if (n > 99) return Math.round(n) / 100;
          return n;
        })();
        const base   = { ...prod, rrp_num: rrpNum, source: supplier };

        if (isConfident) {
          confident.push({ ...base, epos: match, eposMatch: match.product });
        } else {
          ambiguous.push({ ...base, candidates, epos: null, eposMatch: "No match" });
        }
      });

      setScanning(false); setScanStep("");

      if (ambiguous.length > 0) {
        setPendingConfident(confident);
        setPendingAmbiguous(ambiguous);
        setView("review");
      } else {
        finishCalculation(confident);
      }

    } catch (e) {
      console.error("Scan:", e);
      setError(e.message || "Scan failed. Try a clearer photo.");
      setScanning(false); setScanStep("");
    }
  };

  // ── After review, merge user selections and calculate ────────────
  const onReviewConfirm = (selections) => {
    const resolved = pendingAmbiguous.map((item, i) => ({
      ...item,
      epos:      selections[i] || null,
      eposMatch: selections[i] ? selections[i].product : "No match",
    }));
    finishCalculation([...pendingConfident, ...resolved]);
    setPendingConfident(null); setPendingAmbiguous(null);
  };

  const finishCalculation = (matchedProducts) => {
    const res      = calculateDecisions(matchedProducts, budget);
    res.source     = supplier;
    res.budget     = parseInt(budget) || 750;
    res.keyInsight = `${res.lines.buy} to buy, ${res.lines.test} to test from ${supplier}. ${res.totalSpend > 0 ? `Total £${res.totalSpend} (${res.budgetPct}% of budget).` : ""}`;
    setResult(res);
    setView("results");
  };

  const save = async () => {
    if (!result || !clientId) return; setSaving(true);
    try {
      await savePromoScan(clientId, result, result.decisions || [], result.skips || []);
      const [s, p] = await Promise.all([loadPromoScans(clientId), loadAllPriceHistory(clientId)]);
      setHistory(s || []); setPriceHist(p || []);
      setView("menu"); setResult(null); setPhotos([]); setPreviews([]);
    } catch (e) { setError("Save failed: " + e.message); }
    setSaving(false);
  };

  const editDec = async (item, dec, notes) => {
    if (item.id) {
      await updatePromoDecision(item.id, { user_override: dec, user_notes: notes });
      if (notes) await saveCorrection(clientId, item.product, "override", `${dec}: ${notes}`);
      setSelDecs(p => p.map(d => d.id === item.id ? { ...d, user_override: dec, user_notes: notes } : d));
    } else {
      const idx = result.decisions.findIndex(d => d.product === item.product);
      if (idx >= 0) { result.decisions[idx].user_override = dec; result.decisions[idx].user_notes = notes; setResult({ ...result }); }
    }
  };

  const viewHist = async (s) => {
    setSelScan(s);
    const [d, k] = await Promise.all([loadPromoDecisions(s.id), loadPromoSkips(s.id)]);
    setSelDecs(d || []); setSelSkips(k || []);
    setView("detail");
  };

  const delScan = async (id) => {
    if (!confirm("Delete this scan?")) return;
    await deletePromoScan(id);
    setHistory(p => p.filter(s => s.id !== id));
    setView("menu");
  };

  // ── MENU ────────────────────────────────────────────────────────
  if (view === "menu") return (
    <SectionCard title="Promotions" icon="🎯" accent="rgba(34,197,94,0.06)">
      {!ANTHROPIC_KEY ? <EmptyState msg="API key required in Vercel settings" /> : <>
        <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 16, lineHeight: 1.6 }}>
          Upload supplier leaflet photos. AI reads every product. JS scores matches against your EPOS — high confidence items are auto-matched, ambiguous ones are shown for your confirmation before the order list is calculated.
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>Scans this week: {scansThisWeek}</div>
        <button onClick={() => setView("scan")} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: C.green, color: C.white, fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}>📷 Scan New Leaflet</button>
        {history.length > 0 && <>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Previous Scans</div>
          {history.map((s, i) => (
            <div key={i} onClick={() => viewHist(s)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", marginBottom: 6, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{s.supplier}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>{new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {s.buy_count}B/{s.test_count}T · {fi(s.total_spend)}</div>
              </div>
              <span style={{ color: C.textMuted }}>›</span>
            </div>
          ))}
        </>}
      </>}
    </SectionCard>
  );

  // ── SCAN ────────────────────────────────────────────────────────
  if (view === "scan") return (
    <SectionCard title="Scan Leaflet" icon="📷">
      <button onClick={() => { resetScan(); setView("menu"); }} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", padding: "0 0 12px", fontWeight: 600 }}>Back</button>

      <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>Supplier</div>
      <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Booker 2DS, Parfetts..." style={{ width: "100%", padding: "12px 14px", borderRadius: 10, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: "Inter, sans-serif", boxSizing: "border-box", marginBottom: 6 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {QUICK_SUPPLIERS.map(s => <button key={s} onClick={() => setSupplier(s)} style={{ padding: "6px 10px", borderRadius: 8, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", background: supplier === s ? C.accentLight : C.surface, color: supplier === s ? C.white : C.textMuted }}>{s}</button>)}
      </div>

      <label style={{ display: "block", padding: "24px 16px", borderRadius: 12, border: `2px dashed ${C.border}`, background: C.surface, textAlign: "center", cursor: "pointer", marginBottom: 12 }}>
        <input type="file" accept="image/*" multiple onChange={addPhotos} style={{ display: "none" }} />
        <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>Take photo or choose from library</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Multiple photos supported</div>
      </label>

      {previews.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {previews.map((p, i) => (
            <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
              <img src={p} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
              <button onClick={() => rmPhoto(i)} style={{ position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: C.white, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>x</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>Budget:</span>
        <div style={{ display: "flex", alignItems: "center", flex: 1, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: "0 12px" }}>
          <span style={{ color: C.textMuted }}>£</span>
          <input type="tel" value={budget} onChange={e => setBudget(e.target.value.replace(/\D/g, ""))} style={{ flex: 1, padding: "10px 8px", background: "transparent", border: "none", color: C.white, fontSize: 14, fontWeight: 700, outline: "none" }} />
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>
        {Object.keys(velMap).length} products in EPOS · {(allDays || []).length} days of data
      </div>

      {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: C.redDim, marginBottom: 12, fontSize: 12, color: C.redText }}>{error}</div>}

      <button onClick={scan} disabled={scanning || !photos.length || !supplier.trim()} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: photos.length && supplier.trim() ? C.green : C.surface, color: photos.length && supplier.trim() ? C.white : C.textMuted, fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: scanning ? 0.7 : 1 }}>
        {scanning ? `${scanStep}` : photos.length && supplier.trim() ? `Scan ${photos.length} Photo${photos.length !== 1 ? "s" : ""}` : !supplier.trim() ? "Enter supplier name" : "Upload a photo"}
      </button>
    </SectionCard>
  );

  // ── REVIEW ───────────────────────────────────────────────────────
  if (view === "review" && pendingAmbiguous) return (
    <div>
      <div style={{ padding: "8px 16px" }}>
        <button onClick={() => { resetScan(); setView("scan"); }} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", padding: "8px 0", fontWeight: 600 }}>Back to scan</button>
      </div>
      {pendingConfident && pendingConfident.length > 0 && (
        <div style={{ padding: "0 16px 8px" }}>
          <div style={{ padding: "10px 14px", borderRadius: 10, background: C.greenDim, border: "1px solid rgba(34,197,94,0.2)", fontSize: 11, color: C.greenText }}>
            {pendingConfident.length} product{pendingConfident.length !== 1 ? "s" : ""} matched automatically and ready to go
          </div>
        </div>
      )}
      <ReviewScreen items={pendingAmbiguous} onConfirm={onReviewConfirm} velMap={velMap} />
    </div>
  );

  // ── RESULTS ─────────────────────────────────────────────────────
  if (view === "results" && result) {
    const b  = (result.decisions || []).filter(d => (d.user_override || d.decision) === "BUY");
    const t  = (result.decisions || []).filter(d => (d.user_override || d.decision) === "TEST");
    const sk = result.skips || [];
    return (<>
      <SectionCard title="Promotion Forensic" icon="🎯" accent="rgba(34,197,94,0.06)">
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <Mini label="Budget" value={fi(result.budget || budget)} />
          <Mini label="Spent"  value={fi(result.totalSpend || 0)} />
          <Mini label="ROI" value={`${result.roi || 0}%`} color={result.roi > 0 ? C.greenText : C.redText} />
          <Mini label="Lines"  value={`${b.length}B / ${t.length}T`} />
        </div>
        {result.source && <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 12 }}>{result.source}</div>}
        {result.keyInsight && (
          <div style={{ background: "linear-gradient(135deg, rgba(46,80,144,0.12), rgba(59,130,246,0.06))", borderRadius: 10, padding: 10, border: "1px solid rgba(46,80,144,0.2)", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Summary</div>
            <div style={{ fontSize: 11, color: C.textPrimary, lineHeight: 1.5 }}>{result.keyInsight}</div>
          </div>
        )}
        {b.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.greenText, textTransform: "uppercase", marginBottom: 8 }}>Buy ({b.length})</div>{b.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {t.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.orangeText, textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>Test ({t.length})</div>{t.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {result.totalSpend > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textMuted, marginBottom: 4 }}><span>Budget used</span><span>{result.budgetPct}%</span></div>
            <div style={{ height: 6, background: C.surface, borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, result.budgetPct)}%`, background: C.green, borderRadius: 3 }} /></div>
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>{f(result.remaining)} remaining</div>
          </div>
        )}
      </SectionCard>

      {sk.length > 0 && (
        <SectionCard title="Skipped" icon="🚫">
          {sk.map((s, i) => (
            <div key={i} style={{ padding: "8px 10px", marginBottom: 4, borderRadius: 8, background: C.redDim }}>
              <div style={{ fontSize: 11, color: C.white }}>{s.product}</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>{s.reason}</div>
            </div>
          ))}
        </SectionCard>
      )}

      <div style={{ padding: "0 16px 20px", display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} style={{ flex: 1, padding: 14, borderRadius: 12, border: "none", background: C.green, color: C.white, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{saving ? "Saving..." : "Save"}</button>
        <button onClick={() => { resetScan(); setView("scan"); }} style={{ padding: "14px 20px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 13, cursor: "pointer" }}>Rescan</button>
      </div>
    </>);
  }

  // ── HISTORY DETAIL ───────────────────────────────────────────────
  if (view === "detail" && selScan) {
    const b = selDecs.filter(d => (d.user_override || d.decision) === "BUY");
    const t = selDecs.filter(d => (d.user_override || d.decision) === "TEST");
    return (<>
      <SectionCard title={selScan.supplier} icon="🎯">
        <button onClick={() => setView("menu")} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", padding: "0 0 12px", fontWeight: 600 }}>Back</button>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>{new Date(selScan.created_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" })}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <Mini label="Spent" value={fi(selScan.total_spend)} />
          <Mini label="ROI"   value={`${selScan.roi}%`} color={C.greenText} />
          <Mini label="Lines" value={`${selScan.buy_count}B/${selScan.test_count}T`} />
        </div>
        {selScan.key_insight && (
          <div style={{ background: "linear-gradient(135deg, rgba(46,80,144,0.12), rgba(59,130,246,0.06))", borderRadius: 10, padding: 10, border: "1px solid rgba(46,80,144,0.2)", marginBottom: 14, fontSize: 11, color: C.textPrimary, lineHeight: 1.5 }}>{selScan.key_insight}</div>
        )}
        {b.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.greenText, textTransform: "uppercase", marginBottom: 8 }}>Buy ({b.length})</div>{b.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {t.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.orangeText, textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>Test ({t.length})</div>{t.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {selSkips.length > 0 && (
          <><div style={{ fontSize: 11, fontWeight: 700, color: C.redText, textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>Skipped ({selSkips.length})</div>
          {selSkips.map((s, i) => (
            <div key={i} style={{ padding: "6px 10px", marginBottom: 4, borderRadius: 8, background: C.redDim, fontSize: 11 }}>
              <span style={{ color: C.white }}>{s.product}</span> — <span style={{ color: C.textMuted }}>{s.reason}</span>
            </div>
          ))}</>
        )}
      </SectionCard>
      <div style={{ padding: "0 16px 20px" }}>
        <button onClick={() => delScan(selScan.id)} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid rgba(239,68,68,0.3)", background: C.redDim, color: C.redText, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Delete Scan</button>
      </div>
    </>);
  }

  return <SectionCard title="Promotions" icon="🎯"><EmptyState msg="Loading..." /></SectionCard>;
}
