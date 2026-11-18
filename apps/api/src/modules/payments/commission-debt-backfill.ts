/**
 * R13-N1 — backfill for historical cash-commission shortfalls.
 *
 * Before R13, a cash job whose helper wallet was short recorded the
 * shortfall only as `metadata.unpaid_fee` on the `commission` transaction
 * — write-only, never read. The true historical debt per helper is
 * therefore exactly recoverable from transaction history:
 *
 *   debt = Σ(unpaid_fee over type='commission')
 *        − Σ(debt_repaid over type='earning')
 *        − Σ(debt_settled over type='withdrawal'), floored at 0.
 *
 * (Post-R13 repayments are recorded in earning/withdrawal metadata, so the
 * formula stays correct for new transactions too — the backfill is
 * idempotent: re-running it computes the same value the server already
 * tracks in Wallet.commission_debt.)
 *
 * This module is pure (no DB) so the aggregation is unit-testable. The
 * runner script lives at `apps/api/src/scripts/backfill-commission-debt.ts`
 * and is DRY-RUN by default — it must NOT be run on production without the
 * owner's explicit call.
 */

export interface CommissionDebtTxInput {
  user_id: string;
  type: string;
  metadata?: {
    unpaid_fee?: number;
    debt_repaid?: number;
    debt_settled?: number;
  } | null;
}

/** Per-helper outstanding commission debt (> 0 only). Pure; no DB. */
export function computeCommissionDebtFromTransactions(
  txs: CommissionDebtTxInput[] | null | undefined,
): Record<string, number> {
  const debt: Record<string, number> = {};
  for (const tx of txs ?? []) {
    const userId = String(tx.user_id);
    const meta = tx.metadata ?? {};
    if (tx.type === 'commission') {
      debt[userId] = (debt[userId] ?? 0) + Math.max(0, meta.unpaid_fee ?? 0);
    } else if (tx.type === 'earning') {
      debt[userId] = (debt[userId] ?? 0) - Math.max(0, meta.debt_repaid ?? 0);
    } else if (tx.type === 'withdrawal') {
      debt[userId] = (debt[userId] ?? 0) - Math.max(0, meta.debt_settled ?? 0);
    }
  }
  const out: Record<string, number> = {};
  for (const [userId, value] of Object.entries(debt)) {
    if (value > 0) out[userId] = value;
  }
  return out;
}
