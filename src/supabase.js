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

// ─── WEATHER FETCH FOR HISTORICAL DATES ─────────────────────────
// Uses Open-Meteo historical API — free, no key needed
// Called once per day on upload, stored in Supabase alongside sales
async function fetchHistoricalWeather(date, lat, lon) {
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe%2FLondon`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.daily?.time?.length) return null;
    const code = data.daily.weathercode[0];
    return {
      max_temp: Math.round(data.daily.temperature_2m_max[0]),
      min_temp: Math.round(data.daily.temperature_2m_min[0]),
      weather_code: code,
      weather_desc: wmoDescriptionSimple(code),
    };
  } catch (e) {
    console.warn("Weather fetch failed for", date, e.message);
    return null;
  }
}

// Minimal WMO code → description for storage
function wmoDescriptionSimple(code) {
  const WMO = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Icy fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow",
    80: "Light showers", 81: "Rain showers", 82: "Heavy showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail",
  };
  if (WMO[code]) return WMO[code];
  if (code <= 3)  return "Partly cloudy";
  if (code <= 49) return "Foggy";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 84) return "Rain showers";
  return "Thunderstorm";
}

// ─── AUTH ────────────────────────────────────────────────────────
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

// ─── PUSH TO SUPABASE ────────────────────────────────────────────
// Now fetches historical weather for each date and stores alongside sales.
// Requires clientLocation (from clients.location) to be passed in.
// Falls back gracefully — if weather fetch fails, upload still succeeds.
export async function pushToSupabase(clientId, data, uploadType, transactions, clientLocation) {
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

      // Fetch historical weather for this date if we have a location
      let weather = null;
      if (clientLocation?.lat && clientLocation?.lon) {
        weather = await fetchHistoricalWeather(date, clientLocation.lat, clientLocation.lon);
        if (weather) console.log(`Weather for ${date}: ${weather.max_temp}°C, ${weather.weather_desc}`);
      }

      const [upload] = await sbPost("uploads", [{
        client_id: clientId, report_date: date, report_start: startDate, report_end: endDate,
        filename: data.filename || "upload.xls", row_count: data.items.length,
        total_gross: Math.round(totalGross / divisor * 100) / 100,
        total_qty: Math.round(totalQty / divisor),
        upload_type: uploadType, is_estimated: isEstimated,
        transactions: dailyTrans,
        avg_basket: dailyTrans ? Math.round((totalGross / divisor) / dailyTrans * 100) / 100 : null,
        // Weather columns — null if location not set or fetch failed
        max_temp: weather?.max_temp ?? null,
        min_temp: weather?.min_temp ?? null,
        weather_code: weather?.weather_code ?? null,
        weather_desc: weather?.weather_desc ?? null,
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
        // Weather data — present for days uploaded after this feature was added
        weather: (u.max_temp != null) ? {
          maxTemp: u.max_temp,
          minTemp: u.min_temp,
          weatherCode: u.weather_code,
          weatherDesc: u.weather_desc,
        } : null,
      });
    }
    return allDays;
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
  const [takenOwner, takenClient] = await Promise.all([
    sbGet("owner_ids", `id=eq.${encodeURIComponent(id)}&limit=1`),
    sbGet("clients", `name=eq.${encodeURIComponent(id)}&limit=1`),
  ]);
  if (takenOwner.length > 0 || takenClient.length > 0) {
    throw new Error("ID already taken");
  }
  await sbPost("owner_ids", [{ id, created_at: new Date().toISOString() }]);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/invite_codes?code=eq.${encodeURIComponent(inviteCode)}`, {
    method: "PATCH", headers: { ...HDR, "Prefer": "return=representation" },
    body: JSON.stringify({ used: true, used_by: id, used_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error("Failed to mark code as used");
  await sbPost("clients", [{ name: id, owner_name: id }]);
  return { ok: true };
}

// ─── PROMO STORAGE ──────────────────────────────────────────────
export async function savePromoScan(clientId, scan, decisions, skips) {
  const [scanRow] = await sbPost("promo_scans", [{
    client_id: clientId, supplier: scan.source || "Unknown", promo_dates: scan.promoDates || "",
    budget: scan.budget || 2500, total_spend: scan.totalSpend || 0, remaining: scan.remaining || 0,
    est_revenue: scan.estRevenue || 0, est_profit: scan.estProfit || 0, roi: scan.roi || 0,
    key_insight: scan.keyInsight || "", status: "active",
    buy_count: decisions.filter(d => d.decision === "BUY").length,
    test_count: decisions.filter(d => d.decision === "TEST").length,
    skip_count: (skips || []).length,
  }]);
  if (decisions.length > 0) {
    await sbPost("promo_decisions", decisions.map(d => ({
      scan_id: scanRow.id, client_id: clientId, product: d.product, source: d.source,
      case_price: d.casePrice, por: d.por, rrp: d.rrp, vel: d.vel, qty: d.qty,
      cover: d.cover, units: d.units, total_inc: d.totalInc, decision: d.decision, notes: d.notes,
    })));
  }
  if (decisions.length > 0) {
    await sbPost("promo_price_history", decisions.filter(d => d.casePrice).map(d => ({
      client_id: clientId, product: d.product, supplier: d.source, case_price: d.casePrice,
      rrp: d.rrp, scan_id: scanRow.id,
    })));
  }
  if (skips && skips.length > 0) {
    await sbPost("promo_skips", skips.map(s => ({ scan_id: scanRow.id, product: s.product, reason: s.reason })));
  }
  return scanRow;
}

export async function loadPromoScans(clientId) {
  return await sbGet("promo_scans", `client_id=eq.${clientId}&order=created_at.desc&limit=20`);
}

export async function loadPromoDecisions(scanId) {
  return await sbGet("promo_decisions", `scan_id=eq.${scanId}&order=decision.asc`);
}

export async function loadPromoSkips(scanId) {
  return await sbGet("promo_skips", `scan_id=eq.${scanId}`);
}

export async function loadPriceHistory(clientId, productName) {
  return await sbGet("promo_price_history", `client_id=eq.${clientId}&product=eq.${encodeURIComponent(productName)}&order=scan_date.desc&limit=10`);
}

export async function loadAllPriceHistory(clientId) {
  return await sbGet("promo_price_history", `client_id=eq.${clientId}&order=scan_date.desc&limit=500`);
}

export async function updatePromoDecision(decisionId, updates) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/promo_decisions?id=eq.${decisionId}`, {
    method: "PATCH", headers: { ...HDR, "Prefer": "return=representation" },
    body: JSON.stringify(updates),
  });
  if (!r.ok) throw new Error("Failed to update decision");
  return r.json();
}

export async function deletePromoScan(scanId) {
  await sbDelete("promo_scans", `id=eq.${scanId}`);
  return { ok: true };
}

export async function saveCorrection(clientId, productPattern, correctionType, correctionValue) {
  await sbPost("promo_corrections", [{ client_id: clientId, product_pattern: productPattern, correction_type: correctionType, correction_value: correctionValue }]);
}

export async function loadCorrections(clientId) {
  return await sbGet("promo_corrections", `client_id=eq.${clientId}&order=created_at.desc&limit=100`);
}
