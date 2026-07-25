/**
 * seed-project-tasks.mjs
 *
 * Parses todo.md and upserts every task into the project_tasks DB table.
 * Safe to run multiple times — uses titleHash for idempotent upserts.
 *
 * Usage: node scripts/seed-project-tasks.mjs
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import mysql from "mysql2/promise";

const TODO_PATH = path.resolve(process.cwd(), "todo.md");
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// ─── Area inference from section headers ─────────────────────────────────────
function inferArea(header) {
  const h = header.toLowerCase();
  if (h.includes("calendar")) return "calendar";
  if (h.includes("properties") || h.includes("gantt") || h.includes("booking")) return "properties";
  if (h.includes("security") || h.includes("gdpr") || h.includes("audit")) return "security";
  if (h.includes("node design")) return "design_system";
  if (h.includes("load time") || h.includes("performance")) return "performance";
  if (h.includes("knowledge") || h.includes("memory")) return "knowledge_mgmt";
  if (h.includes("shopping") || h.includes("order") || h.includes("scan")) return "shopping";
  if (h.includes("financial") || h.includes("expense") || h.includes("bank")) return "finance";
  if (h.includes("household") || h.includes("family") || h.includes("member")) return "household";
  if (h.includes("geeves") || h.includes("ai") || h.includes("assistant")) return "ai";
  if (h.includes("integration") || h.includes("whatsapp") || h.includes("google")) return "integrations";
  if (h.includes("not yet built") || h.includes("future")) return "future";
  return "general";
}

// ─── Phase inference ──────────────────────────────────────────────────────────
function inferPhase(header, title) {
  const h = (header + " " + title).toLowerCase();
  if (h.includes("phase 2") || h.includes("phase2")) return "2";
  if (h.includes("phase 3") || h.includes("phase3")) return "3";
  if (h.includes("phase 4") || h.includes("phase4")) return "4";
  return "1";
}

// ─── Parse todo.md ────────────────────────────────────────────────────────────
function parseTodo(content) {
  const lines = content.split("\n");
  const tasks = [];
  let currentSection = "General";
  let currentBucket = null;

  for (const line of lines) {
    // Section headers (## or ###)
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    if (h2) {
      currentSection = h2[1].trim();
      currentBucket = null;
      continue;
    }
    if (h3) {
      currentBucket = h3[1].trim();
      continue;
    }

    // Task lines: - [x] or - [ ]
    const taskMatch = line.match(/^-\s+\[([ xX])\]\s+(.+)/);
    if (!taskMatch) continue;

    const done = taskMatch[1].toLowerCase() === "x";
    const rawTitle = taskMatch[2].trim();

    // Strip inline notes after " — " or " (DB migration..." etc. for the title
    // Keep full text as notes
    const titleShort = rawTitle.split(" — ")[0].split(" (DB migration")[0].trim();

    const area = inferArea(currentSection);
    const phase = inferPhase(currentSection, rawTitle);
    const titleHash = createHash("sha256").update(rawTitle).digest("hex").slice(0, 64);

    // Detect deferred items
    const isDeferred = rawTitle.toLowerCase().includes("deferred") ||
      rawTitle.toLowerCase().includes("— deferred");
    const deferredReason = isDeferred
      ? (rawTitle.match(/deferred[:\s]+(.+)/i)?.[1] ?? "Deferred to later sprint")
      : null;

    tasks.push({
      phase,
      area,
      bucket: currentBucket ?? currentSection,
      title: rawTitle.slice(0, 512),
      titleHash,
      status: done
        ? (isDeferred ? "deferred" : "done")
        : (isDeferred ? "deferred" : "todo"),
      priority: "medium",
      notes: rawTitle !== titleShort ? rawTitle : null,
      deferredReason,
      sourceDoc: "todo.md",
      completedAt: done && !isDeferred ? new Date() : null,
    });
  }

  return tasks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const content = fs.readFileSync(TODO_PATH, "utf-8");
  const tasks = parseTodo(content);
  console.log(`Parsed ${tasks.length} tasks from todo.md`);

  const conn = await mysql.createConnection(DB_URL);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const task of tasks) {
    try {
      // Check if row exists by titleHash
      const [rows] = await conn.execute(
        "SELECT id, status FROM project_tasks WHERE titleHash = ?",
        [task.titleHash]
      );

      if (rows.length > 0) {
        const existing = rows[0];
        // Only update if status changed
        if (existing.status !== task.status) {
          await conn.execute(
            `UPDATE project_tasks SET status=?, completedAt=?, updatedAt=NOW() WHERE titleHash=?`,
            [task.status, task.completedAt, task.titleHash]
          );
          updated++;
        } else {
          skipped++;
        }
      } else {
        await conn.execute(
          `INSERT INTO project_tasks (phase, area, bucket, title, titleHash, status, priority, notes, deferredReason, sourceDoc, completedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            task.phase,
            task.area,
            task.bucket,
            task.title,
            task.titleHash,
            task.status,
            task.priority,
            task.notes,
            task.deferredReason,
            task.sourceDoc,
            task.completedAt,
          ]
        );
        inserted++;
      }
    } catch (err) {
      console.error(`Error upserting task "${task.title.slice(0, 60)}":`, err.message);
    }
  }

  await conn.end();

  console.log(`Done. Inserted: ${inserted}, Updated: ${updated}, Skipped (unchanged): ${skipped}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
