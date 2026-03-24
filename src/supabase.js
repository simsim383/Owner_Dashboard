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

// Get owner ID — localStorage is the source of truth, URL is fallback for first visit only
export function getSavedOwnerId() {
  return localStorage.getItem("shopmate_owner_id") || null;
}

export function saveOwnerId(id) {
  localStorage.setItem("shopmate_owner_id", id);
}

export function getSavedPin() {
  const ownerId = getSavedOwnerId();
  return ownerId ? localStorage.getItem(`shopmate_pin_${ownerId}`) : null;
}

export function savePin(ownerId, pin) {
  localStorage.setItem(`shopmate_pin_${ownerId}`, pin);
}

export function logout() {
  const ownerId = getSavedOwnerId();
  if (ownerId) localStorage.removeItem(`shopmate_pin_${ownerId}`);
  localStorage.removeItem("shopmate_owner_id");
}

export async function verifyPin(clientId, pin) {
  if (!clientId || !pin) return false;
  try {
    const rows = await sbGet("clients", `id=eq.${encodeURIComponent(clientId)}&select=pin`);
    if (!rows.length) return false;
    // If no PIN set yet, any PIN is accepted (first-time setup)
    if (!rows[0].pin) return true;
    return rows[0].pin === pin;
  } catch (e) {
    console.error("PIN verify:", e);
    return false;
  }
}

export async function setPin(clientId, pin) {
  if (!clientId || !pin) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}`, {
      method: "PATCH", headers: { ...HDR, "Prefer": "return=representation" },
      body: JSON.stringify({ pin }),
    });
    if (!r.ok) throw new Error("Failed to set PIN");
  } catch (e) { console.error("Set PIN:", e); }
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

// ─── FAST LOAD — single bulk query instead of N sequential loops ─
export async function loadFromSupabase(clientId) {
  if (!clientId) return [];
  try {
    // 1. Fetch upload metadata (lightweight)
    const uploads = await sbGet("uploads", `client_id=eq.${encodeURIComponent(clientId)}&order=report_date.asc&limit=365`);
    if (!uploads.length) return [];

    // 2. Fetch ALL daily_sales for this client in ONE request — no more per-upload loop
    const sales = await sbGet("daily_sales", `client_id=eq.${encodeURIComponent(clientId)}&order=upload_id.asc,gross.desc&limit=50000`);

    // 3. Group sales by upload_id client-side (fast, in-memory)
    const salesByUpload = {};
    sales.forEach(s => {
      if (!salesByUpload[s.upload_id]) salesByUpload[s.upload_id] = [];
      salesByUpload[s.upload_id].push(s);
    });

    // 4. Assemble the allDays structure
    return uploads.map(u => ({
      uploadId: u.id,
      items: (salesByUpload[u.id] || []).map(s => ({
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
    }));
  } catch (e) { console.error("Load from Supabase:", e); return []; }
}

// ─── ONBOARDING ─────────────────────────────────────────────────
export async function checkInviteCode(code) {
  const rows = await sbGet("invite_codes", `code=eq.${encodeURIComponent(code)}&limit=1`);
  if (!rows.length) return { valid: false, error: "Invalid code" };
  if (rows[0].used) return { valid: false, error: "Code already used" };
  return { valid: true };
}

export async function claimOwnerId(id, inviteCode) {
  // Check not taken
  const [takenOwner, takenClient] = await Promise.all([
    sbGet("owner_ids", `id=eq.${encodeURIComponent(id)}&limit=1`),
    sbGet("clients", `name=eq.${encodeURIComponent(id)}&limit=1`),
  ]);
  if (takenOwner.length > 0 || takenClient.length > 0) {
    throw new Error("ID already taken");
  }
  // Claim it
  await sbPost("owner_ids", [{ id, created_at: new Date().toISOString() }]);
  // Mark invite code as used
  const r = await fetch(`${SUPABASE_URL}/rest/v1/invite_codes?code=eq.${encodeURIComponent(inviteCode)}`, {
    method: "PATCH", headers: { ...HDR, "Prefer": "return=representation" },
    body: JSON.stringify({ used: true, used_by: id, used_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error("Failed to mark code as used");
  // Create client record with PIN placeholder
  await sbPost("clients", [{ name: id, owner_name: id }]);
  return { ok: true };
}
