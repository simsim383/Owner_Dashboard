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
• Lead with the direct answer
• Reference actual data
• End with one clear action`;
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
      const recent = [...messages, { role: "user", content: msg }].slice(-4);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: AI_HDR,
        body: JSON.stringify({ model: AI_MODEL, max_tokens: 500, system: systemPrompt, messages: recent }),
      });
      const data = await res.json();
      if (data.error) { setMessages(p => [...p, { role: "assistant", content: `API error: ${data.error.message}` }]); setLoading(false); return; }
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "No response.";
      setMessages(p => [...p, { role: "assistant", content: text }]);
    } catch (e) {
      setMessages(p => [...p, { role: "assistant", content: `Connection error: ${e.message}` }]);
    }
    setLoading(false);
    setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }), 100);
  }, [input, loading, messages, systemPrompt]);

  const suggestions = ["What day should I have two staff?", "Most profitable category?", "Which costs should I enter first?", "What should I stock more of?", "Am I losing money anywhere?", "What's my average basket spend?"];

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

      {/* Textarea input instead of single-line input */}
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
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: input.trim() ? C.accentLight : C.surface, color: input.trim() ? C.white : C.textMuted, fontSize: 13, fontWeight: 700, alignSelf: "stretch" }}>Send</button>
      </div>
    </SectionCard>
  );
}

// ─── COMING UP ──────────────────────────────────────────────────
export function ComingUpSection() {
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ANTHROPIC_KEY) { setEvents([]); return; }
    let c = false;
    (async () => {
      setLoading(true);
      try {
        // Calculate key dates to feed to the AI so it doesn't hallucinate
        const now = new Date();
        const todayStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        const year = now.getFullYear();
        
        // Find last Friday of current month (payday)
        const lastDay = new Date(year, now.getMonth() + 1, 0);
        while (lastDay.getDay() !== 5) lastDay.setDate(lastDay.getDate() - 1);
        const paydayStr = lastDay.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
        const paydayDays = Math.max(0, Math.round((lastDay - now) / 86400000));

        const prompt = `Today is ${todayStr}. List 6-8 upcoming events for a UK convenience store in County Durham (Peterlee/Horden). 

KEY DATES TO INCLUDE (calculate days from today yourself):
- Payday Friday: ${paydayStr} (${paydayDays} days away)
- Mother's Day UK 2026: 22 March 2026
- Good Friday 2026: 3 April 2026
- Easter Sunday 2026: 5 April 2026
- Easter Monday 2026: 6 April 2026
- Ramadan 2026: starts approximately 27 February 2026
- Eid al-Fitr 2026: approximately 29 March 2026
- May Bank Holiday 2026: 4 May 2026
- Spring Bank Holiday 2026: 25 May 2026

RULES:
1. URGENT = 0-3 days away. PLAN = 4-14 days. AWARE = 15+ days.
2. Calculate "days" as actual days from today ${todayStr}.
3. Give specific stock advice in the "impact" field.
4. Only include events that are within the next 6 weeks.

Respond with ONLY a JSON array: [{event, date, days, impact, priority}]
"days" should be like "3 days" or "2 weeks"`;

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: AI_HDR,
          body: JSON.stringify({ model: AI_MODEL, max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
        });
        if (!res.ok) { console.error("Coming Up API:", res.status); if (!c) setEvents([]); setLoading(false); return; }
        const data = await res.json();
        if (data.error) { console.error("Coming Up error:", data.error); if (!c) setEvents([]); setLoading(false); return; }
        const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
        const clean = text.replace(/```json|```/g, "").trim();
        try { if (!c) setEvents(JSON.parse(clean)); }
        catch { console.error("Coming Up parse fail:", clean.slice(0, 300)); if (!c) setEvents([]); }
      } catch (e) { console.error("Coming Up:", e); if (!c) setEvents([]); }
      if (!c) setLoading(false);
    })();
    return () => { c = true; };
  }, []);

  return (
    <SectionCard title="Coming Up" icon="📅">
      {loading && <div style={{ textAlign: "center", padding: 20, color: C.textMuted, fontSize: 13 }}>Loading events...</div>}
      {!ANTHROPIC_KEY && <EmptyState msg="Add API key to enable Coming Up" />}
      {events?.length === 0 && ANTHROPIC_KEY && <EmptyState msg="Could not load events" />}
      {events?.map((e, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 14px", marginBottom: 6, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
          <div style={{ flex: 1, marginRight: 8 }}>
            <div style={{ fontSize: 13, color: C.white, fontWeight: 600, marginBottom: 2 }}>{e.event}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{e.date} · {e.days}</div>
            <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 4, lineHeight: 1.4 }}>{e.impact}</div>
          </div>
          <Badge type={e.priority === "URGENT" ? "ALERT" : e.priority === "PLAN" ? "MED" : "OK"}>{e.priority}</Badge>
        </div>
      ))}
    </SectionCard>
  );
}

// ─── NEWS ───────────────────────────────────────────────────────
export function NewsSection() {
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ANTHROPIC_KEY) { setNews([]); return; }
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: AI_HDR,
          body: JSON.stringify({
            model: AI_MODEL, max_tokens: 1000,
            messages: [{ role: "user", content: "Search for 5 recent UK convenience store and grocery retail news stories from this week. Include stories about: supplier price changes, Booker/Nisa/Londis/Premier promotions, wholesale deals, tobacco/vape regulation, and grocery trends. For each: title, source (publication name), summary (1 sentence), url (real URL), timeAgo. ONLY respond with a JSON array. No markdown, no backticks, no explanation." }],
            tools: [{ type: "web_search_20250305", name: "web_search" }],
          }),
        });
        if (!res.ok) { console.error("News API:", res.status); if (!c) setNews([]); setLoading(false); return; }
        const data = await res.json();
        if (data.error) { console.error("News error:", data.error); if (!c) setNews([]); setLoading(false); return; }
        const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
        const clean = text.replace(/```json|```/g, "").trim();
        try { if (!c && clean) setNews(JSON.parse(clean).slice(0, 5)); else if (!c) setNews([]); }
        catch { console.error("News parse fail:", clean.slice(0, 200)); if (!c) setNews([]); }
      } catch (e) { console.error("News:", e); if (!c) setNews([]); }
      if (!c) setLoading(false);
    })();
    return () => { c = true; };
  }, []);

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.white }}>Retail News</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>UK convenience & grocery</div>
        </div>
      </div>
      {loading && <div style={{ textAlign: "center", padding: 32, color: C.textMuted, fontSize: 13 }}>Loading news...</div>}
      {!ANTHROPIC_KEY && <EmptyState msg="Add API key to enable News" />}
      {news?.length === 0 && ANTHROPIC_KEY && <EmptyState msg="Could not load news — try refreshing" />}
      {news?.map((item, i) => (
        <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block" }}>
          <div style={{ padding: "14px 16px", marginBottom: 8, borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.accentLight, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.source}</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>{item.timeAgo || ""}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.white, lineHeight: 1.4, marginBottom: 4 }}>{item.title}</div>
            {item.summary && <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.4 }}>{item.summary}</div>}
          </div>
        </a>
      ))}
    </div>
  );
}
