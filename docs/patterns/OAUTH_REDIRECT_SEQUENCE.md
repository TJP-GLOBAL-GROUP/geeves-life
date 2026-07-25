# Pattern: OAuth Redirect Sequence Modal

**Last updated:** 2026-06-27  
**Status:** Production (implemented in `ReconnectSequenceModal`)  
**Relevant files:**
- `client/src/components/ReconnectSequenceModal.tsx`
- `client/src/pages/Home.tsx` — calls `useReconnectSequenceResume`
- `client/src/pages/Settings.tsx` — calls `useReconnectSequenceResume`
- `server/_core/oauth.ts` — sets `reconnect_success` / `connect_error` URL params on callback

---

## The Core Problem

Any multi-step OAuth flow (reconnecting N accounts, linking N services, authorizing N scopes) requires full-page redirects to the external provider. A React modal component **cannot survive a full-page redirect** — it is unmounted the moment the browser navigates away. This means:

- Any state held in component `useState` is lost
- Any `useEffect` cleanup or completion handlers never fire
- When the OAuth callback returns the user to the app, the modal is not mounted, so its internal `useEffect` that would advance the sequence never runs

**The wrong approach** (what was originally built and failed):
```tsx
// ❌ WRONG: sequence advancement logic inside the modal
export function ReconnectSequenceModal() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reconnect_success")) {
      // This never runs — modal is unmounted during the redirect
      advanceSequence();
    }
  }, []);
}
```

---

## The Correct Pattern

### Rule: Sequence advancement logic must live at the PAGE level, not inside the modal.

The modal is responsible only for **displaying** the current sequence state and **initiating** the first redirect. All URL param detection and state advancement must happen in a hook called unconditionally at the page level — before the modal is conditionally rendered.

```
Page mounts
  → useReconnectSequenceResume() runs unconditionally
  → reads URL params (reconnect_success / connect_error)
  → advances sessionStorage state
  → sets shouldOpen = true
  → page renders modal with correct state already applied
  → modal displays updated nodes (green/amber/red)
  → if more accounts remain, modal auto-redirects to next OAuth URL
```

### Implementation

**1. Persist sequence state in `sessionStorage`** (survives page reloads and redirects):

```ts
const STORAGE_KEY = "geeves_reconnect_sequence";

interface SequenceState {
  accounts: SequenceAccount[];  // each has status: pending | in_progress | done | error
  currentIdx: number;
  origin: string;
}

function saveSequence(state: SequenceState) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadSequence(): SequenceState | null { ... }
function clearSequence() { sessionStorage.removeItem(STORAGE_KEY); }
```

**2. Page-level hook — call this in every page that can receive the OAuth callback:**

```ts
export function useReconnectSequenceResume() {
  const [shouldOpen, setShouldOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reconnectSuccess = params.get("reconnect_success");
    const connectError = params.get("connect_error");

    if (!reconnectSuccess && !connectError) {
      // Not returning from OAuth — restore in-progress sequence if one exists
      if (loadSequence()) setShouldOpen(true);
      return;
    }

    const saved = loadSequence();
    if (!saved) {
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (reconnectSuccess) {
      // Mark current account done
      const updated = { ...saved, accounts: [...saved.accounts] };
      updated.accounts[saved.currentIdx] = { ...updated.accounts[saved.currentIdx], status: "done" };

      const nextIdx = saved.currentIdx + 1;
      if (nextIdx >= updated.accounts.length) {
        // All done
        saveSequence(updated);
        window.history.replaceState({}, "", window.location.pathname);
        setShouldOpen(true);
      } else {
        // Advance to next
        updated.currentIdx = nextIdx;
        updated.accounts[nextIdx] = { ...updated.accounts[nextIdx], status: "in_progress" };
        saveSequence(updated);
        window.history.replaceState({}, "", window.location.pathname);
        setShouldOpen(true);
        // Show progress briefly, then redirect to next OAuth URL
        setTimeout(() => {
          window.location.href = updated.accounts[nextIdx].url;
        }, 1500);
      }
    } else if (connectError) {
      // Mark current as error
      const updated = { ...saved, accounts: [...saved.accounts] };
      updated.accounts[saved.currentIdx] = { ...updated.accounts[saved.currentIdx], status: "error" };
      clearSequence();
      saveSequence(updated); // keep for display
      window.history.replaceState({}, "", window.location.pathname);
      setShouldOpen(true);
    }
  }, []);

  return { shouldOpen, setShouldOpen };
}
```

**3. Modal reads from sessionStorage on mount** (state is already advanced by the time it mounts):

```ts
export function ReconnectSequenceModal({ onClose, onAllDone }: Props) {
  // Initialize from sessionStorage — the page-level hook has already advanced it
  const [sequence, setSequence] = useState<SequenceState | null>(() => loadSequence());
  // ... render nodes based on sequence.accounts[i].status
}
```

**4. Page usage:**

```tsx
// In Home.tsx and Settings.tsx — called unconditionally, before any conditional rendering
export default function Home() {
  const { shouldOpen: reconnectShouldOpen, setShouldOpen: setReconnectShouldOpen } = useReconnectSequenceResume();
  const [showReconnectModal, setShowReconnectModal] = useState(false);

  useEffect(() => {
    if (reconnectShouldOpen) setShowReconnectModal(true);
  }, [reconnectShouldOpen]);

  return (
    <>
      {showReconnectModal && (
        <ReconnectSequenceModal
          onClose={() => setShowReconnectModal(false)}
          onAllDone={() => { /* invalidate queries */ }}
        />
      )}
      {/* rest of page */}
    </>
  );
}
```

---

## Server Side: Setting the Callback URL Params

The server OAuth callback (`server/_core/oauth.ts`) must set the correct URL params after token exchange:

```ts
// Success
res.redirect(`${origin}/settings?tab=integrations&reconnect_success=${encodeURIComponent(email)}`);

// Failure
res.redirect(`${origin}/settings?tab=integrations&connect_error=${encodeURIComponent(errorMessage)}`);
```

**Critical:** `reconnect_success` is only set after a **successful token exchange and DB save**. It is never set optimistically. This means the green node in the modal is a true server-confirmed success signal.

---

## Node Status Lifecycle

```
pending       → not yet reached in sequence (red, static)
in_progress   → OAuth redirect initiated (amber, pulsing + spinner ring)
done          → server confirmed reconnect_success (green, checkmark badge)
error         → server returned connect_error (red/destructive, "Failed — tap Retry")
```

---

## Applying This Pattern to Other Contexts

Any time you need a multi-step flow involving full-page redirects (OAuth, payment redirects, external verification links), apply the same pattern:

1. Pick a unique `sessionStorage` key for the sequence
2. Create a `useXxxSequenceResume` hook that runs at page level
3. The hook reads URL params, advances sessionStorage state, and returns `shouldOpen`
4. The modal/component reads sessionStorage on mount — never relies on its own `useEffect` for URL params
5. The server sets success/error URL params only after confirmed completion

---

## Known Limitations

- **sessionStorage is tab-scoped** — if the user opens the OAuth URL in a new tab and completes it there, the original tab won't advance automatically. The user would need to return to the original tab and refresh. This is acceptable for the reconnect use case (OAuth typically opens in the same tab).
- **Google's "app not certified" warning** — expected for apps in Testing mode on Google Cloud Console. Users must click "Continue" to proceed. This is a one-time friction per account per session and does not affect the sequence logic.
- **Token refresh vs. full re-auth** — this sequence handles full re-authorization (when `invalid_grant` is returned). Silent token refresh (when only the access token expires but the refresh token is still valid) is handled separately in `calendarWebhook.ts` and does not require this modal flow.
