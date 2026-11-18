/**
 * R13-N1 — one-off backfill: seed Wallet.commission_debt from historical
 * cash-commission shortfalls (pre-R13 losses that lived only in
 * metadata.unpaid_fee).
 *
 *   DRY RUN (default, writes nothing):
 *     npx ts-node -r tsconfig-paths/register src/scripts/backfill-commission-debt.ts
 *   APPLY (explicit flag only):
 *     npx ts-node -r tsconfig-paths/register src/scripts/backfill-commission-debt.ts --apply
 *
 * The MongoDB URI comes from `--uri <uri>` or the `MONGODB_URI` env var.
 * The script REFUSES to run without one (never defaults to localhost).
 *
 * For each helper: computed debt = Σ(unpaid_fee) − Σ(debt_repaid) −
 * Σ(debt_settled), floored at 0 (see commission-debt-backfill.ts). The
 * script SETS Wallet.commission_debt to the computed value and logs
 * before/after per wallet; re-runs are no-ops when stored == computed.
 *
 * DO NOT run against production Atlas without the owner's explicit call.
 * Run against staging / a backup first, review the dry-run output, and
 * keep the log.
 */
import mongoose from 'mongoose';
import { computeCommissionDebtFromTransactions } from '../modules/payments/commission-debt-backfill';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const uriFlag = args.indexOf('--uri');
  const uri = (uriFlag >= 0 ? args[uriFlag + 1] : undefined) ?? process.env.MONGODB_URI ?? '';
  if (!uri) {
    throw new Error(
      'Missing MongoDB URI: pass --uri <uri> or set MONGODB_URI. Refusing to run without one.',
    );
  }

  console.log(`[backfill-commission-debt] mode: ${apply ? 'APPLY' : 'DRY-RUN (no writes)'}`);
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB connection');

  const collections = await db.listCollections().toArray();
  for (const name of ['transactions', 'wallets']) {
    if (!collections.some(c => c.name === name)) {
      throw new Error(`Collection '${name}' not found. Available: ${collections.map(c => c.name).join(', ') || '(none)'}`);
    }
  }

  // R13-N1b (review 2): khởi tạo field cho ví tạo trước R13 — Mongo $gte
  // không khớp document thiếu field, nên ví nào chưa có commission_debt
  // phải được set 0 trước khi code mới dùng guard (dù guard giờ đã bỏ qua
  // khi nợ = 0, việc khởi tạo vẫn chuẩn hoá dữ liệu cho mọi truy vấn sau
  // này). Chạy TRƯỚC vòng tính nợ để ví có nợ thật vẫn được set đúng số
  // nợ ở bước sau.
  const missing = await db
    .collection('wallets')
    .countDocuments({ commission_debt: { $exists: false } });
  console.log(`[backfill] ${missing} wallet(s) missing commission_debt field`);
  let initialised = 0;
  if (apply && missing > 0) {
    const res = await db
      .collection('wallets')
      .updateMany({ commission_debt: { $exists: false } }, { $set: { commission_debt: 0 } });
    initialised = res.modifiedCount;
    console.log(`[backfill] initialised commission_debt=0 on ${initialised} wallet(s)`);
  }

  const txs = await db
    .collection('transactions')
    .find({
      $or: [
        { type: 'commission', 'metadata.unpaid_fee': { $gt: 0 } },
        { type: 'earning', 'metadata.debt_repaid': { $gt: 0 } },
        { type: 'withdrawal', 'metadata.debt_settled': { $gt: 0 } },
      ],
    })
    .project({ user_id: 1, type: 1, metadata: 1 })
    .toArray();
  console.log(`[backfill] scanned ${txs.length} debt-relevant transaction(s)`);

  const computed = computeCommissionDebtFromTransactions(
    txs.map(t => ({ user_id: String(t.user_id), type: t.type, metadata: t.metadata ?? {} })),
  );
  const userIds = Object.keys(computed);
  console.log(`[backfill] ${userIds.length} helper(s) with outstanding commission debt`);

  let updated = 0;
  let total = 0;
  for (const userId of userIds) {
    const wallet = await db.collection('wallets').findOne({ user_id: new mongoose.Types.ObjectId(userId) });
    const stored = Math.max(0, wallet?.commission_debt ?? 0);
    const target = computed[userId];
    total += target;
    console.log(
      `[${apply ? 'apply' : 'would-update'}] user ${userId}: stored=${stored} -> computed=${target}`,
    );
    if (apply && stored !== target) {
      const res = await db
        .collection('wallets')
        .updateOne(
          { user_id: new mongoose.Types.ObjectId(userId) },
          { $set: { commission_debt: target } },
        );
      if (res.modifiedCount === 1) updated += 1;
      else console.log(`[warn] user ${userId}: updateOne modified ${res.modifiedCount}`);
    }
  }

  console.log(
    `[backfill] done. helpers=${userIds.length} total_debt=${total} updated=${updated} initialised=${initialised}${apply ? '' : ' (dry-run — re-run with --apply to write)'}`,
  );
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[backfill] FAILED:', err?.message ?? err);
  process.exit(1);
});
