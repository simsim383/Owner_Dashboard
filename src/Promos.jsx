// ═══════════════════════════════════════════════════════════════════
// PROMOS v4 — JS calculates everything, AI reads images + matches only
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from "react";
import { C, SectionCard, Badge, EmptyState, fi, f } from "./components.jsx";
import { ANTHROPIC_KEY, AI_HDR } from "./config.js";
import { savePromoScan, loadPromoScans, loadPromoDecisions, loadPromoSkips, loadAllPriceHistory, updatePromoDecision, deletePromoScan, saveCorrection } from "./supabase.js";

const MAX_SCANS_PER_WEEK = 5;
const QUICK_SUPPLIERS = ["Booker 1DS", "Booker 2DS", "Booker 5DS", "Booker RTE", "Costco", "Parfetts", "United Wholesale"];

// ═══════════════════════════════════════════════════════════════════
// VELOCITY ENGINE — calculates blended weekly velocity from EPOS data
// ═══════════════════════════════════════════════════════════════════
function buildVelocityMap(allDays) {
  if (!allDays || !allDays.length) return {};
  // Sort days by date
  const sorted = [...allDays].sort((a, b) => (a.dates?.start || "").localeCompare(b.dates?.start || ""));
  const totalDays = sorted.length;

  // Last 7 days
  const last7 = sorted.slice(-Math.min(7, totalDays));
  // Last 28 days (monthly)
  const last28 = sorted.slice(-Math.min(28, totalDays));
  const monthWeeks = Math.max(1, last28.length / 7);

  // Aggregate by product for each period
  const agg = (days) => {
    const map = {};
    days.forEach(d => d.items.forEach(i => {
      const key = (i.barcode || i.product).toLowerCase();
      if (!map[key]) map[key] = { product: i.product, barcode: i.barcode, category: i.category, qty: 0, gross: 0, grossMargin: i.grossMargin, hasCost: i.hasCost };
      map[key].qty += i.qty;
      map[key].gross += i.gross;
      if (i.grossMargin != null) map[key].grossMargin = i.grossMargin;
    }));
    return map;
  };

  const weekMap = agg(last7);
  const monthMap = agg(last28);

  // Build blended velocity map
  const result = {};
  const allKeys = new Set([...Object.keys(weekMap), ...Object.keys(monthMap)]);

  allKeys.forEach(key => {
    const w = weekMap[key];
    const m = monthMap[key];
    const product = (w || m).product;
    const weeklyVel = w ? w.qty : 0; // Actual units sold in last 7 days
    const monthlyAvg = m ? Math.round((m.qty / monthWeeks) * 10) / 10 : 0; // Monthly weekly average
    // Blended: 70% recent (last 7 days), 30% monthly average
    const blended = Math.round(((0.7 * weeklyVel) + (0.3 * monthlyAvg)) * 10) / 10;
    const sellPrice = (m || w).qty > 0 ? Math.round(((m || w).gross / (m || w).qty) * 100) / 100 : 0;

    result[key] = {
      product, barcode: (w || m).barcode, category: (w || m).category,
      weeklyVel, monthlyAvg, blended,
      sellPrice, grossMargin: (w || m).grossMargin, hasCost: (w || m).hasCost,
    };
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// MATCHING ENGINE — finds EPOS match, strict brand validation
// ═══════════════════════════════════════════════════════════════════
function findEposMatch(leafletProduct, eposMatch, velMap) {
  if (!eposMatch || eposMatch === "null" || eposMatch === "No match") return null;
  const search = eposMatch.toLowerCase().trim();
  
  // Direct key match
  if (velMap[search]) return velMap[search];
  
  // Exact product name match
  for (const v of Object.values(velMap)) {
    if (v.product.toLowerCase() === search) return v;
  }
  
  // Close match — but validate the BRAND matches
  // Extract first word (brand) from both the leaflet product and the EPOS match
  const leafletBrand = (leafletProduct || "").toLowerCase().split(/[\s\/]+/)[0];
  const matchBrand = search.split(/[\s\/]+/)[0];
  
  for (const v of Object.values(velMap)) {
    const eposBrand = v.product.toLowerCase().split(/[\s\/]+/)[0];
    const eposName = v.product.toLowerCase();
    
    // Product name contains the search term — but brands must agree
    if (eposName.includes(search) && eposBrand === matchBrand) return v;
    if (search.includes(eposName) && eposName.length > 5 && eposBrand === matchBrand) return v;
  }
  
  // Last resort: search contains significant part of EPOS name, brands match
  for (const v of Object.values(velMap)) {
    const eposWords = v.product.toLowerCase().split(/\s+/);
    const searchWords = search.split(/\s+/);
    // At least 2 words must match and first word (brand) must match
    const commonWords = eposWords.filter(w => searchWords.some(sw => sw.includes(w) || w.includes(sw)));
    if (commonWords.length >= 2 && eposWords[0] === searchWords[0]) return v;
  }
  
  return null; // No confident match — better to return null than wrong product
}

// ═══════════════════════════════════════════════════════════════════
// DECISION ENGINE — calculates POR, cover, qty, decision
// ═══════════════════════════════════════════════════════════════════
function calculateDecisions(matchedProducts, budget) {
  const decisions = [];
  const skips = [];
  let totalSpend = 0;

  // First pass — calculate everything
  matchedProducts.forEach(item => {
    const { product_name, case_price, rrp_num, units_per_case, epos, eposMatch } = item;
    const vel = epos ? epos.blended : 0;
    const cp = Number(case_price) || 0;
    const upc = Number(units_per_case) || 1;
    const rrp = Number(rrp_num) || 0;

    // POR calculation
    const costPerUnitExVat = cp / upc;
    const costPerUnitIncVat = costPerUnitExVat * 1.2;
    const por = rrp > 0 ? Math.round(((rrp - costPerUnitIncVat) / rrp) * 1000) / 10 : 0;

    // Decision logic
    if (vel < 0.5 && (!epos || epos.weeklyVel === 0)) {
      // Zero or near-zero velocity — TEST or SKIP
      if (cp > 0 && por >= 25) {
        // Interesting POR, test with 1 case
        const totalInc = Math.round(cp * 1 * 1.2 * 100) / 100;
        decisions.push({
          product: product_name, eposMatch: eposMatch || "No match", source: item.source || "",
          casePrice: cp, por, vel: Math.round(vel * 10) / 10, qty: 1,
          cover: "TEST", units: upc, totalInc, rrp: item.rrp || "",
          decision: "TEST", notes: `No/low EPOS velocity (${vel}/wk). Testing with 1 case. ${por}% POR.`,
        });
        totalSpend += totalInc;
      } else {
        skips.push({ product: product_name, reason: `Zero velocity in EPOS${por > 0 ? `, ${por}% POR` : ""}. No demand signal.` });
      }
      return;
    }

    // Calculate cover and qty
    let targetWeeks;
    if (vel >= 10) targetWeeks = 8; // Fast movers: aim for 8wk
    else if (vel >= 4) targetWeeks = 6; // Medium: 6wk
    else targetWeeks = 4; // Slow: 4wk

    let qty = Math.ceil((vel * targetWeeks) / upc);
    let coverWeeks = Math.round((qty * upc) / vel * 10) / 10;

    // Enforce 10wk cap
    while (coverWeeks > 10.5 && qty > 1) {
      qty--;
      coverWeeks = Math.round((qty * upc) / vel * 10) / 10;
    }
    // Minimum 1 case
    if (qty < 1) qty = 1;
    coverWeeks = Math.round((qty * upc) / vel * 10) / 10;

    const totalInc = Math.round(cp * qty * 1.2 * 100) / 100;
    const totalUnits = qty * upc;

    decisions.push({
      product: product_name, eposMatch: eposMatch || "", source: item.source || "",
      casePrice: cp, por, vel: Math.round(vel * 10) / 10, qty,
      cover: `~${Math.round(coverWeeks)}wk`, units: totalUnits, totalInc, rrp: item.rrp || "",
      decision: "BUY",
      notes: `EPOS: ${epos.product} at ${epos.weeklyVel}/wk (last 7d), ${epos.monthlyAvg}/wk (monthly avg), blended ${vel}/wk. ${qty} case${qty > 1 ? "s" : ""} = ${totalUnits} units = ~${Math.round(coverWeeks)}wk cover. ${por}% POR.`,
    });
    totalSpend += totalInc;
  });

  // Budget rebalance — if over budget, reduce slowest movers first
  const budgetNum = Number(budget) || 750;
  const buyItems = decisions.filter(d => d.decision === "BUY").sort((a, b) => a.vel - b.vel);
  while (totalSpend > budgetNum * 1.05 && buyItems.length > 0) {
    const slowest = buyItems[0];
    if (slowest.qty > 1) {
      slowest.qty--;
      const upc = slowest.units / (slowest.qty + 1);
      slowest.units = slowest.qty * upc;
      slowest.totalInc = Math.round(slowest.casePrice * slowest.qty * 1.2 * 100) / 100;
      slowest.cover = `~${Math.round(slowest.units / slowest.vel)}wk`;
      slowest.notes += " [Reduced for budget]";
      totalSpend = decisions.reduce((s, d) => s + (d.totalInc || 0), 0);
    } else {
      buyItems.shift(); // Can't reduce further, skip to next
    }
  }

  // If under budget by a lot, increase fastest movers
  const fastItems = decisions.filter(d => d.decision === "BUY").sort((a, b) => b.vel - a.vel);
  for (const fast of fastItems) {
    if (totalSpend >= budgetNum * 0.95) break;
    const upc = fast.units / fast.qty;
    const newCover = ((fast.qty + 1) * upc) / fast.vel;
    if (newCover <= 10) {
      fast.qty++;
      fast.units = fast.qty * upc;
      fast.totalInc = Math.round(fast.casePrice * fast.qty * 1.2 * 100) / 100;
      fast.cover = `~${Math.round(newCover)}wk`;
      fast.notes += " [Increased — budget available]";
      totalSpend = decisions.reduce((s, d) => s + (d.totalInc || 0), 0);
    }
  }

  // Calculate summary stats
  const estRevenue = decisions.reduce((s, d) => {
    const rrpNum = parseFloat((d.rrp || "").replace(/[^0-9.]/g, "")) || 0;
    return s + (rrpNum * (d.units || 0));
  }, 0);
  const estProfit = Math.round((estRevenue - totalSpend) * 100) / 100;
  const roi = totalSpend > 0 ? Math.round((estProfit / totalSpend) * 1000) / 10 : 0;

  return {
    decisions, skips,
    totalSpend: Math.round(totalSpend * 100) / 100,
    remaining: Math.round((budgetNum - totalSpend) * 100) / 100,
    budgetPct: Math.round((totalSpend / budgetNum) * 1000) / 10,
    estRevenue: Math.round(estRevenue * 100) / 100,
    estProfit, roi,
    lines: { buy: decisions.filter(d => d.decision === "BUY").length, test: decisions.filter(d => d.decision === "TEST").length, skip: skips.length },
  };
}

// ═══════════════════════════════════════════════════════════════════
// AI PROMPTS — image reading + product matching only
// ═══════════════════════════════════════════════════════════════════
function step1Prompt(supplier) {
  return `Read this wholesale promotion leaflet from ${supplier}. Extract EVERY product shown.

For each product return:
- product_name: Full name with brand, variant, size (e.g. "Pepsi Max Original/Cherry 12x500ml PM£1.39")
- case_format: e.g. "12x500ml", "6x4x568ml", "24x250ml", "6x2ltr"
- case_price: The WHOLESALE CASE PRICE (ex VAT). The big price labelled WSP. NOT the retail price.
- rrp: The retail/PM price per unit (e.g. "PM£1.39", "PM£7.99", "RRP£1.99")
- units_per_case: Sellable units. 6x4x568ml=6 packs. 12x500ml=12. 24x250ml=24. 6x2ltr=6. 6x70cl=6. 10x100g=10.
- deal_notes: Any special offers ("Buy 3 for £13", "Was £8.39")

CRITICAL:
- case_price is for ONE CASE not per unit. "WSP: £5.99" = £5.99 for the whole case.
- If a product name has "/" it means BOTH varieties in one case. "Hardy's Chardonnay/Merlot" = case contains both Chardonnay AND Merlot bottles. List it as ONE product with the full name including both.
- Read prices EXACTLY as printed. Do not calculate or infer.

RESPOND with ONLY a JSON array: [{"product_name":"","case_format":"","case_price":0,"rrp":"","units_per_case":0,"deal_notes":""}]`;
}

function step2Prompt(extractedProducts, eposNames) {
  return `Match each promotion product to the EXACT correct EPOS product name from the store's till system.

PROMOTION PRODUCTS TO MATCH:
${extractedProducts.map((p, i) => `${i + 1}. ${p.product_name} (${p.case_format}, PM/RRP: ${p.rrp})`).join("\n")}

EPOS PRODUCT NAMES (the ONLY valid matches — do not invent names):
${eposNames.join("\n")}

STRICT MATCHING RULES:
1. Match by BRAND + PM code + SIZE. "Pepsi Max 12x500ml PM£1.39" → find an EPOS name with "Pepsi" AND ("Pm139" or "Pet 500"). NOT "Pepsi Max Pm219" (wrong size).
2. "/" in promo names means BOTH variants: "Hardy's Chardonnay/Merlot" → search for "Hardys" + "Chardonnay" in EPOS. Return that match. Also note if Merlot exists separately.
3. BRAND MUST MATCH. "I Heart Prosecco" can ONLY match an EPOS name containing "Heart" or "Prosecco". It CANNOT match "Hardys" or "Chardonnay" — those are different products entirely.
4. "K Cider" can ONLY match an EPOS name containing "K Cider" or "Knights". It CANNOT match "Heineken" or "Fosters" or any other brand.
5. "Smirnoff" can ONLY match EPOS names containing "Smirnoff". Check PM code too — Pm1759 ≠ Pm2359.
6. If NO EPOS name matches the brand + format, return null. Do NOT pick the nearest unrelated product.
7. Return the EXACT EPOS name string from the list above, spelled exactly as shown.

CRITICAL: It is MUCH better to return null (no match) than to match to the wrong product. A wrong match causes the store to over-order products they don't sell.

RESPOND with ONLY a JSON array (same order as promotion products):
[{"promo_index":0,"epos_match":"exact EPOS name or null","match_notes":"why matched or why no match found"}]`;
}

// ═══════════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════
function PromoRow({ item, onEdit, priceHistory }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newDec, setNewDec] = useState(item.user_override || item.decision);
  const [notes, setNotes] = useState(item.user_notes || "");
  const dec = item.user_override || item.decision;
  const decBg = dec === "BUY" ? C.greenDim : dec === "TEST" ? C.orangeDim : C.redDim;
  const decBd = dec === "BUY" ? "rgba(34,197,94,0.2)" : dec === "TEST" ? "rgba(245,158,11,0.2)" : "rgba(239,68,68,0.2)";
  const cp = item.casePrice || item.case_price;
  const prev = priceHistory?.find(h => h.product?.toLowerCase() === item.product?.toLowerCase() && h.scan_id !== item.scan_id);
  const chg = prev && cp ? Math.round((Number(cp) - Number(prev.case_price)) * 100) / 100 : null;
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

const Mini = ({ label, value, color }) => (<div style={{ flex: "1 1 45%", background: C.surface, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.border}` }}><div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>{label}</div><div style={{ fontSize: 14, fontWeight: 800, color: color || C.white }}>{value}</div></div>);

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function LeafletScanner({ analysis, clientId, allDays }) {
  const [view, setView] = useState("menu");
  const [photos, setPhotos] = useState([]); const [previews, setPreviews] = useState([]);
  const [budget, setBudget] = useState("750"); const [supplier, setSupplier] = useState("");
  const [scanning, setScanning] = useState(false); const [scanStep, setScanStep] = useState("");
  const [result, setResult] = useState(null); const [error, setError] = useState(null);
  const [history, setHistory] = useState([]); const [priceHist, setPriceHist] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [selScan, setSelScan] = useState(null); const [selDecs, setSelDecs] = useState([]); const [selSkips, setSelSkips] = useState([]);
  const [saving, setSaving] = useState(false);

  // Pre-calculate velocity map from all uploaded data
  const velMap = useMemo(() => buildVelocityMap(allDays), [allDays]);
  const eposNames = useMemo(() => Object.values(velMap).map(v => v.product).sort(), [velMap]);

  useEffect(() => { if (!clientId) return; (async () => { try { const [s, p] = await Promise.all([loadPromoScans(clientId), loadAllPriceHistory(clientId)]); setHistory(s || []); setPriceHist(p || []); } catch (e) { console.error(e); } })(); }, [clientId]);

  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const scansThisWeek = history.filter(s => new Date(s.created_at) >= weekStart).length;
  const canScan = scansThisWeek < MAX_SCANS_PER_WEEK;

  const addPhotos = (e) => { const files = Array.from(e.target.files || []); setPhotos(p => [...p, ...files]); files.forEach(f => { const r = new FileReader(); r.onload = ev => setPreviews(p => [...p, ev.target.result]); r.readAsDataURL(f); }); };
  const rmPhoto = i => { setPhotos(p => p.filter((_, j) => j !== i)); setPreviews(p => p.filter((_, j) => j !== i)); };

  // ─── THREE-STEP SCAN ──────────────────────────────────────────
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
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 3000, messages: [{ role: "user", content: [...imgs, { type: "text", text: step1Prompt(supplier) }] }] }),
      });
      if (!s1.ok) throw new Error(`Step 1 failed: ${s1.status}`);
      let s1text = ((await s1.json()).content?.filter(b => b.type === "text").map(b => b.text).join("") || "").replace(/```json|```/g, "").trim();
      const j1s = s1text.indexOf("["); const j1e = s1text.lastIndexOf("]");
      if (j1s >= 0) s1text = s1text.slice(j1s, j1e + 1);
      const extracted = JSON.parse(s1text);
      if (!Array.isArray(extracted) || !extracted.length) throw new Error("No products found. Try a clearer photo.");

      // ── STEP 2: Match products to EPOS ──
      setScanStep(`Step 2/3: Matching ${extracted.length} products to EPOS...`);
      const s2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2000, messages: [{ role: "user", content: step2Prompt(extracted, eposNames) }] }),
      });
      if (!s2.ok) throw new Error(`Step 2 failed: ${s2.status}`);
      let s2text = ((await s2.json()).content?.filter(b => b.type === "text").map(b => b.text).join("") || "").replace(/```json|```/g, "").trim();
      const j2s = s2text.indexOf("["); const j2e = s2text.lastIndexOf("]");
      if (j2s >= 0) s2text = s2text.slice(j2s, j2e + 1);
      const matches = JSON.parse(s2text);

      // ── STEP 3: JavaScript calculates everything ──
      setScanStep("Step 3/3: Calculating decisions...");
      const matchedProducts = extracted.map((prod, i) => {
        const match = matches.find(m => m.promo_index === i) || matches[i] || {};
        const eposName = match.epos_match;
        let epos = null;
        
        if (eposName && eposName !== "null") {
          // BRAND VALIDATION: extract first significant word from both names
          const promoBrand = (prod.product_name || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/)[0];
          const matchBrand = (eposName || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/)[0];
          
          // If brands are completely different, reject the match
          const brandsRelated = promoBrand === matchBrand || 
            eposName.toLowerCase().includes(promoBrand) || 
            (prod.product_name || "").toLowerCase().includes(matchBrand);
          
          if (brandsRelated) {
            epos = findEposMatch(prod.product_name, eposName, velMap);
          } else {
            console.warn(`Brand mismatch rejected: "${prod.product_name}" → "${eposName}" (${promoBrand} ≠ ${matchBrand})`);
          }
        }
        
        const rrpNum = parseFloat((prod.rrp || "").replace(/[^0-9.]/g, "")) || 0;
        return {
          ...prod, rrp_num: rrpNum,
          epos, eposMatch: epos ? epos.product : "No match",
          source: supplier,
        };
      });

      const result = calculateDecisions(matchedProducts, budget);
      result.source = supplier;
      result.promoDates = extracted[0]?.deal_notes || "";
      result.budget = parseInt(budget) || 750;
      result.keyInsight = `${result.lines.buy} products to buy, ${result.lines.test} to test from ${supplier}. ${result.totalSpend > 0 ? `Total spend £${result.totalSpend} (${result.budgetPct}% of budget).` : ""}`;

      setResult(result);
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
      setHistory(s || []); setPriceHist(p || []); setView("menu"); setResult(null); setPhotos([]); setPreviews([]);
    } catch (e) { setError("Save failed: " + e.message); }
    setSaving(false);
  };

  const editDec = async (item, dec, notes) => {
    if (item.id) {
      await updatePromoDecision(item.id, { user_override: dec, user_notes: notes });
      if (notes) await saveCorrection(clientId, item.product, "override", `${dec}: ${notes}`);
      setSelDecs(p => p.map(d => d.id === item.id ? { ...d, user_override: dec, user_notes: notes } : d));
    } else {
      const i = result.decisions.findIndex(d => d.product === item.product);
      if (i >= 0) { result.decisions[i].user_override = dec; result.decisions[i].user_notes = notes; setResult({ ...result }); }
    }
  };

  const viewHist = async (s) => { setSelScan(s); const [d, k] = await Promise.all([loadPromoDecisions(s.id), loadPromoSkips(s.id)]); setSelDecs(d || []); setSelSkips(k || []); setView("detail"); };
  const delScan = async (id) => { if (!confirm("Are you sure you want to delete this scan?")) return; await deletePromoScan(id); setHistory(p => p.filter(s => s.id !== id)); setView("menu"); };

  // ── MENU ──
  if (view === "menu") return (
    <SectionCard title="Promotions" icon="🎯" accent="rgba(34,197,94,0.06)">
      {!ANTHROPIC_KEY ? <EmptyState msg="API key required in Vercel settings" /> : <>
        <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 16, lineHeight: 1.6 }}>Upload supplier leaflet photos. AI reads every product and matches to your EPOS. All calculations done locally — velocity, cover, POR, budget are always accurate.</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: C.textMuted }}>Scans this week: {scansThisWeek}/{MAX_SCANS_PER_WEEK}</span>
          {!canScan && <Badge type="LOW">LIMIT REACHED</Badge>}
        </div>
        <button onClick={() => canScan ? setView("scan") : null} disabled={!canScan} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: canScan ? C.green : C.surface, color: canScan ? C.white : C.textMuted, fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 16, opacity: canScan ? 1 : 0.5 }}>📷 Scan New Leaflet</button>
        {history.length > 0 && <>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Previous Scans</div>
          {history.map((s, i) => <div key={i} onClick={() => viewHist(s)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", marginBottom: 6, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer" }}><div><div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{s.supplier}</div><div style={{ fontSize: 10, color: C.textMuted }}>{new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {s.buy_count}B/{s.test_count}T · {fi(s.total_spend)}</div></div><span style={{ color: C.textMuted }}>›</span></div>)}
        </>}
      </>}
    </SectionCard>
  );

  // ── SCAN ──
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
      {previews.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>{previews.map((p, i) => <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}><img src={p} style={{ width: "100%", height: "100%", objectFit: "cover" }} /><button onClick={() => rmPhoto(i)} style={{ position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: C.white, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button></div>)}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>Budget:</span>
        <div style={{ display: "flex", alignItems: "center", flex: 1, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: "0 12px" }}><span style={{ color: C.textMuted }}>£</span><input type="tel" value={budget} onChange={e => setBudget(e.target.value.replace(/\D/g, ""))} style={{ flex: 1, padding: "10px 8px", background: "transparent", border: "none", color: C.white, fontSize: 14, fontWeight: 700, outline: "none" }} /></div>
      </div>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>📊 {Object.keys(velMap).length} products in EPOS · {(allDays || []).length} days of data</div>
      {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: C.redDim, marginBottom: 12, fontSize: 12, color: C.redText }}>{error}</div>}
      <button onClick={scan} disabled={scanning || !photos.length || !supplier.trim()} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: photos.length && supplier.trim() ? C.green : C.surface, color: photos.length && supplier.trim() ? C.white : C.textMuted, fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: scanning ? 0.7 : 1 }}>
        {scanning ? `🔍 ${scanStep}` : photos.length && supplier.trim() ? `🎯 Scan ${photos.length} Photo${photos.length !== 1 ? "s" : ""}` : !supplier.trim() ? "Enter supplier name" : "Upload a photo"}
      </button>
    </SectionCard>
  );

  // ── RESULTS ──
  if (view === "results" && result) {
    const b = (result.decisions || []).filter(d => (d.user_override || d.decision) === "BUY");
    const t = (result.decisions || []).filter(d => (d.user_override || d.decision) === "TEST");
    const sk = result.skips || [];
    return (<>
      <SectionCard title="Promotion Forensic" icon="🎯" accent="rgba(34,197,94,0.06)">
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}><Mini label="Budget" value={fi(result.budget || budget)} /><Mini label="Spent" value={fi(result.totalSpend || 0)} color={C.white} /><Mini label="ROI" value={`${result.roi || 0}%`} color={C.greenText} /><Mini label="Lines" value={`${b.length}B / ${t.length}T`} /></div>
        {result.source && <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 12 }}>{result.source}</div>}
        {result.keyInsight && <div style={{ background: "linear-gradient(135deg, rgba(46,80,144,0.12), rgba(59,130,246,0.06))", borderRadius: 10, padding: 10, border: "1px solid rgba(46,80,144,0.2)", marginBottom: 14 }}><div style={{ fontSize: 10, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Summary</div><div style={{ fontSize: 11, color: C.textPrimary, lineHeight: 1.5 }}>{result.keyInsight}</div></div>}
        {b.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.greenText, textTransform: "uppercase", marginBottom: 8 }}>✅ Buy ({b.length})</div>{b.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {t.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.orangeText, textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>🔶 Test ({t.length})</div>{t.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {result.totalSpend > 0 && <div style={{ marginTop: 14 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textMuted, marginBottom: 4 }}><span>Budget</span><span>{result.budgetPct}%</span></div><div style={{ height: 6, background: C.surface, borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, result.budgetPct)}%`, background: C.green, borderRadius: 3 }} /></div><div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>{f(result.remaining)} remaining</div></div>}
      </SectionCard>
      {sk.length > 0 && <SectionCard title="Skipped" icon="🚫">{sk.map((s, i) => <div key={i} style={{ padding: "8px 10px", marginBottom: 4, borderRadius: 8, background: C.redDim }}><div style={{ fontSize: 11, color: C.white }}>{s.product}</div><div style={{ fontSize: 10, color: C.textMuted }}>{s.reason}</div></div>)}</SectionCard>}
      <div style={{ padding: "0 16px 20px", display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} style={{ flex: 1, padding: 14, borderRadius: 12, border: "none", background: C.green, color: C.white, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{saving ? "Saving..." : "💾 Save"}</button>
        <button onClick={() => { setView("scan"); setResult(null); }} style={{ padding: "14px 20px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 13, cursor: "pointer" }}>↻ Rescan</button>
      </div>
    </>);
  }

  // ── HISTORY DETAIL ──
  if (view === "detail" && selScan) {
    const b = selDecs.filter(d => (d.user_override || d.decision) === "BUY");
    const t = selDecs.filter(d => (d.user_override || d.decision) === "TEST");
    return (<>
      <SectionCard title={selScan.supplier} icon="🎯">
        <button onClick={() => setView("menu")} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", padding: "0 0 12px", fontWeight: 600 }}>← Back</button>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>{new Date(selScan.created_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" })}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}><Mini label="Spent" value={fi(selScan.total_spend)} /><Mini label="ROI" value={`${selScan.roi}%`} color={C.greenText} /><Mini label="Lines" value={`${selScan.buy_count}B/${selScan.test_count}T`} /></div>
        {selScan.key_insight && <div style={{ background: "linear-gradient(135deg, rgba(46,80,144,0.12), rgba(59,130,246,0.06))", borderRadius: 10, padding: 10, border: "1px solid rgba(46,80,144,0.2)", marginBottom: 14, fontSize: 11, color: C.textPrimary, lineHeight: 1.5 }}>{selScan.key_insight}</div>}
        {b.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.greenText, textTransform: "uppercase", marginBottom: 8 }}>✅ Buy ({b.length})</div>{b.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {t.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.orangeText, textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>🔶 Test ({t.length})</div>{t.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {selSkips.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.redText, textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>🚫 Skipped ({selSkips.length})</div>{selSkips.map((s, i) => <div key={i} style={{ padding: "6px 10px", marginBottom: 4, borderRadius: 8, background: C.redDim, fontSize: 11 }}><span style={{ color: C.white }}>{s.product}</span> — <span style={{ color: C.textMuted }}>{s.reason}</span></div>)}</>}
      </SectionCard>
      <div style={{ padding: "0 16px 20px" }}><button onClick={() => delScan(selScan.id)} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid rgba(239,68,68,0.3)", background: C.redDim, color: C.redText, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🗑️ Delete Scan</button></div>
    </>);
  }

  return <SectionCard title="Promotions" icon="🎯"><EmptyState msg="Loading..." /></SectionCard>;
}
