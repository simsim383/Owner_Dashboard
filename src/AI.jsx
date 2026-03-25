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
