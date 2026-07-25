/**
 * useGestures — Geeves.Life Gesture Design System
 *
 * Conventions:
 *   Swipe left/right  → advance/retreat the current view's primary unit
 *                        (next day, next property, next card, etc.)
 *   Pinch in (shrink) → zoom out to a larger time/content unit
 *                        (day → week, week → month)
 *   Pinch out (expand)→ zoom in to a smaller time/content unit
 *                        (month → week, week → day)
 *
 * SWIPE NAVIGATION FIX:
 *   - Vertical swipes ALWAYS scroll the page (never captured by gesture areas)
 *   - Horizontal swipes are captured ONLY within gesture-enabled areas
 *     (carousels, property cards, calendar tabs)
 *   - The gesture area uses touch-action: pan-y to allow vertical scrolling
 *     while capturing horizontal swipes
 *   - Scrollable lists within widgets use overflow-y-auto and capture
 *     vertical swipes for their own scrolling
 *
 * Usage:
 *   const { ref } = useGestures({ onSwipe: (dir) => ... });
 *   const { ref } = useGestures({ onSwipe, onPinch });
 */

import { useRef, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────

export type SwipeDirection = "left" | "right";
export type PinchDirection = "in" | "out";

export interface GestureOptions {
  /** Called when a horizontal swipe is detected. */
  onSwipe?: (direction: SwipeDirection) => void;
  /**
   * Called when a pinch gesture fires.
   * direction "in"  = fingers coming together (zoom out to larger unit)
   * direction "out" = fingers spreading apart  (zoom in to smaller unit)
   */
  onPinch?: (direction: PinchDirection, scale: number) => void;
  /** Minimum horizontal distance (px) to trigger a swipe. Default: 50 */
  swipeThreshold?: number;
  /**
   * Minimum ratio of horizontal to vertical movement to count as a swipe.
   * Higher = more horizontal movement required before capturing.
   * Default: 1.8 (was 1.5 — increased to reduce false positives during scroll)
   */
  dominanceRatio?: number;
  /** Minimum scale change (0–1) to trigger a pinch. Default: 0.15 */
  pinchThreshold?: number;
}

// ─── useGestures ─────────────────────────────────────────────────────

export function useGestures<T extends HTMLElement = HTMLDivElement>({
  onSwipe,
  onPinch,
  swipeThreshold = 50,
  dominanceRatio = 1.8,
  pinchThreshold = 0.15,
}: GestureOptions) {
  const ref = useRef<T>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const startDist = useRef<number | null>(null);
  // Track whether we've determined this gesture is a scroll (vertical) vs swipe (horizontal)
  const gestureDecided = useRef<"scroll" | "swipe" | null>(null);

  const stableOnSwipe = useCallback(
    (dir: SwipeDirection) => onSwipe?.(dir),
    [onSwipe]
  );
  const stableOnPinch = useCallback(
    (dir: PinchDirection, scale: number) => onPinch?.(dir, scale),
    [onPinch]
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const getTouchDist = (e: TouchEvent) =>
      Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );

    /**
     * Check if the touch target is inside a scrollable container.
     * If so, we should NOT capture the gesture — let the scrollable area handle it.
     */
    const isInsideScrollable = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false;
      let node: HTMLElement | null = target;
      while (node && node !== el) {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        // If the element has scrollable overflow AND has content to scroll
        if (
          (overflowY === "auto" || overflowY === "scroll") &&
          node.scrollHeight > node.clientHeight
        ) {
          return true;
        }
        if (
          (overflowX === "auto" || overflowX === "scroll") &&
          node.scrollWidth > node.clientWidth
        ) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const onTouchStart = (e: TouchEvent) => {
      gestureDecided.current = null;

      if (e.touches.length === 1) {
        // Don't capture if starting inside a scrollable child
        if (isInsideScrollable(e.target)) {
          startX.current = null;
          startY.current = null;
          return;
        }
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
        startDist.current = null;
      } else if (e.touches.length === 2) {
        startX.current = null;
        startY.current = null;
        startDist.current = getTouchDist(e);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      // Handle pinch
      if (e.touches.length === 2 && startDist.current !== null && onPinch) {
        const currentDist = getTouchDist(e);
        const scale = currentDist / startDist.current;
        if (Math.abs(scale - 1) >= pinchThreshold) {
          stableOnPinch(scale < 1 ? "in" : "out", scale);
          startDist.current = currentDist;
        }
        return;
      }

      // For single-finger gestures, decide early if this is scroll vs swipe
      if (startX.current !== null && startY.current !== null && !gestureDecided.current) {
        const dx = Math.abs(e.touches[0].clientX - startX.current);
        const dy = Math.abs(e.touches[0].clientY - startY.current);

        // Wait until we have enough movement to decide (12px minimum)
        if (dx > 12 || dy > 12) {
          if (dx > dy * dominanceRatio) {
            gestureDecided.current = "swipe";
          } else {
            gestureDecided.current = "scroll";
            // Clear start positions — this is a scroll, not our concern
            startX.current = null;
            startY.current = null;
          }
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (startX.current !== null && startY.current !== null) {
        const dx = e.changedTouches[0].clientX - startX.current;
        const dy = e.changedTouches[0].clientY - startY.current;
        startX.current = null;
        startY.current = null;

        // Only fire swipe if we decided this was a horizontal gesture
        if (
          gestureDecided.current === "swipe" &&
          Math.abs(dx) >= swipeThreshold &&
          Math.abs(dx) > Math.abs(dy) * dominanceRatio
        ) {
          stableOnSwipe(dx < 0 ? "left" : "right");
        }
      }
      if (e.touches.length === 0) {
        startDist.current = null;
        gestureDecided.current = null;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [stableOnSwipe, stableOnPinch, swipeThreshold, dominanceRatio, pinchThreshold, onPinch]);

  return { ref };
}
