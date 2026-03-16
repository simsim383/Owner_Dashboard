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
import LeafletScanner from "./Promos.jsx";

// ─── SETTINGS SECTION ───────────────────────────────────────────
function SettingsSection({ clientId, clientName, onRefresh, onLogout }) {
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
      <ManageUploadsSection clientId={clientId} onRefresh={onRefresh} />
    </div>
  );

  if (activeSettings === "pin") return (
    <SectionCard title="Change PIN" icon="🔑">
      <button onClick={() => setActiveSettings("menu")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0", marginBottom: 12, background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 13, fontWeight: 600 }}>← Back to Settings</button>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>CURRENT PIN</div>
      <input type="tel" inputMode="numeric" maxLength={4} style={pinInp} value={currentPin} onChange={e => { setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinMsg(null); }} placeholder="• • • •" />
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>NEW PIN</div>
      <input type="tel" inputMode="numeric" maxLength={4} style={pinInp} value={newPin} onChange={e => { setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinMsg(null); }} placeholder="• • • •" />
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>CONFIRM NEW PIN</div>
      <input type="tel" inputMode="numeric" maxLength={4} style={pinInp} value={confirmNewPin} onChange={e => { setConfirmNewPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinMsg(null); }} placeholder="• • • •" />
      {pinMsg && <div style={{ fontSize: 13, color: pinMsg.startsWith("✓") ? C.greenText : C.redText, marginBottom: 12 }}>{pinMsg}</div>}
      <button onClick={handleChangePin} disabled={savingPin} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: C.accentLight, color: C.white, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{savingPin ? "Saving..." : "Update PIN"}</button>
    </SectionCard>
  );

  return (
    <SectionCard title="Settings" icon="⚙️">
      <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 16 }}>Logged in as <strong style={{ color: C.white }}>{clientName}</strong></div>
      {[
        { label: "Manage Uploads", sub: "View, delete uploaded data", icon: "📋", action: () => setActiveSettings("uploads") },
        { label: "Change PIN", sub: "Update your 4-digit PIN", icon: "🔑", action: () => setActiveSettings("pin") },
      ].map((item, i) => (
        <div key={i} onClick={item.action} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px", marginBottom: 8, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer" }}>
          <span style={{ fontSize: 22 }}>{item.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>{item.label}</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>{item.sub}</div>
          </div>
          <span style={{ fontSize: 14, color: C.textMuted }}>›</span>
        </div>
      ))}
      <div onClick={() => setConfirmLogout(true)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px", marginTop: 16, borderRadius: 12, background: C.redDim, border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer" }}>
        <span style={{ fontSize: 22 }}>🚪</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.redText }}>Log Out</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>Return to login screen</div>
        </div>
      </div>
      {confirmLogout && (
        <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 12 }}>Are you sure you want to log out?</div>
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
  { id: "leaflet", label: "Leaflet Scanner", icon: "📸" },
  { id: "coming", label: "Coming Up", icon: "📅" },
  { id: "settings", label: "Settings", icon: "⚙️" },
  { id: "ai", label: "AI", icon: "🤖" },
];

const sectionSubs = { dashboard: "KPIs & insights", cats: "Revenue, profit, top/bottom", trending: "40%+ vs previous", review: "Low margin items", topsellers: "Best profit contributors", erosion: "Margin alerts", missing: "No cost data items", ops: "Daily patterns & basket", actions: "Prioritised to-do list", density: "ELITE / OK / THIEF audit", competitor: "vs Tesco & Asda pricing", clearshelf: "Slow mover promotions", leaflet: "Scan supplier deals", coming: "Events & prep", settings: "Uploads, PIN, logout", ai: "Ask about your data" };

const bottomNav = [
  { id: "home", icon: "🏠", label: "Home" },
  { id: "search", icon: "🔍", label: "Search" },
  { id: "grid", icon: "⊞", label: "Sections" },
  { id: "news", icon: "📰", label: "News" },
];

const timeRanges = [{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }];

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
    } catch { setInviteMsg("Could not verify — check connection"); }
    setChecking(false);
  };

  const handleCreate = async () => {
    const id = ownerId.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!id || id.length < 3) { setIdMsg("ID must be at least 3 characters"); return; }
    if (pin.length !== 4) { setIdMsg("PIN must be 4 digits"); return; }
    if (pin !== pinConfirm) { setIdMsg("PINs don't match"); return; }
    setSaving(true); setIdMsg(null);
    try {
      await claimOwnerId(id, inviteCode.trim().toUpperCase());
      const client = await getOrCreateClient(id);
      if (client) await setPin(client.id, pin);
      saveOwnerId(id);
      // Load data and authenticate
      onAuthenticated(client.id, client.name || id);
    } catch (e) {
      const msg = e.message || "";
      if (msg.includes("taken") || msg.includes("duplicate")) setIdMsg("That ID is taken — try something more specific");
      else setIdMsg("Setup failed: " + msg);
    }
    setSaving(false);
  };

  const handleLogin = async () => {
    const id = loginId.trim().toLowerCase();
    if (!id) { setLoginMsg("Enter your business ID"); return; }
    if (loginPin.length !== 4) { setLoginMsg("Enter your 4-digit PIN"); return; }
    setLoggingIn(true); setLoginMsg(null);
    try {
      const client = await getOrCreateClient(id);
      if (!client) { setLoginMsg("Business not found"); setLoggingIn(false); return; }
      const valid = await verifyPin(client.id, loginPin);
      if (!valid) { setLoginMsg("Incorrect PIN"); setLoginPin(""); setLoggingIn(false); return; }
      saveOwnerId(id);
      onAuthenticated(client.id, client.name || id);
    } catch (e) { setLoginMsg("Login failed: " + (e.message || "check connection")); }
    setLoggingIn(false);
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto", fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif", color: C.textPrimary, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg, ${C.accentLight}, ${C.green})`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 20 }}>📊</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 4 }}>ShopMate Sales</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 28 }}>Owner Dashboard</div>

        {/* ── LANDING ── */}
        {mode === "landing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={() => setMode("login")} style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: C.accentLight, color: C.white, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
              Log In
            </button>
            <button onClick={() => setMode("setup-code")} style={{ width: "100%", padding: "16px", borderRadius: 14, border: `1.5px solid ${C.border}`, background: C.card, color: C.textSecondary, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              I have an invite code
            </button>
          </div>
        )}

        {/* ── LOGIN ── */}
        {mode === "login" && (
          <div style={{ background: C.card, borderRadius: 16, padding: 24, border: `1px solid ${C.border}`, textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.white, marginBottom: 16 }}>Welcome back</div>

            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>BUSINESS ID</div>
            <input style={inp} value={loginId} onChange={e => { setLoginId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setLoginMsg(null); }} placeholder="e.g. londis-horden" autoFocus />

            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>PIN</div>
            <input type="tel" inputMode="numeric" maxLength={4} style={pinInp} value={loginPin} onChange={e => { setLoginPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setLoginMsg(null); }} onKeyDown={e => { if (e.key === "Enter" && loginPin.length === 4) handleLogin(); }} placeholder="• • • •" />

            {loginMsg && <div style={{ fontSize: 13, color: C.redText, marginBottom: 12 }}>{loginMsg}</div>}

            <button onClick={handleLogin} disabled={loggingIn || !loginId.trim() || loginPin.length !== 4} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: loginId.trim() && loginPin.length === 4 ? C.accentLight : C.surface, color: loginId.trim() && loginPin.length === 4 ? C.white : C.textMuted, fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>
              {loggingIn ? "Logging in..." : "Log In"}
            </button>

            <button onClick={() => { setMode("landing"); setLoginMsg(null); }} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", padding: 0 }}>← Back</button>
          </div>
        )}

        {/* ── SETUP: INVITE CODE ── */}
        {mode === "setup-code" && (
          <div style={{ background: C.card, borderRadius: 16, padding: 24, border: `1px solid ${C.border}`, textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.white, marginBottom: 6 }}>Enter your invite code</div>
            <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 16, lineHeight: 1.5 }}>Each code can only be used once to create one account.</div>
            <input style={{ ...inp, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }} value={inviteCode} onChange={e => { setInviteCode(e.target.value.toUpperCase()); setInviteMsg(null); }} onKeyDown={e => { if (e.key === "Enter") handleInvite(); }} placeholder="e.g. HORDEN-2026" autoFocus />
            {inviteMsg && <div style={{ fontSize: 13, color: C.redText, marginBottom: 12 }}>{inviteMsg}</div>}
            <button onClick={handleInvite} disabled={checking || !inviteCode.trim()} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: inviteCode.trim() ? C.accentLight : C.surface, color: inviteCode.trim() ? C.white : C.textMuted, fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>
              {checking ? "Checking..." : "Continue →"}
            </button>
            <button onClick={() => { setMode("landing"); setInviteMsg(null); }} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", padding: 0 }}>← Back</button>
          </div>
        )}

        {/* ── SETUP: CHOOSE ID + PIN ── */}
        {mode === "setup-id" && (
          <div style={{ background: C.card, borderRadius: 16, padding: 24, border: `1px solid ${C.border}`, textAlign: "left" }}>
            <div style={{ display: "inline-block", background: C.greenDim, color: C.greenText, padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>✓ Code accepted</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.white, marginBottom: 16 }}>Create your account</div>

            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>BUSINESS ID</div>
            <input style={inp} value={ownerId} onChange={e => { setOwnerId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setIdMsg(null); }} placeholder="e.g. londis-horden" autoFocus />

            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>4-DIGIT PIN</div>
            <input type="tel" inputMode="numeric" maxLength={4} style={pinInp} value={pin} onChange={e => { setLocalPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setIdMsg(null); }} placeholder="• • • •" />

            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>CONFIRM PIN</div>
            <input type="tel" inputMode="numeric" maxLength={4} style={pinInp} value={pinConfirm} onChange={e => { setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4)); setIdMsg(null); }} onKeyDown={e => { if (e.key === "Enter" && pin.length === 4 && pinConfirm.length === 4) handleCreate(); }} placeholder="• • • •" />

            {idMsg && <div style={{ fontSize: 13, color: C.redText, marginBottom: 12 }}>{idMsg}</div>}

            <button onClick={handleCreate} disabled={saving || !ownerId.trim() || pin.length !== 4 || pinConfirm.length !== 4} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: ownerId.trim() && pin.length === 4 ? C.accentLight : C.surface, color: ownerId.trim() ? C.white : C.textMuted, fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>
              {saving ? "Creating..." : "Create Account →"}
            </button>

            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>Your business ID and PIN are your login. Remember them — you'll need your PIN each time you open the app.</div>
          </div>
        )}
      </div>
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

  // Available months from data
  const availableMonths = useMemo(() => {
    const months = {};
    allDays.forEach(d => {
      if (!d.dates?.start) return;
      const m = d.dates.start.slice(0, 7); // "2026-03"
      if (!months[m]) months[m] = { key: m, label: new Date(d.dates.start + "T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }), days: [] };
      months[m].days.push(d);
    });
    return Object.values(months).sort((a, b) => b.key.localeCompare(a.key));
  }, [allDays]);

  // Previous complete month key
  const prevMonthKey = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  // Current range data — day/week/month logic
  const currentDays = useMemo(() => {
    if (!allDays.length) return [];
    if (timeRange === "day") return [allDays[allDays.length - 1]];
    if (timeRange === "week") return allDays.slice(-7);
    // Month: use selected month or previous complete month
    const mKey = selectedMonth || prevMonthKey;
    const monthDays = allDays.filter(d => d.dates?.start?.startsWith(mKey));
    return monthDays.length > 0 ? monthDays : allDays; // fallback to all if no match
  }, [allDays, timeRange, selectedMonth, prevMonthKey]);

  const currentData = useMemo(() => {
    if (!currentDays.length) return null;
    if (timeRange === "day") return currentDays[0];
    return { items: currentDays.flatMap(d => d.items), dates: { start: currentDays[0].dates?.start, end: currentDays[currentDays.length - 1].dates?.end } };
  }, [currentDays, timeRange]);

  // Previous period for WoW comparison
  const prevWeekDays = useMemo(() => {
    if (!allDays.length) return null;
    if (timeRange === "day") {
      // Day mode: return previous day as a single-element array
      return allDays.length >= 2 ? [allDays[allDays.length - 2]] : null;
    }
    if (timeRange === "month") {
      // Month mode: find the PREVIOUS calendar month's data
      const currentMonthKey = currentDays[0]?.dates?.start?.slice(0, 7);
      if (!currentMonthKey) return null;
      const d = new Date(currentMonthKey + "-15");
      d.setMonth(d.getMonth() - 1);
      const prevKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const prevDays = allDays.filter(day => day.dates?.start?.startsWith(prevKey));
      return prevDays.length > 0 ? prevDays : null;
    }
    // Week mode: get the same number of days before
    return getPrevWeekData(allDays, currentDays);
  }, [allDays, currentDays, timeRange]);

  const rangeLabel = timeRange === "day" ? "Today" : timeRange === "week" ? "This Week" : "This Month";
  const isMultiDay = timeRange !== "day";
  const isMonth = timeRange === "month";
  const sectionList = [...baseSections, ...(isMonth ? monthlySections : []), ...alwaysSections];
  const sectionGrid = sectionList.map(s => ({ ...s, sub: sectionSubs[s.id] || "" }));
  const analysis = useMemo(() => currentData ? analyzeData(allDays, currentData, rangeLabel, prevWeekDays) : null, [currentData, allDays, rangeLabel, prevWeekDays]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

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
  const dateLabel = currentData.dates ? (timeRange === "day"
    ? new Date(currentData.dates.start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : `${allDays.length} days`) : "";

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
      case "leaflet": return <LeafletScanner analysis={analysis} />;
      case "coming": return <ComingUpSection />;
      case "settings": return <SettingsSection clientId={clientId} clientName={clientName} onRefresh={refreshData} onLogout={handleLogout} />;
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

        {/* Time toggle */}
        <div style={{ display: "flex", gap: 4, marginBottom: isMonth ? 8 : 12 }}>
          {timeRanges.map(tr => (
            <button key={tr.id} onClick={() => setTimeRange(tr.id)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: timeRange === tr.id ? C.accentLight : C.surface, color: timeRange === tr.id ? C.white : C.textMuted }}>
              {tr.label}
            </button>
          ))}
        </div>

        {/* Month selector — only when in month mode */}
        {isMonth && availableMonths.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <select value={selectedMonth || prevMonthKey} onChange={e => setSelectedMonth(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, outline: "none", fontFamily: "'Inter', sans-serif", appearance: "none", WebkitAppearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748B'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}>
              {availableMonths.map(m => <option key={m.key} value={m.key} style={{ background: C.bg, color: C.white }}>{m.label} ({m.days.length} days)</option>)}
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
