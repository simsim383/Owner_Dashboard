// ═══════════════════════════════════════════════════════════════════
// PARSER — ShopMate Excel file parser
// ═══════════════════════════════════════════════════════════════════
import * as XLSX from "xlsx";

function parseMoney(v) {
  if (v == null || v === "-" || v === "") return null;
  const n = parseFloat(String(v).replace(/[£,\s]/g, ""));
  return isNaN(n) ? null : n;
}
function parsePct(v) {
  if (v == null || v === "-" || v === "") return null;
  const n = parseFloat(String(v).replace(/[%,\s]/g, ""));
  return isNaN(n) ? null : n;
}

export function extractDates(fn) {
  const b = fn.replace(/^.*[\\/]/, "").replace(/_Item_Sales_Report\.xls[x]?$/i, "");
  const p = b.split("-");
  if (p.length < 2) return null;
  try {
    const d = (s) => { const [y, m, dd] = s.split("_"); return `20${y}-${m}-${dd}`; };
    return { start: d(p[0]), end: d(p[1]) };
  } catch { return null; }
}

export function parseFile(buf, fn) {
  const wb = XLSX.read(buf, { type: "array" });
  const sn = wb.SheetNames.find(n => n.toLowerCase() === "ag-grid") || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 });
  if (rows.length < 2) throw new Error("No data found in file");

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0] || !r[1]) continue;
    const gp = parseMoney(r[6]);
    items.push({
      barcode: String(r[0]).trim(),
      product: String(r[1]).trim(),
      category: String(r[2] || "").trim(),
      qty: parseInt(r[3]) || 0,
      gross: parseMoney(r[4]) || 0,
      net: parseMoney(r[5]) || 0,
      grossProfit: gp,
      grossMargin: parsePct(r[7]),
      hasCost: gp !== null,
    });
  }
  return { items, dates: extractDates(fn) };
}
