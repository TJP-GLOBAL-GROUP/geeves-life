import type { Request, Response, Router } from "express";
import { Router as ExpressRouter } from "express";
import { getDb } from "../db";
import { transactions, editLog } from "../../drizzle/schema";
import { sql, like, eq } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────
const VALID_VERTICALS = new Set(["MB", "MM", "BL", "GL", "SO", "BLab", "FAM", "PERS", "REV"]);
const PERSONAL_VERTICALS = new Set(["FAM", "PERS"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse the "Vertical: X" segment from a notes string. Returns null if absent. */
function parseVertical(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/Vertical:\s*(\S+)/);
  return m ? m[1] : null;
}

/**
 * Merge pipe-separated segments into an existing notes string.
 * Rules:
 *  - Each segment key maps to a prefix like "Class: ", "Loc: ", etc.
 *  - If the segment already exists, replace it (with QBO-class guard for cls).
 *  - If the segment is new, insert it before any trailing "| NEEDS REVIEW".
 *  - Empty value → remove the segment.
 */
function mergeNotesSegments(
  notes: string,
  fields: Record<string, string | string[]>
): string {
  const QBO_CLASSES = new Set(["Bohemian Lodges", "Maxfield Market"]);

  // Split notes into parts by " | "
  let parts = notes.split(" | ").map((p) => p.trim()).filter(Boolean);

  const setSegment = (prefix: string, value: string, guardFn?: (existing: string) => boolean) => {
    const idx = parts.findIndex((p) => p.startsWith(prefix));
    if (!value) {
      // Remove segment
      if (idx !== -1) parts.splice(idx, 1);
      return;
    }
    const newSeg = `${prefix}${value}`;
    if (idx !== -1) {
      // Guard: only replace if allowed
      if (guardFn) {
        const existingVal = parts[idx].slice(prefix.length);
        if (!guardFn(existingVal)) return; // preserve existing
      }
      parts[idx] = newSeg;
    } else {
      // Insert before NEEDS REVIEW if present
      const nrIdx = parts.findIndex((p) => p === "NEEDS REVIEW");
      if (nrIdx !== -1) {
        parts.splice(nrIdx, 0, newSeg);
      } else {
        parts.push(newSeg);
      }
    }
  };

  if ("cat" in fields) {
    // cat is handled via column, not notes — skip
  }
  if ("cls" in fields) {
    const val = fields.cls as string;
    setSegment("Class: ", val, (existing) => QBO_CLASSES.has(existing));
  }
  if ("loc" in fields) setSegment("Loc: ", fields.loc as string);
  if ("cust" in fields) setSegment("Cust: ", fields.cust as string);
  if ("memo" in fields) setSegment("Memo: ", (fields.memo as string).replace(/\n/g, " "));
  if ("bill" in fields) {
    const bill = fields.bill as string;
    const markup = fields.markup as string | undefined;
    if (bill === "yes") {
      const suffix = markup ? ` (+${markup}% markup)` : "";
      setSegment("Billable: ", `yes${suffix}`);
    } else if (bill === "no") {
      setSegment("Billable: ", "no");
    } else {
      setSegment("Billable: ", "");
    }
  }
  if ("tags" in fields) {
    const tags = fields.tags as string[];
    setSegment("Tags: ", tags.length ? tags.join(", ") : "");
  }

  return parts.join(" | ");
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function healthHandler(_req: Request, res: Response) {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ ok: false, db: "down" });
    await db.execute(sql`SELECT 1`);
    return res.json({ ok: true, db: "up" });
  } catch {
    return res.status(503).json({ ok: false, db: "down" });
  }
}

async function editsHandler(req: Request, res: Response) {
  const secret = process.env.EDIT_SECRET;
  if (!secret || req.body?.secret !== secret) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { edits = [], splits = [], field_edits = [] } = req.body as {
    edits: Array<{ txn_id: number; to: string; meta?: Record<string, unknown> }>;
    splits: Array<{ txn_id: number; meta?: Record<string, unknown>; lines: Array<{ vertical: string; amount: number; memo?: string; category?: string; class?: string; location?: string }> }>;
    field_edits: Array<{ txn_id: number; meta?: Record<string, unknown>; fields: Record<string, string | string[]> }>;
  };

  if (!edits.length && !splits.length && !field_edits.length) {
    return res.status(400).json({ ok: false, error: "ValidationError: at least one of edits, splits, or field_edits must be non-empty" });
  }

  // Validate verticals
  for (const e of edits) {
    if (!VALID_VERTICALS.has(e.to)) {
      return res.status(400).json({ ok: false, error: `ValidationError: invalid vertical '${e.to}'` });
    }
  }
  for (const s of splits) {
    for (const line of s.lines) {
      if (!VALID_VERTICALS.has(line.vertical)) {
        return res.status(400).json({ ok: false, error: `ValidationError: invalid vertical '${line.vertical}' in split txn_id=${s.txn_id}` });
      }
    }
    // Validate split amounts sum to transaction amount
    const meta = s.meta as { amount?: number } | undefined;
    if (meta?.amount !== undefined) {
      const lineSum = s.lines.reduce((acc, l) => acc + Math.abs(l.amount), 0);
      if (Math.abs(lineSum - Math.abs(meta.amount)) > 0.004) {
        return res.status(400).json({ ok: false, error: `ValidationError: split lines sum ${lineSum.toFixed(4)} ≠ txn amount ${meta.amount} for txn_id=${s.txn_id}` });
      }
    }
  }

  const db = await getDb();
  if (!db) return res.status(500).json({ ok: false, error: "DBError: database not available" });

  let applied = 0;
  let deleted = 0;
  let inserted = 0;

  try {
    // Process edits and splits (delete + reinsert)
    const allReinserts = [
      ...edits.map((e) => ({ txn_id: e.txn_id, meta: e.meta, lines: [{ vertical: e.to, amount: e.meta?.amount as number ?? 0, memo: "", category: "", class: "", location: "" }] })),
      ...splits,
    ];

    for (const item of allReinserts) {
      const geePattern = `GEE-${item.txn_id}%`;
      // Find existing rows
      const existing = await db.select().from(transactions).where(like(transactions.notes, geePattern));

      // Determine base values
      const base = existing[0];
      const meta = item.meta as Record<string, unknown> | undefined;
      const bankAccountId = base?.bankAccountId ?? null;
      const description = (base?.description ?? meta?.desc ?? "") as string;
      const totalAmount = base?.amount ?? String(meta?.amount ?? "0");
      const currency = (base?.currency ?? meta?.currency ?? "USD") as string;
      const vendor = (base?.vendor ?? meta?.vendor ?? null) as string | null;
      const transactionDate = base?.transactionDate ?? (meta?.date ? new Date(meta.date as string) : new Date());

      // Parse old vertical for audit
      const oldVertical = existing.length > 0 ? parseVertical(existing[0]?.notes ?? null) : null;

      // Delete existing rows
      if (existing.length > 0) {
        await db.delete(transactions).where(like(transactions.notes, geePattern));
        deleted += existing.length;
      }

      // Insert replacement rows
      const N = item.lines.length;
      for (let i = 0; i < N; i++) {
        const line = item.lines[i];
        const vertical = line.vertical;
        let notesStr = `GEE-${item.txn_id} L${i + 1}/${N} | Vertical: ${vertical}`;
        if (line.memo) notesStr += ` | ${line.memo.replace(/\n/g, " ")}`;
        if (line.class) notesStr += ` | Class: ${line.class}`;
        if (line.location) notesStr += ` | Loc: ${line.location}`;
        if (vertical === "REV") notesStr += ` | NEEDS REVIEW`;

        await db.insert(transactions).values({
          userId: 1,
          bankAccountId,
          description,
          amount: String(Math.abs(line.amount || Number(totalAmount))),
          currency,
          type: "expense",
          classification: PERSONAL_VERTICALS.has(vertical) ? "personal" : "business",
          expenseCategory: line.category || "Uncategorized",
          vendor: vendor || undefined,
          isManualOverride: false,
          platform: "staging",
          notes: notesStr,
          transactionDate,
        });
        inserted++;
      }

      // Audit log
      const newValue = N === 1
        ? `Vertical: ${item.lines[0].vertical}`
        : `SPLIT ${item.lines.map((l) => `${l.vertical} $${Math.abs(l.amount).toFixed(2)}`).join(" + ")}`;

      await db.insert(editLog).values({
        geeTxn: `GEE-${item.txn_id}`,
        field: N === 1 ? "vertical" : "split",
        oldValue: oldVertical ? `Vertical: ${oldVertical}` : null,
        newValue,
        editedBy: "explorer-api",
        reason: "direct sync",
      });

      applied++;
    }

    // Process field_edits (UPDATE in place, do NOT delete/reinsert)
    for (const fe of field_edits) {
      const geePattern = `GEE-${fe.txn_id}%`;
      const existing = await db.select().from(transactions).where(like(transactions.notes, geePattern));
      if (existing.length === 0) continue;

      for (const row of existing) {
        const updateData: Record<string, unknown> = {};
        if ("cat" in fe.fields) {
          updateData.expenseCategory = (fe.fields.cat as string) || "Uncategorized";
        }
        if ("vendor" in fe.fields) {
          updateData.vendor = (fe.fields.vendor as string) || null;
        }
        if ("tax" in fe.fields) {
          updateData.taxCategory = (fe.fields.tax as string) || null;
        }

        // Merge notes segments
        const newNotes = mergeNotesSegments(row.notes ?? "", fe.fields);
        updateData.notes = newNotes;

        if (Object.keys(updateData).length > 0) {
          await db.update(transactions).set(updateData as Parameters<typeof db.update>[0] extends { set: (v: infer V) => unknown } ? V : never).where(eq(transactions.id, row.id));
        }
      }

      // Audit log
      await db.insert(editLog).values({
        geeTxn: `GEE-${fe.txn_id}`,
        field: "qbo-fields",
        oldValue: null,
        newValue: JSON.stringify(fe.fields),
        editedBy: "explorer-api",
        reason: "direct sync",
      });

      applied++;
    }

    return res.json({ ok: true, applied, deleted, inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: `DBError: ${msg}` });
  }
}

async function editLogHandler(req: Request, res: Response) {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ ok: false, error: "DB not available" });
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 500);
    const rows = await db
      .select()
      .from(editLog)
      .orderBy(sql`${editLog.createdAt} DESC`)
      .limit(limit);
    return res.json({
      ok: true,
      rows: rows.map((r) => ({
        id: r.id,
        txn: r.geeTxn,
        field: r.field,
        from: r.oldValue,
        to: r.newValue,
        by: r.editedBy,
        at: r.createdAt,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
}

// ─── Router factory ───────────────────────────────────────────────────────────

export function createEditsApiRouter(): Router {
  const router = ExpressRouter();

  // CORS — allow all origins (explorer is a static page on a different domain)
  router.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  });
  router.options("*", (_req, res) => res.sendStatus(204));

  router.get("/health", healthHandler);
  router.post("/edits", editsHandler);
  router.get("/edit-log", editLogHandler);

  return router;
}

