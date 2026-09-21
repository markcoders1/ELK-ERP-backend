# Hardware Approvals — Backend

See also: `client/src/features/approvals/FEATURE_README.md`

## Collections

- `hardwarechangerequests` — pending/approved/rejected proposals (`entityType` for future modules)
- `audits` — immutable decision log
- `notifications` — lightweight in-app notifications

## Apply path

`approve()` → `hardware.service.create|update` (cascade) → `sync.service.trigger()` → audit + notify submitter.

`sync.service.trigger()` fans out four targets. Dynamic Quote (DQS) is a **real** adapter: it reads live VARIANT finish prices for catalogue products touched by the hardware stock code (or the component code) and POSTs to DQS. Winner / EKOOMS / Consultant List remain placeholders.

Snapshots (`snapshotBefore` / `snapshotAfter`) are never mutated after insert and are **never** sent to DQS.
