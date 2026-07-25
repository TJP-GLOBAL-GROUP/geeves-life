/**
 * Geeves Edits API — write-back endpoints for the Maxfield Reconciliation Explorer.
 *
 * Drop-in Express router for the geeves.life server. Mount in server/_core/index.ts
 * BEFORE the tRPC middleware:
 *
 *   import { editsApiRouter } from "../editsApi";
 *   ...
 *   app.use("/api", editsApiRouter);
 *
 * Env:
 *   DATABASE_URL  — already used by the app (mysql2 connection string)
 *   EDIT_SECRET   — shared secret the explorer must send as body.secret
 *
 * Endpoints:
 *   GET  /api/health
 *   POST /api/edits        (edits[] vertical reassigns, splits[] with per-line QBO
 *                           fields, field_edits[] txn-level QBO fields)
 *   GET  /api/edit-log?limit=50
 *
 * Semantics mirror geeves_edits_api/main.py (the tested Python reference):
 *  - staged rows are identified by notes LIKE 'GEE-<txnId>%'
 *  - reassign/split = DELETE + re-insert (idempotent), preserving bankAccountId,
 *    description, amount, currency, vendor, transactionDate from the existing row
 *  - field edits UPDATE in place: cat→expenseCategory, vendor→vendor, tax→taxCategory;
 *    cls/loc/cust/bill/markup/memo/tags become notes segments (only keys present are
 *    touched; '' clears); mind/body/soul quick-tag memos are preserved
 *  - every mutation writes an edit_log audit row; each request is one transaction
 *    (all-or-nothing)
 */

import { Router } from "express";
import mysql from "mysql2/promise";

export const editsApiRouter = Router();

const VERTS = new Set(["MB", "MM", "BL", "GL", "SO", "BLab", "FAM", "PERS", "REV"]);
const QBO_CLASSES = new Set(["Bohemian Lodges", "Maxfield Market"]);

let _pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not set");
    const sep = url.includes("?") ? "&" : "?";
    _pool = mysql.createPool(url + sep + "connectionLimit=4");
  }
  return _pool;
}

let _editLogReady = false;
async function ensureEditLog(c: mysql.PoolConnection) {
  if (_editLogReady) return;
  await c.query(`CREATE TABLE IF NOT EXISTS edit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    gee_txn VARCHAR(32) NOT NULL,
    field VARCHAR(32), old_value TEXT, new_value TEXT,
    edited_by VARCHAR(64), reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  _editLogReady = true;
}

/** Merge txn-level QBO fields into a GEE notes string as pipe-separated segments. */
function applyNoteSegments(notes: string | null, f: Record<string, any>): string {
  const segs = (notes || "").split(" | ").map(s => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const s of segs) {
    const [headRaw, , valRaw] = [s.slice(0, s.indexOf(":")), "", s.slice(s.indexOf(":") + 1)];
    const head = headRaw.trim(), val = (valRaw || "").trim();
    if (head === "Loc" && "loc" in f) continue;
    if (head === "Class" && QBO_CLASSES.has(val) && "cls" in f) continue;
    if (head === "Cust" && "cust" in f) continue;
    if (head === "Memo" && "memo" in f) continue;
    if (head === "Tags" && "tags" in f) continue;
    if (head === "Billable" && "bill" in f) continue;
    out.push(s);
  }
  const add = (seg: string) => {
    if (out.length && out[out.length - 1] === "NEEDS REVIEW") out.splice(out.length - 1, 0, seg);
    else out.push(seg);
  };
  if (f.loc) add(`Loc: ${f.loc}`);
  if (f.cls) add(`Class: ${f.cls}`);
  if (f.cust) add(`Cust: ${f.cust}`);
  if (f.bill === "yes") add("Billable: yes" + (f.markup !== undefined && f.markup !== null && `${f.markup}` !== "" ? ` (+${f.markup}% markup)` : ""));
  else if (f.bill === "no") add("Billable: no");
  if (f.memo) add(`Memo: ${f.memo}`);
  if (Array.isArray(f.tags) && f.tags.length) add("Tags: " + f.tags.map(String).join(", "));
  return out.join(" | ").slice(0, 1900);
}

// CORS — the explorer is a static page on another origin
editsApiRouter.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

editsApiRouter.get("/health", async (_req, res) => {
  try {
    await getPool().query("SELECT 1");
    res.json({ ok: true, db: "up" });
  } catch (e: any) {
    res.status(503).json({ ok: false, error: String(e?.message || e) });
  }
});

interface Line { vertical: string; amount: number; memo?: string; category?: string; class?: string; location?: string }
interface Meta { desc?: string; amount?: number; date?: string; vendor?: string; currency?: string }

editsApiRouter.post("/edits", async (req, res) => {
  const body = req.body || {};
  if (!process.env.EDIT_SECRET || body.secret !== process.env.EDIT_SECRET) {
    return res.status(401).json({ ok: false, error: "bad secret" });
  }
  const ed: any[] = body.edits || [];
  const sp: any[] = body.splits || [];
  const fed: any[] = body.field_edits || [];
  if (!ed.length && !sp.length && !fed.length) return res.json({ ok: true, applied: 0 });

  // pre-validate verticals (400 before touching the DB)
  for (const e of ed) if (!VERTS.has(e.to)) return res.status(400).json({ ok: false, error: `bad vertical ${e.to}` });
  for (const s of sp) for (const l of (s.lines || []) as Line[])
    if (!VERTS.has(l.vertical)) return res.status(400).json({ ok: false, error: `bad vertical ${l.vertical}` });

  const pool = getPool();
  const c = await pool.getConnection();
  let applied = 0, nDel = 0, nIns = 0;
  try {
    await c.beginTransaction();
    await ensureEditLog(c);

    const items: { txn_id: number; lines: Line[]; meta: Meta }[] = [];
    for (const e of ed) {
      items.push({ txn_id: +e.txn_id, meta: e.meta || {},
        lines: [{ vertical: e.to, amount: +(e.meta?.amount ?? 0) }] });
    }
    for (const s of sp) items.push({ txn_id: +s.txn_id, lines: s.lines || [], meta: s.meta || {} });

    for (const it of items) {
      const tid = it.txn_id;
      const [rows] = await c.query<mysql.RowDataPacket[]>(
        "SELECT id, bankAccountId, description, amount, currency, vendor, transactionDate, notes FROM transactions WHERE notes LIKE ? ORDER BY id",
        [`GEE-${tid}%`]);
      const ex: any = rows[0] || {};
      const ba = ex.bankAccountId ?? null;
      const desc = (ex.description ?? it.meta.desc ?? "").slice(0, 500);
      const curcy = ex.currency ?? it.meta.currency ?? "USD";
      const vendor = ex.vendor ?? (it.meta.vendor || null);
      const date = ex.transactionDate ?? it.meta.date ?? null;
      const oldDesc = rows.length ? String(ex.notes) : "(new)";
      const tot = Math.abs(+(ex.amount ?? it.meta.amount ?? 0));
      const sum = it.lines.reduce((x, l) => x + Math.abs(+l.amount), 0);
      if (Math.abs(sum - tot) > 0.004 && tot > 0.004) {
        throw Object.assign(new Error(`txn ${tid}: split lines do not sum to amount`), { isValidation: true });
      }
      const [del] = await c.query<mysql.ResultSetHeader>(
        "DELETE FROM transactions WHERE notes LIKE ?", [`GEE-${tid}%`]);
      nDel += del.affectedRows;
      const [mx] = await c.query<mysql.RowDataPacket[]>("SELECT COALESCE(MAX(id),0)+1 AS nid FROM transactions");
      let nid = mx[0].nid;
      const N = it.lines.length;
      for (let i = 0; i < N; i++) {
        const l = it.lines[i];
        const cls = (l.vertical === "FAM" || l.vertical === "PERS") ? "personal" : "business";
        let note = `GEE-${tid} L${i + 1}/${N} | Vertical: ${l.vertical}`;
        if (l.memo) note += " | " + String(l.memo).replace(/[\r\n]+/g, " ");
        if (l.class) note += ` | Class: ${l.class}`;
        if (l.location) note += ` | Loc: ${l.location}`;
        if (l.vertical === "REV") note += " | NEEDS REVIEW";
        const cat = (l.category || "Uncategorized").slice(0, 100);
        await c.query(`INSERT INTO transactions
          (id, userId, bankAccountId, description, amount, currency, exchangeRate, type,
           expenseCategory, classification, aiConfidence, isManualOverride, vendor, platform,
           receiptUrl, notes, isTaxDeductible, taxCategory, transactionDate)
          VALUES (?, 1, ?, ?, ?, ?, NULL, 'expense', ?, ?, NULL, 0, ?, 'staging', NULL, ?, 0, NULL, ?)`,
          [nid, ba, desc, Math.abs(+l.amount), curcy, cat, cls, vendor, note.slice(0, 1900), date]);
        nid++; nIns++;
      }
      const newDesc = it.lines.length > 1
        ? "SPLIT " + it.lines.map(l => `${l.vertical} $${(+l.amount).toFixed(2)}`).join(" + ")
        : it.lines[0].vertical;
      await c.query(
        "INSERT INTO edit_log (gee_txn, field, old_value, new_value, edited_by, reason) VALUES (?,?,?,?,?,?)",
        [`GEE-${tid}`, "vertical/split", oldDesc.slice(0, 900), newDesc, "explorer-api", "direct sync"]);
      applied++;
    }

    // txn-level QBO field edits — UPDATE existing rows in place
    for (const fe of fed) {
      const tid = +fe.txn_id;
      const f: Record<string, any> = fe.fields || {};
      if (!Object.keys(f).length) continue;
      const [rows] = await c.query<mysql.RowDataPacket[]>(
        "SELECT id, notes FROM transactions WHERE notes LIKE ? ORDER BY id", [`GEE-${tid}%`]);
      if (!rows.length) continue;
      for (const r of rows) {
        const sets: string[] = [], params: any[] = [];
        if ("vendor" in f) { sets.push("vendor=?"); params.push(f.vendor ? String(f.vendor).slice(0, 255) : null); }
        if ("cat" in f) { sets.push("expenseCategory=?"); params.push((f.cat || "Uncategorized").slice(0, 100)); }
        if ("tax" in f) { sets.push("taxCategory=?"); params.push(f.tax ? String(f.tax).slice(0, 100) : null); }
        const newNotes = applyNoteSegments(r.notes, f);
        if (newNotes !== (r.notes || "")) { sets.push("notes=?"); params.push(newNotes); }
        if (sets.length) {
          params.push(r.id);
          await c.query(`UPDATE transactions SET ${sets.join(", ")} WHERE id=?`, params);
        }
      }
      await c.query(
        "INSERT INTO edit_log (gee_txn, field, old_value, new_value, edited_by, reason) VALUES (?,?,?,?,?,?)",
        [`GEE-${tid}`, "qbo-fields", null, JSON.stringify(f).slice(0, 900), "explorer-api", "field edit"]);
      applied++;
    }

    await c.commit();
    res.json({ ok: true, applied, deleted: nDel, inserted: nIns });
  } catch (e: any) {
    await c.rollback();
    if (e?.isValidation) return res.status(400).json({ ok: false, error: String(e.message) });
    res.status(500).json({ ok: false, error: `${e?.constructor?.name || "Error"}: ${e?.message || e}` });
  } finally {
    c.release();
  }
});

editsApiRouter.get("/edit-log", async (req, res) => {
  try {
    const limit = Math.min(+(req.query.limit || 50) || 50, 500);
    const pool = getPool();
    const c = await pool.getConnection();
    try {
      await ensureEditLog(c);
      const [rows] = await c.query<mysql.RowDataPacket[]>(
        "SELECT gee_txn AS txn, old_value AS `from`, new_value AS `to`, edited_by AS `by`, created_at AS at FROM edit_log ORDER BY id DESC LIMIT ?",
        [limit]);
      res.json({ ok: true, rows });
    } finally { c.release(); }
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
