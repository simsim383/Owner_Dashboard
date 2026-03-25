// ═══════════════════════════════════════════════════════════════════
// AI — Chat, Coming Up, News
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { C, Badge, SectionCard, EmptyState, Insight, f, fi, pct } from "./components.jsx";
import { ANTHROPIC_KEY, AI_MODEL, AI_HDR } from "./config.js";

// ─── AI CHAT ────────────────────────────────────────────────────
export function AIChatSection({ analysis, allDays }) {
  const [messages, setMessages] = useState([]);
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
    const top = [...analysis.items].sort((a, b) => b.gross - a.gross).slice(0, 30).map(i => `${i.product}(${i.category}):qty=${i.qty},£${i.gross.toFixed(2)},${i.hasCost ? i.grossMargin?.toFixed(1) + "%" : "UNTRACKED"}`).join("\n");
    return `You are an expert retail advisor for a UK convenience store. ${allDays.length} days of data.

SUMMARY: £${summary.totalGross.toFixed(0)} rev, £${summary.trackedProfit.toFixed(0)} profit, ${summary.trackedMargin.toFixed(1)}% margin, ${summary.productCount} products, ${summary.untrackedCount} untracked (£${summary.untrackedRevenue.toFixed(0)}).

DAILY:\n${dailyBreakdown}

CATEGORIES:\n${catS}

TOP 30:\n${top}

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
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask about your data..." style={{ flex: 1, padding: "12px 14px", borderRadius: 10, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: "'Inter', sans-serif" }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: "12px 18px", borderRadius: 10, border: "none", background: input.trim() ? C.accentLight : C.surface, color: input.trim() ? C.white : C.textMuted, fontSize: 13, fontWeight: 700, alignSelf: "stretch" }}>Send</button>
      </div>
    </SectionCard>
  );
}

// ─── HARDCODED EVENTS DATABASE ───────────────────────────────────
const EVENTS_2026 = [
  // APRIL
  { date: "2026-04-03", event: "Good Friday", icon: "🐣", rawImpact: "Bank holiday — expect high footfall. Stock up on confectionery, soft drinks, alcohol, snacks and BBQ essentials. Easter eggs should be front of store." },
  { date: "2026-04-05", event: "Easter Sunday", icon: "🐣", rawImpact: "Stock chocolate eggs, hot cross buns, alcohol for family gatherings. Many families visiting — push multipacks and sharing bags." },
  { date: "2026-04-06", event: "Easter Monday (Bank Holiday)", icon: "🐣", rawImpact: "Last bank holiday of Easter — BBQ weather purchases, snacks, drinks. Keep alcohol and confectionery well stocked." },
  { date: "2026-04-24", event: "Payday (Last Friday April)", icon: "💰", rawImpact: "Payday uplift — customers will spend more freely. Ensure premium products, alcohol, tobacco and treats are well stocked and faced up." },
  // MAY
  { date: "2026-05-04", event: "Early May Bank Holiday", icon: "🏖️", rawImpact: "Long weekend — stock BBQ items, soft drinks, alcohol, crisps and snacks. Footfall will spike on the day." },
  { date: "2026-05-17", event: "Premier League Final Day", icon: "⚽", rawImpact: "Big viewing occasion — push beer, cider, crisps, pizza snacks and party food. Pre-match and half-time trade will be strong." },
  { date: "2026-05-23", event: "FA Cup Final", icon: "🏆", rawImpact: "Major national viewing event — stock alcohol, snacks, soft drinks. Similar profile to Champions League final day trade." },
  { date: "2026-05-25", event: "Spring Bank Holiday", icon: "🌸", rawImpact: "Long weekend — BBQ, drinks, snacks. Pair with half term for a strong spending week. Ensure freezer and drinks chiller are full." },
  { date: "2026-05-29", event: "Payday (Last Friday May)", icon: "💰", rawImpact: "Payday — premium spend uplift. Alcohol, tobacco, meal deals and treats. Good week to push premium lines." },
  // JUNE
  { date: "2026-06-06", event: "Champions League Final", icon: "⚽", rawImpact: "Biggest club game of the year — strong beer, cider, snacks trade. Stock up the evening before. Viewing parties boost multipacks." },
  { date: "2026-06-11", event: "FIFA World Cup Starts", icon: "🌍", rawImpact: "Month-long tournament — sustained uplift on beer, crisps, soft drinks throughout. Flag displays, face paint. England games will spike trade significantly." },
  { date: "2026-06-21", event: "Father's Day", icon: "👨", rawImpact: "Stock beer, spirits, snacks and card/gift items. Last-minute buyers peak on the day — keep alcohol visible and accessible." },
  { date: "2026-06-26", event: "Payday (Last Friday June)", icon: "💰", rawImpact: "Summer payday — customers in good spirits with World Cup on. Alcohol and snacks will be key sellers this week." },
  // JULY
  { date: "2026-07-04", event: "Wimbledon Finals Weekend", icon: "🎾", rawImpact: "Stock Pimm's, strawberries and cream items, soft drinks, Prosecco. British sporting occasion with strong impulse buying." },
  { date: "2026-07-19", event: "Schools Break Up", icon: "🎒", rawImpact: "Summer holidays begin — footfall increases throughout the day. Stock up on ice creams, cold drinks, snacks and sweets for kids." },
  { date: "2026-07-31", event: "Payday (Last Friday July)", icon: "💰", rawImpact: "First summer holiday payday — high spend period. Alcohol, soft drinks, ice cream, BBQ essentials all prime. World Cup knockouts likely running too." },
  // AUGUST
  { date: "2026-08-02", event: "Community Shield", icon: "⚽", rawImpact: "Football returns — stock beer and snacks for the occasion. Signals the start of football season spending." },
  { date: "2026-08-15", event: "Premier League Season Starts", icon: "⚽", rawImpact: "Weekly football trade resumes — Saturday and Sunday beer, crisps and snacks uplift returns for the season. Key sustained revenue driver." },
  { date: "2026-08-28", event: "Payday (Last Friday August)", icon: "💰", rawImpact: "Bank holiday weekend payday — double impact. Keep all categories stocked. One of the biggest trading weekends of summer." },
  { date: "2026-08-31", event: "Summer Bank Holiday", icon: "🌞", rawImpact: "Last bank holiday of summer — BBQ, alcohol, cold drinks. Back to school week after so families making the most of it." },
  // SEPTEMBER
  { date: "2026-09-05", event: "Back to School", icon: "🎒", rawImpact: "Stock school snacks, lunch fillers, cereal bars, drinks pouches. Morning footfall increases as routines restart." },
  { date: "2026-09-25", event: "Payday (Last Friday September)", icon: "💰", rawImpact: "Autumn payday — spending returns to normal pattern. Ensure alcohol and tobacco are stocked for the weekend." },
  // OCTOBER
  { date: "2026-10-24", event: "Half Term Starts", icon: "🍂", rawImpact: "Week off school — daytime footfall from families increases. Snacks, sweets, soft drinks and activities push. Stock sweets ahead of Halloween." },
  { date: "2026-10-30", event: "Payday (Last Friday October)", icon: "💰", rawImpact: "Pre-Halloween payday — customers buying sweets, costumes, decorations. One of the best weeks for confectionery sales." },
  { date: "2026-10-31", event: "Halloween", icon: "🎃", rawImpact: "Stock pick and mix, bags of sweets, chocolate treats. Heavy footfall from early afternoon. Keep confectionery stocked throughout the day." },
  // NOVEMBER
  { date: "2026-11-05", event: "Bonfire Night", icon: "🎆", rawImpact: "Stock sparklers, hot drinks, mulled wine, snacks. Evening trade spike — families gathering before and after firework events." },
  { date: "2026-11-27", event: "Black Friday & Payday", icon: "🛍️", rawImpact: "Big spending day coincides with payday — stock premium products, alcohol, tobacco and treats. Customers in a buying mood." },
  // DECEMBER
  { date: "2026-12-05", event: "Christmas Peak Begins", icon: "🎄", rawImpact: "Christmas trade starts in earnest — stock mince pies, selection boxes, cards, wrapping essentials, alcohol. Daily footfall increases from here." },
  { date: "2026-12-24", event: "Christmas Eve", icon: "🎅", rawImpact: "Biggest impulse day of the year — last-minute alcohol, snacks, soft drinks, batteries, cards. Be fully stocked by 8am. Expect queues." },
  { date: "2026-12-25", event: "Christmas Day", icon: "🎁", rawImpact: "If open — last-minute emergency items only. Milk, bread, alcohol forgotten at home. Premium charge opportunity on essentials." },
  { date: "2026-12-26", event: "Boxing Day (Football)", icon: "⚽", rawImpact: "Full Premier League programme — stock beer, snacks, soft drinks. Strong afternoon and evening trade around kick-offs." },
  { date: "2026-12-31", event: "New Year's Eve", icon: "🥂", rawImpact: "Stock Prosecco, Champagne, beer, cider, soft drinks, snacks and party food. Trade builds from mid-afternoon. One of the top 5 alcohol days of the year." },
];

function calcDays(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = new Date(dateStr + "T00:00:00");
  return Math.round((event - today) / 86400000);
}

function getPriority(daysAway) {
  if (daysAway < 0) return null; // past
  if (daysAway <= 3) return "URGENT";
  if (daysAway <= 14) return "PLAN";
  return "AWARE";
}

function getUpcomingEvents() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return EVENTS_2026
    .map(e => ({ ...e, daysAway: calcDays(e.date) }))
    .filter(e => e.daysAway >= 0 && e.daysAway <= 60)
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 8);
}

function formatDaysAway(n) {
  if (n === 0) return "TODAY";
  if (n === 1) return "Tomorrow";
  return `${n} days`;
}

function formatEventDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// ─── COMING UP ──────────────────────────────────────────────────
export function ComingUpSection() {
  const [tick, setTick] = useState(0); // forces recalculation of days on refresh
  const [impacts, setImpacts] = useState({}); // AI-generated impacts keyed by date
  const [loadingImpacts, setLoadingImpacts] = useState(false);

  const events = useMemo(() => getUpcomingEvents(), [tick]);

  // Generate AI stock advice for the upcoming events
  const generateImpacts = useCallback(async () => {
    if (!ANTHROPIC_KEY || events.length === 0) return;
    setLoadingImpacts(true);
    try {
      const eventList = events.map(e => `- ${e.event} (${formatEventDate(e.date)}, ${formatDaysAway(e.daysAway)}): ${e.rawImpact}`).join("\n");
      const prompt = `You are a stock advisor for a UK Londis convenience store in County Durham (working class area, loyal regular customers).

For each of these upcoming events, write ONE short punchy sentence (max 12 words) of specific stock advice. Focus on the 2-3 most important products to have ready.

Events:
${eventList}

Respond ONLY with a JSON object where keys are event names and values are the stock advice string. No markdown, no backticks.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({ model: AI_MODEL, max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) { setLoadingImpacts(false); return; }
      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      try {
        const parsed = JSON.parse(clean);
        setImpacts(parsed);
      } catch { /* use rawImpact fallback */ }
    } catch (e) { console.error("Coming Up impacts:", e); }
    setLoadingImpacts(false);
  }, [events]);

  useEffect(() => { generateImpacts(); }, [tick]);

  const handleRefresh = () => setTick(t => t + 1);

  return (
    <SectionCard title="Coming Up" icon="📅">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.textMuted }}>Next 8 events · tap refresh to update days</div>
        <button onClick={handleRefresh} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
          ↻ Refresh
        </button>
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
                {formatEventDate(e.date)} · <span style={{ color: priority === "URGENT" ? C.redText : priority === "PLAN" ? C.orangeText : C.textMuted, fontWeight: 600 }}>{formatDaysAway(e.daysAway)}</span>
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
// Uses free RSS-to-JSON proxies for real UK retail news — no API key needed

const RSS_FEEDS = [
  {
    name: "The Grocer",
    url: "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.thegrocer.co.uk%2Frss",
    color: "#2563eb",
  },
  {
    name: "Better Retailing",
    url: "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fbetterretailing.com%2Ffeed",
    color: "#16a34a",
  },
  {
    name: "Convenience Store",
    url: "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.conveniencestore.co.uk%2Frss",
    color: "#9333ea",
  },
];

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const then = new Date(dateStr);
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function stripHtml(str) {
  return (str || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

export function NewsSection() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchNews = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const results = await Promise.allSettled(
        RSS_FEEDS.map(feed =>
          fetch(feed.url)
            .then(r => r.json())
            .then(data => (data.items || []).slice(0, 4).map(item => ({
              title: stripHtml(item.title),
              summary: stripHtml(item.description || item.content || "").slice(0, 120) + "…",
              url: item.link,
              source: feed.name,
              sourceColor: feed.color,
              pubDate: item.pubDate,
              timeAgo: timeAgo(item.pubDate),
            })))
        )
      );

      const all = results
        .filter(r => r.status === "fulfilled")
        .flatMap(r => r.value)
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
        .slice(0, 10);

      if (all.length === 0) { setError(true); } else { setArticles(all); }
      setLastUpdated(new Date());
    } catch (e) {
      console.error("News fetch:", e);
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchNews(); }, []);

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

      {/* Source badges */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {RSS_FEEDS.map(f => (
          <div key={f.name} style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: f.color + "20", color: f.color, border: `1px solid ${f.color}40` }}>
            {f.name}
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ padding: "16px", borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
              <div style={{ height: 10, width: "40%", borderRadius: 5, background: C.surface, marginBottom: 10 }} />
              <div style={{ height: 14, width: "90%", borderRadius: 5, background: C.surface, marginBottom: 8 }} />
              <div style={{ height: 10, width: "70%", borderRadius: 5, background: C.surface }} />
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: 20, textAlign: "center", borderRadius: 12, background: C.surface, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
          <div style={{ fontSize: 13, color: C.white, fontWeight: 600, marginBottom: 4 }}>Could not load news</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>Check your connection and try again</div>
          <button onClick={fetchNews} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.accentLight, color: C.white, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Try Again</button>
        </div>
      )}

      {!loading && !error && articles.map((item, i) => (
        <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block", marginBottom: 8 }}>
          <div style={{ padding: "14px 16px", borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, transition: "border-color 0.15s" }}>
            {/* Source + time row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.sourceColor, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: item.sourceColor, textTransform: "uppercase", letterSpacing: 0.8 }}>{item.source}</span>
              </div>
              <span style={{ fontSize: 10, color: C.textMuted }}>{item.timeAgo}</span>
            </div>
            {/* Headline */}
            <div style={{ fontSize: 14, fontWeight: 700, color: C.white, lineHeight: 1.4, marginBottom: 6 }}>{item.title}</div>
            {/* Summary */}
            {item.summary && item.summary !== "…" && (
              <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{item.summary}</div>
            )}
            {/* Read more */}
            <div style={{ fontSize: 11, color: item.sourceColor, fontWeight: 600, marginTop: 8 }}>Read more →</div>
          </div>
        </a>
      ))}

      {!loading && !error && articles.length > 0 && (
        <div style={{ textAlign: "center", padding: "12px 0", fontSize: 11, color: C.textMuted }}>
          {articles.length} stories from {RSS_FEEDS.length} sources
        </div>
      )}
    </div>
  );
}
