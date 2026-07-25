# Formal Bug Report: Knowledge Management Context Retention Failure

**Submitted by:** Supah-T (Product Designer), Geeves.life Project  
**Date:** June 19, 2026  
**Severity:** High — impacts continuity of all long-running AI-assisted development projects  
**Product:** Manus AI — Agent Knowledge Management System  
**Report to:** [https://help.manus.im](https://help.manus.im)

---

## Executive Summary

The Manus AI agent repeatedly reports that its knowledge context is "at its limit" and loses awareness of completed work across sessions, even when the user has explicitly disabled all knowledge retention settings. This creates a compounding problem: the agent cannot reliably distinguish between what has been built and what remains to be done, leading to redundant work, incorrect status reporting, and loss of project continuity. This report documents the observed behaviour, its impact, and the workarounds that have been implemented at the project level.

---

## 1. Problem Description

### 1.1 Observed Behaviour

During the development of the Geeves.life project (a long-running, multi-session AI-assisted web application), the following behaviours have been consistently observed:

The agent periodically reports that its knowledge context has reached its limit, despite the user having disabled all knowledge retention settings in the Manus platform. After each new session begins, the agent demonstrates incomplete or incorrect awareness of the project's current state — specifically, it cannot reliably distinguish between features that have been fully implemented and those that are still pending. This results in the agent proposing to re-implement work that already exists, or marking items as incomplete when they have been done.

The agent's own internal `todo.md` tracking has drifted from the actual codebase state, because status updates written in one session are not reliably carried forward into the next. The agent has acknowledged this drift directly during the current session, noting "a trend of not really knowing what has been done from what has not."

### 1.2 Reproduction Steps

1. Start a new Manus project with a complex, multi-phase development scope (10+ features, 100+ tasks).
2. Disable all knowledge retention settings in the Manus platform settings.
3. Work across 10 or more sessions, implementing features and marking tasks complete in `todo.md`.
4. Begin a new session and ask the agent to continue from where it left off.
5. Observe that the agent either (a) reports context limit warnings, (b) proposes re-implementing already-built features, or (c) cannot accurately report the percentage of work completed.

### 1.3 Expected Behaviour

When knowledge retention is disabled, the agent should rely entirely on the project's codebase and any explicitly maintained context files (such as `todo.md` or `AI_MEMORY.md`) to reconstruct its understanding of the project state. It should not report context limit warnings that contradict the user's retention settings, and it should not lose awareness of completed work between sessions.

---

## 2. Impact Assessment

| Impact Area | Description | Severity |
|---|---|---|
| **Project continuity** | Agent cannot reliably resume work across sessions without manual re-briefing | High |
| **Developer trust** | Repeated loss of context erodes confidence in AI-assisted development for long projects | High |
| **Redundant work** | Agent proposes re-implementing completed features, wasting session time | Medium |
| **Audit trail** | Completed tasks may be incorrectly marked as pending in project records | Medium |
| **User experience** | User must manually re-explain project state at the start of each session | High |

---

## 3. Root Cause Hypothesis

Based on observed behaviour, there appear to be two distinct but related issues:

**Issue A — Context window compression:** The Manus agent operates within a fixed context window. As a session grows longer, earlier context (including completed task records) is compressed or dropped to make room for new information. This is a known architectural constraint of large language model systems, but the agent's behaviour suggests that the compression is not gracefully handled — it reports "context at limit" rather than silently falling back to file-based context.

**Issue B — Knowledge retention setting conflict:** The user has disabled knowledge retention, but the agent still reports retention-related warnings. This suggests either (a) the retention setting is not being correctly applied to the agent's context management system, or (b) the warning message is triggered by a different mechanism than the one controlled by the retention setting.

---

## 4. Workarounds Implemented

Because the platform-level knowledge management system is unreliable for this use case, the following project-level workarounds have been built directly into the Geeves.life application:

**4.1 Database-driven task tracker (`project_tasks` table).** All tasks from `todo.md` are seeded into a persistent MySQL database table with fields for `phase`, `area`, `status`, `titleHash`, `completedAt`, and `notes`. This table is the authoritative record of project progress and survives context resets.

**4.2 Automated todo.md → DB sync via heartbeat.** The existing 24-hour knowledge review heartbeat (`knowledgeReview.ts`) has been extended to parse `todo.md` on every run and upsert any status changes into the `project_tasks` table. New tasks are inserted; status changes are propagated. This means the DB always reflects the latest state of `todo.md`, even if the agent's in-session memory has been compressed.

**4.3 Regenerated `AI_MEMORY.md` with task status section.** The heartbeat now appends a live task status summary (completion percentage, counts by status and area) to `docs/AI_MEMORY.md`. This file is designed to be read at the start of every new session to reconstruct project state without relying on the agent's retained memory.

**4.4 Super Admin portal (`/super-admin`).** A dedicated, `system_admin`-gated page in the application provides a live, queryable view of all tasks, knowledge base entries, and audit log entries. This gives the technical team full visibility into project state independent of the agent's session memory.

---

## 5. Requested Platform Fixes

The following changes are requested from the Manus platform team:

| Request | Priority | Description |
|---|---|---|
| **Fix retention setting enforcement** | High | When knowledge retention is disabled, the agent must not report retention-related context limit warnings. The setting should fully suppress the warning pathway. |
| **Graceful context compression** | High | When the context window approaches its limit, the agent should silently fall back to reading project files (e.g., `todo.md`, `AI_MEMORY.md`) rather than reporting a warning that confuses the user. |
| **Session handoff protocol** | Medium | Provide a mechanism for the agent to write a structured "session summary" to a project file at the end of each session, which is automatically read at the start of the next session. |
| **Persistent task state** | Medium | Consider offering a platform-level task tracking primitive (separate from the context window) that the agent can read and write across sessions without compression. |
| **Clearer documentation** | Low | Document the exact behaviour of knowledge retention settings and context window limits so users can design their projects accordingly. |

---

## 6. How to Submit This Report

This report should be submitted to the Manus support team at **[https://help.manus.im](https://help.manus.im)**.

When submitting, include:
- This document as an attachment
- The project ID: `nKRUueEwEcFgrDnsh3N8Ek` (Geeves for Life Management)
- The approximate session dates when the behaviour was observed: February–June 2026
- A note that knowledge retention was explicitly disabled by the user prior to the observed behaviour

---

*This report was drafted on June 19, 2026, during an active development session on the Geeves.life project. The workarounds described in Section 4 are already implemented and operational.*
