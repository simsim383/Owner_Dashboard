// ═══════════════════════════════════════════════════════════════════
// SEARCH — Product search with deduplication
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo } from "react";
import { C, fi } from "./components.jsx";

export default function Search({ analysis, onSelectProduct }) {
  const [query, setQuery] = useState("");

  // Items are already deduplicated by the analysis engine for week/month
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return analysis.items
      .filter(i => i.product.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || i.barcode.includes(q))
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 50);
  }, [query, analysis.items]);

  const cats = useMemo(() => {
    const m = {};
    analysis.items.forEach(i => {
      if (!m[i.category]) m[i.category] = { name: i.category, count: 0, revenue: 0 };
      m[i.category].count++;
      m[i.category].revenue += i.gross;
    });
    return Object.values(m).sort((a, b) => b.revenue - a.revenue);
  }, [analysis.items]);

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: C.textMuted, pointerEvents: "none" }}>🔍</div>
        <input
          type="text" value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search products, categories, barcodes..."
          style={{ width: "100%", padding: "14px 14px 14px 46px", borderRadius: 12, background: C.card, color: C.white, border: `1px solid ${C.border}`, fontSize: 15, fontWeight: 500, outline: "none", fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }}
        />
        {query && <button onClick={() => setQuery("")} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.textMuted, fontSize: 18, cursor: "pointer" }}>✕</button>}
      </div>

      {/* Browse by category when no query */}
      {!query.trim() && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 10 }}>Browse by Category</div>
          {cats.map((cat, i) => (
            <button key={i} onClick={() => setQuery(cat.name)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "12px 14px", marginBottom: 5, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, cursor: "pointer", textAlign: "left" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{cat.name}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{cat.count} products · {fi(cat.revenue)}</div>
              </div>
              <div style={{ fontSize: 14, color: C.textMuted }}>›</div>
            </button>
          ))}
        </div>
      )}

      {/* Search results */}
      {query.trim() && results.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>{results.length} result{results.length !== 1 ? "s" : ""}</div>
          {results.map((item, i) => (
            <div key={i} onClick={() => onSelectProduct && onSelectProduct(item)} style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", marginBottom: 4, borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, cursor: "pointer" }}>
              <div style={{ flex: 2 }}>
                <div style={{ fontSize: 13, color: C.white, fontWeight: 600 }}>{item.product}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{item.category}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, color: C.white, fontWeight: 600 }}>{fi(item.gross)}</div>
                <div style={{ fontSize: 11, color: item.hasCost ? C.greenText : C.textMuted }}>
                  ×{item.qty} · {item.hasCost ? `${(item.grossMargin || 0).toFixed(1)}%` : "no cost"}
                </div>
              </div>
              <div style={{ fontSize: 14, color: C.textMuted, marginLeft: 8, alignSelf: "center" }}>›</div>
            </div>
          ))}
        </div>
      )}

      {query.trim() && results.length === 0 && (
        <div style={{ textAlign: "center", padding: 32, color: C.textMuted, fontSize: 13 }}>No products found for "{query}"</div>
      )}
    </div>
  );
}
