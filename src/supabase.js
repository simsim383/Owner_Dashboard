// ═══════════════════════════════════════════════════════════════════
// SUPABASE — All database operations
// ═══════════════════════════════════════════════════════════════════
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const HDR = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };

async function sbGet(t, p = "") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?${p}`, { headers: HDR });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.message || `GET ${t} failed`); }
  return r.json();
}
async function sbPost(t, b) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: "POST", headers: HDR, body: JSON.stringify(b) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.message || `POST ${t} failed`); }
  return r.json();
}
async function sbDelete(t, p) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?${p}`, { method: "DELETE", headers: HDR });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.message || `DELETE ${t} failed`); }
  return r.json();
}

export function getOwnerIdFromURL() {
  return new URLSearchParams(window.location.search).get("owner") || null;
}

export async function getOrCreateClient(ownerId) {
  if (!ownerId) return null;
  try {
    const existing = await sbGet("clients", `name=eq.${encodeURIComponent(ownerId)}`);
    if (existing.length > 0) return existing[0];
    const [created] = await sbPost("clients", [{ name: ownerId, owner_name: ownerId }]);
    console.log("Created client:", created);
    return created;
  } catch (e) {
    console.error("Client lookup/create failed:", e);
    return null;
  }
}

export async function pushToSupabase(clientId, data, uploadType, transactions) {
  const startDate = data.dates?.start;
  const endDate = data.dates?.end;
  if (!startDate || !clientId) return { ok: false, error: "Missing date or client ID" };
  const isEstimated = uploadType !== "day";
  const dStart = new Date(startDate + "T12:00:00");
  const dEnd = new Date(endDate + "T12:00:00");
  const totalGross = data.items.reduce((s, i) => s + i.gross, 0);
  const totalQty = data.items.reduce((s, i) => s + i.qty, 0);

  const datesToInsert = [];
  for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
    datesToInsert.push(d.toISOString().split("T")[0]);
  }
  const divisor = isEstimated ? datesToInsert.length : 1;
  const dailyTrans = transactions ? Math.round(transactions / datesToInsert.length) : null;

  try {
    const uploadIds = [];
    for (const date of datesToInsert) {
      const existing = await sbGet("uploads", `client_id=eq.${encodeURIComponent(clientId)}&report_date=eq.${date}`);
      if (existing.length > 0) {
        const ex = existing[0];
        if (!ex.is_estimated && isEstimated) { console.log(`Skipping ${date} — actual data exists`); continue; }
        await sbDelete("daily_sales", `upload_id=eq.${ex.id}`);
        await sbDelete("uploads", `id=eq.${ex.id}`);
      }
      const [upload] = await sbPost("uploads", [{
        client_id: clientId, report_date: date, report_start: startDate, report_end: endDate,
        filename: data.filename || "upload.xls", row_count: data.items.length,
        total_gross: Math.round(totalGross / divisor * 100) / 100,
        total_qty: Math.round(totalQty / divisor),
        upload_type: uploadType, is_estimated: isEstimated,
        transactions: dailyTrans,
        avg_basket: dailyTrans ? Math.round((totalGross / divisor) / dailyTrans * 100) / 100 : null,
      }]);
      const rows = data.items.map(i => ({
        client_id: clientId, upload_id: upload.id, report_date: date,
        barcode: i.barcode, product: i.product, category: i.category,
        qty: isEstimated ? Math.round(i.qty / divisor) : i.qty,
        gross: Math.round((i.gross / divisor) * 100) / 100,
        net: Math.round((i.net / divisor) * 100) / 100,
        gross_profit: i.grossProfit != null ? Math.round((i.grossProfit / divisor) * 100) / 100 : null,
        gross_margin: i.grossMargin, has_cost_data: i.hasCost, is_estimated: isEstimated,
      }));
      for (let i = 0; i < rows.length; i += 100) { await sbPost("daily_sales", rows.slice(i, i + 100)); }
      uploadIds.push(upload.id);
      console.log(`${date}: ${isEstimated ? "estimated" : "actual"} — ${rows.length} rows`);
    }
    return { ok: true, uploadIds, daysInserted: uploadIds.length, totalDays: datesToInsert.length };
  } catch (e) { console.error("Push failed:", e); return { ok: false, error: e.message }; }
}

export async function deleteUpload(uploadId) {
  try {
    await sbDelete("daily_sales", `upload_id=eq.${uploadId}`);
    await sbDelete("uploads", `id=eq.${uploadId}`);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

export async function loadUploadsMeta(clientId) {
  if (!clientId) return [];
  try { return await sbGet("uploads", `client_id=eq.${encodeURIComponent(clientId)}&order=report_date.desc&limit=365`); }
  catch (e) { console.error("Load meta:", e); return []; }
}

export async function loadFromSupabase(clientId) {
  if (!clientId) return [];
  try {
    const uploads = await sbGet("uploads", `client_id=eq.${encodeURIComponent(clientId)}&order=report_date.asc&limit=365`);
    const allDays = [];
    for (const u of uploads) {
      const sales = await sbGet("daily_sales", `upload_id=eq.${u.id}&order=gross.desc`);
      allDays.push({
        uploadId: u.id,
        items: sales.map(s => ({
          barcode: s.barcode, product: s.product, category: s.category,
          qty: s.qty, gross: Number(s.gross), net: Number(s.net),
          grossProfit: s.gross_profit != null ? Number(s.gross_profit) : null,
          grossMargin: s.gross_margin != null ? Number(s.gross_margin) : null,
          hasCost: s.has_cost_data, isEstimated: s.is_estimated || false,
        })),
        dates: { start: u.report_date, end: u.report_date },
        isEstimated: u.is_estimated || false,
        uploadType: u.upload_type || "day",
        transactions: u.transactions,
        avgBasket: u.avg_basket ? Number(u.avg_basket) : null,
      });
    }
    return allDays;
  } catch (e) { console.error("Load from Supabase:", e); return []; }
}
