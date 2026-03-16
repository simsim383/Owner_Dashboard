// ═══════════════════════════════════════════════════════════════════
// PROMOS — Leaflet Scanner: Photo → AI Analysis → BUY/TEST/SKIP
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useCallback } from "react";
import { C, SectionCard, Badge, EmptyState, fi, f, pct } from "./components.jsx";
import { ANTHROPIC_KEY, AI_HDR, AI_MODEL } from "./config.js";

// ─── PROMO ROW (expandable) ─────────────────────────────────────
function PromoRow({ item }) {
  const [open, setOpen] = useState(false);
  const decColor = item.decision === "BUY" ? C.greenText : item.decision === "TEST" ? C.orangeText : C.redText;
  const decBg = item.decision === "BUY" ? C.greenDim : item.decision === "TEST" ? C.orangeDim : C.redDim;
  const decBorder = item.decision === "BUY" ? "rgba(34,197,94,0.2)" : item.decision === "TEST" ? "rgba(245,158,11,0.2)" : "rgba(239,68,68,0.2)";

  return (
    <div style={{ marginBottom: 6 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: open ? "10px 10px 0 0" : 10, background: open ? decBg : C.surface, border: `1px solid ${open ? decBorder : C.border}`, cursor: "pointer" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: C.white, fontWeight: 600 }}>{item.product}</div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
            {item.vel != null ? `${item.vel}/wk` : "—"} · {item.por != null ? `${item.por}% POR` : "—"} · {item.source || "—"}
          </div>
        </div>
        <Badge type={item.decision === "BUY" ? "HIGH" : item.decision === "TEST" ? "MED" : "LOW"}>{item.decision}</Badge>
      </div>
      {open && (
        <div style={{ padding: "12px 14px", background: decBg, borderRadius: "0 0 10px 10px", border: `1px solid ${decBorder}`, borderTop: "none" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {[
              ["Case £", item.casePrice ? `£${item.casePrice}` : "—"],
              ["Qty", item.qty ? `${item.qty} cases` : "—"],
              ["Cover", item.cover || "—"],
              ["Units", item.units ? `${item.units}` : "—"],
              ["Total", item.totalInc ? f(item.totalInc) : "—"],
              ["RRP", item.rrp || "—"],
            ].map(([lbl, val]) => val !== "—" ? (
              <div key={lbl} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "5px 9px" }}>
                <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>{lbl}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{val}</div>
              </div>
            ) : null)}
          </div>
          {item.notes && <div style={{ fontSize: 11, color: C.textPrimary, lineHeight: 1.65 }}>{item.notes}</div>}
        </div>
      )}
    </div>
  );
}

// ─── MINI STAT ──────────────────────────────────────────────────
const MiniStat = ({ label, value, color }) => (
  <div style={{ flex: "1 1 45%", background: C.surface, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.border}` }}>
    <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 800, color: color || C.white }}>{value}</div>
  </div>
);

// ─── BUILD THE AI PROMPT ────────────────────────────────────────
function buildPromoPrompt(analysis, budget) {
  // Build velocity data from EPOS
  const velData = (analysis?.items || [])
    .filter(i => i.qty >= 1)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 200)
    .map(i => {
      const price = i.qty > 0 ? (i.gross / i.qty).toFixed(2) : "?";
      const margin = i.grossMargin != null ? `${Math.round(i.grossMargin)}%` : "?";
      return `${i.product} | ${i.qty}/wk | £${price} | ${margin}`;
    }).join("\n");

  return `You are analysing promotion leaflet images for a Londis convenience store.

BUDGET: £${budget} inc VAT

EPOS VELOCITY DATA (product | vel/wk | sell price | margin):
${velData}

RULES:
1. READ every product from the leaflet images — product name, case price (ex VAT), case size, RRP/PM price
2. MATCH each product to EPOS data by PM code AND size. "Dr Pepper 12x500ml PM£1.40" matches "Dr Pepper Pm140" NOT "Dr Pepper Pm215"
3. CALCULATE for each:
   - Sellable units per case (6x4=6 packs, 24x330ml=24 cans, 12x500ml=12 bottles)
   - Cost per unit inc VAT = case price × 1.2 / units per case
   - POR = (RRP - cost per unit inc VAT) / RRP × 100
   - Cover weeks = qty × units per case / velocity per week
4. DECIDE:
   - BUY: velocity ≥2/wk + genuine promo saving. Cover: fast(10+/wk)=6-10wk, medium(4-9/wk)=4-8wk, slow(1-3/wk)=3-6wk. Max 10wk.
   - TEST: no/minimal EPOS history OR new product. Always qty=1 case.
   - SKIP: dead product (0 vel), dearer than normal, don't stock the format, 20cl spirit bottles.
5. BUDGET: Spend 97%+. All case prices on flyers are EX VAT — add 20% for totals.
6. Pack logic: 6x4x568ml = 6 sellable 4-packs. Velocity in EPOS is sellable units.

RESPOND WITH ONLY a JSON object (no markdown, no backticks):
{
  "source": "supplier name and deal type",
  "promoDates": "date range",
  "budget": ${budget},
  "totalSpend": number,
  "remaining": number,
  "budgetPct": number,
  "estRevenue": number,
  "estProfit": number,
  "roi": number,
  "lines": {"buy": number, "test": number, "skip": number},
  "keyInsight": "one key insight sentence",
  "decisions": [
    {
      "product": "full product name with size",
      "source": "supplier code",
      "casePrice": number (ex VAT),
      "por": number,
      "vel": number (blended /wk),
      "qty": number (cases),
      "cover": "~Xwk",
      "units": number (total sellable units),
      "totalInc": number (total inc VAT),
      "rrp": "PM£X.XX or RRP£X.XX",
      "decision": "BUY" or "TEST" or "SKIP",
      "notes": "reasoning"
    }
  ],
  "skips": [{"product": "name", "reason": "why skipped"}]
}`;
}

// ─── MAIN LEAFLET SCANNER SECTION ───────────────────────────────
export default function LeafletScanner({ analysis }) {
  const [photos, setPhotos] = useState([]);
  const [photoPreview, setPhotoPreview] = useState([]);
  const [budget, setBudget] = useState("2500");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]); // past scans

  const handlePhotos = (e) => {
    const files = Array.from(e.target.files || []);
    setPhotos(prev => [...prev, ...files]);
    // Generate previews
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotoPreview(prev => [...prev, { name: file.name, data: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (idx) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
    setPhotoPreview(prev => prev.filter((_, i) => i !== idx));
  };

  const scanLeaflet = async () => {
    if (!photos.length) { setError("Upload at least one leaflet photo"); return; }
    if (!ANTHROPIC_KEY) { setError("Add API key in Vercel to enable scanning"); return; }
    setScanning(true); setError(null); setResult(null);

    try {
      // Convert photos to base64
      const imageContents = await Promise.all(photos.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(",")[1];
            const mediaType = file.type || "image/jpeg";
            resolve({ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } });
          };
          reader.readAsDataURL(file);
        });
      }));

      const prompt = buildPromoPrompt(analysis, parseInt(budget) || 2500);

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: AI_HDR,
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", // Use Sonnet for image analysis (Haiku less reliable with images)
          max_tokens: 4000,
          messages: [{
            role: "user",
            content: [
              ...imageContents,
              { type: "text", text: prompt },
            ],
          }],
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API error: ${res.status}`);
      }

      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();

      try {
        const parsed = JSON.parse(clean);
        setResult(parsed);
        setHistory(prev => [{ date: new Date().toISOString(), ...parsed }, ...prev]);
      } catch {
        console.error("Parse fail:", clean.slice(0, 500));
        setError("Failed to parse results. Try with clearer photos.");
      }
    } catch (e) {
      console.error("Scan error:", e);
      setError(e.message || "Scan failed — check connection and API key");
    }
    setScanning(false);
  };

  const buys = result?.decisions?.filter(d => d.decision === "BUY") || [];
  const tests = result?.decisions?.filter(d => d.decision === "TEST") || [];
  const skips = result?.skips || [];

  // No result yet — show upload UI
  if (!result) {
    return (
      <SectionCard title="Leaflet Scanner" icon="📸" accent="rgba(34,197,94,0.06)">
        {!ANTHROPIC_KEY && <EmptyState msg="API key required. Add VITE_ANTHROPIC_KEY in Vercel settings." />}

        {ANTHROPIC_KEY && (
          <>
            <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 16, lineHeight: 1.6 }}>
              Upload photos of supplier leaflets (Booker, Parfetts, Costco etc). The AI reads every product, cross-references your sales data, and tells you what to buy.
            </div>

            {/* Photo upload area */}
            <label style={{ display: "block", padding: "24px 16px", borderRadius: 12, border: `2px dashed ${C.border}`, background: C.surface, textAlign: "center", cursor: "pointer", marginBottom: 12 }}>
              <input type="file" accept="image/*" multiple capture="environment" onChange={handlePhotos} style={{ display: "none" }} />
              <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>Tap to take photo or upload</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Multiple leaflet pages supported</div>
            </label>

            {/* Photo previews */}
            {photoPreview.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {photoPreview.map((p, i) => (
                  <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
                    <img src={p.data} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button onClick={() => removePhoto(i)} style={{ position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: C.white, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Budget input */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, minWidth: 50 }}>Budget:</div>
              <div style={{ display: "flex", alignItems: "center", flex: 1, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: "0 12px" }}>
                <span style={{ fontSize: 14, color: C.textMuted }}>£</span>
                <input type="tel" value={budget} onChange={e => setBudget(e.target.value.replace(/\D/g, ""))} style={{ flex: 1, padding: "10px 8px", background: "transparent", border: "none", color: C.white, fontSize: 14, fontWeight: 700, outline: "none" }} />
              </div>
            </div>

            {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: C.redDim, border: "1px solid rgba(239,68,68,0.2)", marginBottom: 12, fontSize: 12, color: C.redText }}>{error}</div>}

            {/* Scan button */}
            <button onClick={scanLeaflet} disabled={scanning || !photos.length} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: photos.length ? C.green : C.surface, color: photos.length ? C.white : C.textMuted, fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: scanning ? 0.7 : 1 }}>
              {scanning ? "🔍 Scanning leaflet..." : `🎯 Scan ${photos.length} Photo${photos.length !== 1 ? "s" : ""} — Analyse Deals`}
            </button>

            {scanning && (
              <div style={{ textAlign: "center", padding: 16, fontSize: 12, color: C.textMuted }}>
                Reading products, matching to your sales data, calculating POR and cover...
                <div style={{ marginTop: 8, fontSize: 11 }}>This may take 30-60 seconds with multiple photos.</div>
              </div>
            )}
          </>
        )}
      </SectionCard>
    );
  }

  // Results view
  return (
    <>
      <SectionCard title="Promotion Forensic" icon="🎯" accent="rgba(34,197,94,0.06)">
        {/* Budget summary */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <MiniStat label="Budget" value={fi(result.budget || budget)} />
          <MiniStat label="Spent" value={fi(result.totalSpend || 0)} color={C.white} />
          <MiniStat label="ROI" value={`${result.roi || 0}%`} color={C.greenText} />
          <MiniStat label="Lines" value={`${buys.length}B / ${tests.length}T`} />
        </div>

        {result.source && <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 12, lineHeight: 1.5 }}>{result.source}{result.promoDates ? ` — ${result.promoDates}` : ""}</div>}

        {/* Key insight */}
        {result.keyInsight && (
          <div style={{ background: "linear-gradient(135deg, rgba(46,80,144,0.12), rgba(59,130,246,0.06))", borderRadius: 10, padding: 10, border: "1px solid rgba(46,80,144,0.2)", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Key Insight</div>
            <div style={{ fontSize: 11, color: C.textPrimary, lineHeight: 1.5 }}>{result.keyInsight}</div>
          </div>
        )}

        {/* BUY decisions */}
        {buys.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.greenText, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>✅ Buy ({buys.length})</div>
            {buys.map((p, i) => <PromoRow key={i} item={p} />)}
          </>
        )}

        {/* TEST decisions */}
        {tests.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.orangeText, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 14, marginBottom: 8 }}>🔶 Test ({tests.length})</div>
            {tests.map((p, i) => <PromoRow key={i} item={p} />)}
          </>
        )}

        {/* Budget bar */}
        {result.totalSpend > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textMuted, marginBottom: 4 }}>
              <span>Budget used</span>
              <span>{result.budgetPct || Math.round((result.totalSpend / (parseInt(budget) || 2500)) * 100)}%</span>
            </div>
            <div style={{ height: 6, background: C.surface, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, result.budgetPct || 0)}%`, background: C.green, borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
              {f(result.remaining || 0)} remaining · Est. profit {fi(result.estProfit || 0)}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Skipped items */}
      {skips.length > 0 && (
        <SectionCard title="Skipped — Not a Deal" icon="🚫">
          {skips.map((s, i) => (
            <div key={i} style={{ padding: "8px 10px", marginBottom: 6, borderRadius: 8, background: C.redDim, border: "1px solid rgba(239,68,68,0.15)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: C.white, fontWeight: 600 }}>{s.product}</span>
                <Badge type="LOW">SKIP</Badge>
              </div>
              <div style={{ fontSize: 10, color: C.textMuted }}>{s.reason}</div>
            </div>
          ))}
        </SectionCard>
      )}

      {/* Scan again button */}
      <div style={{ padding: "0 16px 20px" }}>
        <button onClick={() => { setResult(null); setPhotos([]); setPhotoPreview([]); }} style={{ width: "100%", padding: "14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          📸 Scan Another Leaflet
        </button>
      </div>
    </>
  );
}
