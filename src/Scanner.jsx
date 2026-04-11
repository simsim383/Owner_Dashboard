// ═══════════════════════════════════════════════════════════════════
// SCANNER.JSX — Product Barcode Scanner
// Scan any product → instant EPOS intel + Open Food Facts fallback
// Requires: npm install html5-qrcode
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";

// ── Colour tokens (matches existing app) ────────────────────────────
const C = {
  bg: "#0a0f1a", surface: "#111827", border: "rgba(255,255,255,0.08)",
  divider: "rgba(255,255,255,0.05)", white: "#ffffff", textPrimary: "#f1f5f9",
  textSecondary: "#94a3b8", textMuted: "#64748b",
  green: "#22c55e", greenText: "#4ade80", greenDim: "rgba(34,197,94,0.08)",
  red: "#ef4444", redText: "#f87171", redDim: "rgba(239,68,68,0.08)",
  amber: "#f59e0b", amberText: "#fbbf24", amberDim: "rgba(245,158,11,0.08)",
  blue: "#3b82f6", blueText: "#60a5fa", blueDim: "rgba(59,130,246,0.08)",
};

const f   = v => `£${Number(v).toFixed(2)}`;
const pct = v => `${Math.round(v)}%`;

// ── Shared card wrapper ──────────────────────────────────────────────
function SectionCard({ title, icon, children }) {
  return (
    <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: 16, overflow: "hidden" }}>
      {title && (
        <div style={{ padding: "14px 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
          <span style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{title}</span>
        </div>
      )}
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, background: C.bg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${C.border}`, textAlign: "center", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: color || C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Badge({ text, color, bg }) {
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: bg || C.greenDim, color: color || C.greenText, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

// ── Open Food Facts lookup ───────────────────────────────────────────
async function fetchOpenFoodFacts(barcode) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await res.json();
    if (data.status === 1 && data.product) {
      const p = data.product;
      return {
        found: true,
        name: p.product_name_en || p.product_name || "Unknown Product",
        brand: p.brands || null,
        category: p.categories_tags?.[0]?.replace("en:", "") || p.categories || null,
        quantity: p.quantity || null,
        imageUrl: p.image_front_small_url || p.image_url || null,
        nutriScore: p.nutriscore_grade || null,
        ingredients: p.ingredients_text_en || p.ingredients_text || null,
      };
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}

// ── EPOS lookup — matches barcode against allDays ────────────────────
function lookupInEPOS(barcode, allDays) {
  if (!allDays || !allDays.length) return null;

  const matches = [];
  allDays.forEach(day => {
    const item = day.items?.find(i => String(i.barcode).trim() === String(barcode).trim());
    if (item) matches.push({ ...item, date: day.dates?.start });
  });

  if (!matches.length) return null;

  const totalQty    = matches.reduce((s, i) => s + (i.qty || 0), 0);
  const totalGross  = matches.reduce((s, i) => s + (i.gross || 0), 0);
  const totalNet    = matches.reduce((s, i) => s + (i.net || 0), 0);
  const totalProfit = matches.some(i => i.grossProfit != null)
    ? matches.reduce((s, i) => s + (i.grossProfit || 0), 0) : null;
  const hasCost     = matches.some(i => i.hasCost);
  const avgMargin   = hasCost && totalNet > 0 && totalProfit != null
    ? (totalProfit / totalNet) * 100 : null;

  const totalDays = allDays.length;
  const weeklyVel = totalDays > 0 ? Math.round((totalQty / totalDays) * 7 * 10) / 10 : 0;

  // Last 7 days vs previous 7 days
  const sorted  = [...allDays].sort((a, b) => (a.dates?.start || "").localeCompare(b.dates?.start || ""));
  const last7   = sorted.slice(-7);
  const prev7   = sorted.slice(-14, -7);

  const last7Qty = last7.reduce((s, day) => {
    const item = day.items?.find(i => String(i.barcode).trim() === String(barcode).trim());
    return s + (item?.qty || 0);
  }, 0);
  const prev7Qty = prev7.reduce((s, day) => {
    const item = day.items?.find(i => String(i.barcode).trim() === String(barcode).trim());
    return s + (item?.qty || 0);
  }, 0);

  const trendPct = prev7Qty > 0 ? Math.round(((last7Qty - prev7Qty) / prev7Qty) * 100) : null;

  // Best day of week
  const byDay = {};
  matches.forEach(m => {
    if (!m.date) return;
    const dow = new Date(m.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" });
    byDay[dow] = (byDay[dow] || 0) + m.qty;
  });
  const bestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Daily breakdown for mini chart (last 14 days)
  const dailyBreakdown = sorted.slice(-14).map(day => {
    const item = day.items?.find(i => String(i.barcode).trim() === String(barcode).trim());
    return {
      date: day.dates?.start,
      dayName: day.dates?.start
        ? new Date(day.dates.start + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" })
        : "?",
      qty: item?.qty || 0,
      profit: item?.grossProfit || null,
    };
  });

  const sample = matches[matches.length - 1];

  return {
    found: true,
    product: sample.product,
    category: sample.category,
    barcode,
    totalQty,
    totalGross,
    totalProfit,
    hasCost,
    avgMargin,
    weeklyVel,
    last7Qty,
    prev7Qty,
    trendPct,
    bestDay,
    dailyBreakdown,
    daysInData: totalDays,
    daysWithSales: matches.length,
  };
}

// ── Mini bar chart ───────────────────────────────────────────────────
function MiniBarChart({ data }) {
  const max = Math.max(...data.map(d => d.qty), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 52, marginTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{
            width: "100%", borderRadius: "3px 3px 0 0",
            height: `${Math.max((d.qty / max) * 40, d.qty > 0 ? 4 : 1)}px`,
            background: d.qty > 0 ? C.green : C.border,
            opacity: d.qty > 0 ? 1 : 0.3,
          }} />
          <span style={{ fontSize: 8, color: C.textMuted }}>{d.dayName}</span>
        </div>
      ))}
    </div>
  );
}

// ── EPOS result panel ────────────────────────────────────────────────
function EPOSResultPanel({ epos, offData }) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const trendColor  = epos.trendPct == null ? C.textMuted
    : epos.trendPct > 0 ? C.greenText : C.redText;
  const marginColor = epos.avgMargin == null ? C.textMuted
    : epos.avgMargin >= 25 ? C.greenText : epos.avgMargin >= 15 ? C.amberText : C.redText;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ flex: 1, paddingRight: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.white, lineHeight: 1.3, marginBottom: 4 }}>{epos.product}</div>
            <div style={{ fontSize: 12, color: C.textSecondary }}>{epos.category}</div>
          </div>
          <Badge text="In Your Store" color={C.greenText} bg={C.greenDim} />
        </div>

        {epos.trendPct != null && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: epos.trendPct > 0 ? C.greenDim : C.redDim, border: `1px solid ${epos.trendPct > 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
            <span style={{ fontSize: 12 }}>{epos.trendPct > 0 ? "📈" : "📉"}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: trendColor }}>
              {epos.trendPct > 0 ? "+" : ""}{epos.trendPct}% vs previous 7 days
            </span>
          </div>
        )}
      </div>

      {/* Stats row 1 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <StatBox label="Weekly Avg" value={`${epos.weeklyVel}`} sub="units/wk" color={C.white} />
        <StatBox label="Total Sold" value={epos.totalQty} sub={`${epos.daysWithSales}/${epos.daysInData} days`} color={C.white} />
        <StatBox label="Revenue" value={f(epos.totalGross)} sub="total" color={C.blueText} />
      </div>

      {/* Stats row 2 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <StatBox
          label="Profit"
          value={epos.hasCost && epos.totalProfit != null ? f(epos.totalProfit) : "—"}
          sub={epos.hasCost ? "total" : "no cost data"}
          color={epos.hasCost ? C.greenText : C.textMuted}
        />
        <StatBox
          label="Margin"
          value={epos.avgMargin != null ? pct(epos.avgMargin) : "—"}
          sub={epos.avgMargin >= 25 ? "strong" : epos.avgMargin >= 15 ? "ok" : epos.avgMargin != null ? "review" : "—"}
          color={marginColor}
        />
        <StatBox label="Best Day" value={epos.bestDay?.slice(0, 3) || "—"} sub={epos.bestDay || "—"} color={C.amberText} />
      </div>

      {/* No cost warning */}
      {!epos.hasCost && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: C.redDim, border: "1px solid rgba(239,68,68,0.2)", marginBottom: 12, fontSize: 12, color: C.redText, fontWeight: 600 }}>
          ⚠️ No cost entered in ShopMate — profit & margin not tracked.
        </div>
      )}

      {/* Last 7 vs prev 7 */}
      {epos.prev7Qty > 0 && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 }}>Last 7 Days vs Previous 7 Days</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.white }}>{epos.last7Qty}</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>this week</div>
            </div>
            <div style={{ fontSize: 18, color: C.textMuted }}>→</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.textSecondary }}>{epos.prev7Qty}</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>last week</div>
            </div>
            {epos.trendPct != null && (
              <div style={{ marginLeft: "auto" }}>
                <Badge
                  text={`${epos.trendPct > 0 ? "+" : ""}${epos.trendPct}%`}
                  color={trendColor}
                  bg={epos.trendPct > 0 ? C.greenDim : C.redDim}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Daily breakdown */}
      {epos.dailyBreakdown?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "12px 14px", borderRadius: showBreakdown ? "10px 10px 0 0" : 10, background: C.bg, border: `1px solid ${C.border}`, cursor: "pointer", color: C.white }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>Daily Sales ({epos.dailyBreakdown.length} days)</span>
            <span style={{ fontSize: 12, color: C.textMuted }}>{showBreakdown ? "▲" : "▼"}</span>
          </button>
          {showBreakdown && (
            <div style={{ padding: "12px 14px", borderRadius: "0 0 10px 10px", background: C.bg, border: `1px solid ${C.border}`, borderTop: "none" }}>
              <MiniBarChart data={epos.dailyBreakdown} />
              <div style={{ marginTop: 12 }}>
                {[...epos.dailyBreakdown].reverse().filter(d => d.qty > 0).slice(0, 7).map((d, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.divider}`, fontSize: 12 }}>
                    <span style={{ color: C.textMuted }}>{d.date}</span>
                    <span style={{ color: C.textSecondary }}>{d.dayName}</span>
                    <span style={{ color: C.white, fontWeight: 600 }}>{d.qty} units</span>
                    {d.profit != null && <span style={{ color: C.greenText }}>{f(d.profit)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Open Food Facts supplement */}
      {offData?.found && (offData.brand || offData.nutriScore || offData.quantity) && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: C.blueDim, border: "1px solid rgba(59,130,246,0.2)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.blueText, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Product Info</div>
          {offData.brand    && <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 4 }}>Brand: <span style={{ color: C.white, fontWeight: 600 }}>{offData.brand}</span></div>}
          {offData.quantity && <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 4 }}>Size: <span style={{ color: C.white }}>{offData.quantity}</span></div>}
          {offData.nutriScore && (
            <div style={{ fontSize: 12, color: C.textSecondary }}>
              Nutri-Score: <span style={{ fontWeight: 800, color: { a: C.greenText, b: "#a3e635", c: C.amberText, d: "#fb923c", e: C.redText }[offData.nutriScore] || C.textMuted }}>
                {offData.nutriScore.toUpperCase()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Not-in-store panel ───────────────────────────────────────────────
function OFFResultPanel({ offData, barcode }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ flex: 1, paddingRight: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.white, lineHeight: 1.3, marginBottom: 4 }}>{offData.name}</div>
          {offData.brand    && <div style={{ fontSize: 12, color: C.textSecondary }}>{offData.brand}</div>}
          {offData.category && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{offData.category}</div>}
        </div>
        {offData.imageUrl && (
          <img src={offData.imageUrl} alt="" style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 8, background: "#fff", padding: 4, flexShrink: 0 }} />
        )}
      </div>

      <div style={{ padding: "12px 14px", borderRadius: 10, background: C.amberDim, border: "1px solid rgba(245,158,11,0.2)", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.amberText, marginBottom: 4 }}>Not Currently Stocked</div>
        <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>
          This product isn't in your EPOS data. No sales history to compare against yet.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {offData.quantity   && <StatBox label="Pack Size" value={offData.quantity} />}
        {offData.nutriScore && (
          <StatBox
            label="Nutri-Score"
            value={offData.nutriScore.toUpperCase()}
            color={{ a: C.greenText, b: "#a3e635", c: C.amberText, d: "#fb923c", e: C.redText }[offData.nutriScore] || C.textMuted}
          />
        )}
        <StatBox label="Barcode" value={barcode} sub="EAN" />
      </div>

      {offData.ingredients && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 }}>Ingredients</div>
          <div style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.5 }}>
            {offData.ingredients.slice(0, 200)}{offData.ingredients.length > 200 ? "…" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scanner camera view ──────────────────────────────────────────────
function ScannerView({ onResult, onClose }) {
  const html5QrRef = useRef(null);
  const hasScanned  = useRef(false); // ref so the closure always sees the latest value
  const [error, setError] = useState(null);

  useEffect(() => {
    let qr;
    try {
      qr = new Html5Qrcode("qr-reader");
      html5QrRef.current = qr;
    } catch (e) {
      setError("Could not initialise scanner.");
      return;
    }

    const config = { fps: 10, qrbox: { width: 260, height: 130 }, aspectRatio: 1.0 };

    qr.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        // ref prevents duplicate fires from multiple frames
        if (hasScanned.current) return;
        hasScanned.current = true;
        try { qr.stop(); } catch (_) {}
        onResult(decodedText);
      },
      () => {} // ignore per-frame decode errors
    ).catch(() => {
      setError("Camera access denied. Please allow camera access and try again.");
    });

    return () => {
      try { if (qr) qr.stop(); } catch (_) {}
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 1000, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>Scan Barcode</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>Point camera at any product barcode</div>
        </div>
        <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 99, background: "rgba(255,255,255,0.1)", border: "none", color: C.white, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Cancel
        </button>
      </div>

      {/* Camera */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <div id="qr-reader" style={{ width: "100%", maxWidth: 500 }} />

        {/* Corner guides */}
        {[
          { top: "calc(50% - 65px)", left: "calc(50% - 130px)", borderTop: `3px solid ${C.green}`, borderLeft: `3px solid ${C.green}` },
          { top: "calc(50% - 65px)", right: "calc(50% - 130px)", borderTop: `3px solid ${C.green}`, borderRight: `3px solid ${C.green}` },
          { bottom: "calc(50% - 65px)", left: "calc(50% - 130px)", borderBottom: `3px solid ${C.green}`, borderLeft: `3px solid ${C.green}` },
          { bottom: "calc(50% - 65px)", right: "calc(50% - 130px)", borderBottom: `3px solid ${C.green}`, borderRight: `3px solid ${C.green}` },
        ].map((s, i) => (
          <div key={i} style={{ position: "absolute", width: 24, height: 24, pointerEvents: "none", ...s }} />
        ))}

        {error && (
          <div style={{ position: "absolute", bottom: 20, left: 20, right: 20, padding: "12px 16px", borderRadius: 12, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: C.redText, fontSize: 13, textAlign: "center" }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ padding: "16px 20px", background: "rgba(0,0,0,0.8)", textAlign: "center" }}>
        <div style={{ fontSize: 12, color: C.textMuted }}>Works with EAN-13, EAN-8, UPC barcodes on any product</div>
      </div>
    </div>
  );
}

// ── Manual entry ─────────────────────────────────────────────────────
function ManualEntry({ onSubmit }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        type="tel"
        value={val}
        onChange={e => setVal(e.target.value.replace(/\D/g, ""))}
        placeholder="Enter barcode manually…"
        maxLength={14}
        style={{ flex: 1, padding: "12px 14px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, color: C.white, fontSize: 14, outline: "none", fontFamily: "inherit" }}
      />
      <button
        onClick={() => val.length >= 8 && onSubmit(val)}
        disabled={val.length < 8}
        style={{ padding: "12px 16px", borderRadius: 10, background: val.length >= 8 ? C.green : C.surface, border: "none", color: val.length >= 8 ? C.white : C.textMuted, fontSize: 13, fontWeight: 700, cursor: val.length >= 8 ? "pointer" : "default", whiteSpace: "nowrap" }}
      >
        Look up
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// Props: allDays — array of day objects from Supabase
// ════════════════════════════════════════════════════════════════════
export default function Scanner({ allDays }) {
  const [view, setView]         = useState("home");   // home | scanning | loading | result | notfound
  const [barcode, setBarcode]   = useState(null);
  const [eposData, setEposData] = useState(null);
  const [offData, setOffData]   = useState(null);
  const [history, setHistory]   = useState([]);

  const handleBarcode = useCallback(async (code) => {
    // Immediately switch to loading — this is the key fix
    setView("loading");
    setBarcode(code);
    setEposData(null);
    setOffData(null);

    const epos = lookupInEPOS(code, allDays);
    const off  = await fetchOpenFoodFacts(code);

    setEposData(epos);
    setOffData(off);

    const name = epos?.product || off?.name || code;
    setHistory(prev => [{ barcode: code, name, inStore: !!epos }, ...prev.filter(h => h.barcode !== code)].slice(0, 8));

    if (epos || off.found) setView("result");
    else setView("notfound");
  }, [allDays]);

  const reset = () => {
    setView("home");
    setBarcode(null);
    setEposData(null);
    setOffData(null);
  };

  // Render camera as a fixed overlay — completely separate from the view state machine
  if (view === "scanning") {
    return <ScannerView onResult={handleBarcode} onClose={() => setView("home")} />;
  }

  return (
    <div>
      {/* ── HOME ──────────────────────────────────────────────── */}
      {view === "home" && (
        <SectionCard title="Product Scanner" icon="📷">
          <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 20, lineHeight: 1.6 }}>
            Scan any product barcode to instantly see your store's sales data, profit, and performance — or get product details for items you don't yet stock.
          </div>

          <button
            onClick={() => setView("scanning")}
            style={{ width: "100%", padding: "20px 16px", borderRadius: 14, border: `2px solid ${C.green}`, background: C.greenDim, color: C.green, fontSize: 16, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 16 }}
          >
            <span style={{ fontSize: 28 }}>📷</span>
            Scan Product Barcode
          </button>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 }}>Or enter manually</div>
            <ManualEntry onSubmit={handleBarcode} />
          </div>

          {history.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Recent Scans</div>
              {history.map((h, i) => (
                <button key={i} onClick={() => handleBarcode(h.barcode)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "10px 14px", marginBottom: 6, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, cursor: "pointer", textAlign: "left" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{h.name}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>{h.barcode}</div>
                  </div>
                  <Badge text={h.inStore ? "In Store" : "Not Stocked"} color={h.inStore ? C.greenText : C.amberText} bg={h.inStore ? C.greenDim : C.amberDim} />
                </button>
              ))}
            </>
          )}
        </SectionCard>
      )}

      {/* ── LOADING ───────────────────────────────────────────── */}
      {view === "loading" && (
        <SectionCard>
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 6 }}>Looking up {barcode}…</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>Checking your EPOS data and product database</div>
          </div>
        </SectionCard>
      )}

      {/* ── RESULT ────────────────────────────────────────────── */}
      {view === "result" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <button onClick={reset} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", fontWeight: 600, padding: 0 }}>← Back</button>
            <button
              onClick={() => setView("scanning")}
              style={{ padding: "8px 16px", borderRadius: 99, background: C.greenDim, border: `1px solid rgba(34,197,94,0.3)`, color: C.greenText, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              📷 Scan Another
            </button>
          </div>

          <SectionCard>
            {eposData
              ? <EPOSResultPanel epos={eposData} offData={offData} />
              : offData?.found
                ? <OFFResultPanel offData={offData} barcode={barcode} />
                : null
            }
          </SectionCard>
        </>
      )}

      {/* ── NOT FOUND ─────────────────────────────────────────── */}
      {view === "notfound" && (
        <>
          <button onClick={reset} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", fontWeight: 600, padding: "0 0 12px", display: "block" }}>← Back</button>
          <SectionCard>
            <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🤷</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.white, marginBottom: 8 }}>Product Not Found</div>
              <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>
                Barcode <span style={{ color: C.white, fontWeight: 600 }}>{barcode}</span> wasn't found in your EPOS data or the Open Food Facts database.
              </div>
              <div style={{ padding: "12px 14px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, textAlign: "left", fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
                This may be a non-food item or a product not yet in the database. Try manual entry if the camera misread it.
              </div>
            </div>
          </SectionCard>
          <button
            onClick={() => setView("scanning")}
            style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: C.green, color: C.white, fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 8 }}
          >
            📷 Try Another Scan
          </button>
        </>
      )}
    </div>
  );
}
