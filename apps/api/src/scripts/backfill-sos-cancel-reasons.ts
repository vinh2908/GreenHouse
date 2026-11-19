/**
 * R13-B5 — one-off backfill: correct pre-R12 SOS cancel reasons.
 *
 *   DRY RUN (default, writes nothing):
 *     npx ts-node -r tsconfig-paths/register src/scripts/backfill-sos-cancel-reasons.ts
 *   APPLY (explicit flag only):
 *     npx ts-node -r tsconfig-paths/register src/scripts/backfill-sos-cancel-reasons.ts --apply
 *
 * The MongoDB URI comes from `--uri <uri>` or the `MONGODB_URI` env var.
 * The script REFUSES to run without one (never defaults to localhost).
 *
 * Match (exact, idempotent): job `status: 'cancelled'` AND
 * `cancellation_reason` exactly the pre-R12 wrong text AND a linked
 * `sosbackuprequests` doc for that job with `status: 'expired'`.
 * Rewrite: ONLY `cancellation_reason` → the exact R12 string.
 *
 * DO NOT run against production Atlas without the owner's explicit call.
 * Run against staging / a backup first, review the dry-run output, and
 * keep the log. It never touches notifications, wallet descriptions,
 * `job.events[]`, money fields, `status`, or `cancelled_by`.
 */
import mongoose from 'mongoose';
import {
  SOS_CANCEL_REASON_NO_RESPONSE,
  SOS_CANCEL_REASON_REMATCH_EXPIRED,
  shouldBackfillSosCancelReason,
} from '../modules/sos-backup/sos-cancel-reason-backfill';

const SOS_COLLECTION = 'sosbackuprequests';

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

  console.log(`[backfill-sos-cancel-reasons] mode: ${apply ? 'APPLY' : 'DRY-RUN (no writes)'}`);
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB connection');

  const collections = await db.listCollections().toArray();
  if (!collections.some(c => c.name === SOS_COLLECTION)) {
    throw new Error(
      `SOS collection '${SOS_COLLECTION}' not found. Available: ${collections.map(c => c.name).join(', ') || '(none)'}`,
    );
  }

  const jobs = db.collection('jobs');
  const sos = db.collection(SOS_COLLECTION);

  const candidates = await jobs
    .find({ status: 'cancelled', cancellation_reason: SOS_CANCEL_REASON_NO_RESPONSE })
    .project({ _id: 1, status: 1, cancellation_reason: 1 })
    .toArray();
  console.log(`[backfill] scanned ${candidates.length} cancelled job(s) with the old reason text`);

  let matched = 0;
  let updated = 0;
  for (const job of candidates) {
    const sosRecords = await sos
      .find({ job_id: job._id })
      .project({ _id: 1, status: 1, customer_decision: 1, decided_by: 1 })
      .toArray();
    if (!shouldBackfillSosCancelReason(job as any, sosRecords as any)) {
      console.log(
        `[skip] job ${job._id}: no expired SOS record (statuses: ${sosRecords.map(s => s.status).join(', ') || 'none'})`,
      );
      continue;
    }
    const expired = sosRecords.find(s => s.status === 'expired');
    matched += 1;
    console.log(
      `[${apply ? 'apply' : 'would-update'}] job ${job._id}: '${SOS_CANCEL_REASON_NO_RESPONSE}' -> '${SOS_CANCEL_REASON_REMATCH_EXPIRED}' (sos ${expired?._id} status=${expired?.status} decision=${expired?.customer_decision ?? '-'} by=${expired?.decided_by ?? '-'})`,
    );
    if (apply) {
      const res = await jobs.updateOne(
        { _id: job._id, cancellation_reason: SOS_CANCEL_REASON_NO_RESPONSE },
        { $set: { cancellation_reason: SOS_CANCEL_REASON_REMATCH_EXPIRED } },
      );
      if (res.modifiedCount === 1) updated += 1;
      else
        console.log(
          `[warn] job ${job._id}: updateOne modified ${res.modifiedCount} (already changed?)`,
        );
    }
  }

  console.log(
    `[backfill] done. scanned=${candidates.length} matched=${matched} updated=${updated}${apply ? '' : ' (dry-run — re-run with --apply to write)'}`,
  );
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[backfill] FAILED:', err?.message ?? err);
  process.exit(1);
});
