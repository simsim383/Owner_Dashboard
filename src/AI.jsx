// ═══════════════════════════════════════════════════════════════════
// AI — Chat, Coming Up, News
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { C, Badge, SectionCard, EmptyState, Insight, f, fi, pct } from "./components.jsx";
import { ANTHROPIC_KEY, AI_MODEL, AI_HDR } from "./config.js";

// ─── AI CHAT ────────────────────────────────────────────────────
export function AIChatSection({ analysis, allDays, messages, setMessages }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef();

  const systemPrompt = useMemo(() => {
    const { summary, categories } = analysis;
    const dailyBreakdown = allDays.map(d => {
      const g = d.items.reduce((s, i) => s + i.gross, 0);
      const q = d.items.reduce((s, i) => s + i.qty, 0);
      const p = d.items.filter(i => i.hasCost).reduce((s, i) => s + (i.grossProfit || 0), 0);
      const day = d.dates ? new Date(d.dates.start + "T12:00:00") : null;
      return `${day ? day.toLocaleDateString("en-GB", { weekday: "short" }) : "?"} ${d.dates?.start}: £${g.toFixed(0)} rev, ${q} units, £${p.toFixed(0)} profit${d.transactions ? `, ${d.transactions} trans, £${(g / d.transactions).toFixed(2)} basket` : ""}`;
    }).join("\n");
    const catS = categories.slice(0, 15).map(c => `${c.name}: £${c.gross.toFixed(0)} (${c.pctRev.toFixed(0)}%), ${c.margin.toFixed(1)}% margin, ${c.qty} units`).join("\n");

    // All products grouped by category, sorted slow→fast within each (so slow movers are visible)
    const productsByCategory = {};
    [...analysis.items].forEach(i => {
      if (!productsByCategory[i.category]) productsByCategory[i.category] = [];
      productsByCategory[i.category].push(i);
    });
    const allProducts = Object.entries(productsByCategory)
      .sort(([, a], [, b]) => b.reduce((s, i) => s + i.gross, 0) - a.reduce((s, i) => s + i.gross, 0))
      .map(([cat, items]) => {
        const sorted = [...items].sort((a, b) => a.qty - b.qty); // slow movers first
        return `[${cat}]\n` + sorted.map(i => `  ${i.product}:qty=${i.qty},£${i.gross.toFixed(2)},${i.hasCost ? i.grossMargin?.toFixed(1) + "%" : "UNTRACKED"}`).join("\n");
      }).join("\n");

    return `You are an expert retail advisor for a UK convenience store. ${allDays.length} days of data.

SUMMARY: £${summary.totalGross.toFixed(0)} rev, £${summary.trackedProfit.toFixed(0)} profit, ${summary.trackedMargin.toFixed(1)}% margin, ${summary.productCount} products, ${summary.untrackedCount} untracked (£${summary.untrackedRevenue.toFixed(0)}).

DAILY:\n${dailyBreakdown}

CATEGORIES:\n${catS}

ALL PRODUCTS BY CATEGORY (slow movers listed first within each category):
${allProducts}

RULES:
• Use bullet points, bold key numbers
• Keep under 150 words
• Lead with the direct answer, then supporting data
• Reference actual product names and numbers from the data
• End with one clear action
• NEVER suggest price increases on price-marked items (any product with "Pm" in its name — e.g. "Pm Coke 500ml")`;
  }, [analysis, allDays]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInput(""); setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({ model: AI_MODEL, max_tokens: 400, system: systemPrompt, messages: newMessages }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || data.error.type);
      const reply = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "Sorry, I couldn't get a response.";
      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch (e) { setMessages([...newMessages, { role: "assistant", content: "Error: " + e.message }]); }
    setLoading(false);
    setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }), 100);
  };

  return (
    <SectionCard title="AI Assistant" icon="🤖">
      {!ANTHROPIC_KEY && <EmptyState msg="Add API key in config.js to enable AI" />}
      <div ref={chatRef} style={{ maxHeight: 380, overflowY: "auto", marginBottom: 12 }}>
        {messages.length === 0 && (
          <div style={{ padding: "16px 0", color: C.textMuted, fontSize: 13, lineHeight: 1.6 }}>
            Ask anything about your sales data — best sellers, margin analysis, ordering quantities, trends.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: m.role === "user" ? C.accentGlow : C.surface, border: `1px solid ${m.role === "user" ? "rgba(59,111,212,0.2)" : C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: m.role === "user" ? C.accentLight : C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>{m.role === "user" ? "You" : "AI"}</div>
            <div style={{ fontSize: 13, color: C.textPrimary, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
          </div>
        ))}
        {loading && <div style={{ padding: "10px 14px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, fontSize: 13, color: C.textMuted }}>Thinking...</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
      <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask about your data..." rows={1} style={{ flex: 1, padding: "12px 14px", borderRadius: 10, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: "'Inter', sans-serif", resize: "none", overflowY: "hidden", lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap", boxSizing: "border-box", fieldSizing: "content", minHeight: 44, maxHeight: 120 }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: "12px 18px", borderRadius: 10, border: "none", background: input.trim() ? C.accentLight : C.surface, color: input.trim() ? C.white : C.textMuted, fontSize: 13, fontWeight: 700, alignSelf: "stretch" }}>Send</button>
      </div>
    </SectionCard>
  );
}

// ─── HARDCODED EVENTS DATABASE ───────────────────────────────────
const EVENTS_2026 = [
  { date: "2026-04-03", event: "Good Friday", icon: "🐣", rawImpact: "Stock Easter eggs, hot cross buns, alcohol and BBQ essentials. High footfall all day — keep confectionery front of store." },
  { date: "2026-04-05", event: "Easter Sunday", icon: "🐣", rawImpact: "Family gathering day — chocolate, alcohol, sharing snacks. Push multipacks and premium items." },
  { date: "2026-04-06", event: "Easter Monday (Bank Holiday)", icon: "🐣", rawImpact: "Last bank holiday of Easter — BBQ weather purchases, snacks, cold drinks. Keep alcohol and confectionery well stocked." },
  { date: "2026-04-24", event: "Payday (April)", icon: "💰", rawImpact: "Customers spend more freely on payday. Ensure premium products, alcohol, tobacco and treats are well faced up." },
  { date: "2026-05-04", event: "Early May Bank Holiday", icon: "🏖️", rawImpact: "Long weekend — BBQ items, soft drinks, alcohol, crisps. Footfall spikes on the day." },
  { date: "2026-05-17", event: "Premier League Final Day", icon: "⚽", rawImpact: "Big viewing occasion — beer, cider, crisps, pizza snacks. Pre-match and half-time trade strong." },
  { date: "2026-05-23", event: "FA Cup Final", icon: "🏆", rawImpact: "Major national viewing event — stock alcohol, snacks, soft drinks for watching parties." },
  { date: "2026-05-25", event: "Spring Bank Holiday", icon: "🌸", rawImpact: "Long weekend with half term — BBQ, drinks, snacks. Ensure freezer and drinks chiller are full." },
  { date: "2026-05-29", event: "Payday (May)", icon: "💰", rawImpact: "Payday uplift — alcohol, tobacco, meal deals and treats. Good week to push premium lines." },
  { date: "2026-06-06", event: "Champions League Final", icon: "⚽", rawImpact: "Biggest club game of the year — beer, cider, snacks. Stock up the evening before. Multipacks move well." },
  { date: "2026-06-11", event: "FIFA World Cup Starts", icon: "🌍", rawImpact: "Month-long tournament — sustained uplift on beer, crisps, soft drinks throughout. England games spike trade significantly." },
  { date: "2026-06-21", event: "Father's Day", icon: "👨", rawImpact: "Stock beer, spirits, snacks. Last-minute buyers peak on the day — keep alcohol visible." },
  { date: "2026-06-26", event: "Payday (June)", icon: "💰", rawImpact: "Summer payday with World Cup on — alcohol and snacks will be key sellers this week." },
  { date: "2026-07-04", event: "Wimbledon Finals Weekend", icon: "🎾", rawImpact: "Stock Pimm's, Prosecco, soft drinks. British sporting occasion with strong impulse buying." },
  { date: "2026-07-19", event: "Schools Break Up", icon: "🎒", rawImpact: "Summer holidays begin — footfall increases through the day. Ice creams, cold drinks, snacks and sweets for kids." },
  { date: "2026-07-31", event: "Payday (July)", icon: "💰", rawImpact: "First summer holiday payday — alcohol, soft drinks, ice cream, BBQ essentials. World Cup knockouts likely running too." },
  { date: "2026-08-02", event: "Community Shield", icon: "⚽", rawImpact: "Football returns — beer and snacks. Signals start of football season spending." },
  { date: "2026-08-15", event: "Premier League Season Starts", icon: "⚽", rawImpact: "Weekly football trade resumes — Saturday beer, crisps and snacks uplift returns for the season." },
  { date: "2026-08-28", event: "Payday (August)", icon: "💰", rawImpact: "Bank holiday weekend payday — double impact. All categories should be fully stocked." },
  { date: "2026-08-31", event: "Summer Bank Holiday", icon: "🌞", rawImpact: "Last bank holiday of summer — BBQ, alcohol, cold drinks. Back to school week follows." },
  { date: "2026-09-05", event: "Back to School", icon: "🎒", rawImpact: "Stock school snacks, lunch fillers, cereal bars, drinks pouches. Morning footfall increases." },
  { date: "2026-09-25", event: "Payday (September)", icon: "💰", rawImpact: "Autumn payday — spending returns to normal pattern. Alcohol and tobacco stocked for the weekend." },
  { date: "2026-10-24", event: "Half Term Starts", icon: "🍂", rawImpact: "Week off school — daytime footfall from families. Snacks, sweets, soft drinks up. Start stocking Halloween sweets." },
  { date: "2026-10-30", event: "Payday (October)", icon: "💰", rawImpact: "Pre-Halloween payday — customers buying sweets, costumes. Best week for confectionery sales." },
  { date: "2026-10-31", event: "Halloween", icon: "🎃", rawImpact: "Heavy footfall from early afternoon. Keep pick and mix, bags of sweets, chocolate fully stocked throughout." },
  { date: "2026-11-05", event: "Bonfire Night", icon: "🎆", rawImpact: "Evening trade spike — hot drinks, mulled wine, snacks. Families gathering before and after fireworks." },
  { date: "2026-11-27", event: "Black Friday & Payday", icon: "🛍️", rawImpact: "Big spending day plus payday — stock premium products, alcohol, tobacco and treats." },
  { date: "2026-12-05", event: "Christmas Peak Begins", icon: "🎄", rawImpact: "Christmas trade starts in earnest — mince pies, selection boxes, cards, alcohol. Daily footfall increases from here." },
  { date: "2026-12-24", event: "Christmas Eve", icon: "🎅", rawImpact: "Biggest impulse day of the year — last-minute alcohol, snacks, soft drinks, batteries. Be fully stocked by 8am." },
  { date: "2026-12-26", event: "Boxing Day (Football)", icon: "⚽", rawImpact: "Full Premier League programme — beer, snacks, soft drinks. Strong afternoon and evening trade." },
  { date: "2026-12-31", event: "New Year's Eve", icon: "🥂", rawImpact: "Stock Prosecco, Champagne, beer, cider, snacks. Trade builds from mid-afternoon. Top 5 alcohol day of the year." },
];

function calcDays(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr + "T00:00:00") - today) / 86400000);
}
function getPriority(n) {
  if (n < 0) return null;
  if (n <= 3) return "URGENT";
  if (n <= 14) return "PLAN";
  return "AWARE";
}
function getUpcoming() {
  return EVENTS_2026
    .map(e => ({ ...e, daysAway: calcDays(e.date) }))
    .filter(e => e.daysAway >= 0 && e.daysAway <= 60)
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 8);
}
function fmtDays(n) { return n === 0 ? "TODAY" : n === 1 ? "Tomorrow" : `${n} days`; }
function fmtDate(s) { return new Date(s + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }

// ─── COMING UP ──────────────────────────────────────────────────
export function ComingUpSection() {
  const [tick, setTick] = useState(0);
  const [impacts, setImpacts] = useState({});
  const [loadingImpacts, setLoadingImpacts] = useState(false);

  const events = useMemo(() => getUpcoming(), [tick]);

  const generateImpacts = useCallback(async () => {
    if (!ANTHROPIC_KEY || events.length === 0) return;
    setLoadingImpacts(true);
    try {
      const list = events.map(e => `- ${e.event} (${fmtDate(e.date)}, ${fmtDays(e.daysAway)}): ${e.rawImpact}`).join("\n");
      const prompt = `You are a stock advisor for a UK Londis convenience store in County Durham (working class area, loyal regulars).

For each upcoming event, write ONE punchy sentence (max 12 words) of the most important specific stock advice.

Events:
${list}

Respond ONLY with a JSON object: {"event name": "stock advice", ...}. No markdown, no backticks.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({ model: AI_MODEL, max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) { setLoadingImpacts(false); return; }
      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      try { setImpacts(JSON.parse(clean)); } catch { /* use rawImpact fallback */ }
    } catch (e) { console.error("Coming Up impacts:", e); }
    setLoadingImpacts(false);
  }, [events]);

  useEffect(() => { generateImpacts(); }, [tick]);

  return (
    <SectionCard title="Coming Up" icon="📅">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.textMuted }}>Next events · refresh to update days</div>
        <button onClick={() => setTick(t => t + 1)} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>↻ Refresh</button>
      </div>
      {events.length === 0 && <EmptyState msg="No upcoming events in the next 60 days" />}
      {events.map((e, i) => {
        const priority = getPriority(e.daysAway);
        const impact = impacts[e.event] || e.rawImpact;
        return (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 14px", marginBottom: 6, borderRadius: 10, background: priority === "URGENT" ? "rgba(239,68,68,0.06)" : C.surface, border: `1px solid ${priority === "URGENT" ? "rgba(239,68,68,0.2)" : C.border}` }}>
            <div style={{ flex: 1, marginRight: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 16 }}>{e.icon}</span>
                <span style={{ fontSize: 13, color: C.white, fontWeight: 700 }}>{e.event}</span>
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>
                {fmtDate(e.date)} · <span style={{ color: priority === "URGENT" ? C.redText : priority === "PLAN" ? C.orangeText : C.textMuted, fontWeight: 600 }}>{fmtDays(e.daysAway)}</span>
              </div>
              <div style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.5 }}>
                {loadingImpacts && !impacts[e.event] ? "Loading advice..." : impact}
              </div>
            </div>
            <Badge type={priority === "URGENT" ? "ALERT" : priority === "PLAN" ? "MED" : "OK"}>{priority}</Badge>
          </div>
        );
      })}
    </SectionCard>
  );
}

// ─── NEWS ───────────────────────────────────────────────────────
// RSS feeds via rss2json.com — free tier, no API key needed
// Sources chosen for rss2json compatibility and UK retail relevance

const RSS_FEEDS = [
  {
    name: "Better Retailing",
    url: "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fbetterretailing.com%2Ffeed",
    color: "#16a34a",
  },
  {
    name: "Retail Gazette",
    url: "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.retailgazette.co.uk%2Ffeed",
    color: "#2563eb",
  },
  {
    name: "Talking Retail",
    url: "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.talkingretail.com%2Ffeed",
    color: "#9333ea",
  },
];

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const mins = Math.round((Date.now() - new Date(dateStr)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function stripHtml(str) {
  return (str || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

export function NewsSection() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [feedStatus, setFeedStatus] = useState({});

  const fetchNews = useCallback(async () => {
    setLoading(true); setError(false);
    const status = {};
    try {
      const results = await Promise.allSettled(
        RSS_FEEDS.map(feed =>
          fetch(feed.url)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(data => {
              if (data.status !== "ok") throw new Error(data.message || "Feed error");
              status[feed.name] = { ok: true, count: data.items?.length || 0 };
              return (data.items || []).slice(0, 5).map(item => ({
                title: stripHtml(item.title),
                summary: stripHtml(item.description || item.content || "").slice(0, 140) + "…",
                url: item.link,
                source: feed.name,
                sourceColor: feed.color,
                pubDate: item.pubDate,
                timeAgo: timeAgo(item.pubDate),
              }));
            })
            .catch(e => { status[feed.name] = { ok: false, error: e.message }; return []; })
        )
      );

      const all = results
        .flatMap(r => r.status === "fulfilled" ? r.value : [])
        .filter(a => a.title)
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
        .slice(0, 12);

      setFeedStatus(status);
      if (all.length === 0) { setError(true); } else { setArticles(all); }
      setLastUpdated(new Date());
    } catch (e) {
      console.error("News fetch:", e);
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchNews(); }, []);

  const workingFeeds = RSS_FEEDS.filter(f => feedStatus[f.name]?.ok !== false);

  return (
    <div style={{ paddingTop: 4 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.white, letterSpacing: -0.3 }}>Retail News</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            {lastUpdated ? `Updated ${timeAgo(lastUpdated.toISOString())}` : "UK convenience & grocery"}
          </div>
        </div>
        <button onClick={fetchNews} disabled={loading} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.5 : 1 }}>
          {loading ? "..." : "↻ Refresh"}
        </button>
      </div>

      {/* Source badges — show green/grey based on feed health */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {RSS_FEEDS.map(f => {
          const ok = feedStatus[f.name]?.ok !== false;
          return (
            <div key={f.name} style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: ok ? f.color + "20" : "rgba(100,116,139,0.1)", color: ok ? f.color : C.textMuted, border: `1px solid ${ok ? f.color + "40" : C.border}` }}>
              {ok ? "" : "✕ "}{f.name}
            </div>
          );
        })}
      </div>

      {/* Skeleton loading */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ padding: "16px", borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ height: 8, width: 80, borderRadius: 4, background: C.surface }} />
                <div style={{ height: 8, width: 40, borderRadius: 4, background: C.surface, marginLeft: "auto" }} />
              </div>
              <div style={{ height: 14, width: "95%", borderRadius: 4, background: C.surface, marginBottom: 6 }} />
              <div style={{ height: 14, width: "70%", borderRadius: 4, background: C.surface, marginBottom: 8 }} />
              <div style={{ height: 10, width: "85%", borderRadius: 4, background: C.surface }} />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{ padding: 24, textAlign: "center", borderRadius: 12, background: C.surface, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📡</div>
          <div style={{ fontSize: 13, color: C.white, fontWeight: 600, marginBottom: 4 }}>Could not load news</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>Check your connection and try again</div>
          <button onClick={fetchNews} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.accentLight, color: C.white, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Try Again</button>
        </div>
      )}

      {/* Articles */}
      {!loading && !error && articles.map((item, i) => (
        <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block", marginBottom: 8 }}>
          <div style={{ padding: "14px 16px", borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.sourceColor, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: item.sourceColor, textTransform: "uppercase", letterSpacing: 0.8 }}>{item.source}</span>
              </div>
              <span style={{ fontSize: 10, color: C.textMuted }}>{item.timeAgo}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.white, lineHeight: 1.4, marginBottom: 6 }}>{item.title}</div>
            {item.summary && item.summary.length > 3 && (
              <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5, marginBottom: 8 }}>{item.summary}</div>
            )}
            <div style={{ fontSize: 11, color: item.sourceColor, fontWeight: 600 }}>Read more →</div>
          </div>
        </a>
      ))}

      {!loading && !error && articles.length > 0 && (
        <div style={{ textAlign: "center", padding: "12px 0", fontSize: 11, color: C.textMuted }}>
          {articles.length} stories · {workingFeeds.length}/{RSS_FEEDS.length} sources live
        </div>
      )}
    </div>
  );
}

// ─── TRENDS ─────────────────────────────────────────────────────
// Social & viral product trends for UK convenience stores
// Uses Claude web search (once per day, cached in localStorage)

const TRENDS_CACHE_KEY = "shopmate_trends_cache";
const TRENDS_TTL = 23 * 60 * 60 * 1000; // 23 hours

function getTrendsCache() {
  try {
    const raw = localStorage.getItem(TRENDS_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > TRENDS_TTL) return null;
    return data;
  } catch { return null; }
}

function setTrendsCache(data) {
  try { localStorage.setItem(TRENDS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

const HEAT_CONFIG = {
  "🔥 Viral now":    { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)",   color: "#ef4444" },
  "📈 Building":     { bg: "rgba(245,158,11,0.08)",   border: "rgba(245,158,11,0.25)",   color: "#f59e0b" },
  "👀 Watch this":   { bg: "rgba(59,130,246,0.08)",   border: "rgba(59,130,246,0.25)",   color: "#3b82f6" },
};

const STOCK_CONFIG = {
  "YES":   { bg: "rgba(34,197,94,0.12)",  color: "#22c55e", label: "✓ Stock it" },
  "MAYBE": { bg: "rgba(245,158,11,0.12)", color: "#f59e0b", label: "? Consider" },
  "NICHE": { bg: "rgba(100,116,139,0.12)",color: "#94a3b8", label: "◦ Niche" },
};

function TrendCard({ trend }) {
  const [open, setOpen] = useState(false);
  const heat   = HEAT_CONFIG[trend.heat]   || HEAT_CONFIG["👀 Watch this"];
  const stock  = STOCK_CONFIG[trend.stock] || STOCK_CONFIG["MAYBE"];

  return (
    <div style={{ marginBottom: 8, borderRadius: 12, border: `1px solid ${heat.border}`, background: heat.bg, overflow: "hidden" }}>
      {/* Header row */}
      <div onClick={() => setOpen(o => !o)} style={{ padding: "12px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div style={{ flex: 1, marginRight: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#ffffff", marginBottom: 3 }}>{trend.product}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{trend.category}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: heat.color, whiteSpace: "nowrap" }}>{trend.heat}</div>
            <div style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: stock.bg, color: stock.color }}>{stock.label}</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5 }}>{trend.why}</div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${heat.border}`, paddingTop: 12, marginTop: 0 }}>
          {trend.recommendation && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Should you stock it?</div>
              <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.5 }}>{trend.recommendation}</div>
            </div>
          )}
          {trend.source && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Where to source</div>
              <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.5 }}>{trend.source}</div>
            </div>
          )}
          {trend.examples && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Specific products</div>
              <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.5 }}>{trend.examples}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TrendsSection() {
  const [trends, setTrends]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError]     = useState(false);

  const fetchTrends = async (force = false) => {
    if (!force) {
      const cached = getTrendsCache();
      if (cached) { setTrends(cached.trends); setLastUpdated(new Date(cached.ts)); return; }
    }
    if (!ANTHROPIC_KEY) { setTrends([]); return; }
    setLoading(true); setError(false);

    const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const prompt = `Today is ${today}. You are a retail trend advisor for a UK Londis convenience store in County Durham.

Search the web for what is currently going viral or trending in the UK that a corner shop should know about. Focus on:
- TikTok viral food and drink products in the UK
- Viral lifestyle/collectible products relevant to a corner shop (e.g. Labubu, Stanley cups, fidget toys)
- New product launches trending on social media in the UK
- "Corner shop haul" type viral content
- UK food trends from Instagram Reels and YouTube Shorts
- Anything on UK Twitter/X trending in food, drink or retail

Return 6-8 trends. For each, provide:
- product: The specific product name (e.g. "Echo Falls Blue Raspberry", "Labubu plush toys", "Prime Hydration")
- category: Short category tag (e.g. "Drinks 🥤", "Snacks 🍟", "Collectibles 🪆", "Confectionery 🍬")
- why: 1-2 sentences on WHY it's trending and what the social media buzz is about
- heat: One of exactly: "🔥 Viral now", "📈 Building", "👀 Watch this"
- stock: One of exactly: "YES", "MAYBE", "NICHE"
- recommendation: 1-2 sentences on whether a UK corner shop should stock it and why
- source: Where to get it — be specific e.g. "Booker, Costco" or "Amazon wholesale" or "Specialist importer — not mainstream yet"
- examples: 2-3 specific product variants or SKUs if known, e.g. "Echo Falls Blue Raspberry 75cl, 187ml"

Respond ONLY with a valid JSON array. No markdown, no backticks, no explanation.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({
          model: AI_MODEL, max_tokens: 2000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const j1 = clean.indexOf("["); const j2 = clean.lastIndexOf("]");
      if (j1 < 0) throw new Error("No trends found");
      const parsed = JSON.parse(clean.slice(j1, j2 + 1));
      const ts = Date.now();
      setTrendsCache({ trends: parsed, ts });
      setTrends(parsed);
      setLastUpdated(new Date(ts));
    } catch (e) {
      console.error("Trends fetch:", e);
      setError(true);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTrends(false); }, []);

  const cacheAge = lastUpdated ? Math.round((Date.now() - lastUpdated) / 3600000) : null;
  const ageLabel = cacheAge === 0 ? "Updated just now" : cacheAge === 1 ? "Updated 1 hour ago" : cacheAge != null ? `Updated ${cacheAge}h ago` : "UK social & viral products";

  return (
    <div style={{ paddingTop: 4 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#ffffff", letterSpacing: -0.3 }}>Trending Now 🔥</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{ageLabel}</div>
        </div>
        <button onClick={() => fetchTrends(true)} disabled={loading} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #1e293b", background: "#0f172a", color: "#64748b", fontSize: 11, fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading ? 0.5 : 1 }}>
          {loading ? "..." : "↻ Refresh"}
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(HEAT_CONFIG).map(([label, cfg]) => (
          <div key={label} style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
            {label}
          </div>
        ))}
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ padding: 14, borderRadius: 12, background: "#0f172a", border: "1px solid #1e293b" }}>
              <div style={{ height: 14, width: "60%", borderRadius: 4, background: "#1e293b", marginBottom: 8 }} />
              <div style={{ height: 10, width: "90%", borderRadius: 4, background: "#1e293b", marginBottom: 6 }} />
              <div style={{ height: 10, width: "70%", borderRadius: 4, background: "#1e293b" }} />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ padding: 24, textAlign: "center", borderRadius: 12, background: "#0f172a", border: "1px solid #1e293b" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📡</div>
          <div style={{ fontSize: 13, color: "#ffffff", fontWeight: 600, marginBottom: 4 }}>Could not load trends</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>Check connection and try again</div>
          <button onClick={() => fetchTrends(true)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3b6fd4", color: "#ffffff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Try Again</button>
        </div>
      )}

      {!ANTHROPIC_KEY && !loading && (
        <div style={{ padding: 20, textAlign: "center", borderRadius: 12, background: "#0f172a", border: "1px solid #1e293b", fontSize: 12, color: "#64748b" }}>
          API key required to load trends
        </div>
      )}

      {/* Trend cards */}
      {!loading && trends && trends.map((t, i) => <TrendCard key={i} trend={t} />)}

      {!loading && trends && trends.length > 0 && (
        <div style={{ textAlign: "center", padding: "12px 0", fontSize: 11, color: "#475569" }}>
          {trends.length} trends · tap any card to expand · refreshes daily
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WEATHER INTELLIGENCE — WeatherSection component
// Paste this entire block into AI.jsx before the closing of the file
// Also export WeatherSection at the bottom
// ═══════════════════════════════════════════════════════════════════

// ─── WEATHER CATEGORY MAP ───────────────────────────────────────
// Maps EPOS categories to weather triggers
// hot = 18°C+, warm = 13-17°C, cold = <8°C, rain = rainy day
const WEATHER_CATEGORY_MAP = {
  hot: ["Soft Drinks", "Cold Drinks", "Drinks", "Energy Drinks", "Water", "Sports Drinks",
        "Beer", "Cider", "Alcohol", "Lager", "Ice Cream", "Frozen", "Ice Lollies",
        "Crisps", "Snacks", "Confectionery"],
  warm: ["Soft Drinks", "Cold Drinks", "Drinks", "Energy Drinks", "Beer", "Cider",
         "Alcohol", "Snacks", "Crisps"],
  cold: ["Hot Drinks", "Tea", "Coffee", "Soup", "Noodles", "Confectionery",
         "Chocolate", "Sweets", "Biscuits", "Comfort Food"],
  rain: ["Hot Drinks", "Tea", "Coffee", "Confectionery", "Chocolate", "Sweets",
         "Biscuits", "Snacks", "Crisps", "Comfort Food"],
};

// UK convenience store typical uplift % by weather vs normal
const UPLIFT = {
  hot:  { min: 40, max: 70 },  // hot days: cold drinks etc +40-70%
  warm: { min: 15, max: 30 },  // warm days: mild uplift
  cold: { min: 10, max: 25 },  // cold snap: hot drinks etc up
  rain: { min: 10, max: 20 },  // rain: slight comfort food bump
};

// ─── WEATHER HELPERS ────────────────────────────────────────────
function classifyDay(maxTemp, description) {
  const desc = (description || "").toLowerCase();
  const isRain = desc.includes("rain") || desc.includes("shower") || desc.includes("drizzle");
  if (maxTemp >= 22) return "hot";
  if (maxTemp >= 18) return "hot";
  if (maxTemp >= 13) return "warm";
  if (maxTemp <= 7)  return "cold";
  return isRain ? "rain" : "normal";
}

function weatherIcon(type, desc) {
  const d = (desc || "").toLowerCase();
  if (d.includes("thunder")) return "⛈️";
  if (d.includes("snow"))    return "❄️";
  if (d.includes("rain") || d.includes("shower") || d.includes("drizzle")) return "🌧️";
  if (type === "hot")  return "☀️";
  if (type === "warm") return "🌤️";
  if (type === "cold") return "🧥";
  return "🌥️";
}

function tempColor(temp) {
  if (temp >= 22) return "#f97316";
  if (temp >= 18) return "#eab308";
  if (temp >= 13) return "#84cc16";
  if (temp <= 7)  return "#60a5fa";
  return "#94a3b8";
}

function dayLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// ─── GET WEATHER-RELEVANT PRODUCTS FROM EPOS ────────────────────
function getWeatherProducts(analysis, weatherType) {
  if (!analysis || weatherType === "normal") return [];
  const targetCats = WEATHER_CATEGORY_MAP[weatherType] || [];
  const items = analysis.items || [];

  // Find products whose category matches weather triggers
  const matched = items.filter(item => {
    const cat = (item.category || "").toLowerCase();
    return targetCats.some(tc => cat.includes(tc.toLowerCase()) || tc.toLowerCase().includes(cat));
  });

  // Sort by revenue, dedupe, take top 8
  const seen = new Set();
  return matched
    .sort((a, b) => (b.gross || 0) - (a.gross || 0))
    .filter(item => {
      if (seen.has(item.product)) return false;
      seen.add(item.product);
      return true;
    })
    .slice(0, 8)
    .map(item => ({
      product: item.product,
      category: item.category,
      weeklyVel: item.qty || 0,
      gross: item.gross || 0,
    }));
}

// ─── LOCATION SETUP ─────────────────────────────────────────────
async function geocodeLocation(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.results?.length) throw new Error("Location not found");
  // Prefer UK results
  const uk = data.results.find(r => r.country_code === "GB") || data.results[0];
  return { name: uk.name, lat: uk.latitude, lon: uk.longitude, country: uk.country };
}

async function fetchForecast(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_sum,weathercode&timezone=Europe%2FLondon&forecast_days=7`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.daily) throw new Error("Weather data unavailable");

  return data.daily.time.map((date, i) => ({
    date,
    maxTemp: Math.round(data.daily.temperature_2m_max[i]),
    precipitation: data.daily.precipitation_sum[i],
    weatherCode: data.daily.weathercode[i],
    description: wmoDescription(data.daily.weathercode[i]),
  }));
}

// WMO weather code to description
function wmoDescription(code) {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 49) return "Foggy";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 84) return "Rain showers";
  if (code <= 94) return "Snow showers";
  return "Thunderstorm";
}

// ─── SAVE/LOAD LOCATION ─────────────────────────────────────────
async function saveClientLocation(clientId, locationName, lat, lon) {
  const { SUPABASE_URL, SUPABASE_KEY } = await import("./config.js");
  const locationStr = JSON.stringify({ name: locationName, lat, lon });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${clientId}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "x-client-id": clientId,
    },
    body: JSON.stringify({ location: locationStr }),
  });
  if (!r.ok) throw new Error("Failed to save location");
}

async function loadClientLocation(clientId) {
  const { SUPABASE_URL, SUPABASE_KEY } = await import("./config.js");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${clientId}&select=location`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "x-client-id": clientId,
    },
  });
  const rows = await r.json();
  if (!rows.length || !rows[0].location) return null;
  try { return JSON.parse(rows[0].location); } catch { return null; }
}

// ─── WEATHER SECTION COMPONENT ──────────────────────────────────
export function WeatherSection({ clientId, analysis }) {
  const [location, setLocation]       = useState(null);
  const [forecast, setForecast]       = useState(null);
  const [loadingLoc, setLoadingLoc]   = useState(true);
  const [loadingFc, setLoadingFc]     = useState(false);
  const [setupMode, setSetupMode]     = useState(false);
  const [query, setQuery]             = useState("");
  const [searching, setSearching]     = useState(false);
  const [searchMsg, setSearchMsg]     = useState(null);
  const [aiPlan, setAiPlan]           = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);

  // Load saved location on mount
  useEffect(() => {
    if (!clientId) { setLoadingLoc(false); return; }
    (async () => {
      try {
        // Check localStorage first for speed
        const cached = localStorage.getItem(`weather_loc_${clientId}`);
        if (cached) {
          const loc = JSON.parse(cached);
          setLocation(loc);
          loadWeather(loc.lat, loc.lon);
        } else {
          const loc = await loadClientLocation(clientId);
          if (loc) {
            setLocation(loc);
            localStorage.setItem(`weather_loc_${clientId}`, JSON.stringify(loc));
            loadWeather(loc.lat, loc.lon);
          }
        }
      } catch (e) { console.error("Load location:", e); }
      setLoadingLoc(false);
    })();
  }, [clientId]);

  const loadWeather = async (lat, lon) => {
    setLoadingFc(true);
    try {
      const fc = await fetchForecast(lat, lon);
      setForecast(fc);
    } catch (e) { console.error("Forecast:", e); }
    setLoadingFc(false);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true); setSearchMsg(null);
    try {
      const result = await geocodeLocation(query.trim());
      // Save to Supabase + localStorage
      await saveClientLocation(clientId, result.name, result.lat, result.lon);
      const loc = { name: result.name, lat: result.lat, lon: result.lon };
      localStorage.setItem(`weather_loc_${clientId}`, JSON.stringify(loc));
      setLocation(loc);
      setSetupMode(false);
      loadWeather(loc.lat, loc.lon);
    } catch (e) { setSearchMsg(e.message || "Could not find location"); }
    setSearching(false);
  };

  const generatePlan = async (dayData) => {
    if (!analysis || !ANTHROPIC_KEY) return;
    setLoadingPlan(true); setAiPlan(null);
    const weatherType = classifyDay(dayData.maxTemp, dayData.description);
    const products = getWeatherProducts(analysis, weatherType);
    const uplift = UPLIFT[weatherType] || { min: 0, max: 0 };

    const prompt = `You are a UK convenience store retail advisor. A store is preparing for upcoming weather.

DATE: ${dayLabel(dayData.date)} (${dayData.date})
WEATHER: ${dayData.description}, ${dayData.maxTemp}°C max
WEATHER TYPE: ${weatherType.toUpperCase()}

STORE'S TOP WEATHER-RELEVANT PRODUCTS (from their actual EPOS data):
${products.map(p => `- ${p.product} (${p.category}): sells ~${p.weeklyVel} units/period, £${p.gross.toFixed(0)} revenue`).join("\n")}

Based on this specific store's actual product mix and the ${weatherType} weather forecast, write a concise preparation plan.

Include:
1. Which specific products from THEIR list to prioritise and by how much (use the ${uplift.min}-${uplift.max}% typical uplift range for ${weatherType} weather)
2. Any shelf positioning or display advice
3. One specific ordering action to take NOW

Keep it under 120 words. Be specific to their actual products — no generic advice. Use bullet points.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: AI_HDR,
        body: JSON.stringify({ model: AI_MODEL, max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      setAiPlan({ text, date: dayData.date });
    } catch (e) { setAiPlan({ text: "Could not generate plan: " + e.message, date: dayData.date }); }
    setLoadingPlan(false);
  };

  // ── LOADING ──
  if (loadingLoc) return (
    <SectionCard title="Weather Intelligence" icon="🌤️">
      <div style={{ padding: 20, textAlign: "center", color: C.textMuted, fontSize: 13 }}>Loading...</div>
    </SectionCard>
  );

  // ── SETUP: no location set ──
  if (!location || setupMode) return (
    <SectionCard title="Weather Intelligence" icon="🌤️">
      <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 16, lineHeight: 1.6 }}>
        Enter your store's town or postcode to get a personalised 7-day weather forecast with stock recommendations based on your actual sales data.
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>STORE LOCATION</div>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setSearchMsg(null); }}
        onKeyDown={e => e.key === "Enter" && handleSearch()}
        placeholder="e.g. Ipswich, IP1 or Norwich"
        style={{ width: "100%", padding: "12px 14px", borderRadius: 10, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 14, outline: "none", fontFamily: "Inter, sans-serif", boxSizing: "border-box", marginBottom: 8 }}
        autoFocus
      />
      {searchMsg && <div style={{ fontSize: 12, color: C.redText, marginBottom: 8 }}>{searchMsg}</div>}
      <button
        onClick={handleSearch}
        disabled={searching || !query.trim()}
        style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: query.trim() ? C.accentLight : C.surface, color: query.trim() ? C.white : C.textMuted, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
      >
        {searching ? "Finding location..." : "Set Location →"}
      </button>
      {location && setupMode && (
        <button onClick={() => setSetupMode(false)} style={{ width: "100%", marginTop: 8, padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.textMuted, fontSize: 13, cursor: "pointer" }}>
          Cancel
        </button>
      )}
    </SectionCard>
  );

  // ── FORECAST VIEW ──
  const notable = forecast ? forecast.filter(d => classifyDay(d.maxTemp, d.description) !== "normal") : [];

  return (
    <div>
      <SectionCard title="Weather Intelligence" icon="🌤️">

        {/* Location header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>📍 {location.name}</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>7-day forecast · auto-updates daily</div>
          </div>
          <button onClick={() => setSetupMode(true)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 11, cursor: "pointer" }}>Change</button>
        </div>

        {/* Loading forecast */}
        {loadingFc && (
          <div style={{ display: "flex", gap: 6 }}>
            {[1,2,3,4,5,6,7].map(i => (
              <div key={i} style={{ flex: 1, height: 72, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }} />
            ))}
          </div>
        )}

        {/* 7-day strip */}
        {forecast && !loadingFc && (
          <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
            {forecast.map((day, i) => {
              const type = classifyDay(day.maxTemp, day.description);
              const isNotable = type !== "normal";
              const isSelected = expandedDay === i;
              return (
                <div
                  key={i}
                  onClick={() => { setExpandedDay(isSelected ? null : i); setAiPlan(null); }}
                  style={{ flex: "0 0 auto", width: 60, padding: "10px 6px", borderRadius: 10, textAlign: "center", cursor: "pointer", border: `1px solid ${isSelected ? C.accentLight : isNotable ? "rgba(234,179,8,0.3)" : C.border}`, background: isSelected ? "rgba(59,111,212,0.15)" : isNotable ? "rgba(234,179,8,0.05)" : C.surface, transition: "all 0.15s" }}
                >
                  <div style={{ fontSize: 9, color: C.textMuted, fontWeight: 600, marginBottom: 4 }}>
                    {i === 0 ? "Today" : new Date(day.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" })}
                  </div>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{weatherIcon(type, day.description)}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: tempColor(day.maxTemp) }}>{day.maxTemp}°</div>
                  {isNotable && (
                    <div style={{ fontSize: 8, marginTop: 3, fontWeight: 700, color: type === "hot" ? "#f97316" : type === "cold" ? "#60a5fa" : type === "rain" ? "#94a3b8" : "#84cc16", textTransform: "uppercase" }}>
                      {type === "hot" ? "Hot" : type === "warm" ? "Warm" : type === "cold" ? "Cold" : "Rain"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Expanded day detail */}
        {forecast && expandedDay !== null && (
          <div style={{ marginTop: 12, padding: "14px", borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
            {(() => {
              const day = forecast[expandedDay];
              const type = classifyDay(day.maxTemp, day.description);
              const products = getWeatherProducts(analysis, type);
              const uplift = UPLIFT[type];
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{dayLabel(day.date)}</div>
                      <div style={{ fontSize: 12, color: C.textMuted }}>{day.description} · {day.maxTemp}°C</div>
                    </div>
                    <div style={{ fontSize: 28 }}>{weatherIcon(type, day.description)}</div>
                  </div>

                  {type === "normal" ? (
                    <div style={{ fontSize: 12, color: C.textMuted }}>Normal trading day — no significant weather impact expected.</div>
                  ) : (
                    <>
                      {/* Uplift banner */}
                      <div style={{ padding: "8px 12px", borderRadius: 8, background: type === "hot" ? "rgba(249,115,22,0.1)" : type === "cold" ? "rgba(96,165,250,0.1)" : "rgba(148,163,184,0.1)", border: `1px solid ${type === "hot" ? "rgba(249,115,22,0.2)" : type === "cold" ? "rgba(96,165,250,0.2)" : "rgba(148,163,184,0.2)"}`, marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: type === "hot" ? "#f97316" : type === "cold" ? "#60a5fa" : "#94a3b8", marginBottom: 2 }}>
                          {type === "hot" ? "🔥 HOT DAY — STOCK UP" : type === "warm" ? "🌤️ WARM DAY — PREP NOW" : type === "cold" ? "🧥 COLD SNAP — PUSH HOT DRINKS" : "🌧️ RAIN DAY — COMFORT PRODUCTS"}
                        </div>
                        {uplift && <div style={{ fontSize: 11, color: C.textSecondary }}>Expect {uplift.min}–{uplift.max}% uplift on weather-sensitive products</div>}
                      </div>

                      {/* Your products to watch */}
                      {products.length > 0 && (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Your Products to Watch</div>
                          {products.slice(0, 5).map((p, i) => {
                            const estUplift = uplift ? Math.round(p.weeklyVel * (uplift.min / 100)) : 0;
                            return (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.divider}` }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 12, color: C.white, fontWeight: 600 }}>{p.product}</div>
                                  <div style={{ fontSize: 10, color: C.textMuted }}>{p.category} · {p.weeklyVel} units/period</div>
                                </div>
                                {estUplift > 0 && (
                                  <div style={{ fontSize: 11, fontWeight: 700, color: C.greenText, background: C.greenDim, padding: "2px 8px", borderRadius: 6 }}>
                                    +{estUplift} est.
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </>
                      )}

                      {/* AI Plan button */}
                      {ANTHROPIC_KEY && (
                        <button
                          onClick={() => generatePlan(day)}
                          disabled={loadingPlan}
                          style={{ width: "100%", marginTop: 12, padding: "10px", borderRadius: 10, border: "none", background: C.accentLight, color: C.white, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: loadingPlan ? 0.7 : 1 }}
                        >
                          {loadingPlan ? "Generating plan..." : "✨ Generate AI Prep Plan"}
                        </button>
                      )}

                      {/* AI Plan output */}
                      {aiPlan && aiPlan.date === day.date && (
                        <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "linear-gradient(135deg, rgba(46,80,144,0.12), rgba(59,130,246,0.06))", border: "1px solid rgba(46,80,144,0.2)" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: C.accentLight, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>✨ AI Prep Plan</div>
                          <div style={{ fontSize: 12, color: C.textPrimary, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiPlan.text}</div>
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}

      </SectionCard>

      {/* Notable days summary */}
      {notable.length > 0 && !loadingFc && (
        <SectionCard title="This Week's Alerts" icon="⚠️">
          {notable.map((day, i) => {
            const type = classifyDay(day.maxTemp, day.description);
            const products = getWeatherProducts(analysis, type);
            const borderCol = type === "hot" ? "rgba(249,115,22,0.3)" : type === "cold" ? "rgba(96,165,250,0.3)" : "rgba(148,163,184,0.3)";
            const bgCol = type === "hot" ? "rgba(249,115,22,0.05)" : type === "cold" ? "rgba(96,165,250,0.05)" : "rgba(148,163,184,0.05)";
            return (
              <div key={i} style={{ padding: "12px 14px", marginBottom: 8, borderRadius: 10, background: bgCol, border: `1px solid ${borderCol}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.white }}>{dayLabel(day.date)} · {weatherIcon(type, day.description)} {day.maxTemp}°C</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>{day.description}</div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: type === "hot" ? "rgba(249,115,22,0.15)" : type === "cold" ? "rgba(96,165,250,0.15)" : "rgba(148,163,184,0.15)", color: type === "hot" ? "#f97316" : type === "cold" ? "#60a5fa" : "#94a3b8" }}>
                    {type.toUpperCase()}
                  </div>
                </div>
                {products.length > 0 && (
                  <div style={{ fontSize: 11, color: C.textSecondary }}>
                    Stock up: {products.slice(0, 3).map(p => p.product).join(", ")}{products.length > 3 ? ` +${products.length - 3} more` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </SectionCard>
      )}
    </div>
  );
}
