/**
 * Knowledge Review Heartbeat Handler
 *
 * Triggered every 24 hours by the Manus Heartbeat cron (task UID: oGKgfGPrv2Djogw85etY8R).
 * This handler is the "cover all bases" knowledge review skill:
 *
 *   1. Reads ALL entries from the project_knowledge DB table
 *   2. Updates lastReviewedAt on every entry (marks them as reviewed today)
 *   3. Reads each docs/ markdown file and stamps its doc_location entry's lastReviewedAt
 *   4. Regenerates docs/AI_MEMORY.md from the full DB so any AI agent starting a
 *      new session has an up-to-date single-file reference for all brand, design,
 *      and architectural decisions.
 *
 * Endpoint: POST /api/scheduled/knowledge-review
 * Auth:     Manus cron gateway (x-manus-cron-task-uid header)
 *
 * To trigger manually: Schedules panel → task oGKgfGPrv2Djogw85etY8R → "Run Now"
 */

import type { Request, Response } from "express";
import { getDb } from "../db";
import { projectKnowledge, projectTasks, calendars, events } from "../../drizzle/schema";
import { eq, isNull, sql, and, gt } from "drizzle-orm";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

// ─── Parse todo.md into task rows ────────────────────────────────────────────
function parseTodoMd(content: string): Array<{
  phase: string; area: string; title: string;
  status: "done" | "todo" | "deferred"; titleHash: string;
}> {
  const tasks: ReturnType<typeof parseTodoMd> = [];
  let currentArea = "general";
  let currentPhase = "1";

  const AREA_MAP: Record<string, string> = {
    "PHASE 1": "general", "CALENDAR": "calendar", "DESIGN SYSTEM": "design_system",
    "FINANCE": "finance", "KNOWLEDGE": "knowledge_mgmt", "PROPERTIES": "properties",
    "SHOPPING": "shopping", "PERFORMANCE": "performance", "SECURITY": "security",
    "AI": "ai", "FUTURE": "future", "SUPER ADMIN": "knowledge_mgmt",
    // New section headings added Jun 25, 2026
    "PROPERTY FINANCIALS": "properties", "PROPERTY TIMEZONE": "properties",
    "PROPERTY WIDGET": "properties", "PROPERTY COUNTRY": "properties",
    "BOOKING EMAIL": "properties", "BOOKING ENRICHMENT": "properties",
    "NODE DESIGN": "design_system", "UX SPRINT": "design_system",
    "GANTT": "calendar", "ICAL": "calendar", "SHADOW BLOCK": "calendar",
    "CALENDAR DUAL": "calendar", "CALENDAR UX": "calendar",
    "DATE/TIME MODEL": "calendar", "DATE SHIFT": "calendar",
    "DUPLICATE CALENDAR": "calendar", "BACKFILL SHADOW": "calendar",
    "SPRINT V2": "general", "SPRINT V3": "general",
    "BUG FIX": "general", "BUG FIXES": "general", "CLEANUP": "general",
    "LOAD TIME": "performance", "DB NAMING": "knowledge_mgmt",
    "KNOWLEDGE MANAGEMENT": "knowledge_mgmt", "FULL CRUD KNOWLEDGE": "knowledge_mgmt",
    "VERTICAL ACCESS": "calendar", "INVITE FLOW": "general",
    "GEEVES ACCESS": "ai", "RESOURCES WIDGET": "ai",
    "CARY": "general", "MEMBER PERMISSIONS": "general", "RBAC": "general",
    "OAUTH": "general", "AUTH": "general", "LEGAL": "general",
    "LANDING PAGE": "general", "SUBSCRIPTION": "general",
    "INTEGRATIONS": "general", "ACCOUNT MANAGEMENT": "general",
    "RECONNECT": "general", "LOGIN": "general",
  };

  for (const line of content.split("\n")) {
    // Section heading → update area
    if (line.startsWith("## ") || line.startsWith("### ")) {
      const heading = line.replace(/^#+\s*/, "").toUpperCase();
      for (const [k, v] of Object.entries(AREA_MAP)) {
        if (heading.includes(k)) { currentArea = v; break; }
      }
      if (heading.includes("PHASE")) {
        const m = heading.match(/PHASE\s+(\d+)/);
        if (m) currentPhase = m[1];
      }
      continue;
    }
    // Task line
    const doneMatch = line.match(/^\s*-\s*\[x\]\s+(.+)$/i);
    const todoMatch = line.match(/^\s*-\s*\[\s\]\s+(.+)$/);
    const deferMatch = line.match(/^\s*-\s*\[~\]\s+(.+)$/);

    if (doneMatch || todoMatch || deferMatch) {
      const title = (doneMatch?.[1] ?? todoMatch?.[1] ?? deferMatch?.[1] ?? "").trim().slice(0, 512);
      if (!title) continue;
      const status = doneMatch ? "done" : deferMatch ? "deferred" : "todo";
      const titleHash = createHash("sha256").update(title).digest("hex").slice(0, 64);
      tasks.push({ phase: currentPhase, area: currentArea, title, status, titleHash });
    }
  }
  return tasks;
}

// ─── Docs to review on every heartbeat ───────────────────────────────────────
const DOCS_TO_REVIEW = [
  { file: "docs/BRANDING.md",              docKey: "branding" },
  { file: "docs/GLOBAL_DESIGN.md",         docKey: "global_design" },
  { file: "docs/PHASE_1.md",               docKey: "phase_1" },
  { file: "docs/DESIGN_PRINCIPLES.md",     docKey: "design_principles" },
  { file: "docs/AI_MEMORY.md",             docKey: "ai_memory" },
  { file: "docs/PERFORMANCE.md",           docKey: "performance" },
  { file: "docs/SECURITY_ASSESSMENT.md",   docKey: "security_assessment" },
  { file: "docs/OAUTH_AUDIT.md",           docKey: "oauth_audit" },
  { file: "docs/BOOKING_ENRICHMENT.md",    docKey: "booking_enrichment" },
  { file: "docs/HARDWARE_PHILOSOPHY.md",   docKey: "hardware_philosophy" },
  { file: "docs/CONNECTIVITY_STRATEGY.md", docKey: "connectivity_strategy" },
  { file: "docs/DATETIME_MODEL.md",        docKey: "datetime_model" },
  { file: "docs/patterns/ENGINEERING_LESSONS.md", docKey: "engineering_lessons" },
  { file: "docs/patterns/OAUTH_REDIRECT_SEQUENCE.md", docKey: "oauth_redirect_sequence" },
  { file: "docs/SHADOW_BLOCK_ARCHITECTURE.md",    docKey: "shadow_block_architecture" },
  { file: "docs/SHADOW_BLOCK_UPDATE_PROPAGATION_AUDIT.md", docKey: "shadow_block_propagation_audit" },
];

// ─── Category display names (ordered for output) ─────────────────────────────
const CATEGORY_ORDER: Array<[string, string]> = [
  ["brand_colour",       "Brand Rainbow Palette"],
  ["foundation_colour",  "Foundation Colours"],
  ["typography",         "Typography"],
  ["logo",               "Logo & Symbol Geometry"],
  ["vertical",           "Life Verticals"],
  ["design_rule",        "Design Rules (Non-Negotiable)"],
  ["design_rules",       "Design Rules (Additional)"],
  ["light_mode",         "Light Mode Rules"],
  ["gantt",              "Gantt Chart Design Rules"],
  ["conflict_detection", "Conflict Detection Rules"],
  ["guest_name_overlay", "Guest Name Overlay Rules"],
  ["ical_limitations",   "iCal Platform Limitations"],
  ["upcoming_events",    "Upcoming Events Widget Specs"],
  ["dashboard",          "Dashboard Layout Rules"],
  ["architecture",       "Architecture Decisions"],
  ["phase_status",       "Phase Status"],
  ["knowledge_review",   "Knowledge Review System"],
  ["doc_location",       "Document Locations"],
  ["db_schema",          "Database Table Definitions"],
  ["db_schema_deprecated", "Deprecated Tables (Do Not Use)"],
  ["db_architecture",    "Database Architecture Decisions"],
];

// ─── Group by key ─────────────────────────────────────────────────────────────
function groupBy<T extends Record<string, unknown>>(arr: T[], key: string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function knowledgeReviewHandler(req: Request, res: Response) {
  try {
    // Auth: x-cron-secret header must match SYSTEM_CRON_SECRET (sent by Google Cloud Scheduler).
    // Allow localhost for dev/test without auth.
    const ip = req.ip ?? "";
    const isInternal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.");
    const secret = req.headers["x-cron-secret"];
    if (!isInternal && secret !== process.env.SYSTEM_CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "db-unavailable" });

    const now = new Date();
    const projectRoot = process.cwd();
    const docsDir = path.resolve(projectRoot, "docs");
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    // ── Step 1: Fetch all knowledge entries ──────────────────────────────────
    const entries = await db
      .select()
      .from(projectKnowledge)
      .orderBy(projectKnowledge.category, projectKnowledge.key);

    // ── Step 2: Mark all DB entries as reviewed today ─────────────────────────
    await db.update(projectKnowledge).set({ lastReviewedAt: now });

    // ── Step 3: Review each docs/ file and stamp its doc_location entry ───────
    const docsReviewed: string[] = [];
    const docsMissing: string[] = [];

    for (const { file, docKey } of DOCS_TO_REVIEW) {
      const fullPath = path.resolve(projectRoot, file);
      if (fs.existsSync(fullPath)) {
        // File exists — stamp lastReviewedAt on its doc_location entry
        await db
          .update(projectKnowledge)
          .set({ lastReviewedAt: now })
          .where(eq(projectKnowledge.key, docKey));
        docsReviewed.push(file);
      } else {
        docsMissing.push(file);
        console.warn(`[KnowledgeReview] Missing doc: ${file}`);
      }
    }

    // ── Step 3b: Auto-flag stale/deprecated knowledge entries ─────────────────
    // Entries that reference a sourceDoc that no longer exists on disk get flagged.
    // Entries in categories starting with "deprecated_" are already marked.
    const staleFlags: string[] = [];
    const KNOWN_SOURCE_DOCS = [
      "docs/BRANDING.md", "docs/GLOBAL_DESIGN.md", "docs/PHASE_1.md",
      "docs/DESIGN_PRINCIPLES.md", "docs/AI_MEMORY.md",
      "docs/PERFORMANCE.md", "docs/SECURITY_ASSESSMENT.md", "docs/OAUTH_AUDIT.md",
      "docs/BOOKING_ENRICHMENT.md", "docs/HARDWARE_PHILOSOPHY.md",
      "docs/CONNECTIVITY_STRATEGY.md", "docs/DATETIME_MODEL.md",
      "docs/patterns/ENGINEERING_LESSONS.md", "docs/patterns/OAUTH_REDIRECT_SEQUENCE.md",
      "drizzle/schema.ts", "server/routers.ts", "todo.md",
    ];
    for (const entry of entries) {
      if (!entry.sourceDoc) continue;
      const srcPath = path.resolve(projectRoot, entry.sourceDoc);
      const isKnown = KNOWN_SOURCE_DOCS.includes(entry.sourceDoc);
      const exists = isKnown || fs.existsSync(srcPath);
      if (!exists && !entry.category?.startsWith("deprecated_")) {
        // Flag as deprecated — source document no longer exists
        const reason = `Source doc '${entry.sourceDoc}' no longer exists on disk`;
        await db.update(projectKnowledge).set({
          category: `deprecated_${entry.category}`,
          notes: `⚠️ AUTO-DEPRECATED (${now.toISOString().slice(0, 10)}): ${reason}`,
          updatedAt: now,
        }).where(eq(projectKnowledge.id, entry.id));
        staleFlags.push(entry.key);
      }
    }
    if (staleFlags.length > 0) {
      console.log(`[KnowledgeReview] Auto-deprecated ${staleFlags.length} stale entries: ${staleFlags.join(", ")}`);
    }

    // ── Step 3c: Propagation health check ────────────────────────────────────
    // Alert if any calendar with recent events has verticalId = null.
    // These calendars receive events but produce no shadow blocks — a silent failure.
    // Known-legitimate nulls: iCal property booking calendars (provider=ical) and
    // personal calendars intentionally left unassigned.
    const propagationHealthIssues: Array<{ calendarId: string; calendarName: string; householdId: string; provider: string; recentEventCount: number }> = [];
    try {
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      // Find calendars with null verticalId that have events updated in the last 7 days
      const unassignedWithEvents = await db
        .select({
          calendarId: calendars.id,
          calendarName: calendars.name,
          householdId: calendars.householdId,
          provider: calendars.provider,
          eventCount: sql<number>`count(${events.id})`,
        })
        .from(calendars)
        .innerJoin(events, eq(events.calendarId, calendars.id))
        .where(and(
          isNull(calendars.verticalId),
          gt(events.updatedAt, new Date(oneWeekAgo)),
        ))
        .groupBy(calendars.id, calendars.name, calendars.householdId, calendars.provider)
        .having(gt(sql<number>`count(${events.id})`, 0));

      // Filter out known-legitimate nulls: iCal property booking calendars
      const LEGITIMATE_NULL_PROVIDERS = ["ical"];
      for (const row of unassignedWithEvents) {
        if (!LEGITIMATE_NULL_PROVIDERS.includes(row.provider ?? "")) {
          propagationHealthIssues.push({
            calendarId: row.calendarId,
            calendarName: row.calendarName ?? "(unnamed)",
            householdId: row.householdId ?? "",
            provider: row.provider ?? "",
            recentEventCount: Number(row.eventCount),
          });
        }
      }

      if (propagationHealthIssues.length > 0) {
        console.warn(
          `[KnowledgeReview] ⚠️ PROPAGATION HEALTH: ${propagationHealthIssues.length} calendar(s) with recent events have verticalId=null (shadow blocks NOT being created):`,
          propagationHealthIssues.map(i => `${i.calendarName} (${i.calendarId}, provider=${i.provider}, ${i.recentEventCount} events)`).join("; ")
        );
        // Notify owner
        try {
          const { notifyOwner } = await import("../_core/notification");
          await notifyOwner({
            title: "⚠️ Propagation Health Alert",
            content: `${propagationHealthIssues.length} calendar(s) with recent events have no vertical assigned — shadow blocks are NOT being created for these calendars:\n\n${propagationHealthIssues.map(i => `• ${i.calendarName} (${i.provider}, ${i.recentEventCount} recent events)`).join("\n")}\n\nFix: assign each calendar to a vertical in Settings → Calendars.`,
          });
        } catch (notifyErr) {
          console.warn("[KnowledgeReview] Could not send propagation health notification:", notifyErr);
        }
      } else {
        console.log("[KnowledgeReview] ✓ Propagation health: all Google/non-iCal calendars with recent events have verticalId assigned.");
      }
    } catch (healthErr) {
      console.warn("[KnowledgeReview] Propagation health check failed (non-fatal):", healthErr);
    }

    // ── Step 4a: Sync todo.md → project_tasks ────────────────────────────────
    const todoPath = path.resolve(projectRoot, "todo.md");
    let taskSyncResult = { inserted: 0, updated: 0, skipped: 0 };
    if (fs.existsSync(todoPath)) {
      const todoContent = fs.readFileSync(todoPath, "utf-8");
      const parsedTasks = parseTodoMd(todoContent);

      // Fetch existing tasks indexed by titleHash
      const existing = await db.select().from(projectTasks);
      const existingByHash = new Map(existing.map(t => [t.titleHash, t]));

      for (const task of parsedTasks) {
        const ex = existingByHash.get(task.titleHash);
        if (!ex) {
          // New task — insert
          await db.insert(projectTasks).values({
            phase: task.phase, area: task.area, title: task.title,
            status: task.status, titleHash: task.titleHash,
            completedAt: task.status === "done" ? now : null,
          });
          taskSyncResult.inserted++;
        } else if (ex.status !== task.status) {
          // Status changed — update
          await db.update(projectTasks)
            .set({ status: task.status, completedAt: task.status === "done" ? now : null, updatedAt: now })
            .where(eq(projectTasks.id, ex.id));
          taskSyncResult.updated++;
        } else {
          taskSyncResult.skipped++;
        }
      }
      console.log(`[KnowledgeReview] Task sync: +${taskSyncResult.inserted} inserted, ~${taskSyncResult.updated} updated, ${taskSyncResult.skipped} unchanged`);
    }

    // ── Step 4b: Regenerate docs/AI_MEMORY.md ────────────────────────────────
    const grouped = groupBy(entries, "category");
    const sections: string[] = [];

    sections.push(`# Geeves.Life — AI Memory Reference\n`);
    sections.push(`> **Auto-generated** by the 24h knowledge-review heartbeat (\`knowledgeReview.ts\`). Last generated: ${now.toISOString().split("T")[0]}.\n> Do not edit this file manually — update the \`project_knowledge\` DB table instead, then trigger the heartbeat or wait for the 24h cycle.\n`);
    sections.push(`Any AI agent or contributor working on this project **must read this file at session start** before making any UI, colour, typography, or structural changes. This document is the single source of truth for brand, design, and architectural decisions.\n`);
    sections.push(`---\n`);

    let sectionNum = 1;
    for (const [category, label] of CATEGORY_ORDER) {
      const items = grouped[category];
      if (!items || items.length === 0) continue;

      sections.push(`## ${sectionNum}. ${label}\n`);
      sectionNum++;

      sections.push(`| Key | Value |`);
      sections.push(`|-----|-------|`);
      for (const item of items) {
        const key = String(item.key).replace(/_/g, " ");
        const value = String(item.value).replace(/\|/g, "\\|").replace(/\n/g, " ");
        sections.push(`| **${key}** | ${value} |`);
      }
      sections.push("");
    }

    // Catch any categories not in CATEGORY_ORDER
    const knownCategories = new Set(CATEGORY_ORDER.map(([c]) => c));
    const unknownCategories = Object.keys(grouped).filter(c => !knownCategories.has(c));
    if (unknownCategories.length > 0) {
      sections.push(`## ${sectionNum}. Other Knowledge\n`);
      sectionNum++;
      sections.push(`| Category | Key | Value |`);
      sections.push(`|----------|-----|-------|`);
      for (const cat of unknownCategories) {
        for (const item of grouped[cat]) {
          const key = String(item.key).replace(/_/g, " ");
          const value = String(item.value).replace(/\|/g, "\\|").replace(/\n/g, " ");
          sections.push(`| ${cat} | **${key}** | ${value} |`);
        }
      }
      sections.push("");
    }

    // ── Task status summary section ─────────────────────────────────────────
    const allTasks = await db.select().from(projectTasks);
    if (allTasks.length > 0) {
      const tasksByStatus: Record<string, number> = {};
      const tasksByArea: Record<string, Record<string, number>> = {};
      for (const t of allTasks) {
        tasksByStatus[t.status] = (tasksByStatus[t.status] ?? 0) + 1;
        if (!tasksByArea[t.area]) tasksByArea[t.area] = {};
        tasksByArea[t.area][t.status] = (tasksByArea[t.area][t.status] ?? 0) + 1;
      }
      const total = allTasks.length;
      const done = tasksByStatus["done"] ?? 0;
      const pct = Math.round((done / total) * 100);

      sections.push(`## ${sectionNum}. Project Task Status (Live from DB)\n`);
      sectionNum++;
      sections.push(`> **${pct}% complete** — ${done}/${total} tasks done. Synced from \`todo.md\` on every heartbeat run.\n`);
      sections.push(`| Status | Count |`);
      sections.push(`|--------|-------|`);
      for (const [s, c] of Object.entries(tasksByStatus).sort()) {
        sections.push(`| ${s} | ${c} |`);
      }
      sections.push("");
      sections.push(`| Area | Done | Todo | Other |`);
      sections.push(`|------|------|------|-------|`);
      for (const [area, counts] of Object.entries(tasksByArea).sort()) {
        sections.push(`| ${area} | ${counts["done"] ?? 0} | ${counts["todo"] ?? 0} | ${(counts["in_progress"] ?? 0) + (counts["deferred"] ?? 0) + (counts["blocked"] ?? 0)} |`);
      }
      sections.push("");
    }

    sections.push(`---\n`);
    sections.push(`## How to Update This Knowledge Base\n`);
    sections.push(`1. Insert or update rows in the \`project_knowledge\` DB table (via the Database panel or SQL).\n`);
    sections.push(`2. This file regenerates automatically every 24 hours. To regenerate immediately: Schedules panel → task \`oGKgfGPrv2Djogw85etY8R\` → "Run Now".\n`);
    sections.push(`3. After any significant architectural or brand decision, add a new row immediately — do not wait for the next cycle.\n`);
    sections.push(`4. All \`docs/\` documents are reviewed on every heartbeat run. If a document changes significantly, update the corresponding \`doc_location\` entry and add new \`project_knowledge\` rows to capture key decisions.\n`);
    sections.push(`\n*Generated from ${entries.length} entries across ${Object.keys(grouped).length} categories. Docs reviewed: ${docsReviewed.join(", ")}${docsMissing.length > 0 ? `. Missing: ${docsMissing.join(", ")}` : ""}.*\n`);

    const markdown = sections.join("\n");
    fs.writeFileSync(path.join(docsDir, "AI_MEMORY.md"), markdown, "utf-8");

    console.log(
      `[KnowledgeReview] Regenerated docs/AI_MEMORY.md with ${entries.length} entries across ${Object.keys(grouped).length} categories. Docs reviewed: ${docsReviewed.length}/${DOCS_TO_REVIEW.length}.`
    );

    return res.json({
      ok: true,
      entriesReviewed: entries.length,
      categoriesFound: Object.keys(grouped).length,
      docsReviewed,
      docsMissing,
      taskSync: taskSyncResult,
      staleEntriesDeprecated: staleFlags.length,
      propagationHealthIssues: propagationHealthIssues.length,
      propagationHealthDetails: propagationHealthIssues,
      generatedAt: now.toISOString(),
    });
  } catch (err: any) {
    console.error("[KnowledgeReview] Error:", err);
    return res.status(500).json({
      error: err?.message ?? "Unknown error",
      stack: err?.stack,
      timestamp: new Date().toISOString(),
    });
  }
}
