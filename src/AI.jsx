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

    // ── Date context ────────────────────────────────────────────
    // Work out the date range covered and how many days
    const sortedDays = [...allDays].sort((a, b) =>
      (a.dates?.start || "").localeCompare(b.dates?.start || "")
    );
    const firstDay = sortedDays[0]?.dates?.start || null;
    const lastDay = sortedDays[sortedDays.length - 1]?.dates?.start || null;
    const numDays = allDays.length;
    const today = new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const daysUntilEndOfMay = (() => {
      const now = new Date();
      const endOfMay = new Date(now.getFullYear(), 4, 31); // May 31
      if (now > endOfMay) {
        // If we're past May, target end of May next year
        const nextMay = new Date(now.getFullYear() + 1, 4, 31);
        return Math.ceil((nextMay - now) / (1000 * 60 * 60 * 24));
      }
      return Math.ceil((endOfMay - now) / (1000 * 60 * 60 * 24));
    })();

    // ── Daily breakdown ──────────────────────────────────────────
    const dailyBreakdown = sortedDays.map(d => {
      const g = d.items.reduce((s, i) => s + i.gross, 0);
      const q = d.items.reduce((s, i) => s + i.qty, 0);
      const p = d.items.filter(i => i.hasCost).reduce((s, i) => s + (i.grossProfit || 0), 0);
      const day = d.dates ? new Date(d.dates.start + "T12:00:00") : null;
      return `${day ? day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "?"}: £${g.toFixed(0)} rev, ${q} units, £${p.toFixed(0)} profit${d.transactions ? `, ${d.transactions} trans, £${(g / d.transactions).toFixed(2)} basket` : ""}`;
    }).join("\n");

    // ── Category summary ─────────────────────────────────────────
    const catS = categories.map(c =>
      `${c.name}: £${c.gross.toFixed(0)} (${c.pctRev.toFixed(0)}%), ${c.margin.toFixed(1)}% margin, ${c.qty} units, ${c.count} products`
    ).join("\n");

    // ── ALL products, grouped by category ────────────────────────
    // This is the critical fix: send ALL products, not just top 30
    // Group by category so AI can answer category-specific questions accurately
    const productsByCategory = {};
    analysis.items.forEach(i => {
      if (!productsByCategory[i.category]) productsByCategory[i.category] = [];
      productsByCategory[i.category].push(i);
    });

    // Sort each category's products by qty descending
    Object.keys(productsByCategory).forEach(cat => {
      productsByCategory[cat].sort((a, b) => b.qty - a.qty);
    });

    // Build the product data string — all products with key metrics
    // Format: PRODUCT(category):qty=N,rev=£X,margin=Y%|UNTRACKED
    const allProductsStr = Object.entries(productsByCategory)
      .sort(([, a], [, b]) => b.reduce((s, i) => s + i.gross, 0) - a.reduce((s, i) => s + i.gross, 0))
      .map(([cat, items]) => {
        const catTotal = items.reduce((s, i) => s + i.gross, 0);
        const lines = items.map(i =>
          `  ${i.product}:qty=${i.qty},rev=£${i.gross.toFixed(2)}${i.hasCost ? `,margin=${i.grossMargin?.toFixed(1)}%,profit=£${(i.grossProfit || 0).toFixed(2)}` : ",UNTRACKED"}`
        ).join("\n");
        return `[${cat} — £${catTotal.toFixed(0)} total, ${items.length} products]\n${lines}`;
      }).join("\n\n");

    // ── Daily velocity for ordering calculations ─────────────────
    // Per-product daily average based on actual days of data
    const velocityNote = numDays > 0
      ? `DATA COVERS ${numDays} DAY${numDays > 1 ? "S" : ""} (${firstDay || "?"} to ${lastDay || "?"}). ` +
        `To calculate daily rate: divide any product's qty by ${numDays}. ` +
        `To calculate how many to order for N days: (qty ÷ ${numDays}) × N, then round up to case size.`
      : "NUMBER OF DAYS UNKNOWN — cannot calculate daily rates.";

    return `You are an expert retail advisor for a UK convenience store. Answer questions based ONLY on the data below.

TODAY: ${today}
DAYS UNTIL END OF MAY: ${daysUntilEndOfMay}
${velocityNote}

DATA PERIOD: ${firstDay || "unknown"} to ${lastDay || "unknown"} (${numDays} days)

STORE SUMMARY:
• Revenue: £${summary.totalGross.toFixed(0)}
• Tracked profit: £${summary.trackedProfit.toFixed(0)} at ${summary.trackedMargin.toFixed(1)}% margin
• Products sold: ${summary.productCount} (${summary.untrackedCount} untracked = £${summary.untrackedRevenue.toFixed(0)})

DAILY BREAKDOWN:
${dailyBreakdown}

CATEGORIES:
${catS}

ALL PRODUCTS (sorted by qty within each category, highest first = best sellers, lowest last = worst sellers):
${allProductsStr}

ORDERING CALCULATION METHOD:
When asked "how many cases of X to last until [date]":
1. Find X in the product list above and note its qty over ${numDays} days
2. Calculate daily rate = qty ÷ ${numDays} (round to 1 decimal)
3. Calculate days needed = days until that date from today
4. Calculate total units needed = daily rate × days needed
5. Calculate cases = ceil(total units ÷ case size)
6. Show your working: "X sold Y units over ${numDays} days = Z/day. To last N days = Y×Z = W units = C cases of size S"
Always show the calculation steps so the owner can verify.

RULES:
• Use bullet points, bold key numbers
• Keep under 200 words
• Lead with the direct answer, then supporting data
• Reference actual product names and numbers from the data
• End with one clear action
• For "worst selling" questions: look at the LOWEST qty items within that category from the product list above
• For "best selling" questions: look at the HIGHEST qty items within that category
• NEVER suggest price increases on price-marked items (any product with "Pm" in its name e.g. Pm279, Pm219 — fixed price on pack)
• NEVER suggest price increases on tobacco or cigarettes
• NEVER suggest milk as a price increase candidate unless specifically asked
• When asked about pricing, only suggest NON-price-marked, non-tobacco items
• If you cannot find a product in the data, say so clearly — do not guess`;
  }, [analysis, allDays]);

  const send = useCallback(async () => {
    if (!input.trim() || loading) return;
    let msg = input.trim().slice(0, 500);
    setInput("");
    setMessages(p => [...p, { role: "user", content: msg }]);
    setLoading(true);

    if (!ANTHROPIC_KEY) {
      setMessages(p => [...p, { role: "assistant", content: "API key not configured. Add VITE_ANTHROPIC_KEY in Vercel environment variables." }]);
      setLoading(false); return;
    }

    try {
      const recent = [...messages, { role: "user", content: msg }].slice(-6);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({ model: AI_MODEL, max_tokens: 600, system: systemPrompt, messages: recent }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages(p => [...p, { role: "assistant", content: `API error: ${data.error.message}` }]);
        setLoading(false); return;
      }
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "No response.";
      setMessages(p => [...p, { role: "assistant", content: text }]);
    } catch (e) {
      setMessages(p => [...p, { role: "assistant", content: `Connection error: ${e.message}` }]);
    }
    setLoading(false);
    setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }), 100);
  }, [input, loading, messages, systemPrompt]);

  const suggestions = [
    "What's my worst selling wine this week?",
    "How many cases of Red Bull 250ml should I order to last until end of May?",
    "What day should I have two staff?",
    "Most profitable category?",
    "Which costs should I enter first?",
    "Am I losing money anywhere?",
  ];

  return (
    <SectionCard title="AI Assistant" icon="🤖" accent="rgba(59,130,246,0.08)">
      <div ref={chatRef} style={{ maxHeight: 400, overflowY: "auto", marginBottom: 12 }}>
        {messages.length === 0 && (
          <div>
            <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 12, lineHeight: 1.5 }}>Ask me anything about your sales data.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => setInput(s)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.textSecondary, fontSize: 11, cursor: "pointer", lineHeight: 1.3 }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 10, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "85%", padding: "10px 14px", borderRadius: 12, fontSize: 13, lineHeight: 1.6, background: m.role === "user" ? C.accentLight : C.surface, color: m.role === "user" ? C.white : C.textPrimary, border: m.role === "user" ? "none" : `1px solid ${C.border}`, whiteSpace: "pre-wrap" }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 4, padding: "8px 14px" }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: 4, background: C.accentLight, opacity: 0.5, animation: `pulse 1s ease-in-out ${i * 0.2}s infinite` }} />)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value.slice(0, 500))}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask about your sales..."
          rows={2}
          maxLength={500}
          style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: "'Inter', sans-serif", resize: "none", lineHeight: 1.4 }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{ padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: input.trim() ? C.accentLight : C.surface, color: input.trim() ? C.white : C.textMuted, fontWeight: 700, fontSize: 13, transition: "all 0.15s", flexShrink: 0 }}
        >
          {loading ? "..." : "Ask"}
        </button>
      </div>
      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6 }}>
        {allDays.length} day{allDays.length !== 1 ? "s" : ""} of data · {analysis.items.length} products · Press Enter to send
      </div>
    </SectionCard>
  );
}

// ─── COMING UP ──────────────────────────────────────────────────
export function ComingUpSection({ analysis, allDays }) {
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true); setError(null);
    if (!ANTHROPIC_KEY) { setError("API key not configured."); setLoading(false); return; }
    const today = new Date();
    const in6weeks = new Date(today); in6weeks.setDate(today.getDate() + 42);
    const fmt = d => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({
          model: AI_MODEL, max_tokens: 800,
          messages: [{
            role: "user",
            content: `You are a UK convenience store advisor. List 6-8 upcoming events, dates, or occasions between ${fmt(today)} and ${fmt(in6weeks)} that are relevant for a UK convenience store to prepare stock for. Include: public holidays, sporting events, school holidays, seasonal occasions. For each give: event name, date, and 2-3 specific products to stock up on. Format as JSON array: [{"event":"...","date":"...","products":["...","...","..."]}]. Return ONLY the JSON array, no other text.`
          }]
        }),
      });
      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "[]";
      const clean = text.replace(/```json|```/g, "").trim();
      setEvents(JSON.parse(clean));
    } catch (e) {
      setError("Could not load events: " + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, []);

  if (loading) return <SectionCard title="Coming Up" icon="📅"><EmptyState msg="Loading upcoming events..." /></SectionCard>;
  if (error) return <SectionCard title="Coming Up" icon="📅"><EmptyState msg={error} /></SectionCard>;
  if (!events?.length) return <SectionCard title="Coming Up" icon="📅"><EmptyState msg="No events loaded." /></SectionCard>;

  return (
    <SectionCard title="Coming Up — Next 6 Weeks" icon="📅">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {events.map((e, i) => (
          <div key={i} style={{ padding: "12px 14px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.white }}>{e.event}</div>
              <div style={{ fontSize: 11, color: C.textMuted, flexShrink: 0, marginLeft: 8 }}>{e.date}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(e.products || []).map((p, j) => (
                <span key={j} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: C.card, color: C.textSecondary, border: `1px solid ${C.divider}` }}>{p}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button onClick={fetchEvents} style={{ marginTop: 12, width: "100%", padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.textMuted, fontSize: 12, cursor: "pointer" }}>
        Refresh Events
      </button>
    </SectionCard>
  );
}

// ─── NEWS ───────────────────────────────────────────────────────
export function NewsSection() {
  const [articles, setArticles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchNews = useCallback(async () => {
    setLoading(true); setError(null);
    if (!ANTHROPIC_KEY) { setError("API key not configured."); setLoading(false); return; }
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({
          model: AI_MODEL, max_tokens: 800,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: "Search for the latest UK convenience store and independent retail news from the past 2 weeks. Find 5 relevant articles. Return as JSON array: [{\"title\":\"...\",\"summary\":\"...\",\"source\":\"...\",\"url\":\"...\"}]. ONLY return the JSON array."
          }]
        }),
      });
      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "[]";
      const clean = text.replace(/```json|```/g, "").trim();
      setArticles(JSON.parse(clean));
    } catch (e) {
      setError("Could not load news: " + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchNews(); }, []);

  if (loading) return <SectionCard title="Retail News" icon="📰"><EmptyState msg="Loading latest news..." /></SectionCard>;
  if (error) return <SectionCard title="Retail News" icon="📰"><EmptyState msg={error} /></SectionCard>;
  if (!articles?.length) return <SectionCard title="Retail News" icon="📰"><EmptyState msg="No articles loaded." /></SectionCard>;

  return (
    <SectionCard title="Retail News" icon="📰">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {articles.map((a, i) => (
          <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "12px 14px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, textDecoration: "none" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.white, marginBottom: 4 }}>{a.title}</div>
            <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5, marginBottom: 6 }}>{a.summary}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{a.source}</div>
          </a>
        ))}
      </div>
      <button onClick={fetchNews} style={{ marginTop: 12, width: "100%", padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.textMuted, fontSize: 12, cursor: "pointer" }}>
        Refresh News
      </button>
    </SectionCard>
  );
}
