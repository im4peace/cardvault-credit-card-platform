/** Customer-facing shapes: decisions expose status, limit, comment and time only — never the deciding officer's id. */
interface DecisionRow {
  decision: string;
  approvedLimit?: number | null;
  comment: string | null;
  decidedAt: Date;
}

export interface PublicDecision {
  decision: string;
  approvedLimit?: number | null;
  comment: string | null;
  decidedAt: Date;
}

export function publicDecision(d: DecisionRow | null | undefined): PublicDecision | null {
  if (!d) return null;
  const view: PublicDecision = { decision: d.decision, comment: d.comment, decidedAt: d.decidedAt };
  if (d.approvedLimit !== undefined) view.approvedLimit = d.approvedLimit;
  return view;
}

export function withPublicDecision<T extends { decision?: DecisionRow | null }>(
  row: T | null,
): (Omit<T, 'decision'> & { decision: PublicDecision | null }) | null {
  if (!row) return null;
  return { ...row, decision: publicDecision(row.decision) };
}
