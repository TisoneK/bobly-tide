// Estimate when a filling group will have everyone secured — the moment it
// activates and the cycle starts (ADR-21). Derived from the pace so far:
// the securing interarrival rate once a couple of members have secured, and
// the join pace since the group opened as an early proxy. Rough by nature, so
// it returns null when there is no basis yet; the client shows it as a "~"
// estimate, never a promise.

export interface FillEstimateInput {
  /** Members needed before the group activates. */
  size: number;
  /** secured_at of members who have secured, any order. */
  securedAt: Date[];
  /** Members joined so far (secured or not). */
  joined: number;
  /** When the group opened. */
  groupCreatedAt: Date;
  now: Date;
}

/**
 * Projected activation time, or null when it can't be estimated yet (nobody
 * has joined, no elapsed time, or a degenerate rate).
 */
export function estimateStartAt(i: FillEstimateInput): Date | null {
  const securedCount = i.securedAt.length;
  const remaining = i.size - securedCount;
  if (remaining <= 0) return null; // already fully secured → activating

  const nowMs = i.now.getTime();
  let ratePerMs: number | null = null;

  // Preferred signal: the rate members have been securing at (intervals
  // between secures), once there are at least two to measure.
  if (securedCount >= 2) {
    const times = i.securedAt.map((d) => d.getTime()).sort((a, b) => a - b);
    const span = times[times.length - 1]! - times[0]!;
    if (span > 0) ratePerMs = (securedCount - 1) / span;
  }

  // Early fallback: the join pace since the group opened.
  if (ratePerMs == null) {
    const elapsed = nowMs - i.groupCreatedAt.getTime();
    if (i.joined >= 1 && elapsed > 0) ratePerMs = i.joined / elapsed;
  }

  if (ratePerMs == null || ratePerMs <= 0) return null;

  const etaMs = nowMs + remaining / ratePerMs;
  return new Date(Math.max(etaMs, nowMs));
}
