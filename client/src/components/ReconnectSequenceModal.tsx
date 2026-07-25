/**
 * ReconnectSequenceModal
 *
 * Animated node-graph modal for the "Reconnect All" flow.
 * Shows each disconnected Google account as a node that transitions:
 *   red (disconnected) → amber (in progress) → green (reconnected)
 *
 * State is persisted in sessionStorage so it survives OAuth redirect round-trips.
 *
 * ARCHITECTURE NOTE:
 * The sequence advancement logic lives in `useReconnectSequenceResume` — a hook
 * that must be called at the PAGE level (Home.tsx, Settings.tsx), NOT inside the
 * modal. This is because the modal is conditionally rendered; if it is unmounted
 * when the OAuth callback returns, its internal useEffect never fires.
 * The page-level hook reads `reconnect_success` / `connect_error` from the URL,
 * advances the sessionStorage state, and sets `showReconnectModal = true` so the
 * modal mounts with the correct state already in place.
 *
 * FIX (Jun 27 2026):
 * 1. returnPath is now derived from window.location.pathname+search at call time
 *    so the OAuth callback always lands back on the page that opened the modal.
 * 2. The modal queries live token status on mount and reconciles: if an account
 *    in the sequence is already `active` in the DB, it is immediately marked `done`
 *    without waiting for URL params. This handles the case where the callback
 *    lands on a page that clears the URL before the hook can read it.
 * 3. Settings.tsx direct `reconnect_success` toast handler is now guarded: it only
 *    fires when there is NO active reconnect sequence in sessionStorage.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { GeevesConstellationMark } from "@/components/GeevesLogo";

const STORAGE_KEY = "geeves_reconnect_sequence";

export interface SequenceAccount {
  accountEmail: string;
  displayName: string | null;
  url: string;
  status: "pending" | "in_progress" | "done" | "error";
}

export interface SequenceState {
  accounts: SequenceAccount[];
  currentIdx: number;
  origin: string;
}

export function saveSequence(state: SequenceState) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadSequence(): SequenceState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSequence() {
  sessionStorage.removeItem(STORAGE_KEY);
}

/** Returns true if there is an active (non-dismissed) reconnect sequence in sessionStorage */
export function hasActiveSequence(): boolean {
  const saved = loadSequence();
  if (!saved) return false;
  return saved.accounts.some(a => a.status === "in_progress" || a.status === "pending");
}

// ── Page-level hook — call this in Home.tsx and Settings.tsx ──────────────────

/**
 * Must be called at the page level (not inside the modal).
 * Detects OAuth callback URL params, advances the sequence state in sessionStorage,
 * and returns `shouldOpen = true` so the parent can open the modal.
 *
 * Also returns `handledBySequence` so callers can suppress their own toast handlers
 * when the reconnect sequence has already consumed the URL param.
 */
export function useReconnectSequenceResume() {
  const [shouldOpen, setShouldOpen] = useState(false);
  const [handledBySequence, setHandledBySequence] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reconnectSuccess = params.get("reconnect_success");
    const connectError = params.get("connect_error");

    if (!reconnectSuccess && !connectError) {
      // Not returning from an OAuth redirect — only restore if actively mid-redirect.
      // A dismissed sequence is cleared, so stale 2-of-N sequences won't reappear.
      const saved = loadSequence();
      if (saved && saved.accounts[saved.currentIdx]?.status === "in_progress") {
        setShouldOpen(true);
      }
      return;
    }

    const saved = loadSequence();

    if (reconnectSuccess && saved) {
      setHandledBySequence(true);
      // Mark the current account as done
      const updated: SequenceState = {
        ...saved,
        accounts: saved.accounts.map((a, i) =>
          i === saved.currentIdx ? { ...a, status: "done" as const } : a
        ),
      };

      const nextIdx = saved.currentIdx + 1;
      const allDone = nextIdx >= updated.accounts.length;

      if (allDone) {
        // All done — save final state so modal can display green nodes, then clear
        saveSequence(updated);
        window.history.replaceState({}, "", window.location.pathname);
        setShouldOpen(true);
      } else {
        // Advance to next account
        updated.currentIdx = nextIdx;
        updated.accounts[nextIdx] = { ...updated.accounts[nextIdx], status: "in_progress" };
        saveSequence(updated);
        window.history.replaceState({}, "", window.location.pathname);
        // Open modal briefly to show progress, then redirect to next OAuth URL
        setShouldOpen(true);
        setTimeout(() => {
          window.location.href = updated.accounts[nextIdx].url;
        }, 1500);
      }
    } else if (connectError && saved) {
      setHandledBySequence(true);
      // Mark current as error and show modal
      const updated: SequenceState = {
        ...saved,
        accounts: saved.accounts.map((a, i) =>
          i === saved.currentIdx ? { ...a, status: "error" as const } : a
        ),
      };
      clearSequence();
      saveSequence(updated); // keep for display only
      window.history.replaceState({}, "", window.location.pathname);
      toast.error(`Failed to reconnect: ${connectError}`);
      setShouldOpen(true);
    } else {
      // URL params present but no saved sequence — NOT handled by sequence
      // (caller's own toast handler will fire)
    }
  }, []);

  return { shouldOpen, setShouldOpen, handledBySequence };
}

// ── Node component ────────────────────────────────────────────────────────────

interface NodeProps {
  account: SequenceAccount;
  index: number;
  total: number;
}

function AccountNode({ account, index, total }: NodeProps) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  const nodeColor =
    account.status === "done"
      ? "bg-primary border-primary shadow-primary/40"
      : account.status === "in_progress"
      ? "bg-amber-500 border-amber-400 shadow-amber-500/40 animate-pulse"
      : account.status === "error"
      ? "bg-destructive border-destructive/60 shadow-destructive/30"
      : "bg-red-600 border-red-500 shadow-red-600/30";

  const labelColor =
    account.status === "done"
      ? "text-primary"
      : account.status === "in_progress"
      ? "text-amber-400"
      : account.status === "error"
      ? "text-destructive"
      : "text-red-400";

  const statusLabel =
    account.status === "done"
      ? "Connected ✓"
      : account.status === "in_progress"
      ? "Reconnecting…"
      : account.status === "error"
      ? "Failed — tap Retry"
      : "Disconnected";

  const connectorColor =
    account.status === "done" ? "bg-primary/60" : "bg-muted/40";

  return (
    <div className="flex flex-col items-center">
      {/* Connector line above (except first) */}
      {!isFirst && (
        <div className={`w-0.5 h-6 transition-colors duration-700 ${connectorColor}`} />
      )}

      {/* Node circle — Constellation logo mark in pulsating node */}
      <div
        className={`relative w-14 h-14 rounded-full border-2 flex items-center justify-center shadow-lg transition-all duration-700 ${nodeColor}`}
        style={{
          animation: account.status === "in_progress"
            ? "constellation-pulse 1.5s ease-in-out infinite alternate"
            : account.status === "pending"
            ? "constellation-pulse 2.5s ease-in-out infinite alternate"
            : undefined,
        }}
      >
        <style>{`
          @keyframes constellation-pulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 currentColor; }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); box-shadow: 0 0 12px 4px rgba(0, 200, 180, 0.3); }
          }
        `}</style>
        {/* Constellation logo mark */}
        <div className="w-8 h-8 flex items-center justify-center">
          <GeevesConstellationMark size={32} />
        </div>

        {/* Done checkmark overlay */}
        {account.status === "done" && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary border-2 border-background flex items-center justify-center">
            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        {/* In-progress spinner ring */}
        {account.status === "in_progress" && (
          <div className="absolute inset-0 rounded-full border-2 border-amber-300/50 border-t-amber-300 animate-spin" />
        )}
      </div>

      {/* Label */}
      <div className="mt-2 text-center max-w-[120px]">
        <p className="text-xs font-medium text-foreground truncate">
          {account.displayName || account.accountEmail.split("@")[0]}
        </p>
        <p className={`text-[10px] mt-0.5 font-medium transition-colors duration-500 ${labelColor}`}>
          {statusLabel}
        </p>
      </div>

      {/* Connector line below (except last) */}
      {!isLast && (
        <div
          className={`w-0.5 h-6 mt-2 transition-colors duration-700 ${
            account.status === "done" ? "bg-primary/60" : "bg-muted/40"
          }`}
        />
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onAllDone?: () => void;
}

export function ReconnectSequenceModal({ onClose, onAllDone }: Props) {
  // Read sequence from sessionStorage on mount — the page-level hook has already
  // advanced it before this modal is opened.
  const [sequence, setSequence] = useState<SequenceState | null>(() => loadSequence());
  const [isStarting, setIsStarting] = useState(false);

  // ── Live status reconciliation on mount ──────────────────────────────────────
  // Query the actual DB token status. If any account in the sequence is already
  // `active` in the DB, mark it `done` immediately — this handles the case where
  // the OAuth callback landed on a different page (e.g. Settings) that consumed
  // the `reconnect_success` URL param before this modal could read it.
  const liveAccountsQuery = trpc.integrations.list.useQuery(undefined, {
    staleTime: 0, // always fresh on modal open
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!liveAccountsQuery.data || !sequence) return;

    const liveByEmail = new Map(
      liveAccountsQuery.data.map(a => [a.accountEmail.toLowerCase(), a.status])
    );

    let changed = false;
    const reconciled: SequenceState = {
      ...sequence,
      accounts: sequence.accounts.map(a => {
        const liveStatus = liveByEmail.get(a.accountEmail.toLowerCase());
        // If the DB says this account is now active but our sequence still shows
        // in_progress or pending, promote it to done.
        if (liveStatus === "active" && (a.status === "in_progress" || a.status === "pending")) {
          changed = true;
          return { ...a, status: "done" as const };
        }
        return a;
      }),
    };

    if (!changed) return;

    // Advance currentIdx past any newly-done accounts
    let newIdx = reconciled.currentIdx;
    while (
      newIdx < reconciled.accounts.length &&
      reconciled.accounts[newIdx].status === "done"
    ) {
      newIdx++;
    }
    reconciled.currentIdx = Math.min(newIdx, reconciled.accounts.length - 1);

    const allNowDone = reconciled.accounts.every(a => a.status === "done");

    if (allNowDone) {
      // All accounts are active — mark sequence complete
      saveSequence(reconciled);
      setSequence(reconciled);
    } else {
      // Some still pending — update state and redirect to next
      saveSequence(reconciled);
      setSequence(reconciled);
    }
  }, [liveAccountsQuery.data]);

  // ── reconnectAll mutation ────────────────────────────────────────────────────
  const reconnectAllMutation = trpc.integrations.reconnectAll.useMutation({
    onSuccess: (data) => {
      if (data.accounts.length === 0) {
        toast.info("No accounts need reconnecting.");
        clearSequence();
        onClose();
        return;
      }
      const newSeq: SequenceState = {
        accounts: data.accounts.map((a, i) => ({
          ...a,
          status: (i === 0 ? "in_progress" : "pending") as SequenceAccount["status"],
        })),
        currentIdx: 0,
        origin: window.location.origin,
      };
      saveSequence(newSeq);
      setSequence(newSeq);
      setIsStarting(false);
      // Small delay so user sees the amber node before redirect
      setTimeout(() => {
        window.location.href = data.accounts[0].url;
      }, 800);
    },
    onError: (err) => {
      toast.error(`Reconnect failed: ${err.message}`);
      setIsStarting(false);
    },
  });

  // Watch for the all-done state and fire onAllDone callback
  const doneCount = sequence?.accounts.filter(a => a.status === "done").length ?? 0;
  const total = sequence?.accounts.length ?? 0;
  const allDone = total > 0 && doneCount === total;
  const currentIdx = sequence?.currentIdx ?? 0;

  useEffect(() => {
    if (allDone) {
      clearSequence();
      const timer = setTimeout(() => {
        onAllDone?.();
        onClose();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [allDone]);

  function handleStart() {
    setIsStarting(true);
    // Pass the current page path as returnPath so the OAuth callback lands here,
    // not on the hardcoded /settings?tab=integrations default.
    reconnectAllMutation.mutate({
      origin: window.location.origin,
      returnPath: window.location.pathname + window.location.search,
    });
  }

  function handleRetry() {
    clearSequence();
    setSequence(null);
    setIsStarting(true);
    reconnectAllMutation.mutate({
      origin: window.location.origin,
      returnPath: window.location.pathname + window.location.search,
    });
  }

  const hasError = sequence?.accounts.some(a => a.status === "error");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-lg font-semibold text-foreground">
            {allDone ? "All Accounts Reconnected" : "Reconnect Google Accounts"}
          </h2>
          {!allDone && sequence && (
            <p className="text-sm text-muted-foreground mt-1">
              {doneCount} of {total} reconnected
            </p>
          )}
          {allDone && (
            <p className="text-sm text-primary mt-1">
              Calendar sync and shadow blocks are active ✓
            </p>
          )}
        </div>

        {/* Node graph */}
        {sequence ? (
          <div className="flex flex-col items-center py-2">
            {sequence.accounts.map((account, i) => (
              <AccountNode
                key={account.accountEmail}
                account={account}
                index={i}
                total={sequence.accounts.length}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <div
              className="w-14 h-14 rounded-full bg-red-600/20 border-2 border-red-500/40 flex items-center justify-center mx-auto mb-3"
              style={{ animation: "constellation-pulse 2.5s ease-in-out infinite alternate" }}
            >
              <GeevesConstellationMark size={36} />
            </div>
            <p className="text-sm font-medium text-foreground">Disconnected accounts detected</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tap Start to reconnect them one by one
            </p>
          </div>
        )}

        {/* Progress bar */}
        {sequence && !allDone && (
          <div className="mt-4 mb-2">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Step {Math.min(currentIdx + 1, total)} of {total}</span>
              <span>{Math.round((doneCount / total) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700"
                style={{ width: `${(doneCount / total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex gap-2">
          {!sequence && !isStarting && (
            <button
              onClick={handleStart}
              className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              Start Reconnecting
            </button>
          )}
          {isStarting && (
            <button disabled className="flex-1 h-10 rounded-lg bg-primary/60 text-primary-foreground text-sm font-medium flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading…
            </button>
          )}
          {allDone && (
            <button
              onClick={() => { clearSequence(); onClose(); }}
              className="flex-1 h-10 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary transition-colors"
            >
              Done
            </button>
          )}
          {hasError && !allDone && (
            <button
              onClick={handleRetry}
              className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Retry Failed
            </button>
          )}
          {!allDone && (
            <button
              onClick={() => {
                // Always clear on dismiss — prevents stale sequence from persisting
                clearSequence();
                onClose();
              }}
              className="h-10 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition-colors"
            >
              {sequence ? "Dismiss" : "Cancel"}
            </button>
          )}
        </div>

        {/* Redirect notice */}
        {sequence && !allDone && sequence.accounts[currentIdx]?.status === "in_progress" && (
          <p className="text-center text-xs text-muted-foreground mt-3">
            Redirecting to Google sign-in…
          </p>
        )}
      </div>
    </div>
  );
}

// ── Hook for dashboard banner ─────────────────────────────────────────────────

export function useExpiredAccountCount() {
  const accountsQuery = trpc.integrations.list.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const expired = (accountsQuery.data || []).filter(
    a => a.status === "expired" || a.status === "revoked"
  );
  return { count: expired.length, accounts: expired, isLoading: accountsQuery.isLoading };
}
