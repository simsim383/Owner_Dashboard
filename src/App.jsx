// ═══════════════════════════════════════════════════════════════════
// APP — Main shell: header, nav, routing
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useCallback, useEffect } from "react";
import { C, Stat, ProductDetail, globalCSS, fi, pct } from "./components.jsx";
import { getOwnerIdFromURL, getOrCreateClient, pushToSupabase, loadFromSupabase } from "./supabase.js";
import { analyzeData } from "./analysis.js";
import Dashboard from "./Dashboard.jsx";
import { CategoriesSection, TrendingSection, ReviewSection, ErosionSection, TopSellersSection, HiddenProfitSection, OpsSection, ActionsSection, ShelfDensitySection, CompetitorPricingSection, ClearShelfSection } from "./Sections.jsx";
import Search from "./Search.jsx";
import { UploadScreen, ManageUploadsSection } from "./Upload.jsx";
import { AIChatSection, ComingUpSection, NewsSection } from "./AI.jsx";

const baseSections = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "cats", label: "Categories", icon: "📦" },
  { id: "trending", label: "Trending", icon: "📈" },
  { id: "review", label: "Review", icon: "⚠️" },
  { id: "topsellers", label: "Top Sellers", icon: "💰" },
  { id: "erosion", label: "Erosion", icon: "🚨" },
  { id: "missing", label: "Hidden Profit", icon: "🔍" },
  { id: "ops", label: "Operations", icon: "⚙️" },
  { id: "actions", label: "Actions", icon: "✅" },
];
const monthlySections = [
  { id: "density", label: "Shelf Density", icon: "🏪" },
  { id: "competitor", label: "Competitors", icon: "🏷️" },
  { id: "clearshelf", label: "Clear Shelf", icon: "🧹" },
];
const alwaysSections = [
  { id: "coming", label: "Coming Up", icon: "📅" },
  { id: "manage", label: "Uploads", icon: "📋" },
  { id: "ai", label: "AI", icon: "🤖" },
];

const sectionSubs = { dashboard: "KPIs & insights", cats: "Revenue, profit, top/bottom", trending: "40%+ vs previous", review: "Low margin items", topsellers: "Best profit contributors", erosion: "Margin alerts", missing: "No cost data items", ops: "Daily patterns & basket", actions: "Prioritised to-do list", density: "ELITE / OK / THIEF audit", competitor: "vs Tesco & Asda pricing", clearshelf: "Slow mover promotions", coming: "Events & prep", manage: "View & delete uploads", ai: "Ask about your data" };

const bottomNav = [
  { id: "home", icon: "🏠", label: "Home" },
  { id: "search", icon: "🔍", label: "Search" },
  { id: "grid", icon: "⊞", label: "Sections" },
  { id: "news", icon: "📰", label: "News" },
];

const timeRanges = [{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }];

export default function App() {
  const [allDays, setAllDays] = useState([]);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [activeTab, setActiveTab] = useState("home");
  const [timeRange, setTimeRange] = useState("day");
  const [clientId, setClientId] = useState(null);
  const [clientName, setClientName] = useState("");
  const [sbStatus, setSbStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // On mount: get owner from URL, load from Supabase
  useEffect(() => {
    (async () => {
      const ownerId = getOwnerIdFromURL();
      if (!ownerId) { setLoading(false); return; }
      try {
        const client = await getOrCreateClient(ownerId);
        if (!client) { setSbStatus("Client error"); setLoading(false); return; }
        setClientId(client.id); setClientName(client.name || ownerId);
        const days = await loadFromSupabase(client.id);
        if (days.length > 0) setAllDays(days);
        setSbStatus(days.length > 0 ? `${days.length} days loaded` : "Ready");
      } catch (e) { console.error("Init:", e); setSbStatus("Error: " + e.message); }
      setLoading(false);
    })();
  }, []);

  const addDay = useCallback(async (data, uploadType, transactions) => {
    if (clientId) {
      setSbStatus("Saving...");
      const result = await pushToSupabase(clientId, data, uploadType || "day", transactions);
      if (result.ok) {
        setSbStatus(`✓ ${result.daysInserted} day${result.daysInserted > 1 ? "s" : ""} saved`);
        const days = await loadFromSupabase(clientId); setAllDays(days);
      } else { setSbStatus(`✗ ${result.error}`); }
      setTimeout(() => setSbStatus(""), 4000);
    } else {
      setAllDays(prev => {
        if (prev.find(d => d.dates?.start === data.dates?.start)) return prev.map(d => d.dates?.start === data.dates?.start ? data : d);
        return [...prev, data].sort((a, b) => (a.dates?.start || "").localeCompare(b.dates?.start || ""));
      });
    }
    setActiveTab("home"); setActiveSection("dashboard");
  }, [clientId]);

  const refreshData = useCallback(async () => {
    if (clientId) { const days = await loadFromSupabase(clientId); setAllDays(days); }
  }, [clientId]);

  // Current range data
  const currentData = useMemo(() => {
    if (!allDays.length) return null;
    if (timeRange === "day") return allDays[allDays.length - 1];
    return { items: allDays.flatMap(d => d.items), dates: { start: allDays[0].dates?.start, end: allDays[allDays.length - 1].dates?.end } };
  }, [allDays, timeRange]);

  const rangeLabel = timeRange === "day" ? "Today" : timeRange === "week" ? "This Week" : "This Month";
  const isMultiDay = timeRange !== "day";
  const sectionList = [...baseSections, ...(isMultiDay ? monthlySections : []), ...alwaysSections];
  const sectionGrid = sectionList.map(s => ({ ...s, sub: sectionSubs[s.id] || "" }));
  const analysis = useMemo(() => currentData ? analyzeData(allDays, currentData, rangeLabel) : null, [currentData, allDays, rangeLabel]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Loading screen
  if (loading) return (
    <div style={{ background: C.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto", fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif", color: C.textPrimary, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 15, color: C.white, fontWeight: 600 }}>Loading...</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>Connecting to your business</div>
      </div>
      <style>{globalCSS}</style>
    </div>
  );

  // No data — upload screen
  if (!analysis) return (
    <div style={{ background: C.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto", fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif", color: C.textPrimary }}>
      {!clientId && (
        <div style={{ padding: "12px 20px", background: C.orangeDim, borderBottom: "1px solid rgba(245,158,11,0.2)" }}>
          <div style={{ fontSize: 12, color: C.orangeText, fontWeight: 600 }}>⚠️ No owner ID in URL — data won't save</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Add ?owner=YOUR_ID to the URL for persistence</div>
        </div>
      )}
      <UploadScreen onDataLoaded={addDay} uploads={allDays} />
      <style>{globalCSS}</style>
    </div>
  );

  const { summary } = analysis;
  const dateLabel = currentData.dates ? (timeRange === "day"
    ? new Date(currentData.dates.start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : `${allDays.length} days`) : "";

  const handleSelectProduct = (product) => setSelectedProduct(product);

  const renderSection = () => {
    switch (activeSection) {
      case "dashboard": return <Dashboard analysis={analysis} dates={currentData.dates} allDays={allDays} timeRange={rangeLabel} />;
      case "cats": return <CategoriesSection analysis={analysis} timeRange={rangeLabel} onSelectProduct={handleSelectProduct} />;
      case "trending": return <TrendingSection analysis={analysis} onSelectProduct={handleSelectProduct} />;
      case "review": return <ReviewSection analysis={analysis} onSelectProduct={handleSelectProduct} />;
      case "topsellers": return <TopSellersSection analysis={analysis} onSelectProduct={handleSelectProduct} />;
      case "erosion": return <ErosionSection analysis={analysis} onSelectProduct={handleSelectProduct} />;
      case "missing": return <HiddenProfitSection analysis={analysis} onSelectProduct={handleSelectProduct} />;
      case "ops": return <OpsSection analysis={analysis} allDays={allDays} />;
      case "actions": return <ActionsSection analysis={analysis} />;
      case "density": return <ShelfDensitySection analysis={analysis} />;
      case "competitor": return <CompetitorPricingSection analysis={analysis} />;
      case "clearshelf": return <ClearShelfSection analysis={analysis} />;
      case "coming": return <ComingUpSection />;
      case "manage": return <ManageUploadsSection clientId={clientId} onRefresh={refreshData} />;
      case "ai": return <AIChatSection analysis={analysis} allDays={allDays} />;
      default: return <Dashboard analysis={analysis} dates={currentData.dates} allDays={allDays} timeRange={rangeLabel} />;
    }
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto", fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif", color: C.textPrimary, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "fixed", top: -150, right: -100, width: 400, height: 400, background: "radial-gradient(circle, rgba(46,80,144,0.15) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* Header */}
      <div style={{ padding: "20px 20px 12px", position: "relative", zIndex: 1, background: "linear-gradient(180deg, rgba(46,80,144,0.08) 0%, transparent 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg, ${C.accentLight}, ${C.green})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900, color: C.white }}>S</div>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.white, letterSpacing: 0.5 }}>ShopMate Sales</span>
            </div>
            <div style={{ fontSize: 14, color: C.textSecondary }}>{greeting}{clientName ? `, ${clientName}` : ""}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{dateLabel} · {allDays.length} day{allDays.length !== 1 ? "s" : ""}{sbStatus ? ` · ${sbStatus}` : ""}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <div style={{ padding: "4px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: C.greenDim, color: C.greenText, border: "1px solid rgba(34,197,94,0.2)" }}>● LIVE</div>
            <button onClick={() => setActiveTab("upload")} style={{ padding: "5px 12px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>+ Upload</button>
          </div>
        </div>

        {/* Time toggle */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {timeRanges.map(tr => (
            <button key={tr.id} onClick={() => setTimeRange(tr.id)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: timeRange === tr.id ? C.accentLight : C.surface, color: timeRange === tr.id ? C.white : C.textMuted }}>
              {tr.label}
            </button>
          ))}
        </div>

        {/* Mini KPI bar */}
        <div style={{ display: "flex", gap: 8, padding: "14px 16px", borderRadius: 12, background: `linear-gradient(135deg, ${C.card}, rgba(46,80,144,0.1))`, border: `1px solid ${C.border}`, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
          <Stat label="Revenue" value={fi(summary.totalGross)} small />
          <div style={{ width: 1, background: C.border }} />
          <Stat label="Profit" value={fi(summary.trackedProfit)} small />
          <div style={{ width: 1, background: C.border }} />
          <Stat label="Margin" value={pct(summary.trackedMargin)} small />
        </div>
      </div>

      {/* Nav pills */}
      {activeTab === "home" && (
        <div style={{ display: "flex", gap: 6, padding: "12px 20px", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", position: "relative", zIndex: 1 }}>
          {sectionList.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={{ padding: "7px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", transition: "all 0.2s", background: activeSection === s.id ? C.accentLight : C.card, color: activeSection === s.id ? C.white : C.textMuted, boxShadow: activeSection === s.id ? "0 2px 12px rgba(59,111,212,0.3)" : "none" }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ padding: "8px 16px 100px", position: "relative", zIndex: 1 }}>
        {activeTab === "home" && renderSection()}
        {activeTab === "search" && <Search analysis={analysis} onSelectProduct={handleSelectProduct} />}
        {activeTab === "grid" && (
          <div style={{ padding: "8px 0" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.white, marginBottom: 16, paddingLeft: 4 }}>Sections</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {sectionGrid.map(s => (
                <button key={s.id} onClick={() => { setActiveSection(s.id); setActiveTab("home"); }} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 14px", textAlign: "left", cursor: "pointer" }}>
                  <span style={{ fontSize: 26, display: "block", marginBottom: 8 }}>{s.icon}</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.3 }}>{s.sub}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {activeTab === "news" && <NewsSection />}
        {activeTab === "upload" && <UploadScreen onDataLoaded={addDay} uploads={allDays} onCancel={() => { setActiveTab("home"); setActiveSection("dashboard"); }} />}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 10, background: `linear-gradient(180deg, transparent, ${C.bg} 20%)`, padding: "20px 16px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "12px 0", borderRadius: 20, background: C.card, border: `1px solid ${C.border}`, boxShadow: "0 -4px 24px rgba(0,0,0,0.4)" }}>
          {bottomNav.map(n => (
            <button key={n.id} onClick={() => { setActiveTab(n.id); if (n.id === "home") setActiveSection("dashboard"); }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: activeTab === n.id ? 1 : 0.5, transition: "opacity 0.2s" }}>
              <span style={{ fontSize: n.id === "grid" ? 24 : 22 }}>{n.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, color: activeTab === n.id ? C.accentLight : C.textMuted }}>{n.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Product Detail Overlay */}
      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          allDays={allDays}
          timeRange={rangeLabel}
        />
      )}

      <style>{globalCSS}</style>
    </div>
  );
}
