# Manus Support Reply — Context Retention Bug (Version 2)
*Revised Jun 19, 2026 | Collaborative tone, cross-project evidence, design partner framing*
*Submit to: support@manus.im in reply to Riley's email*

---

## REPLY DRAFT

---

Hi Riley,

Thank you for the thoughtful response and for escalating this to your internal team. I want to be upfront about something before I answer your questions: I am writing this not as a frustrated customer, but as someone who genuinely loves this product and has been one of its most active advocates. I have introduced Manus to colleagues, recommended it publicly, and built three substantial production projects on it. That context matters, because what I am describing is not a complaint — it is a detailed, evidence-backed account of a platform-level issue that I believe, if addressed, would make Manus significantly more valuable for the power users who are driving your most complex and commercially meaningful use cases.

I would love the opportunity to work with your team as a design partner on this. I have direct, lived experience of where the system breaks down at scale, and I have already built workarounds that could inform a proper platform solution.

---

### Your Questions — Answered

**1. Plan:** Pro Plan.

**2 & 3. Affected projects, session links, and dates:**

The issue has affected three projects across approximately four months. I am providing evidence from all three below and will share session share links separately.

| Project | Project ID | Duration | First Affected |
|---|---|---|---|
| **MBOMS** (Maxfield Bakery Order Management System) | *(MBOMS project)* | Jan 14 – Jun 19, 2026 (~5 months) | ~March 2026 |
| **StartOut** (Conference scheduling platform) | `N8kSRpESEW6PDnG7PDKBaF` / Webdev: `YnzXDmcCk7cP3f8VERvhCr` | May 19 – Jun 19, 2026 (~31 days) | May 2026 |
| **Geeves.life** (Personal life management platform) | `nKRUueEwEcFgrDnsh3N8Ek` | Feb 2026 – present | Ongoing |

---

### The Evidence — By Project

I want to give you the kind of specificity that your engineering team can actually act on.

#### MBOMS — 5 Months, 763 Commits, ~190,000 Lines of Code

This is my largest project on the platform. The evidence of context loss is measurable and documented:

**Documentation written specifically to compensate for context loss — ~79,000+ words across 40+ files:**

| Location | Words | Purpose |
|---|---|---|
| `todo.md` (inside project) | 69,716 words / 7,290 lines | Exhaustive task tracking — functions as session-to-session memory |
| `migration-map.md` | 434 | Schema decision reference — because the agent cannot remember migrations |
| `docpack-investigation.md` | 352 | Investigation notes |
| `pdf-review-notes.md` | 483 | PDF generation decisions |
| ~30 state dump files (outside project) | ~3,500+ words | Created mid-task to persist working memory when context windows fill |
| 7 MBOMS-specific skills | ~4,912 words | Entire workflows documented so the agent can re-learn them each session |

A `todo.md` that is 69,716 words — roughly the length of a novel — is not normal project management. It exists because the agent cannot hold project state across sessions and needs a written record to function.

**Features built more than once — direct git evidence:**

| Commit | What Happened |
|---|---|
| `ab3a8a6` | "Fixed double-counting bug" in cash payments — payment validation was called after receipt creation, counting the same payment twice. Classic "forgot the earlier step exists" error. |
| `828c4be` | "Fixed double taxation issue for 9 orders" — 15% GCT applied on top of already-inclusive prices. Tax logic re-implemented without awareness it was already inclusive. |
| `ee113be` | "Reverted `recalculatePickListTotals`" — source of truth changed and then reverted. |
| `5678adb` | "Reverted 3 incorrectly assigned orders from draft pick lists" — load algorithm rebuilt incorrectly. |
| `e6d005d` | "Reverted 24 bulk-moved orders" — bulk operation done without awareness of constraints. |

**Structural indicators of context loss:**
- **399 out of 763 commits (52%) contain "fix"** — an unusually high fix-to-feature ratio for a project of this scope.
- **6 commits contain "revert"** — explicit rollbacks of decisions that were forgotten.
- **4 sequential `import_dialog_state` files created within 4 minutes on March 31** — the agent was clearly losing context mid-task and writing state to disk repeatedly to compensate.
- **106 database migrations over 5 months** — approximately 1 migration every 1.4 days, suggesting schema decisions were being forgotten and re-made.

---

#### StartOut — Sandbox Crash, Cascading Failures, 100% Session Waste

This project experienced the most severe failure mode: an **unrecoverable sandbox crash** that wasted an entire session and left pending work in an irrecoverable state.

The sequence of events:
1. A previous session hit token limits and had to be terminated, requiring a 2,500+ word handover block to be manually assembled just so the next session could understand what had been built.
2. The next session inherited a sandbox already at load 100 (broken from the previous session).
3. Every recovery attempt — `git checkout`, `webdev_rollback`, `killall` — timed out or failed.
4. Load escalated from 100 → 147 → 342 over the course of the session.
5. **Zero productive work was accomplished.** All time and credits were spent on failed recovery attempts.
6. The user was forced to start a separate task to rebuild the site, which published to the wrong URL, requiring yet another task to fix.
7. Seven pending edits that were already in progress had to be re-applied from scratch.

The handover documentation alone — `<current_progress>`, `<current_state>`, `<technical_context>`, `<key_files>`, `<next_steps>`, `<user_requirements>` — totalled over 2,500 words written specifically so the next session could pick up where the last left off. This is not project documentation. It is AI memory compensation.

---

#### Geeves.life — A Knowledge Management System Built Inside the App

On this project, having learned from MBOMS and StartOut, I took a proactive approach and built an entire knowledge management subsystem *inside the application itself* — not because the application requires it, but because the platform's own knowledge management cannot be relied upon.

**What I built at my own cost, specifically to compensate for context loss:**

| System | Description |
|---|---|
| `project_knowledge` DB table | 85 entries across 18 categories — persistent store that survives context resets |
| `docs/AI_MEMORY.md` (2,581 words) | Auto-regenerated every 24 hours — designed to be re-read at the start of every session |
| `docs/PHASE_1.md` (4,919 words) | Architectural decisions documented because the agent forgets them |
| `docs/GLOBAL_DESIGN.md` (6,399 words) | Full design system documented because the agent reverts to generic styling after context loss |
| `docs/BRANDING.md` + 5 other docs | Brand, security, performance, connectivity, hardware philosophy |
| `project_tasks` DB table | 193 tasks seeded from `todo.md` — because the agent cannot track what has been built vs. pending |
| Knowledge review heartbeat | 24h automated sync of `todo.md` → DB + regeneration of `AI_MEMORY.md` |
| Super Admin portal (`/super-admin`) | A full admin interface built into the application to inspect project state independently of the agent |

**Total compensatory documentation on Geeves.life: ~15,000+ words across 10 docs.**

Combined across all three projects, I have written approximately **~94,000 words of documentation** whose primary purpose is to compensate for context loss — not to serve the applications themselves.

---

### What I Am Asking For

I want to be clear that I am not writing this to be adversarial. I am writing it because I believe Manus has the potential to be the best AI development platform available, and I want to help make it that. The issues I have described are solvable, and I would genuinely welcome the chance to work with your product and engineering teams as a design partner to help define what reliable context retention should look like for power users building complex, long-running projects.

Concretely, I am asking for four things:

1. **Acknowledgement** that the context retention failure across multi-session projects is a known platform issue, not expected behaviour, and that the knowledge base entry limit (100 entries for Pro) is insufficient for projects of this scope.

2. **Credit compensation** for the sessions demonstrably wasted on context recovery, feature rebuilding, and workaround infrastructure — particularly the complete session loss on StartOut and the recurring rebuild cycles on MBOMS. I am happy to work with your team to quantify this from session logs.

3. **A timeline or roadmap item** for when cross-session context retention will work reliably for long-running projects on the Pro plan.

4. **A design partnership conversation** — I have direct experience of exactly where this breaks down, I have built workarounds that could inform a proper solution, and I am motivated to help. I would welcome an introduction to whoever owns this area of the product.

I have attached three supporting documents:
- `MANUS_BUG_REPORT.md` — technical root cause analysis and five specific platform fix requests
- `Context_Retention_Evidence_Report_—_MBOMS_Project.pdf` — quantified evidence from the MBOMS project
- The StartOut evidence report (pasted above)

Thank you for taking this seriously. I look forward to your response.

Tarik Perkins
Pro Plan
Projects: Geeves.life (`nKRUueEwEcFgrDnsh3N8Ek`), MBOMS, StartOut (`N8kSRpESEW6PDnG7PDKBaF`)

---
---

## CLARIFYING QUESTIONS — To Strengthen the Final Draft

Before I finalise this letter, the following details would make the case significantly stronger. Please answer whichever you can:

**About the financial impact:**

1. Do you have a rough sense of how many Manus credits or sessions were spent on MBOMS in total? Even an order-of-magnitude estimate (e.g., "dozens of sessions", "hundreds of credits") would help frame the compensation ask.

2. On the StartOut project specifically — do you remember approximately how many sessions were affected by the sandbox crash and the cascading failures that followed? Was there a session where you had to rebuild the published site from scratch?

3. For MBOMS, are there specific features you can recall having to rebuild from scratch — not just fix, but completely re-implement — because the agent had forgotten they existed? Any examples beyond what the git commits show would be powerful.

**About your usage pattern:**

4. How frequently do you typically start a new Manus task/session for a given project? (e.g., daily, multiple times a day, weekly) This helps establish the frequency of context loss events.

5. When you start a new session on MBOMS or Geeves.life, what do you typically have to do before you can get productive work done? (e.g., paste in documentation, re-explain the project, re-read files) A description of your typical session-start ritual would be compelling evidence.

**About your promotion of Manus:**

6. You mentioned promoting the product — have you recommended Manus to colleagues, clients, or publicly (social media, community forums, etc.)? Any specific examples would strengthen the "design partner" framing and establish your value as an advocate.

7. Is there a specific feature or improvement that, if Manus fixed the context retention issue, would unlock the most value for you? This helps frame the design partnership ask concretely.

**About the knowledge base limit:**

8. Have you ever hit the 100-entry knowledge base limit explicitly (i.e., received a message saying the limit was reached)? Or has the failure been more subtle — entries silently dropped, context quietly lost without a warning?
