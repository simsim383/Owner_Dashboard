// ═══════════════════════════════════════════════════════════════════
// PROMOS v3 — Two-step AI scan, weekly cap, PM+size matching
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C, SectionCard, Badge, EmptyState, fi, f } from "./components.jsx";
import { ANTHROPIC_KEY, AI_HDR } from "./config.js";
import { savePromoScan, loadPromoScans, loadPromoDecisions, loadPromoSkips, loadAllPriceHistory, updatePromoDecision, deletePromoScan, saveCorrection } from "./supabase.js";

const MAX_SCANS_PER_WEEK = 5;

// ─── PROMO ROW ──────────────────────────────────────────────────
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
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{item.vel != null ? `${item.vel}/wk` : "—"} · {item.por != null ? `${Math.round(Number(item.por))}% POR` : "—"} · {item.source || ""}</div>
          {item.eposMatch && <div style={{ fontSize: 10, color: C.accentLight, marginTop: 1 }}>EPOS: {item.eposMatch}</div>}
          {chg != null && chg !== 0 && <div style={{ fontSize: 10, marginTop: 2, color: chg < 0 ? C.greenText : C.redText, fontWeight: 600 }}>{chg < 0 ? `£${Math.abs(chg).toFixed(2)} CHEAPER` : `£${chg.toFixed(2)} DEARER`} vs last promo</div>}
        </div>
        <Badge type={dec === "BUY" ? "HIGH" : dec === "TEST" ? "MED" : "LOW"}>{dec}</Badge>
      </div>
      {open && (
        <div style={{ padding: "12px 14px", background: decBg, borderRadius: "0 0 10px 10px", border: `1px solid ${decBd}`, borderTop: "none" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {[["Case £", cp ? `£${Number(cp).toFixed(2)}` : null], ["Qty", item.qty], ["Cover", item.cover], ["Units", item.units], ["Total", item.totalInc || item.total_inc ? f(Number(item.totalInc || item.total_inc)) : null], ["RRP", item.rrp]].map(([l, v]) => v ? <div key={l} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "5px 9px" }}><div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{v}</div></div> : null)}
          </div>
          {item.notes && <div style={{ fontSize: 11, color: C.textPrimary, lineHeight: 1.65, marginBottom: 8 }}>{item.notes}</div>}
          {item.user_notes && <div style={{ fontSize: 11, color: C.orangeText, marginBottom: 8 }}>✏️ {item.user_notes}</div>}
          {!editing ? (
            <button onClick={e => { e.stopPropagation(); setEditing(true); }} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✏️ Edit</button>
          ) : (
            <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: 8, padding: 10, marginTop: 6 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {["BUY", "TEST", "SKIP"].map(d => <button key={d} onClick={() => setNewDec(d)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: newDec === d ? (d === "BUY" ? C.green : d === "TEST" ? "#F39C12" : C.red) : C.surface, color: newDec === d ? C.white : C.textMuted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{d}</button>)}
              </div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Why? e.g. wrong product matched, don't stock this size..." style={{ width: "100%", padding: 8, borderRadius: 8, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 11, minHeight: 50, outline: "none", resize: "vertical", fontFamily: "Inter, sans-serif", boxSizing: "border-box" }} />
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
const QUICK_SUPPLIERS = ["Booker 1DS", "Booker 2DS", "Booker 5DS", "Booker RTE", "Costco", "Parfetts", "United Wholesale"];

// ─── STEP 1 PROMPT: Read the leaflet image ──────────────────────
function step1Prompt(supplier) {
  return `You are reading a wholesale/convenience store promotion leaflet from ${supplier}.

EXTRACT every product shown on the leaflet. For EACH product, read:
1. product_name: The full name including brand, variant, size (e.g. "Pepsi Max Original/Cherry 12x500ml PM£1.39")
2. case_format: The case size as printed (e.g. "12x500ml", "6x4x568ml", "24x250ml", "6x2ltr")
3. case_price: The WHOLESALE CASE PRICE (ex VAT). This is the large price shown, often labelled WSP. NOT the retail/RRP price.
4. rrp: The retail/PM price per SELLABLE UNIT (e.g. "PM£1.39", "PM£2.19", "RRP£7.99")
5. por: The POR% if shown on the leaflet (otherwise null)
6. units_per_case: How many sellable units in one case:
   - 6x4x568ml = 6 packs (sell each 4-pack)
   - 6x4x440ml = 6 packs
   - 12x500ml = 12 bottles
   - 24x250ml = 24 cans
   - 24x330ml = 24 cans
   - 6x2ltr = 6 bottles
   - 6x70cl or 6x75cl = 6 bottles
   - 10x100g = 10 bars
7. any_deal_notes: e.g. "Buy 3 for £13", "Was £8.39 Save £2.40"

CRITICAL:
- case_price is for ONE CASE, not per unit. If it says "WSP: £5.99" that means £5.99 for the whole case.
- The PM/RRP price (e.g. PM£2.19) is what the shop SELLS each unit for — this is NOT the case price.
- Read EXACTLY what is on the leaflet. Do not infer or calculate case prices.
- If the leaflet shows "6x4x568ml £23.49" the case_price is 23.49 and units_per_case is 6.

RESPOND with ONLY a JSON array (no markdown, no backticks):
[{"product_name":"","case_format":"","case_price":0,"rrp":"","por":null,"units_per_case":0,"deal_notes":""}]`;
}

// ─── STEP 2 PROMPT: Match + decide ──────────────────────────────
function step2Prompt(extractedProducts, analysis, budget, supplier, priceHist, corrections) {
  // Build EPOS velocity data
  const epos = (analysis?.items || []).filter(i => i.qty >= 1).sort((a, b) => b.qty - a.qty).slice(0, 250)
    .map(i => `${i.product} | ${i.qty}/wk | £${i.qty > 0 ? (i.gross / i.qty).toFixed(2) : "?"} | ${i.grossMargin != null ? Math.round(i.grossMargin) + "%" : "?"}`).join("\n");

  let prevCtx = "";
  if (priceHist?.length) {
    const r = {}; priceHist.forEach(h => { if (!r[h.product]) r[h.product] = h; });
    prevCtx = `\nPREVIOUS PROMO PRICES (if this week is DEARER, SKIP):\n${Object.values(r).slice(0, 60).map(h => `${h.product}: £${h.case_price} from ${h.supplier}`).join("\n")}`;
  }

  let corrCtx = "";
  if (corrections?.length) {
    corrCtx = `\nUSER CORRECTIONS (learn from these):\n${corrections.slice(0, 20).map(c => `- "${c.product_pattern}": ${c.correction_value}`).join("\n")}`;
  }

  return `You are making BUY/TEST/SKIP decisions for a convenience store promotion.

SUPPLIER: ${supplier}
BUDGET: £${budget} inc VAT
${prevCtx}${corrCtx}

PRODUCTS EXTRACTED FROM LEAFLET:
${JSON.stringify(extractedProducts, null, 1)}

EPOS VELOCITY DATA (product name | velocity/wk | sell price | margin):
${epos}

PRODUCT MATCHING — CRITICAL RULES:
1. Match each leaflet product to EPOS data by BOTH the PM price code AND size.
2. "Pepsi Max 12x500ml PM£1.39" → search EPOS for a product containing "Pm139" or "Pet 500" → match "Pepsi Max Pet 500Ml" or similar. Do NOT match "Pepsi Max Pm219" (that's the 2L bottle).
3. "Pepsi Max 6x2Ltr PM£2.19" → match "Pepsi Max Pm219" (2L bottle).
4. "San Miguel 6x4x568ml PM£7.99" → match "San Miguel Pm799" (pint cans). NOT "San Miguel" without PM.
5. "Heineken 6x4x440ml PM£6.59" → match "Heineken Pm659". NOT Heineken pint (568ml — different product).
6. 568ml ≠ 440ml. These are DIFFERENT products with different EPOS lines. Never combine.
7. Different PM = different product (usually). PM£5.69 ≠ PM£5.25 for Fosters.
8. If NO EPOS match exists for this PM+size → velocity = 0 → TEST or SKIP.
9. Do NOT sum multiple variants to get velocity. Only use the exact matched line.

VELOCITY: Use the EXACT number from the EPOS data above. Do not estimate or round creatively.

POR CALCULATION:
1. Cost per unit ex VAT = case_price / units_per_case
2. Cost per unit inc VAT = cost ex VAT × 1.2
3. POR = (RRP - cost inc VAT) / RRP × 100

COVER: cases needed = CEIL(velocity × target_weeks / units_per_case)
- Fast (10+/wk): 6-10wk cover, min 4wk
- Medium (4-9/wk): 4-8wk cover
- Slow (1-3/wk): 3-6wk cover
- Max 10 weeks absolute cap
- No history: TEST = 1 case

TOTAL: totalInc = case_price × qty × 1.2 (add VAT)

BUDGET: Spend 97%+ of £${budget}. Rebalance: if under-spent, increase fast movers first (within 10wk cap). If over-spent, reduce slowest items first.

SKIP RULES:
- Zero velocity + no EPOS match → SKIP (unless interesting TEST candidate)
- Dearer than previous promo price → SKIP
- 20cl spirit miniatures → SKIP (we only sell 70cl+)
- San Miguel 440ml → SKIP (we only sell 568ml pint cans)
- Dead products (0 yearly sales) → SKIP

RESPOND with ONLY JSON (no markdown, no backticks):
{"source":"${supplier}","promoDates":"","budget":${budget},"totalSpend":0,"remaining":0,"budgetPct":0,"estRevenue":0,"estProfit":0,"roi":0,"lines":{"buy":0,"test":0,"skip":0},"keyInsight":"","decisions":[{"product":"full name with size from leaflet","eposMatch":"exact EPOS product name matched","source":"${supplier}","casePrice":0,"por":0,"vel":0,"qty":0,"cover":"~Xwk","units":0,"totalInc":0,"rrp":"PM£X.XX","decision":"BUY","notes":"matching reasoning + why buy/test/skip"}],"skips":[{"product":"","reason":""}]}`;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────
export default function LeafletScanner({ analysis, clientId }) {
  const [view, setView] = useState("menu");
  const [photos, setPhotos] = useState([]); const [previews, setPreviews] = useState([]);
  const [budget, setBudget] = useState("750"); const [supplier, setSupplier] = useState("");
  const [scanning, setScanning] = useState(false); const [scanStep, setScanStep] = useState("");
  const [result, setResult] = useState(null); const [error, setError] = useState(null);
  const [history, setHistory] = useState([]); const [priceHist, setPriceHist] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [selScan, setSelScan] = useState(null); const [selDecs, setSelDecs] = useState([]); const [selSkips, setSelSkips] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!clientId) return; (async () => { try { const [s, p] = await Promise.all([loadPromoScans(clientId), loadAllPriceHistory(clientId)]); setHistory(s || []); setPriceHist(p || []); } catch (e) { console.error(e); } })(); }, [clientId]);

  // Weekly scan count
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const scansThisWeek = history.filter(s => new Date(s.created_at) >= weekStart).length;
  const canScan = scansThisWeek < MAX_SCANS_PER_WEEK;

  const addPhotos = (e) => { const files = Array.from(e.target.files || []); setPhotos(p => [...p, ...files]); files.forEach(f => { const r = new FileReader(); r.onload = ev => setPreviews(p => [...p, ev.target.result]); r.readAsDataURL(f); }); };
  const rmPhoto = i => { setPhotos(p => p.filter((_, j) => j !== i)); setPreviews(p => p.filter((_, j) => j !== i)); };

  // ─── TWO-STEP SCAN ────────────────────────────────────────────
  const scan = async () => {
    if (!photos.length || !ANTHROPIC_KEY || !supplier.trim()) return;
    if (!canScan) { setError(`Weekly limit reached (${MAX_SCANS_PER_WEEK} scans per week). Try again next week.`); return; }
    setScanning(true); setError(null); setResult(null);

    try {
      // Convert photos to base64
      const imgs = await Promise.all(photos.map(file => new Promise(res => {
        const r = new FileReader();
        r.onload = () => res({ type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: r.result.split(",")[1] } });
        r.readAsDataURL(file);
      })));

      // ── STEP 1: Read the leaflet ──
      setScanStep("Step 1/2: Reading leaflet...");
      const s1res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 3000, messages: [{ role: "user", content: [...imgs, { type: "text", text: step1Prompt(supplier) }] }] }),
      });
      if (!s1res.ok) throw new Error(`Step 1 API error: ${s1res.status}`);
      const s1data = await s1res.json();
      let s1text = (s1data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "").replace(/```json|```/g, "").trim();
      const s1js = s1text.indexOf("["); const s1je = s1text.lastIndexOf("]");
      if (s1js >= 0 && s1je > s1js) s1text = s1text.slice(s1js, s1je + 1);
      
      let extracted;
      try { extracted = JSON.parse(s1text); }
      catch { throw new Error("Could not read leaflet products. Try a clearer photo."); }
      
      if (!Array.isArray(extracted) || extracted.length === 0) throw new Error("No products found on leaflet. Try a clearer photo.");

      // ── STEP 2: Match + decide ──
      setScanStep(`Step 2/2: Matching ${extracted.length} products to your sales data...`);
      const s2prompt = step2Prompt(extracted, analysis, parseInt(budget) || 750, supplier, priceHist, corrections);
      const s2res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, messages: [{ role: "user", content: s2prompt }] }),
      });
      if (!s2res.ok) throw new Error(`Step 2 API error: ${s2res.status}`);
      const s2data = await s2res.json();
      let s2text = (s2data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "").replace(/```json|```/g, "").trim();
      const s2js = s2text.indexOf("{"); const s2je = s2text.lastIndexOf("}");
      if (s2js >= 0 && s2je > s2js) s2text = s2text.slice(s2js, s2je + 1);

      try {
        const parsed = JSON.parse(s2text);
        setResult(parsed);
        setView("results");
      } catch {
        // Retry step 2 with explicit JSON instruction
        try {
          const r2 = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST", headers: AI_HDR,
            body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, messages: [
              { role: "user", content: s2prompt },
              { role: "assistant", content: s2text },
              { role: "user", content: "Invalid JSON. Respond with ONLY a JSON object starting with { and ending with }." },
            ] }),
          });
          const r2d = await r2.json();
          let r2t = (r2d.content?.filter(b => b.type === "text").map(b => b.text).join("") || "").replace(/```json|```/g, "").trim();
          const r2s = r2t.indexOf("{"); const r2e = r2t.lastIndexOf("}");
          if (r2s >= 0) r2t = r2t.slice(r2s, r2e + 1);
          setResult(JSON.parse(r2t)); setView("results");
        } catch { setError("Could not generate decisions. Try with fewer photos."); }
      }
    } catch (e) { console.error("Scan:", e); setError(e.message || "Scan failed"); }
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
        <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 16, lineHeight: 1.6 }}>Upload supplier leaflet photos. AI reads every product, matches to your EPOS by PM code + size, and recommends BUY/TEST/SKIP.</div>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: C.textMuted }}>Scans this week: {scansThisWeek}/{MAX_SCANS_PER_WEEK}</span>
          {!canScan && <Badge type="LOW">LIMIT REACHED</Badge>}
        </div>

        <button onClick={() => canScan ? setView("scan") : setError("Weekly scan limit reached")} disabled={!canScan} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: canScan ? C.green : C.surface, color: canScan ? C.white : C.textMuted, fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 16, opacity: canScan ? 1 : 0.5 }}>📷 Scan New Leaflet</button>

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
      <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Booker 1-Day Special, Parfetts Mega Mondays..." style={{ width: "100%", padding: "12px 14px", borderRadius: 10, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: "Inter, sans-serif", boxSizing: "border-box", marginBottom: 6 }} />
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

      {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: C.redDim, marginBottom: 12, fontSize: 12, color: C.redText }}>{error}</div>}

      <button onClick={scan} disabled={scanning || !photos.length || !supplier.trim()} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: photos.length && supplier.trim() ? C.green : C.surface, color: photos.length && supplier.trim() ? C.white : C.textMuted, fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: scanning ? 0.7 : 1 }}>
        {scanning ? "🔍 " + scanStep : photos.length && supplier.trim() ? `🎯 Scan ${photos.length} Photo${photos.length !== 1 ? "s" : ""}` : !supplier.trim() ? "Enter supplier name" : "Upload a photo"}
      </button>
      {scanning && <div style={{ textAlign: "center", padding: 12, fontSize: 12, color: C.textMuted }}>{scanStep}</div>}
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
        {result.source && <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 12 }}>{result.source}{result.promoDates ? ` — ${result.promoDates}` : ""}</div>}
        {result.keyInsight && <div style={{ background: "linear-gradient(135deg, rgba(46,80,144,0.12), rgba(59,130,246,0.06))", borderRadius: 10, padding: 10, border: "1px solid rgba(46,80,144,0.2)", marginBottom: 14 }}><div style={{ fontSize: 10, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Key Insight</div><div style={{ fontSize: 11, color: C.textPrimary, lineHeight: 1.5 }}>{result.keyInsight}</div></div>}
        {b.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.greenText, textTransform: "uppercase", marginBottom: 8 }}>✅ Buy ({b.length})</div>{b.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {t.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: C.orangeText, textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>🔶 Test ({t.length})</div>{t.map((p, i) => <PromoRow key={i} item={p} onEdit={editDec} priceHistory={priceHist} />)}</>}
        {result.totalSpend > 0 && <div style={{ marginTop: 14 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textMuted, marginBottom: 4 }}><span>Budget</span><span>{result.budgetPct || Math.round((result.totalSpend / (parseInt(budget) || 750)) * 100)}%</span></div><div style={{ height: 6, background: C.surface, borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, result.budgetPct || 0)}%`, background: C.green, borderRadius: 3 }} /></div></div>}
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
