// ═══════════════════════════════════════════════════════════════════
// UPLOAD — Upload screen + Manage Uploads
// ═══════════════════════════════════════════════════════════════════
import { useState, useCallback, useRef, useEffect } from "react";
import { C, Badge, Stat, SectionCard, EmptyState, f, fi } from "./components.jsx";
import { parseFile } from "./parser.js";
import { loadUploadsMeta, deleteUpload } from "./supabase.js";

export function UploadScreen({ onDataLoaded, uploads, onCancel }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pendingData, setPendingData] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploadType, setUploadType] = useState("day");
  const [transactions, setTransactions] = useState("");
  const fileRef = useRef();

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError(null); setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const data = parseFile(buf, file.name);
      data.filename = file.name;
      const s = new Date(data.dates.start + "T12:00:00");
      const e = new Date(data.dates.end + "T12:00:00");
      const days = Math.round((e - s) / 86400000) + 1;
      if (days === 1) setUploadType("day"); else if (days <= 8) setUploadType("week"); else setUploadType("month");
      setPendingData(data); setPendingFile(file);
    } catch (e) { setError(e.message || "Failed to read file"); }
    setLoading(false);
  }, []);

  const confirmUpload = () => {
    if (!pendingData) return;
    const trans = transactions ? parseInt(transactions) : null;
    onDataLoaded(pendingData, uploadType, trans);
    setPendingData(null); setPendingFile(null); setTransactions("");
  };

  const cancelUpload = () => { setPendingData(null); setPendingFile(null); setTransactions(""); };

  const dayCount = pendingData?.dates ? Math.max(1, Math.round((new Date(pendingData.dates.end + "T12:00:00") - new Date(pendingData.dates.start + "T12:00:00")) / 86400000) + 1) : 1;
  const totalGross = pendingData ? pendingData.items.reduce((s, i) => s + i.gross, 0) : 0;
  const dateLabel = pendingData?.dates ? (pendingData.dates.start === pendingData.dates.end
    ? new Date(pendingData.dates.start + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : `${new Date(pendingData.dates.start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — ${new Date(pendingData.dates.end + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`) : "";

  return (
    <div style={{ padding: "20px", minHeight: "60vh" }}>
      {onCancel && <button onClick={onCancel} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0", marginBottom: 12, background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 13, fontWeight: 600 }}>← Back to Dashboard</button>}

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${C.accentLight}, ${C.green})`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.white, marginBottom: 4 }}>Upload Sales Data</div>
        <div style={{ fontSize: 12, color: C.textMuted }}>ShopMate Item Sales Report (.xls)</div>
      </div>

      {!pendingData ? (
        <>
          <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }} onClick={() => fileRef.current?.click()} style={{ width: "100%", padding: "36px 20px", borderRadius: 16, cursor: "pointer", border: `2px dashed ${dragging ? C.accentLight : C.border}`, textAlign: "center", background: dragging ? C.accentGlow : C.card }}>
            {loading ? <div style={{ fontSize: 14, color: C.accentLight, fontWeight: 600 }}>Reading file...</div> : <>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📁</div>
              <div style={{ fontSize: 14, color: C.white, fontWeight: 600, marginBottom: 4 }}>Tap to select file</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>or drag & drop</div>
            </>}
          </div>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
          {error && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: C.redDim, border: "1px solid rgba(239,68,68,0.3)", fontSize: 12, color: C.redText }}>{error}</div>}
          {uploads.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Recent ({uploads.length} days)</div>
              {uploads.slice(-5).reverse().map((u, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", marginBottom: 4, borderRadius: 8, background: C.card, border: `1px solid ${C.border}` }}>
                  <div><span style={{ fontSize: 12, color: C.white }}>{u.dates?.start}</span>{u.isEstimated && <span style={{ fontSize: 10, color: C.orangeText, marginLeft: 6 }}>EST</span>}</div>
                  <span style={{ fontSize: 12, color: C.textMuted }}>{fi(u.items.reduce((s, i) => s + i.gross, 0))}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Confirmation step */}
          <div style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 8 }}>📄 {pendingFile?.name}</div>
            <div style={{ fontSize: 12, color: C.textSecondary }}>{dateLabel} · {dayCount} day{dayCount > 1 ? "s" : ""} · {pendingData.items.length} products · {fi(totalGross)}</div>
          </div>

          {/* Upload type */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>What are you uploading?</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ id: "day", label: "Single Day", desc: "Exact figures" }, { id: "week", label: "Week", desc: `÷ ${dayCount} days` }, { id: "month", label: "Month", desc: `÷ ${dayCount} days` }].map(t => (
                <button key={t.id} onClick={() => setUploadType(t.id)} style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer", background: uploadType === t.id ? C.accentLight : C.surface, textAlign: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: uploadType === t.id ? C.white : C.textMuted }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: uploadType === t.id ? "rgba(255,255,255,0.7)" : C.textMuted, marginTop: 2 }}>{t.desc}</div>
                </button>
              ))}
            </div>
            {uploadType !== "day" && (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: C.orangeDim, border: "1px solid rgba(245,158,11,0.2)" }}>
                <div style={{ fontSize: 11, color: C.orangeText }}>⚠️ Data will be split across {dayCount} days and marked as estimated. Upload individual days later for exact figures.</div>
              </div>
            )}
          </div>

          {/* Transactions */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Transactions (optional)</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" value={transactions} onChange={e => setTransactions(e.target.value)} placeholder={uploadType === "day" ? "e.g. 180" : "Total for period"} style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: C.surface, color: C.white, border: `1px solid ${C.border}`, fontSize: 14, outline: "none", fontFamily: "'Inter', sans-serif" }} />
              {transactions && <div style={{ fontSize: 12, color: C.textSecondary, minWidth: 80 }}>Avg basket: {f(totalGross / (parseInt(transactions) || 1))}</div>}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>From ShopMate Portal dashboard</div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={cancelUpload} style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button onClick={confirmUpload} style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: C.accentLight, color: C.white, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Upload {uploadType === "day" ? "Day" : uploadType === "week" ? "Week" : "Month"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ManageUploadsSection({ clientId, onRefresh, onViewDay, onViewMonth }) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    if (clientId) { setLoading(true); const u = await loadUploadsMeta(clientId); setUploads(u); setLoading(false); }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (upload) => {
    setDeleting(upload.id);
    const result = await deleteUpload(upload.id);
    if (result.ok) { setUploads(prev => prev.filter(u => u.id !== upload.id)); if (onRefresh) onRefresh(); }
    setDeleting(null);
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Delete ALL ${uploads.length} uploads? This cannot be undone.`)) return;
    setDeleting("all");
    for (const u of uploads) { await deleteUpload(u.id); }
    setUploads([]); if (onRefresh) onRefresh(); setDeleting(null);
  };

  const handleDeleteMonth = async (monthUploads, monthLabel) => {
    if (!confirm(`Delete all ${monthUploads.length} days in ${monthLabel}? This cannot be undone.`)) return;
    const monthKey = "month-" + monthUploads[0].report_date.slice(0, 7);
    setDeleting(monthKey);
    for (const u of monthUploads) { await deleteUpload(u.id); }
    setUploads(prev => prev.filter(u => !monthUploads.find(m => m.id === u.id)));
    if (onRefresh) onRefresh();
    setDeleting(null);
  };

  const months = {};
  uploads.forEach(u => {
    const m = u.report_date.slice(0, 7);
    if (!months[m]) months[m] = { key: m, label: new Date(u.report_date + "T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }), uploads: [], totalGross: 0 };
    months[m].uploads.push(u); months[m].totalGross += Number(u.total_gross || 0);
  });
  const monthList = Object.values(months).reverse();

  return (
    <SectionCard title="Manage Uploads" icon="📋">
      {loading && <div style={{ textAlign: "center", padding: 20, color: C.textMuted, fontSize: 13 }}>Loading...</div>}
      {!loading && uploads.length === 0 && <EmptyState msg="No uploads yet — tap + Upload to add data" />}

      {uploads.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Stat label="Total Days" value={uploads.length} small />
            <Stat label="Actual" value={uploads.filter(u => !u.is_estimated).length} small />
            <Stat label="Estimated" value={uploads.filter(u => u.is_estimated).length} small />
          </div>
          <button onClick={handleDeleteAll} disabled={deleting === "all"} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: C.redDim, color: C.redText, fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 16, opacity: deleting === "all" ? 0.5 : 1 }}>
            {deleting === "all" ? "Deleting all..." : "🗑️ Delete All Uploads"}
          </button>
        </>
      )}

      {monthList.map((month, mi) => (
        <MonthUploadGroup key={mi} month={month} deleting={deleting} onDelete={handleDelete} onDeleteMonth={handleDeleteMonth} onViewDay={onViewDay} onViewMonth={onViewMonth} />
      ))}
    </SectionCard>
  );
}

// Expandable month group
function MonthUploadGroup({ month, deleting, onDelete, onDeleteMonth, onViewDay, onViewMonth }) {
  const [expanded, setExpanded] = useState(false);
  const isDeletingMonth = deleting === "month-" + month.key;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: expanded ? "10px 10px 0 0" : 10, background: C.surface, border: `1px solid ${C.border}` }}>
        <div onClick={() => setExpanded(!expanded)} style={{ flex: 1, cursor: "pointer" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.white }}>{month.label}</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>{month.uploads.length} days · {fi(month.totalGross)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {onViewMonth && (
            <button onClick={() => onViewMonth(month.key)} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(59,111,212,0.4)", background: "rgba(59,111,212,0.12)", color: C.accentLight, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              View
            </button>
          )}
          <button onClick={() => onDeleteMonth(month.uploads, month.label)} disabled={isDeletingMonth} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.3)", background: C.redDim, color: C.redText, fontSize: 11, fontWeight: 600, cursor: "pointer", opacity: isDeletingMonth ? 0.5 : 1 }}>
            {isDeletingMonth ? "..." : "Delete"}
          </button>
          <span onClick={() => setExpanded(!expanded)} style={{ fontSize: 14, color: C.textMuted, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", cursor: "pointer", paddingLeft: 2 }}>▾</span>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "8px 10px 10px", background: C.surface, borderRadius: "0 0 10px 10px", border: `1px solid ${C.border}`, borderTop: "none" }}>
          {month.uploads.map((u, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 6px", marginBottom: 2, borderRadius: 6, background: C.card, border: `1px solid ${u.is_estimated ? "rgba(245,158,11,0.15)" : C.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: C.white, fontWeight: 600 }}>{new Date(u.report_date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
                  {u.is_estimated && <Badge type="ALERT">EST</Badge>}
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                  {fi(Number(u.total_gross || 0))} · {u.total_qty || 0} items
                  {u.transactions && ` · ${u.transactions} trans`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {onViewDay && (
                  <button onClick={() => onViewDay(u.report_date)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(59,111,212,0.4)", background: "rgba(59,111,212,0.12)", color: C.accentLight, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    View
                  </button>
                )}
                <button onClick={() => { if (confirm(`Delete ${new Date(u.report_date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} data?`)) onDelete(u); }} disabled={deleting === u.id} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.3)", background: C.redDim, color: C.redText, fontSize: 11, fontWeight: 600, cursor: "pointer", opacity: deleting === u.id ? 0.5 : 1 }}>
                  {deleting === u.id ? "..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
