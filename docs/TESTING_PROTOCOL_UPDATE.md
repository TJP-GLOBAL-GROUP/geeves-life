# Testing Protocol Update — UI/UX Gap Analysis and New Standards

**Date:** July 7, 2026
**Author:** Geeves AI Development Agent
**Triggered by:** Eniola's testing revealed focus loss and state management bugs that were not caught during development.

---

## Self-Assessment: Why UI/UX Issues Were Missed

### Root Cause Analysis

The focus loss bug in the Walmart Categorizer (custom category field and memo/notes field) and the re-categorization state bug were not detected during development for the following reasons:

**1. Testing was code-centric, not interaction-centric.** The development workflow verified that TypeScript compiled cleanly, that tRPC procedures returned correct data, and that components rendered without errors. However, no systematic testing of user interaction patterns (typing in fields, state transitions across multiple actions) was performed.

**2. Inner function components are a silent anti-pattern.** Defining `DetailPanel`, `OrderList`, and `SavedCategorizationView` as functions inside the parent component is syntactically valid TypeScript and renders correctly on first mount. The bug only manifests when the parent re-renders while the user is actively typing — a condition that requires real-time interaction to observe.

**3. State transition testing was limited to happy paths.** The re-categorization flow (split to single) was tested by verifying the backend mutation deletes old rows and inserts new ones. The frontend behavior of `moveToNext()` being called unconditionally on success was not tested because the test only verified "does the toast appear?" rather than "does the order stay selected?"

**4. No UI interaction testing protocol existed.** The development process included vitest unit tests for backend logic and TypeScript type checking for frontend correctness, but lacked a systematic checklist for testing interactive UI behaviors like focus retention, input field persistence, and multi-step state flows.

---

## Updated Testing Protocol

### Mandatory UI Interaction Checklist (Before Every Delivery)

Every feature delivery must now include verification of the following interaction patterns. These cannot be verified by TypeScript compilation or unit tests alone — they require either browser-based testing or systematic code review against known anti-patterns.

#### Category 1: Input Field Focus Retention

| Check | How to Verify |
|-------|---------------|
| All `<Input>` and `<Textarea>` components retain focus during typing | Grep for any input rendered inside a function defined within a component body. If found, refactor to inline JSX or extract to a separate file-level component with `React.memo`. |
| No parent state changes cause input unmount/remount | Verify that the component containing the input is not re-created on every render (i.e., not defined as an inner function or anonymous component). |
| Controlled inputs have stable `onChange` handlers | Ensure `onChange` callbacks are either defined at module level, wrapped in `useCallback`, or are simple state setters. |

#### Category 2: State Transition Persistence

| Check | How to Verify |
|-------|---------------|
| After mutation success, verify the correct post-mutation UI state | For each mutation's `onSuccess`: trace what happens to the selected item, the form state, and the list filter. |
| Re-do/re-edit flows don't advance or navigate away | Any "edit existing" flow must stay on the same item after save, not advance to the next. |
| Status changes move items between correct filter tabs | After categorize/split/skip, verify the item appears in the expected tab and disappears from the old one. |

#### Category 3: Component Architecture Anti-Patterns

| Anti-Pattern | Detection Method | Fix |
|--------------|-----------------|-----|
| Inner function components rendered with JSX syntax (`<InnerComp />`) | Grep: `function [A-Z].*\(` inside component bodies that are later used as `<ComponentName` | Convert to inline JSX variables or extract to file-level components |
| Unstable query inputs (new objects/arrays in render) | Grep: `useQuery({` followed by object literals not wrapped in `useMemo` or `useState` | Stabilize with `useMemo` or `useState(() => ...)` |
| Missing `key` props on dynamic lists | React DevTools warnings or grep for `.map(` without `key=` | Add stable keys |

#### Category 4: Mobile and Responsive Behavior

| Check | How to Verify |
|-------|---------------|
| All interactive elements are reachable at 375px width | Resize browser and verify no horizontal scroll, no truncated buttons |
| Touch targets are at least 44x44px | Verify button/link sizes on mobile |
| View transitions (list → detail) have back navigation | Verify back button exists and works |

#### Category 5: Error and Edge States

| Check | How to Verify |
|-------|---------------|
| Empty states render meaningful messages | Test with no data in each section |
| Network errors show user-friendly messages | Simulate offline or 500 responses |
| Loading states prevent double-submission | Click submit rapidly — verify only one mutation fires |

---

## Implementation: Automated Detection

The following grep commands should be run as part of every pre-delivery review:

```bash
# Detect inner function components (potential focus loss)
grep -rn "function [A-Z][a-zA-Z]*(" client/src/pages/ | grep -v "^.*export"

# Detect unstable query inputs
grep -rn "useQuery({" client/src/ | grep -v "useMemo\|useState\|enabled"

# Detect inputs inside non-memoized components
grep -rn "<Input\|<Textarea\|<input\|<textarea" client/src/pages/ 
```

---

## Process Change

**Before:** Code review focused on TypeScript correctness, API contract alignment, and visual rendering.

**After:** Code review now includes:
1. Anti-pattern scan (inner components, unstable refs)
2. Interaction flow trace (type in every input, complete every multi-step flow)
3. State transition verification (what happens after each mutation succeeds/fails)
4. Mobile responsive spot-check (375px width minimum)

This protocol applies to all future feature deliveries and bug fix batches.
