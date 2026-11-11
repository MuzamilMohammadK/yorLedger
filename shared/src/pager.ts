// §8.1 / §8.8 circular pager: Party → Sales → Purchases → Party (wraps both ways).

/** Visible view for an unbounded virtual index. */
export function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

/**
 * Decide a swipe on release: commit when dragged past `threshold` (default 25 %) of the
 * width or flung faster than `flingPxPerMs`; otherwise spring back (0).
 * Returns +1 to go to the next view (finger moved left), −1 for the previous one.
 */
export function swipeDecision(dx: number, width: number, velocityPxPerMs: number, threshold = 0.25, flingPxPerMs = 0.5): -1 | 0 | 1 {
  if (width <= 0) return 0;
  const fast = Math.abs(velocityPxPerMs) >= flingPxPerMs && Math.abs(dx) > 20;
  if (Math.abs(dx) >= width * threshold || fast) return dx < 0 ? 1 : -1;
  return 0;
}

/** Only treat a gesture as a page swipe once it is clearly horizontal. */
export function isHorizontalGesture(dx: number, dy: number, slop = 10): boolean | null {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null; // undecided yet
  return Math.abs(dx) > Math.abs(dy) * 1.2;
}
