# Manus Support Reply — Final Version
*Completed Jun 19, 2026 | Ready to send to support@manus.im*
*Reply to: Riley's email of Jun 19, 2026*

---

Hi Riley,

Thank you for the thoughtful response and for escalating this to your internal team. Before I answer your questions, I want to be direct about something: I am not writing this as a frustrated customer. I am writing it as someone who genuinely loves this product, has been one of its most active advocates, and wants to help make it better. I have introduced Manus to colleagues and clients, recommended it publicly, and invested significant time and money building three substantial production projects on it. That context matters, because what follows is not a complaint — it is a detailed, evidence-backed account of a platform-level issue that I believe, if addressed, would make Manus significantly more valuable for the power users who are driving your most complex and commercially meaningful use cases.

I would genuinely welcome the opportunity to work with your product and engineering teams as a design partner on this. I have direct, lived experience of exactly where the system breaks down at scale, and I have already built workarounds that could inform a proper platform solution.

---

### Your Questions — Answered

**1. Plan:** Pro Plan.

**2 & 3. Affected projects, dates, and credit usage:**

The issue has affected three projects across approximately four months, representing the majority of my total platform usage. I will share session share links separately — but first, a note on that: I would like to formally request a **secure, access-controlled method for sharing session links** with your support team. Several of my projects contain commercially sensitive IP and proprietary business logic. The current public share link mechanism is not appropriate for this type of disclosure. I am very willing to share the sessions — I simply need a mechanism that does not expose my clients' data publicly. A time-limited, support-team-only access token, or a direct secure upload channel, would resolve this.

| Project | Project ID | Duration | Net Credits Used |
|---|---|---|---|
| **MBOMS** (Maxfield Bakery Order Management System) | *(MBOMS project)* | Jan 14 – Jun 19, 2026 (~5 months) | **2,527,386** |
| **StartOut** (Conference scheduling platform) | `N8kSRpESEW6PDnG7PDKBaF` | May 19 – Jun 19, 2026 (~31 days) | **253,052** |
| **Geeves.life** (Personal life management platform) | `nKRUueEwEcFgrDnsh3N8Ek` | Feb 2026 – present | **138,955** |
| **Total across all projects** | | | **3,098,893** |

To put this in perspective: I have consumed over **3 million credits** on this platform, the overwhelming majority of which went into three complex, production-grade projects. MBOMS alone accounts for 2.5 million credits across 5 months of active development. These are not casual experiments — they are real business systems that I and my clients depend on. The context retention failures I am describing have affected every phase of all three projects.

---

### The Evidence — By Project

#### MBOMS — 5 Months, 763 Commits, ~190,000 Lines of Code, 2,527,386 Credits

This is my largest project on the platform and the one most severely affected. The evidence of context loss is measurable, documented, and verifiable from the project filesystem and git history.

**Documentation written specifically to compensate for context loss — ~79,000+ words across 40+ files:**

| Location | Words | Purpose |
|---|---|---|
| `todo.md` (inside project) | 69,716 words / 7,290 lines | Exhaustive task tracking — functions as session-to-session memory because the agent cannot hold project state |
| `migration-map.md` | 434 | Schema decision reference — because the agent cannot remember which migrations do what |
| `docpack-investigation.md` | 352 | Investigation notes |
| `pdf-review-notes.md` | 483 | PDF generation decisions |
| ~30 state dump files (outside project) | ~3,500+ words | Created mid-task to persist working memory when context windows fill |
| 7 MBOMS-specific skills | ~4,912 words | Entire recurring workflows documented so the agent can re-learn them each session |

A `todo.md` that is **69,716 words — roughly the length of a novel** — is not normal project management. It exists because the agent cannot hold project state across sessions and requires a written record to function. This file is itself the most compelling evidence of the problem.

**Features built more than once — direct git evidence:**

| Commit | What Happened |
|---|---|
| `ab3a8a6` | "Fixed double-counting bug" in cash payments — payment validation was called after receipt creation, counting the same payment twice. Classic "forgot the earlier step exists" error. |
| `828c4be` | "Fixed double taxation issue for 9 orders" — 15% GCT applied on top of already-inclusive prices. Tax logic re-implemented without awareness it was already inclusive. |
| `ee113be` | "Reverted `recalculatePickListTotals`" — source of truth changed and then reverted. |
| `5678adb` | "Reverted 3 incorrectly assigned orders from draft pick lists" — load algorithm rebuilt incorrectly. |
| `e6d005d` | "Reverted 24 bulk-moved orders" — bulk operation done without awareness of constraints. |

**Structural indicators of context loss:**
- **399 out of 763 commits (52%) contain "fix"** — an unusually high fix-to-feature ratio for a project of this scope and maturity.
- **6 commits contain "revert"** — explicit rollbacks of decisions that were forgotten between sessions.
- **4 sequential `import_dialog_state` files created within 4 minutes on March 31** — the agent was clearly losing context mid-task and writing state to disk repeatedly to compensate.
- **106 database migrations over 5 months** — approximately 1 migration every 1.4 days, strongly suggesting schema decisions were being forgotten and re-made.

---

#### StartOut — Sandbox Crash, Cascading Failures, 100% Session Waste, 253,052 Credits

This project experienced the most severe failure mode: an **unrecoverable sandbox crash** that wasted an entire session and triggered a cascade of downstream failures. The sequence is documented precisely:

1. A session hit token limits and had to be terminated. A 2,500+ word handover block was manually assembled just so the next session could understand what had been built — this is itself evidence of the problem.
2. The next session inherited a sandbox already at load 100 (broken from the previous session's context pressure).
3. Every recovery attempt — `git checkout`, `webdev_rollback`, `killall` — timed out or failed.
4. Load escalated from 100 → 147 → 342 over the course of the session.
5. **Zero productive work was accomplished.** Every credit spent in that session went to failed recovery attempts.
6. A separate task was started to rebuild the site, which published to the wrong URL, requiring yet another task to fix.
7. Seven pending edits that were already in progress had to be re-applied from scratch across two additional sessions.

The handover documentation alone — `<current_progress>`, `<current_state>`, `<technical_context>`, `<key_files>`, `<next_steps>`, `<user_requirements>` — totalled over 2,500 words written specifically so the next session could pick up where the last left off. This is not project documentation. It is AI memory compensation.

---

#### Geeves.life — A Knowledge Management System Built Inside the App, 138,955 Credits

On this project, having learned from MBOMS and StartOut, I took a proactive approach and built an entire knowledge management subsystem *inside the application itself* — not because the application requires it, but because the platform's own knowledge management cannot be relied upon. This is the most telling evidence of all: I spent a meaningful portion of my Geeves.life budget building infrastructure to compensate for a platform failure.

**What I built at my own cost, specifically to compensate for context loss:**

| System | Description |
|---|---|
| `project_knowledge` DB table | 85 entries across 18 categories — persistent store that survives context resets |
| `docs/AI_MEMORY.md` (2,581 words) | Auto-regenerated every 24 hours — designed to be re-read at the start of every session |
| `docs/PHASE_1.md` (4,919 words) | Architectural decisions documented because the agent forgets them between sessions |
| `docs/GLOBAL_DESIGN.md` (6,399 words) | Full design system documented because the agent reverts to generic styling after context loss |
| `docs/BRANDING.md` + 5 other reference docs | Brand, security, performance, connectivity, and hardware philosophy — all written to compensate for forgetting |
| `project_tasks` DB table | 193 tasks seeded from `todo.md` — because the agent cannot reliably track what has been built vs. what is pending |
| Knowledge review heartbeat (24h cron) | Automated sync of `todo.md` → DB + regeneration of `AI_MEMORY.md` on every run |
| Super Admin portal (`/super-admin` page) | A full admin interface built into the application to inspect and manage project state independently of the agent |

**Total compensatory documentation on Geeves.life alone: ~15,000+ words across 10 docs.**

---

### The Aggregate Picture

Across all three projects, I have written approximately **~94,000 words of documentation** whose primary purpose is to compensate for context loss — not to serve the applications themselves. To put that in perspective: the average non-fiction book is 70,000–80,000 words. I have written more than a book's worth of AI memory scaffolding just to keep a development agent functional across sessions.

The total credit spend across all projects is **3,098,893 credits**. I am not asking for a full refund. I am asking for a fair acknowledgement of the proportion of that spend that went to context recovery, feature rebuilding, and workaround infrastructure that would have been unnecessary if the platform's knowledge management worked as intended.

---

### What I Am Asking For

1. **Acknowledgement** that cross-session context retention failure for long-running projects is a known platform issue, not expected behaviour, and that the 100-entry knowledge base limit for Pro is insufficient for projects of this scope.

2. **Credit compensation** commensurate with the sessions demonstrably wasted on context recovery, feature rebuilding, and workaround infrastructure — particularly the complete session loss on StartOut and the recurring rebuild cycles on MBOMS. I am happy to work with your team to quantify this from session logs.

3. **A secure session-sharing mechanism** for support escalations. The current public share link is not appropriate for projects containing commercially sensitive IP. I want to cooperate fully with your investigation — I simply need a way to do so without exposing my clients' data.

4. **A timeline or roadmap item** for when cross-session context retention will work reliably for long-running projects on the Pro plan.

5. **A design partnership conversation.** I have direct, documented experience of exactly where this breaks down at scale. I have already built workarounds that could inform a proper platform solution. I am motivated to help, and I believe a conversation between your product team and a power user who has stress-tested the system this thoroughly would be genuinely valuable for both sides.

I have attached three supporting documents with this email:
- **`MANUS_BUG_REPORT.md`** — technical root cause analysis with five specific platform fix requests
- **`Context_Retention_Evidence_Report_—_MBOMS_Project.pdf`** — quantified evidence from the MBOMS project (git analysis, migration counts, documentation overhead)
- **StartOut evidence report** — sandbox crash sequence and cascading failure documentation

I look forward to your response, and I genuinely hope this level of documentation is useful to your team.

Tarik Perkins
Pro Plan | 3,098,893 credits used
Projects: Geeves.life (`nKRUueEwEcFgrDnsh3N8Ek`), MBOMS, StartOut (`N8kSRpESEW6PDnG7PDKBaF`)
