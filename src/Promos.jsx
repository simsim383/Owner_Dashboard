// ═══════════════════════════════════════════════════════════════════
// PROMOS v5 — JS calculates everything, AI reads images + matches only
// Fixes: 3-window velocity, one-off detection, variant matching,
//        pack structure validator, cover floors, Strategy A fallback only
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from "react";
import { C, SectionCard, Badge, EmptyState, fi, f } from "./components.jsx";
import { ANTHROPIC_KEY, AI_HDR } from "./config.js";
import { savePromoScan, loadPromoScans, loadPromoDecisions, loadPromoSkips, loadAllPriceHistory, updatePromoDecision, deletePromoScan, saveCorrection } from "./supabase.js";

const MAX_SCANS_PER_WEEK = 999;
const QUICK_SUPPLIERS = ["Booker 1DS", "Booker 2DS", "Booker 5DS", "Booker RTE", "Costco", "Parfetts", "United Wholesale"];

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

  const allKeys = new Set([...Object.keys(weekMap), ...Object.keys(monthMap), ...Object.keys(yearMap)]);
  const result = {};

  allKeys.forEach(key => {
    const w = weekMap[key];
    const m = monthMap[key];
    const y = yearMap[key];

    const weeklyVel  = w ? w.qty : 0;
    const monthlyAvg = m ? Math.round((m.qty / Math.max(1, last28.length / 7)) * 10) / 10 : 0;
    const yearlyAvg  = y ? Math.round((y.qty / Math.max(1, allTime.length / 7)) * 10) / 10 : 0;

    // ONE-OFF DETECTION: high last week but near-zero all-time = one-off purchase
    const isOneOff = weeklyVel >= 3 && yearlyAvg < 0.5;

    let blended;
    if (isOneOff) {
      blended = 0;
    } else if (weeklyVel > yearlyAvg * 2) {
      // Growing — weight recent higher
      blended = Math.round(((weeklyVel * 0.5) + (monthlyAvg * 0.3) + (yearlyAvg * 0.2)) * 10) / 10;
    } else if (weeklyVel < yearlyAvg * 0.5) {
      // Seasonal dip — trust yearly more
      blended = Math.round(((weeklyVel * 0.2) + (monthlyAvg * 0.3) + (yearlyAvg * 0.5)) * 10) / 10;
    } else {
      // Stable — balanced weight
      blended = Math.round(((weeklyVel * 0.4) + (monthlyAvg * 0.35) + (yearlyAvg * 0.25)) * 10) / 10;
    }

    const base       = w || m || y;
    const totalQty   = (m || y)?.qty || 1;
    const totalGross = (m || y)?.gross || 0;
    const sellPrice  = Math.round((totalGross / totalQty) * 100) / 100;

    result[key] = {
      product: base.product, barcode: base.barcode, category: base.category,
      weeklyVel, monthlyAvg, yearlyAvg, blended, isOneOff, sellPrice,
    };
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// MATCHING ENGINE — variant-aware, brand + PM + flavour validated
// ═══════════════════════════════════════════════════════════════════
const VARIANT_KEYWORDS = [
  "cherry", "zero", "diet", "max", "original", "sugar free", "light",
  "orange", "lemon", "lime", "raspberry", "strawberry", "tropical",
  "mint", "menthol", "dark fruit", "pear", "apple", "berry",
  "gold", "silver", "black", "white", "red", "blue",
  "extra cold", "smooth", "extra", "classic", "premium",
];

function findEposMatch(leafletProduct, eposMatch, velMap) {
  if (!eposMatch || eposMatch === "null" || eposMatch === "No match") return null;
  const search = eposMatch.toLowerCase().trim();

  // Direct key match
  if (velMap[search]) return velMap[search];

  // Exact product name match
  for (const v of Object.values(velMap)) {
    if (v.product.toLowerCase() === search) return v;
  }

  // Build required variant list from both the promo name and the AI match string
  const searchVariants  = VARIANT_KEYWORDS.filter(kw => search.includes(kw));
  const leafletVariants = VARIANT_KEYWORDS.filter(kw => (leafletProduct || "").toLowerCase().includes(kw));
  // Use whichever source is more specific
  const requiredVariants = searchVariants.length >= leafletVariants.length ? searchVariants : leafletVariants;

  const matchBrand = search.split(/[\s\/]+/)[0];

  for (const v of Object.values(velMap)) {
    const eposName  = v.product.toLowerCase();
    const eposBrand = eposName.split(/[\s\/]+/)[0];

    // Brand must match
    if (eposBrand !== matchBrand) continue;

    // ALL required variant keywords must be present in the EPOS name
    if (requiredVariants.length > 0) {
      if (!requiredVariants.every(kw => eposName.includes(kw))) continue;
    }

    // If promo has NO variant keywords, reject EPOS names that DO have them
    // (prevents "Dr Pepper Original" matching "Dr Pepper Cherry")
    if (requiredVariants.length === 0) {
      const eposHasVariant  = VARIANT_KEYWORDS.some(kw => eposName.includes(kw));
      const promoHasVariant = VARIANT_KEYWORDS.some(kw => (leafletProduct || "").toLowerCase().includes(kw));
      if (eposHasVariant && !promoHasVariant) continue;
    }

    if (eposName.includes(search) || search.includes(eposName)) return v;
  }

  // Last resort: brand + all variant keywords match + at least 2 common words
  for (const v of Object.values(velMap)) {
    const eposName  = v.product.toLowerCase();
    const eposWords = eposName.split(/\s+/);
    const searchWords = search.split(/\s+/);
    if (eposWords[0] !== matchBrand) continue;
    if (requiredVariants.length > 0 && !requiredVariants.every(kw => eposName.includes(kw))) continue;
    // Require words longer than 3 chars so "dr"/"pm" don't count as meaningful matches
    const commonWords = eposWords.filter(w => w.length > 3 && searchWords.some(sw => sw.includes(w) || w.includes(sw)));
    if (commonWords.length >= 2) return v;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// PACK STRUCTURE VALIDATOR — overrides AI's units_per_case
// ═══════════════════════════════════════════════════════════════════
function parseUnitsPerCase(caseFormat, aiValue) {
  if (!caseFormat) return aiValue || 1;
  // "6x4x568ml" or "6x4x440ml" → 6 sellable packs (outer number only)
  const multiPack = caseFormat.match(/^(\d+)x(\d+)x/i);
  if (multiPack) return parseInt(multiPack[1]);
  // "12x500ml", "24x250ml", "6x75cl" → first number = individual units
  const single = caseFormat.match(/^(\d+)x/i);
  if (single) return parseInt(single[1]);
  // "70cl" / "1ltr" with no multiplier = single bottle (spirits)
  if (/^\d*x?[\d.]+(cl|ml|ltr)/i.test(caseFormat) && !caseFormat.includes("x")) return 1;
  return aiValue || 1;
}

// ═══════════════════════════════════════════════════════════════════
// DECISION ENGINE — correct thresholds, cover rules, one-off guard
// ═══════════════════════════════════════════════════════════════════
function calculateDecisions(matchedProducts, budget) {
  const decisions  = [];
  const skips      = [];
  let totalSpend   = 0;
  const COVER_MIN  = 3;
  const COVER_MAX  = 10;
  const FAST_VEL   = 10;

  matchedProducts.forEach(item => {
    const { product_name, case_price, case_format, rrp_num, epos, eposMatch } = item;
    const vel  = epos ? epos.blended : 0;
    const cp   = Number(case_price) || 0;
    const upc  = parseUnitsPerCase(case_format, Number(item.units_per_case) || 1);
    const rrp  = Number(rrp_num) || 0;

    // POR calculation
    const costPerUnitExVat  = upc > 0 ? cp / upc : cp;
    const costPerUnitIncVat = costPerUnitExVat * 1.2;
    const por = rrp > 0 ? Math.round(((rrp - costPerUnitIncVat) / rrp) * 1000) / 10 : 0;

    const baseFields = {
      product: product_name, eposMatch: eposMatch || "No match", source: item.source || "",
      casePrice: cp, por, rrp: item.rrp || "", upc,
    };

    const isOneOff  = epos?.isOneOff || false;
    const yearlyAvg = epos?.yearlyAvg || 0;

    // ONE-OFF GUARD
    if (isOneOff) {
      skips.push({ product: product_name, reason: `One-off purchase — ${epos.weeklyVel}/wk last week but only ${yearlyAvg.toFixed(1)}/wk yearly avg. Not a real seller.` });
      return;
    }

    // ZERO VELOCITY — no sales in any period
    if (vel === 0 && yearlyAvg === 0) {
      if (cp > 0 && por >= 20) {
        const totalInc = Math.round(cp * 1.2 * 100) / 100;
        decisions.push({ ...baseFields, vel: 0, qty: 1, cover: "TEST", units: upc, totalInc, decision: "TEST",
          notes: `No EPOS history. Testing 1 case. ${por}% POR.` });
        totalSpend += totalInc;
      } else {
        skips.push({ product: product_name, reason: `Zero velocity — no sales history.${por > 0 ? ` ${por}% POR.` : ""}` });
      }
      return;
    }

    // LOW VELOCITY — blended < 1 AND yearly < 1
    if (vel < 1 && yearlyAvg < 1) {
      if (por >= 20) {
        const totalInc = Math.round(cp * 1.2 * 100) / 100;
        decisions.push({ ...baseFields, vel: Math.round(vel * 10) / 10, qty: 1, cover: "TEST", units: upc, totalInc, decision: "TEST",
          notes: `Low velocity (${vel}/wk blended, ${yearlyAvg}/wk yearly). Testing 1 case. ${por}% POR.` });
        totalSpend += totalInc;
      } else {
        skips.push({ product: product_name, reason: `Low velocity (${vel}/wk) and ${por}% POR. Not worth testing.` });
      }
      return;
    }

    // BUY — calculate cover with correct rules
    let targetWeeks;
    if (vel >= FAST_VEL) targetWeeks = 8;
    else if (vel >= 4)   targetWeeks = 6;
    else                 targetWeeks = 4;

    let qty        = Math.ceil((vel * targetWeeks) / upc);
    if (qty < 1) qty = 1;
    let coverWeeks = (qty * upc) / vel;

    // Enforce hard cap
    while (coverWeeks > COVER_MAX && qty > 1) {
      qty--;
      coverWeeks = (qty * upc) / vel;
    }

    // Enforce floor (fast movers min 4wk, others min 3wk)
    const coverFloor = vel >= FAST_VEL ? 4 : COVER_MIN;
    while (coverWeeks < coverFloor) {
      qty++;
      coverWeeks = (qty * upc) / vel;
      if (coverWeeks > COVER_MAX) { qty--; coverWeeks = (qty * upc) / vel; break; }
    }

    coverWeeks = Math.round(coverWeeks);
    const totalInc   = Math.round(cp * qty * 1.2 * 100) / 100;
    const totalUnits = qty * upc;

    decisions.push({
      ...baseFields, vel: Math.round(vel * 10) / 10, qty, upc,
      cover: `~${coverWeeks}wk`, units: totalUnits, totalInc, decision: "BUY",
      notes: `EPOS: ${epos.product} — ${epos.weeklyVel}/wk (7d), ${epos.monthlyAvg}/wk (monthly), ${yearlyAvg}/wk (yearly), blended ${vel}/wk. ${qty} case${qty > 1 ? "s" : ""} × ${upc} = ${totalUnits} units = ~${coverWeeks}wk. ${por}% POR.`,
    });
    totalSpend += totalInc;
  });

  // Budget rebalance — reduce slowest movers if over budget
  const budgetNum  = Number(budget) || 750;
  const buyItems   = decisions.filter(d => d.decision === "BUY").sort((a, b) => a.vel - b.vel);
  while (totalSpend > budgetNum * 1.05 && buyItems.length > 0) {
    const slowest = buyItems[0];
    if (slowest.qty > 1) {
      slowest.qty--;
      slowest.units    = slowest.qty * slowest.upc;
      slowest.totalInc = Math.round(slowest.casePrice * slowest.qty * 1.2 * 100) / 100;
      slowest.cover    = `~${Math.round(slowest.units / slowest.vel)}wk`;
      slowest.notes   += " [Reduced for budget]";
      totalSpend       = decisions.reduce((s, d) => s + (d.totalInc || 0), 0);
    } else {
      buyItems.shift();
    }
  }

  // Increase fastest movers if under budget
  const fastItems = decisions.filter(d => d.decision === "BUY").sort((a, b) => b.vel - a.vel);
  for (const fast of fastItems) {
    if (totalSpend >= budgetNum * 0.95) break;
    const newCover = ((fast.qty + 1) * fast.upc) / fast.vel;
    if (newCover <= COVER_MAX) {
      fast.qty++;
      fast.units    = fast.qty * fast.upc;
      fast.totalInc = Math.round(fast.casePrice * fast.qty * 1.2 * 100) / 100;
      fast.cover    = `~${Math.round(newCover)}wk`;
      fast.notes   += " [Increased — budget available]";
      totalSpend    = decisions.reduce((s, d) => s + (d.totalInc || 0), 0);
    }
  }

  const estRevenue = decisions.reduce((s, d) => {
    const rrpNum = parseFloat((d.rrp || "").replace(/[^0-9.]/g, "")) || 0;
    return s + (rrpNum * (d.units || 0));
  }, 0);
  const estProfit = Math.round((estRevenue - totalSpend) * 100) / 100;
  const roi       = totalSpend > 0 ? Math.round((estProfit / totalSpend) * 1000) / 10 : 0;

  return {
    decisions, skips,
    totalSpend:  Math.round(totalSpend * 100) / 100,
    remaining:   Math.round((budgetNum - totalSpend) * 100) / 100,
    budgetPct:   Math.round((totalSpend / budgetNum) * 1000) / 10,
    estRevenue:  Math.round(estRevenue * 100) / 100,
    estProfit, roi,
    lines: {
      buy:  decisions.filter(d => d.decision === "BUY").length,
      test: decisions.filter(d => d.decision === "TEST").length,
      skip: skips.length,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// AI PROMPTS — image reading + product matching only
// ═══════════════════════════════════════════════════════════════════
function step1Prompt(supplier) {
  return `Read this wholesale promotion leaflet from ${supplier}. Extract EVERY product shown.

For each product return:
- product_name: Full name with brand, variant, size (e.g. "Dr Pepper Cherry 12x500ml PM£1.40")
- case_format: e.g. "12x500ml", "6x4x568ml", "24x250ml", "6x2ltr"
- case_price: The WHOLESALE CASE PRICE (ex VAT). The big price labelled WSP. NOT the retail price.
- rrp: The retail/PM price per unit (e.g. "PM£1.40", "PM£7.99", "RRP£1.99")
- units_per_case: Sellable units. 6x4x568ml=6 packs. 12x500ml=12. 24x250ml=24. 6x2ltr=6. 6x70cl=6. 10x100g=10.
- deal_notes: Any special offers ("Buy 3 for £13", "Was £8.39")

CRITICAL:
- case_price is for ONE CASE not per unit. "WSP: £5.99" = £5.99 for the whole case.
- Include the FULL variant name in product_name. "Dr Pepper Cherry" not just "Dr Pepper". "Pepsi Max" not just "Pepsi".
- If a product name has "/" it means BOTH varieties in one case. List as ONE product with full name including both.
- Read prices EXACTLY as printed. Do not calculate or infer.

RESPOND with ONLY a JSON array: [{"product_name":"","case_format":"","case_price":0,"rrp":"","units_per_case":0,"deal_notes":""}]`;
}

function step2Prompt(extractedProducts, eposNames) {
  return `You are matching wholesale promotion products to EPOS till system product names.
This is a convenience store in the north east of England (Londis).

PROMOTION PRODUCTS TO MATCH:
${extractedProducts.map((p, i) => `${i + 1}. ${p.product_name} | Format: ${p.case_format} | PM/RRP: ${p.rrp}`).join("\n")}

EPOS PRODUCT NAMES (ONLY valid matches — do not invent names, do not modify spelling):
${eposNames.join("\n")}

HOW TO MATCH — follow these steps for EVERY product:

STEP A: Build a search string from the promo
- Take the brand (e.g. "Dr Pepper")
- Take the PM price digits (e.g. PM£1.40 → "Pm140" or "Pm1.40")
- Take the variant/flavour (e.g. "Cherry", "Zero", "Original", "Dark Fruit")
- Example: "Dr Pepper Cherry 12x500ml PM£1.40" → search for EPOS name with "Dr Pepper" AND "Cherry" AND "Pm140"

STEP B: Find the EPOS name that matches ALL three (brand + variant + PM code)
- "Dr Pepper Zero Cherry Pm140" ✓ matches brand + cherry + pm140
- "Dr Pepper Pm140" ✗ wrong — missing Cherry variant
- "Dr Pepper Cherry Pm215" ✗ wrong — different PM code = different product

STEP C: If no exact three-way match, try brand + variant only (drop PM requirement)
- Only do this if the PM code genuinely does not appear in any EPOS name for that brand

STEP D: If still no match, return null — do NOT pick the closest unrelated product

CRITICAL RULES:
1. VARIANT IS MANDATORY — this is the most important rule.
   Cherry ≠ Original ≠ Zero ≠ Diet ≠ Max ≠ Sugar Free ≠ any other flavour.
   
   WORKED EXAMPLE — "Dr Pepper Cherry 12x500ml PM£1.40":
   ✓ CORRECT: "Dr Pepper Zero Cherry Pm140" — has Cherry AND Pm140
   ✗ WRONG:   "Dr Pepper Pm140"             — no Cherry in name, REJECT even if PM matches
   ✗ WRONG:   "Dr Pepper Cherry Pm215"      — wrong PM code, REJECT
   ✗ WRONG:   "Pepsi Max Cherry Pm139"      — wrong brand entirely, REJECT
   
   If the promo product has a flavour/variant word and your chosen EPOS name does NOT
   contain that exact word → that is the WRONG match. Return null instead.
   Do not substitute the plain version for the flavoured version. Ever.
2. PM CODE IS MANDATORY where it exists in EPOS. Pm140 ≠ Pm215. Different PM = different product.
3. BRAND MUST MATCH exactly. "I Heart Prosecco" cannot match "Hardys". "Heineken" cannot match "Fosters".
4. 6x4 PACK FORMAT: "Heineken 6x4x440ml PM£6.59" → EPOS match is "Heineken Pm659" (4-pack sells at £6.59).
5. MIXED CASES with "/": "Chardonnay/Merlot" → match to the FIRST named variant in EPOS (Chardonnay).
6. SPIRITS single bottles: "Smirnoff 70cl PM£17.59" → match "Smirnoff" + "Pm1759". Pm1759 ≠ Pm2359.
7. PM MATCHING: PM£6.59 converts to Pm659. If "Heineken Pm659" exists in EPOS → that IS the match.
8. NEVER sum multiple EPOS variants. "Pepsi Max Pm139" and "Pepsi Max Pm219" are DIFFERENT products.
9. If you are not confident, return null. A wrong match causes the store to order products they don't sell.

RESPOND with ONLY a JSON array in the same order as the promotion products above:
[{"promo_index":0,"epos_match":"exact EPOS name from the list above, or null","match_notes":"brief reason"}]`;
}

// ═══════════════════════════════════════════════════════════════════
// UI COMPONENTS
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
          {item.eposMatch && item.eposMatch !== "No match" && <div style={{ fontSize: 10, color: C.accentLight, marginTop: 1 }}>EPOS: {item.eposMatch}</div>}
          {chg != null && chg !== 0 && <div style={{ fontSize: 10, marginTop: 2, color: chg < 0 ? C.greenText : C.redText, fontWeight: 600 }}>{chg < 0 ? `£${Math.abs(chg).toFixed(2)} CHEAPER` : `£${chg.toFixed(2)} DEARER`} vs last promo</div>}
        </div>
        <Badge type={dec === "BUY" ? "HIGH" : dec === "TEST" ? "MED" : "LOW"}>{dec}</Badge>
      </div>
      {open && (
        <div style={{ padding: "12px 14px", background: decBg, borderRadius: "0 0 10px 10px", border: `1px solid ${decBd}`, borderTop: "none" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {[["Case £", cp ? `£${Number(cp).toFixed(2)}` : null], ["Qty", item.qty], ["Cover", item.cover], ["Units", item.units], ["Total", item.totalInc ? f(Number(item.totalInc)) : null], ["RRP", item.rrp]].map(([l, v]) => v ? <div key={l} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "5px 9px" }}><div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{v}</div></div> : null)}
          </div>
          {item.notes && <div style={{ fontSize: 11, color: C.textPrimary, lineHeight: 1.65, marginBottom: 8 }}>{item.notes}</div>}
          {item.user_notes && <div style={{ fontSize: 11, color: C.orangeText, marginBottom: 8 }}>✏️ {item.user_notes}</div>}
          {!editing ? (
            <button onClick={e => { e.stopPropagation(); setEditing(true); }} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✏️ Edit</button>
          ) : (
            <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: 8, padding: 10, marginTop: 6 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>{["BUY", "TEST", "SKIP"].map(d => <button key={d} onClick={() => setNewDec(d)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: newDec === d ? (d === "BUY" ? C.green : d === "TEST" ? "#F39C12" : C.red) : C.surface, color: newDec === d ? C.white : C.textMuted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{d}</button>)}</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Why? e.g. wrong product, don't stock this size..." style={{ width: "100%", padding: 8, borderRadius: 8, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 11, minHeight: 50, outline: "none", resize: "vertical", fontFamily: "Inter, sans-serif", boxSizing: "border-box" }} />
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
  const [view, setView]         = useState("menu");
  const [photos, setPhotos]     = useState([]);
  const [previews, setPreviews] = useState([]);
  const [budget, setBudget]     = useState("750");
  const [supplier, setSupplier] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState("");
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const [history, setHistory]   = useState([]);
  const [priceHist, setPriceHist] = useState([]);
  const [selScan, setSelScan]   = useState(null);
  const [selDecs, setSelDecs]   = useState([]);
  const [selSkips, setSelSkips] = useState([]);
  const [saving, setSaving]     = useState(false);

  const velMap    = useMemo(() => buildVelocityMap(allDays), [allDays]);
  const eposNames = useMemo(() => Object.values(velMap).map(v => v.product).sort(), [velMap]);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      try {
        const [s, p] = await Promise.all([loadPromoScans(clientId), loadAllPriceHistory(clientId)]);
        setHistory(s || []);
        setPriceHist(p || []);
      } catch (e) { console.error(e); }
    })();
  }, [clientId]);

  const weekStart      = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const scansThisWeek  = history.filter(s => new Date(s.created_at) >= weekStart).length;
  const canScan        = scansThisWeek < MAX_SCANS_PER_WEEK;

  const addPhotos = (e) => {
    const files = Array.from(e.target.files || []);
    setPhotos(p => [...p, ...files]);
    files.forEach(f => { const r = new FileReader(); r.onload = ev => setPreviews(p => [...p, ev.target.result]); r.readAsDataURL(f); });
  };
  const rmPhoto = i => { setPhotos(p => p.filter((_, j) => j !== i)); setPreviews(p => p.filter((_, j) => j !== i)); };

  // ─── THREE-STEP SCAN ────────────────────────────────────────────
  const scan = async () => {
    if (!photos.length || !ANTHROPIC_KEY || !supplier.trim()) return;
    if (!canScan) { setError(`Weekly limit (${MAX_SCANS_PER_WEEK}) reached.`); return; }
    setScanning(true); setError(null); setResult(null);

    try {
      const imgs = await Promise.all(photos.map(file => new Promise(res => {
        const r = new FileReader();
        r.onload = () => res({ type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: r.result.split(",")[1] } });
        r.readAsDataURL(file);
      })));

      // ── STEP 1: Read leaflet image ──
      setScanStep("Step 1/3: Reading leaflet...");
      const s1 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 8000, messages: [{ role: "user", content: [...imgs, { type: "text", text: step1Prompt(supplier) }] }] }),
      });
      if (!s1.ok) throw new Error(`Step 1 failed: ${s1.status} — check API key`);
      const s1json = await s1.json();
      if (s1json.error) throw new Error(`Step 1 error: ${s1json.error.message || s1json.error.type}`);
      let s1text = (s1json.content?.filter(b => b.type === "text").map(b => b.text).join("") || "").replace(/```json|```/g, "").trim();
      const j1s = s1text.indexOf("["); const j1e = s1text.lastIndexOf("]");
      if (j1s < 0) throw new Error("No products found in leaflet. Try a clearer photo.");
      s1text = s1text.slice(j1s, j1e + 1);
      let extracted;
      try { extracted = JSON.parse(s1text); }
      catch { throw new Error("Too many products for one scan — try uploading photos one at a time."); }
      if (!Array.isArray(extracted) || !extracted.length) throw new Error("No products found. Try a clearer photo.");

      // ── STEP 2: Match products to EPOS ──
      setScanStep(`Step 2/3: Matching ${extracted.length} products to EPOS...`);
      const s2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, messages: [{ role: "user", content: step2Prompt(extracted, eposNames) }] }),
      });
      if (!s2.ok) throw new Error(`Step 2 failed: ${s2.status}`);
      const s2json = await s2.json();
      if (s2json.error) throw new Error(`Step 2 error: ${s2json.error.message || s2json.error.type}`);
      let s2text = (s2json.content?.filter(b => b.type === "text").map(b => b.text).join("") || "").replace(/```json|```/g, "").trim();
      const j2s = s2text.indexOf("["); const j2e = s2text.lastIndexOf("]");
      if (j2s < 0) throw new Error("Matching step failed — please try again.");
      s2text = s2text.slice(j2s, j2e + 1);
      let matches;
      try { matches = JSON.parse(s2text); }
      catch { matches = []; } // if matching JSON is bad, proceed with no matches (all go to TEST/SKIP)

      // ── STEP 3: JavaScript calculates everything ──
      setScanStep("Step 3/3: Calculating decisions...");
      const matchedProducts = extracted.map((prod, i) => {
        const match    = matches.find(m => m.promo_index === i) || matches[i] || {};
        const eposName = match.epos_match;
        let epos       = null;

        // Primary: use AI match with brand AND variant pre-validation
        if (eposName && eposName !== "null" && eposName !== "No match") {
          const promoBrand   = (prod.product_name || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/)[0];
          const matchBrand   = (eposName || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/)[0];
          const brandsRelated = promoBrand === matchBrand ||
            eposName.toLowerCase().includes(promoBrand) ||
            (prod.product_name || "").toLowerCase().includes(matchBrand);

          // VARIANT PRE-CHECK: before calling findEposMatch, verify the AI's
          // suggested EPOS name actually contains all variant keywords from the promo.
          // This catches cases where AI correctly reads "Dr Pepper Cherry" in Step 1
          // but then matches to "Dr Pepper Pm140" (no cherry) in Step 2.
          const promoNameLower  = (prod.product_name || "").toLowerCase();
          const eposNameLower   = (eposName || "").toLowerCase();
          const promoVariants   = VARIANT_KEYWORDS.filter(kw => promoNameLower.includes(kw));
          const variantsMissing = promoVariants.filter(kw => !eposNameLower.includes(kw));

          // If any variant keyword from the promo is absent from the AI's EPOS match → reject it
          const variantCheckPassed = variantsMissing.length === 0;

          if (brandsRelated && variantCheckPassed) {
            epos = findEposMatch(prod.product_name, eposName, velMap);
          }
          // If variant check failed, epos stays null → falls through to Strategy A fallback
          // which also enforces variants, so it will correctly return no match
        }

        // JS Fallback: Strategy A only — brand + PM code + variant (strict, no fuzzy)
        // Strategies B (sell price) and C (keyword) removed — they cause false matches
        if (!epos) {
          const promoRrp = (prod.rrp || "").replace(/[^0-9.]/g, "");
          const pmCode   = promoRrp.replace(".", ""); // "6.59" → "659"
          const brand    = (prod.product_name || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/)[0];
          // Extract required variants from promo name — same logic as findEposMatch
          const promoLower      = (prod.product_name || "").toLowerCase();
          const fallbackVariants = VARIANT_KEYWORDS.filter(kw => promoLower.includes(kw));

          if (brand && pmCode && pmCode.length >= 2) {
            for (const v of Object.values(velMap)) {
              const ep = v.product.toLowerCase();
              if (!ep.startsWith(brand)) continue;
              if (!ep.includes(`pm${pmCode}`)) continue;
              // VARIANT CHECK: all required variants must be present in EPOS name
              if (fallbackVariants.length > 0 && !fallbackVariants.every(kw => ep.includes(kw))) continue;
              // VARIANT CHECK: if promo has no variants, reject EPOS names that do
              if (fallbackVariants.length === 0 && VARIANT_KEYWORDS.some(kw => ep.includes(kw))) continue;
              epos = v;
              break;
            }
          }
        }

        const rrpNum = parseFloat((prod.rrp || "").replace(/[^0-9.]/g, "")) || 0;
        return {
          ...prod, rrp_num: rrpNum,
          epos, eposMatch: epos ? epos.product : "No match",
          source: supplier,
        };
      });

      const res       = calculateDecisions(matchedProducts, budget);
      res.source      = supplier;
      res.promoDates  = extracted[0]?.deal_notes || "";
      res.budget      = parseInt(budget) || 750;
      res.keyInsight  = `${res.lines.buy} products to buy, ${res.lines.test} to test from ${supplier}. ${res.totalSpend > 0 ? `Total spend £${res.totalSpend} (${res.budgetPct}% of budget).` : ""}`;

      setResult(res);
      setView("results");
    } catch (e) {
      console.error("Scan:", e);
      setError(e.message || "Scan failed. Try a clearer photo.");
    }
    setScanning(false); setScanStep("");
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
    if (!confirm("Are you sure you want to delete this scan?")) return;
    await deletePromoScan(id);
    setHistory(p => p.filter(s => s.id !== id));
    setView("menu");
  };

  // ── MENU ────────────────────────────────────────────────────────
  if (view === "menu") return (
    <SectionCard title="Promotions" icon="🎯" accent="rgba(34,197,94,0.06)">
      {!ANTHROPIC_KEY ? <EmptyState msg="API key required in Vercel settings" /> : <>
        <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 16, lineHeight: 1.6 }}>Upload supplier leaflet photos. AI reads every product and matches to your EPOS. All calculations done locally — velocity, cover, POR, budget are always accurate.</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: C.textMuted }}>Scans this week: {scansThisWeek}</span>
        </div>
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
      <button onClick={() => { setView("menu"); setPhotos([]); setPreviews([]); setError(null); }} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", padding: "0 0 12px", fontWeight: 600 }}>← Back</button>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>Supplier Name</div>
      <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Booker 1-Day Special, Parfetts..." style={{ width: "100%", padding: "12px 14px", borderRadius: 10, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: "Inter, sans-serif", boxSizing: "border-box", marginBottom: 6 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {QUICK_SUPPLIERS.map(s => <button key={s} onClick={() => setSupplier(s)} style={{ padding: "6px 10px", borderRadius: 8, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", background: supplier === s ? C.accentLight : C.surface, color: supplier === s ? C.white : C.textMuted }}>{s}</button>)}
      </div>
      <label style={{ display: "block", padding: "24px 16px", borderRadius: 12, border: `2px dashed ${C.border}`, background: C.surface, textAlign: "center", cursor: "pointer", marginBottom: 12 }}>
        <input type="file" accept="image/*" multiple onChange={addPhotos} style={{ display: "none" }} />
        <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>Take photo or choose from library</div>
      </label>
      {previews.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {previews.map((p, i) => (
            <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
              <img src={p} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button onClick={() => rmPhoto(i)} style={{ position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: C.white, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
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
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>📊 {Object.keys(velMap).length} products in EPOS · {(allDays || []).length} days of data</div>
      {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: C.redDim, marginBottom: 12, fontSize: 12, color: C.redText }}>{error}</div>}
      <button onClick={scan} disabled={scanning || !photos.length || !supplier.trim()} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: photos.length && supplier.trim() ? C.green : C.surface, color: photos.length && supplier.trim() ? C.white : C.textMuted, fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: scanning ? 0.7 : 1 }}>
        {scanning ? `🔍 ${scanStep}` : photos.length && supplier.trim() ? `🎯 Scan ${photos.length} Photo${photos.length !== 1 ? "s" : ""}` : !supplier.trim() ? "Enter supplier name" : "Upload a photo"}
      </button>
    </SectionCard>
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
          <Mini label="ROI"    value={`${result.roi || 0}%`} color={C.greenText} />
          <Mini label="Lines"  value={`${b.length}B / ${t.length}T`} />
        </div>
        {result.source && <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 12 }}>{result.source}</div>}
        {result.keyInsight && (
          <div style={{ background: "linear-gradient(135deg, rgba(46,80,144,0.12), rgba(59,130,246,0.06))", borderRadius: 10, padding: 10, border: "1px solid rgba(46,80,144,0.2)", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Summary</div>
            <div style={{ fontSize: 11, color: C.textPrimary, lineHeight: 1.5 }}>{result.keyInsight}</div>
          </div>
        )}
        {b.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.greenText, textTransform: "uppercase", marginBottom: 8 }}>✅ Buy ({b.length})</div>{b.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {t.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.orangeText, textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>🔶 Test ({t.length})</div>{t.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {result.totalSpend > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textMuted, marginBottom: 4 }}><span>Budget</span><span>{result.budgetPct}%</span></div>
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
        <button onClick={save} disabled={saving} style={{ flex: 1, padding: 14, borderRadius: 12, border: "none", background: C.green, color: C.white, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{saving ? "Saving..." : "💾 Save"}</button>
        <button onClick={() => { setView("scan"); setResult(null); }} style={{ padding: "14px 20px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 13, cursor: "pointer" }}>↻ Rescan</button>
      </div>
    </>);
  }

  // ── HISTORY DETAIL ───────────────────────────────────────────────
  if (view === "detail" && selScan) {
    const b = selDecs.filter(d => (d.user_override || d.decision) === "BUY");
    const t = selDecs.filter(d => (d.user_override || d.decision) === "TEST");
    return (<>
      <SectionCard title={selScan.supplier} icon="🎯">
        <button onClick={() => setView("menu")} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", padding: "0 0 12px", fontWeight: 600 }}>← Back</button>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>{new Date(selScan.created_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" })}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <Mini label="Spent" value={fi(selScan.total_spend)} />
          <Mini label="ROI"   value={`${selScan.roi}%`} color={C.greenText} />
          <Mini label="Lines" value={`${selScan.buy_count}B/${selScan.test_count}T`} />
        </div>
        {selScan.key_insight && (
          <div style={{ background: "linear-gradient(135deg, rgba(46,80,144,0.12), rgba(59,130,246,0.06))", borderRadius: 10, padding: 10, border: "1px solid rgba(46,80,144,0.2)", marginBottom: 14, fontSize: 11, color: C.textPrimary, lineHeight: 1.5 }}>{selScan.key_insight}</div>
        )}
        {b.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.greenText, textTransform: "uppercase", marginBottom: 8 }}>✅ Buy ({b.length})</div>{b.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {t.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.orangeText, textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>🔶 Test ({t.length})</div>{t.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {selSkips.length > 0 && (
          <><div style={{ fontSize: 11, fontWeight: 700, color: C.redText, textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>🚫 Skipped ({selSkips.length})</div>
          {selSkips.map((s, i) => (
            <div key={i} style={{ padding: "6px 10px", marginBottom: 4, borderRadius: 8, background: C.redDim, fontSize: 11 }}>
              <span style={{ color: C.white }}>{s.product}</span> — <span style={{ color: C.textMuted }}>{s.reason}</span>
            </div>
          ))}</>
        )}
      </SectionCard>
      <div style={{ padding: "0 16px 20px" }}>
        <button onClick={() => delScan(selScan.id)} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid rgba(239,68,68,0.3)", background: C.redDim, color: C.redText, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🗑️ Delete Scan</button>
      </div>
    </>);
  }

  return <SectionCard title="Promotions" icon="🎯"><EmptyState msg="Loading..." /></SectionCard>;
}
