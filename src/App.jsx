// ═══════════════════════════════════════════════════════════════════
// APP — Main shell: header, nav, routing
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useCallback, useEffect } from "react";
import { C, Stat, SectionCard, EmptyState, ProductDetail, globalCSS, fi, pct } from "./components.jsx";
import { getSavedOwnerId, saveOwnerId, logout, getOrCreateClient, pushToSupabase, loadFromSupabase, verifyPin, setPin, checkInviteCode, claimOwnerId } from "./supabase.js";
import { analyzeData, getPrevWeekData } from "./analysis.js";
import Dashboard from "./Dashboard.jsx";
import { CategoriesSection, TrendingSection, ReviewSection, ErosionSection, TopSellersSection, HiddenProfitSection, OpsSection, ActionsSection, ShelfDensitySection, CompetitorPricingSection, ClearShelfSection } from "./Sections.jsx";
import Search from "./Search.jsx";
import { UploadScreen, ManageUploadsSection } from "./Upload.jsx";
import { AIChatSection, ComingUpSection, NewsSection } from "./AI.jsx";

// ─── SETTINGS SECTION ───────────────────────────────────────────
function SettingsSection({ clientId, clientName, onRefresh, onLogout, onViewDay, onViewMonth }) {
  const [activeSettings, setActiveSettings] = useState("menu"); // menu, uploads, pin
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [pinMsg, setPinMsg] = useState(null);
  const [savingPin, setSavingPin] = useState(false);

  const handleChangePin = async () => {
    if (currentPin.length !== 4) { setPinMsg("Enter your current 4-digit PIN"); return; }
    if (newPin.length !== 4) { setPinMsg("New PIN must be 4 digits"); return; }
    if (newPin !== confirmNewPin) { setPinMsg("New PINs don't match"); return; }
    setSavingPin(true); setPinMsg(null);
    const valid = await verifyPin(clientId, currentPin);
    if (!valid) { setPinMsg("Current PIN is incorrect"); setSavingPin(false); return; }
    await setPin(clientId, newPin);
    setPinMsg("✓ PIN updated successfully");
    setCurrentPin(""); setNewPin(""); setConfirmNewPin("");
    setSavingPin(false);
  };

  const pinInp = { width: "100%", padding: "14px", borderRadius: 12, background: C.surface, color: C.white, border: `1.5px solid ${C.border}`, fontSize: 22, fontWeight: 800, letterSpacing: 8, textAlign: "center", outline: "none", fontFamily: "'Inter', sans-serif", boxSizing: "border-box", marginBottom: 12 };

  if (activeSettings === "uploads") return (
    <div>
      <button onClick={() => setActiveSettings("menu")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0", marginBottom: 12, background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 13, fontWeight: 600 }}>← Back to Settings</button>
      <ManageUploadsSection clientId={clientId} onRefresh={onRefresh} onViewDay={onViewDay} onViewMonth={onViewMonth} />
    </div>
  );

  if (activeSettings === "pin") return (
    <SectionCard title="Change PIN" icon="🔐">
      <button onClick={() => setActiveSettings("menu")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0", marginBottom: 16, background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 13, fontWeight: 600 }}>← Back to Settings</button>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>CURRENT PIN</div>
      <input type="tel" inputMode="numeric" maxLength={4} style={pinInp} value={currentPin} onChange={e => { setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinMsg(null); }} placeholder="• • • •" />
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>NEW PIN</div>
      <input type="tel" inputMode="numeric" maxLength={4} style={pinInp} value={newPin} onChange={e => { setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinMsg(null); }} placeholder="• • • •" />
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>CONFIRM NEW PIN</div>
      <input type="tel" inputMode="numeric" maxLength={4} style={pinInp} value={confirmNewPin} onChange={e => { setConfirmNewPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinMsg(null); }} placeholder="• • • •" />
      {pinMsg && <div style={{ fontSize: 13, color: pinMsg.startsWith("✓") ? C.greenText : C.redText, marginBottom: 12 }}>{pinMsg}</div>}
      <button onClick={handleChangePin} disabled={savingPin} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: C.accentLight, color: C.white, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
        {savingPin ? "Saving..." : "Update PIN"}
      </button>
    </SectionCard>
  );

  return (
    <SectionCard title="Settings" icon="⚙️">
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>Logged in as <span style={{ color: C.white, fontWeight: 700 }}>{clientName || clientId}</span></div>
      {[
        { label: "📋 Manage Uploads", sub: "View, delete, browse history", action: () => setActiveSettings("uploads") },
        { label: "🔐 Change PIN", sub: "Update your 4-digit PIN", action: () => setActiveSettings("pin") },
      ].map((item, i) => (
        <div key={i} onClick={item.action} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", marginBottom: 8, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{item.label}</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{item.sub}</div>
          </div>
          <span style={{ color: C.textMuted, fontSize: 16 }}>›</span>
        </div>
      ))}
      {!confirmLogout ? (
        <button onClick={() => setConfirmLogout(true)} style={{ width: "100%", marginTop: 8, padding: "12px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: C.redDim, color: C.redText, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Log Out</button>
      ) : (
        <div style={{ padding: 16, borderRadius: 12, background: C.redDim, border: "1px solid rgba(239,68,68,0.2)", marginTop: 8 }}>
          <div style={{ fontSize: 13, color: C.white, marginBottom: 12 }}>Are you sure you want to log out?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmLogout(false)} style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button onClick={onLogout} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: C.red, color: C.white, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Log Out</button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

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
  { id: "settings", label: "Settings", icon: "⚙️" },
  { id: "ai", label: "AI", icon: "🤖" },
];

const sectionSubs = { dashboard: "KPIs & insights", cats: "Revenue, profit, top/bottom", trending: "40%+ vs previous", review: "Low margin items", topsellers: "Best profit contributors", erosion: "Margin alerts", missing: "No cost data items", ops: "Daily patterns & basket", actions: "Prioritised to-do list", density: "ELITE / OK / THIEF audit", competitor: "vs Tesco & Asda pricing", clearshelf: "Slow mover promotions", coming: "Events & prep", settings: "Uploads, PIN, logout", ai: "Ask about your data" };

const bottomNav = [
  { id: "home", icon: "🏠", label: "Home" },
  { id: "search", icon: "🔍", label: "Search" },
  { id: "grid", icon: "⊞", label: "Sections" },
  { id: "news", icon: "📰", label: "News" },
];

const timeRanges = [{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "year", label: "Year" }];

// ─── LANDING / LOGIN / SETUP ────────────────────────────────────
function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("landing"); // landing, login, setup-code, setup-id
  const [inviteCode, setInviteCode] = useState("");
  const [inviteMsg, setInviteMsg] = useState(null);
  const [checking, setChecking] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [pin, setLocalPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [idMsg, setIdMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  // Login state
  const [loginId, setLoginId] = useState(getSavedOwnerId() || "");
  const [loginPin, setLoginPin] = useState("");
  const [loginMsg, setLoginMsg] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const inp = { width: "100%", padding: "14px 16px", borderRadius: 12, background: C.surface, color: C.white, border: `1.5px solid ${C.border}`, fontSize: 16, outline: "none", fontFamily: "'Inter', sans-serif", boxSizing: "border-box", marginBottom: 12 };
  const pinInp = { ...inp, letterSpacing: 8, textAlign: "center", fontSize: 22, fontWeight: 800 };

  const handleInvite = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) { setInviteMsg("Enter your invite code"); return; }
    setChecking(true); setInviteMsg(null);
    try {
      const result = await checkInviteCode(code);
      if (result.valid) setMode("setup-id");
      else setInviteMsg(result.error || "Invalid code");
    } catch { setInviteMsg("Could not verify code"); }
    setChecking(false);
  };

  const handleCreate = async () => {
    const id = ownerId.trim().toLowerCase().replace(/\s+/g, "-");
    if (!id) { setIdMsg("Enter a business ID"); return; }
    if (pin.length !== 4) { setIdMsg("PIN must be 4 digits"); return; }
    if (pin !== pinConfirm) { setIdMsg("PINs don't match"); return; }
    setSaving(true); setIdMsg(null);
    try {
      await claimOwnerId(id, inviteCode.trim().toUpperCase());
      await setPin(id, pin);
      saveOwnerId(id);
      onAuthenticated(id, id);
    } catch (e) { setIdMsg(e.message || "Failed to create account"); }
    setSaving(false);
  };

  const handleLogin = async () => {
    const id = loginId.trim().toLowerCase();
    if (!id) { setLoginMsg("Enter your business ID"); return; }
    if (loginPin.length !== 4) { setLoginMsg("PIN must be 4 digits"); return; }
    setLoggingIn(true); setLoginMsg(null);
    try {
      const client = await getOrCreateClient(id);
      if (!client) { setLoginMsg("Business ID not found"); setLoggingIn(false); return; }
      const valid = await verifyPin(id, loginPin);
      if (!valid) { setLoginMsg("Incorrect PIN"); setLoggingIn(false); return; }
      saveOwnerId(id);
      onAuthenticated(id, client.owner_name || id);
    } catch (e) { setLoginMsg(e.message || "Login failed"); }
    setLoggingIn(false);
  };

  const btn = (onClick, label, disabled, variant = "primary") => (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: disabled ? C.surface : variant === "secondary" ? C.surface : C.accentLight, color: disabled ? C.textMuted : C.white, fontSize: 15, fontWeight: 700, cursor: disabled ? "default" : "pointer", marginBottom: 12, border: variant === "secondary" ? `1px solid ${C.border}` : "none" }}>
      {label}
    </button>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto", fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif", color: C.textPrimary, padding: "40px 24px" }}>
      {mode === "landing" && (
        <div>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ width: 70, height: 70, borderRadius: 18, background: `linear-gradient(135deg, ${C.accentLight}, ${C.green})`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 32, marginBottom: 16 }}>S</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: C.white, marginBottom: 8 }}>ShopMate Sales</div>
            <div style={{ fontSize: 14, color: C.textMuted }}>Your store intelligence dashboard</div>
          </div>
          {btn(() => setMode("login"), "Log In")}
          {btn(() => setMode("setup-code"), "Create Account", false, "secondary")}
        </div>
      )}

      {mode === "login" && (
        <div>
          <button onClick={() => setMode("landing")} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 24 }}>← Back</button>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 24 }}>Log In</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>BUSINESS ID</div>
          <input style={inp} value={loginId} onChange={e => { setLoginId(e.target.value); setLoginMsg(null); }} placeholder="e.g. londis-horden" autoFocus />
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>4-DIGIT PIN</div>
          <input type="tel" inputMode="numeric" maxLength={4} style={pinInp} value={loginPin} onChange={e => { setLoginPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setLoginMsg(null); }} onKeyDown={e => { if (e.key === "Enter" && loginPin.length === 4) handleLogin(); }} placeholder="• • • •" />
          {loginMsg && <div style={{ fontSize: 13, color: C.redText, marginBottom: 12 }}>{loginMsg}</div>}
          {btn(handleLogin, loggingIn ? "Logging in..." : "Log In →", loggingIn)}
        </div>
      )}

      {mode === "setup-code" && (
        <div>
          <button onClick={() => setMode("landing")} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 24 }}>← Back</button>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 8 }}>Enter Invite Code</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 24 }}>You need an invite code to create an account.</div>
          <input style={inp} value={inviteCode} onChange={e => { setInviteCode(e.target.value.toUpperCase()); setInviteMsg(null); }} placeholder="e.g. SHOP-2024" autoFocus />
          {inviteMsg && <div style={{ fontSize: 13, color: C.redText, marginBottom: 12 }}>{inviteMsg}</div>}
          {btn(handleInvite, checking ? "Checking..." : "Continue →", checking || !inviteCode.trim())}
        </div>
      )}

      {mode === "setup-id" && (
        <div>
          <button onClick={() => setMode("setup-code")} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 24 }}>← Back</button>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 8 }}>Create Account</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 24 }}>Choose a unique business ID and PIN.</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>BUSINESS ID</div>
          <input style={inp} value={ownerId} onChange={e => { setOwnerId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setIdMsg(null); }} placeholder="e.g. londis-horden" autoFocus />
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>4-DIGIT PIN</div>
          <input type="tel" inputMode="numeric" maxLength={4} style={pinInp} value={pin} onChange={e => { setLocalPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setIdMsg(null); }} placeholder="• • • •" />
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>CONFIRM PIN</div>
          <input type="tel" inputMode="numeric" maxLength={4} style={pinInp} value={pinConfirm} onChange={e => { setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4)); setIdMsg(null); }} onKeyDown={e => { if (e.key === "Enter" && pin.length === 4 && pinConfirm.length === 4) handleCreate(); }} placeholder="• • • •" />
          {idMsg && <div style={{ fontSize: 13, color: C.redText, marginBottom: 12 }}>{idMsg}</div>}
          {btn(handleCreate, saving ? "Creating..." : "Create Account →", saving || !ownerId.trim() || pin.length !== 4 || pinConfirm.length !== 4)}
          <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>Your business ID and PIN are your login. Remember them — you'll need your PIN each time you open the app.</div>
        </div>
      )}
      <style>{globalCSS}</style>
    </div>
  );
}

export default function App() {
  const [allDays, setAllDays] = useState([]);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [activeTab, setActiveTab] = useState("home");
  const [timeRange, setTimeRange] = useState("day");
  const [clientId, setClientId] = useState(null);
  const [clientName, setClientName] = useState("");
  const [sbStatus, setSbStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);

  // Called by AuthScreen when login/setup succeeds
  const handleAuthenticated = async (cId, cName) => {
    setClientId(cId); setClientName(cName); setAuthenticated(true);
    setLoading(true);
    try {
      const days = await loadFromSupabase(cId);
      if (days.length > 0) setAllDays(days);
      setSbStatus(days.length > 0 ? `${days.length} days loaded` : "Ready");
    } catch (e) { setSbStatus("Error: " + e.message); }
    setLoading(false);
  };

  const handleLogout = () => {
    logout();
    setAuthenticated(false); setClientId(null); setClientName("");
    setAllDays([]); setActiveSection("dashboard"); setActiveTab("home");
  };

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

  const [selectedMonth, setSelectedMonth] = useState(null); // null = auto (previous month)
  const [selectedYear, setSelectedYear] = useState(null);   // null = auto (current/most recent year)

  // viewOverride: when user clicks View Day or View Month from Manage Uploads
  // { type: "day", date: "2026-01-15" } or { type: "month", key: "2026-01" }
  const [viewOverride, setViewOverride] = useState(null);

  // Available months from data
  const availableMonths = useMemo(() => {
    const months = {};
    allDays.forEach(d => {
      if (!d.dates?.start) return;
      const m = d.dates.start.slice(0, 7);
      if (!months[m]) months[m] = { key: m, label: new Date(d.dates.start + "T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }), days: [] };
      months[m].days.push(d);
    });
    return Object.values(months).sort((a, b) => b.key.localeCompare(a.key));
  }, [allDays]);

  // Available years from data
  const availableYears = useMemo(() => {
    const years = {};
    allDays.forEach(d => {
      if (!d.dates?.start) return;
      const y = d.dates.start.slice(0, 4);
      if (!years[y]) years[y] = { key: y, label: y, days: [] };
      years[y].days.push(d);
    });
    return Object.values(years).sort((a, b) => b.key.localeCompare(a.key));
  }, [allDays]);

  // Previous complete month key
  const prevMonthKey = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  // Current year key (most recent year with data, or current calendar year)
  const currentYearKey = useMemo(() => {
    if (availableYears.length > 0) return availableYears[0].key;
    return String(new Date().getFullYear());
  }, [availableYears]);

  // Current range data — day/week/month/year logic (viewOverride takes priority)
  const currentDays = useMemo(() => {
    if (!allDays.length) return [];

    // viewOverride from Manage Uploads
    if (viewOverride) {
      if (viewOverride.type === "day") {
        const match = allDays.find(d => d.dates?.start === viewOverride.date);
        return match ? [match] : [];
      }
      if (viewOverride.type === "month") {
        return allDays.filter(d => d.dates?.start?.startsWith(viewOverride.key));
      }
    }

    if (timeRange === "day") return [allDays[allDays.length - 1]];
    if (timeRange === "week") return allDays.slice(-7);
    if (timeRange === "month") {
      const mKey = selectedMonth || prevMonthKey;
      const monthDays = allDays.filter(d => d.dates?.start?.startsWith(mKey));
      return monthDays.length > 0 ? monthDays : allDays;
    }
    if (timeRange === "year") {
      const yKey = selectedYear || currentYearKey;
      const yearDays = allDays.filter(d => d.dates?.start?.startsWith(yKey));
      return yearDays.length > 0 ? yearDays : allDays;
    }
    return allDays;
  }, [allDays, timeRange, selectedMonth, selectedYear, prevMonthKey, currentYearKey, viewOverride]);

  const currentData = useMemo(() => {
    if (!currentDays.length) return null;
    if ((timeRange === "day" && !viewOverride) || (viewOverride?.type === "day")) return currentDays[0];
    return { items: currentDays.flatMap(d => d.items), dates: { start: currentDays[0].dates?.start, end: currentDays[currentDays.length - 1].dates?.end } };
  }, [currentDays, timeRange, viewOverride]);

  // Effective time range label accounting for viewOverride
  const effectiveTimeRange = useMemo(() => {
    if (viewOverride?.type === "day") return "day";
    if (viewOverride?.type === "month") return "month";
    return timeRange;
  }, [timeRange, viewOverride]);

  // Previous period for WoW comparison
  const prevWeekDays = useMemo(() => {
    if (!allDays.length) return null;
    if (effectiveTimeRange === "day") {
      return allDays.length >= 2 ? [allDays[allDays.length - 2]] : null;
    }
    if (effectiveTimeRange === "month") {
      const currentMonthKey = currentDays[0]?.dates?.start?.slice(0, 7);
      if (!currentMonthKey) return null;
      const d = new Date(currentMonthKey + "-15");
      d.setMonth(d.getMonth() - 1);
      const prevKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const prevDays = allDays.filter(day => day.dates?.start?.startsWith(prevKey));
      return prevDays.length > 0 ? prevDays : null;
    }
    if (effectiveTimeRange === "year") {
      const currentYearStr = currentDays[0]?.dates?.start?.slice(0, 4);
      if (!currentYearStr) return null;
      const prevYearStr = String(parseInt(currentYearStr) - 1);
      const prevDays = allDays.filter(day => day.dates?.start?.startsWith(prevYearStr));
      return prevDays.length > 0 ? prevDays : null;
    }
    return getPrevWeekData(allDays, currentDays);
  }, [allDays, currentDays, effectiveTimeRange]);

  const rangeLabel = effectiveTimeRange === "day" ? "Today" : effectiveTimeRange === "week" ? "This Week" : effectiveTimeRange === "year" ? "This Year" : "This Month";
  const isMultiDay = effectiveTimeRange !== "day";
  const isMonth = effectiveTimeRange === "month";
  const isYear = effectiveTimeRange === "year";
  const sectionList = [...baseSections, ...((isMonth || isYear) ? monthlySections : []), ...alwaysSections];
  const sectionGrid = sectionList.map(s => ({ ...s, sub: sectionSubs[s.id] || "" }));
  const analysis = useMemo(() => currentData ? analyzeData(allDays, currentData, rangeLabel, prevWeekDays) : null, [currentData, allDays, rangeLabel, prevWeekDays]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Handle view day/month from Manage Uploads — switch to dashboard with override
  const handleViewDay = useCallback((date) => {
    setViewOverride({ type: "day", date });
    setActiveSection("dashboard");
    setActiveTab("home");
  }, []);

  const handleViewMonth = useCallback((monthKey) => {
    setViewOverride({ type: "month", key: monthKey });
    setActiveSection("dashboard");
    setActiveTab("home");
  }, []);

  // Clear viewOverride when user manually changes time range
  const handleTimeRangeChange = useCallback((tr) => {
    setTimeRange(tr);
    setViewOverride(null);
  }, []);

  // Not authenticated — show login/setup screen
  if (!authenticated) return <AuthScreen onAuthenticated={handleAuthenticated} />;

  // Loading data after auth
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
      <UploadScreen onDataLoaded={addDay} uploads={allDays} />
      <style>{globalCSS}</style>
    </div>
  );

  const { summary } = analysis;

  // Date label in header
  const viewOverrideLabel = viewOverride
    ? viewOverride.type === "day"
      ? `📌 ${new Date(viewOverride.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
      : `📌 ${new Date(viewOverride.key + "-15T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`
    : null;

  const dateLabel = viewOverrideLabel || (currentData.dates ? (effectiveTimeRange === "day"
    ? new Date(currentData.dates.start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : `${currentDays.length} days`) : "");

  const handleSelectProduct = (product) => setSelectedProduct(product);

  const renderSection = () => {
    switch (activeSection) {
      case "dashboard": return <Dashboard analysis={analysis} dates={currentData.dates} allDays={currentDays} timeRange={rangeLabel} />;
      case "cats": return <CategoriesSection analysis={analysis} timeRange={rangeLabel} onSelectProduct={handleSelectProduct} />;
      case "trending": return <TrendingSection analysis={analysis} onSelectProduct={handleSelectProduct} />;
      case "review": return <ReviewSection analysis={analysis} onSelectProduct={handleSelectProduct} />;
      case "topsellers": return <TopSellersSection analysis={analysis} onSelectProduct={handleSelectProduct} />;
      case "erosion": return <ErosionSection analysis={analysis} onSelectProduct={handleSelectProduct} />;
      case "missing": return <HiddenProfitSection analysis={analysis} onSelectProduct={handleSelectProduct} />;
      case "ops": return <OpsSection analysis={analysis} allDays={currentDays} />;
      case "actions": return <ActionsSection analysis={analysis} />;
      case "density": return <ShelfDensitySection analysis={analysis} />;
      case "competitor": return <CompetitorPricingSection analysis={analysis} />;
      case "clearshelf": return <ClearShelfSection analysis={analysis} />;
      case "coming": return <ComingUpSection />;
      case "settings": return <SettingsSection clientId={clientId} clientName={clientName} onRefresh={refreshData} onLogout={handleLogout} onViewDay={handleViewDay} onViewMonth={handleViewMonth} />;
      case "ai": return <AIChatSection analysis={analysis} allDays={currentDays} />;
      default: return <Dashboard analysis={analysis} dates={currentData.dates} allDays={currentDays} timeRange={rangeLabel} />;
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

        {/* viewOverride banner — tap to dismiss */}
        {viewOverride && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", marginBottom: 8, borderRadius: 10, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}>
            <span style={{ fontSize: 12, color: C.orangeText, fontWeight: 600 }}>📌 Pinned view — {viewOverrideLabel?.replace("📌 ", "")}</span>
            <button onClick={() => setViewOverride(null)} style={{ background: "none", border: "none", color: C.orangeText, fontSize: 13, cursor: "pointer", fontWeight: 700 }}>✕ Clear</button>
          </div>
        )}

        {/* Time toggle */}
        <div style={{ display: "flex", gap: 4, marginBottom: (isMonth || isYear) ? 8 : 12 }}>
          {timeRanges.map(tr => (
            <button key={tr.id} onClick={() => handleTimeRangeChange(tr.id)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: (timeRange === tr.id && !viewOverride) ? C.accentLight : C.surface, color: (timeRange === tr.id && !viewOverride) ? C.white : C.textMuted }}>
              {tr.label}
            </button>
          ))}
        </div>

        {/* Month selector — only when in month mode */}
        {isMonth && !viewOverride && availableMonths.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <select value={selectedMonth || prevMonthKey} onChange={e => setSelectedMonth(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, outline: "none", fontFamily: "'Inter', sans-serif", appearance: "none", WebkitAppearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748B'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}>
              {availableMonths.map(m => <option key={m.key} value={m.key} style={{ background: C.bg, color: C.white }}>{m.label} ({m.days.length} days)</option>)}
            </select>
          </div>
        )}

        {/* Year selector — only when in year mode */}
        {isYear && !viewOverride && availableYears.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <select value={selectedYear || currentYearKey} onChange={e => setSelectedYear(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, outline: "none", fontFamily: "'Inter', sans-serif", appearance: "none", WebkitAppearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748B'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}>
              {availableYears.map(y => <option key={y.key} value={y.key} style={{ background: C.bg, color: C.white }}>{y.label} ({y.days.length} days of data)</option>)}
            </select>
          </div>
        )}

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
          currentDays={currentDays}
          timeRange={rangeLabel}
        />
      )}

      <style>{globalCSS}</style>
    </div>
  );
}
