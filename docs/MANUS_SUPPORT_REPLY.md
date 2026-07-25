# Manus Support Reply — Context Retention Bug
*Draft prepared Jun 19, 2026 | For submission to support@manus.im in reply to Riley's email*

---

## REPLY TO RILEY — IMPROVED DRAFT

---

Hi Riley,

Thank you for the response. To answer your questions directly:

**1. Plan:** Pro Plan.

**2 & 3. Affected projects and timeline:**

This issue has been affecting me since approximately **March 2026**, starting with my **MBOMS project** (Maxfield Bakery Order Management System). It has continued into my current **Geeves.life project**, which I started specifically to build a personal life management platform. I will share session links separately, but I want to first give you the full picture of the financial and operational impact, because I believe this goes beyond a standard support ticket.

---

### The Core Problem

Your response describes the 100-entry knowledge base limit as a "workaround" — but this framing misses the severity of what I am experiencing. The issue is not simply that the knowledge base fills up. The problem is a combination of three compounding failures:

1. **The agent loses awareness of completed work between sessions**, regardless of whether knowledge retention is enabled or disabled. It proposes re-implementing features that already exist in the codebase, marks completed tasks as pending, and cannot accurately report project state.

2. **The agent reports context limit warnings even when I have explicitly disabled all knowledge retention settings.** If the retention setting is supposed to control this behaviour, it is not working.

3. **There is no graceful degradation.** When the context window fills, the agent does not fall back to reading the project's own files. It simply loses state silently, and I only discover this when I notice it re-building something I already paid for.

---

### Quantified Impact on the Geeves.life Project Alone

To give you a concrete sense of the scale, here is what I have had to build *at my own cost* specifically to work around the broken knowledge management system on the Geeves.life project:

| Workaround Built | Why It Was Necessary |
|---|---|
| **`project_knowledge` DB table** (85 entries across 18 categories) | Manus knowledge base fills up and loses entries; I needed a persistent store that survives context resets |
| **`docs/AI_MEMORY.md`** (2,581 words, auto-regenerated every 24h) | Agent cannot reconstruct project state from memory alone; I had to build a document it re-reads at the start of every session |
| **`docs/PHASE_1.md`** (4,919 words) | Detailed phase documentation written specifically because the agent forgets architectural decisions |
| **`docs/GLOBAL_DESIGN.md`** (6,399 words) | Design system documented in full because the agent repeatedly reverts to generic styling after context loss |
| **`docs/BRANDING.md`** (1,368 words) | Brand palette and typography documented because the agent forgets brand decisions mid-session |
| **`project_tasks` DB table** (193 tasks seeded from `todo.md`) | The agent cannot reliably track what has been built vs. what is pending; I built a database-driven task tracker to compensate |
| **Knowledge review heartbeat** (runs every 24h) | Automated sync of `todo.md` → DB, regeneration of `AI_MEMORY.md`, stamping of all knowledge entries — because the agent cannot maintain this state itself |
| **Super Admin portal** (`/super-admin` page) | A full admin interface built into the application itself so I can inspect and manage project state independently of the agent's session memory |
| **`docs/CONNECTIVITY_STRATEGY.md`, `DESIGN_PRINCIPLES.md`, `SECURITY_ASSESSMENT.md`, `HARDWARE_PHILOSOPHY.md`, `PERFORMANCE.md`** | Additional reference documents written because the agent forgets strategic decisions |

In total, I have written over **15,000 words of documentation** and built an entire **knowledge management subsystem** inside my application — not because the application requires it, but because Manus's own knowledge management is broken. This represents a significant number of sessions and credits spent on infrastructure that should be provided by the platform.

The Geeves.life project currently has:
- **39 database tables** across a full-stack application
- **193 tracked tasks** (168 complete, 34 pending)
- **10 test files with 182 passing tests**
- **9 feature routers**, **7 backend services**, **22 frontend pages**
- **23 database migrations**

This is a substantial, production-grade project. The context loss problem has affected every phase of it.

---

### Impact on the MBOMS Project

The MBOMS project (which predates Geeves.life) was where I first encountered this issue at scale, starting around March 2026. On that project I experienced repeated instances of the agent re-implementing features that had already been built, losing awareness of database schema decisions, and reverting UI components to earlier states after context resets. I will share specific session links for that project in a follow-up.

---

### What I Am Asking For

I am a power user and active promoter of Manus. I genuinely believe in the product. But I have spent a disproportionate amount of money compensating for a platform-level failure that has persisted for over three months. I am asking for:

1. **Acknowledgement** that this is a known platform issue, not expected behaviour.
2. **A credit or compensation** commensurate with the sessions spent rebuilding work and building workarounds — I am happy to work with your team to quantify this.
3. **A timeline** for when context retention across sessions will work reliably for long-running projects.
4. **Escalation** to the engineering team with the detailed technical report I have already prepared (attached: `MANUS_BUG_REPORT.md`).

I have attached my full technical bug report, which includes root cause analysis, specific reproduction steps, and five concrete platform fix requests. I hope this level of documentation demonstrates both the seriousness of the issue and my commitment to helping you resolve it properly.

Thank you for taking this seriously.

Tarik Perkins
Geeves.life Project | MBOMS Project
Pro Plan

---
---

## DATA-GATHERING PROMPT
*Run this in your MBOMS task and any other affected Manus tasks to collect evidence for the final draft*

---

### PROMPT TO RUN IN OTHER AFFECTED TASKS:

> I need your help gathering evidence for a formal support complaint I am submitting to Manus about context retention failures across long-running projects. Please answer the following questions as accurately as you can based on what you can observe in this project's codebase and history:
>
> 1. **How many times in this project have you been asked to re-read documentation, re-read `todo.md`, or re-read design docs at the start of a session or mid-session?** Give a rough count or range if you can.
>
> 2. **Are there any features, components, or systems in this project that appear to have been built more than once?** List any files or areas where you can see evidence of rebuilding (e.g., duplicate implementations, commented-out old versions, migration files that reverse earlier migrations, or git history showing a feature being re-added).
>
> 3. **How many documentation files exist in this project that were written specifically to compensate for context loss** (e.g., `AI_MEMORY.md`, `PHASE_1.md`, design docs, architecture docs, `todo.md`)? List them with word counts if possible.
>
> 4. **How many database migrations exist in this project?** A high migration count relative to the project's age can indicate schema decisions being forgotten and re-made.
>
> 5. **Are there any `todo.md` or equivalent tracking files?** If so, how many tasks are tracked, and how many are marked complete vs. pending?
>
> 6. **What is the approximate date range of this project** (first session to most recent)?
>
> 7. **Can you identify any specific sessions or moments where you clearly lost context** — for example, where you asked about something that had already been decided, or where you proposed something that contradicted an earlier decision?
>
> 8. **What workarounds, if any, were built into this project specifically to manage context loss?** (e.g., knowledge tables, heartbeat jobs, memory files, re-read instructions at session start)
>
> Please be as specific as possible. I will use your answers to substantiate a compensation request to Manus support. The more concrete the evidence (file names, counts, dates), the stronger the case.

---

*Once you have responses from MBOMS and any other affected projects, share them here and I will merge all the evidence into a final, unified support letter.*
