# Hardware Approvals — Backend

See also: `client/src/features/approvals/FEATURE_README.md`

## Collections

- `hardwarechangerequests` — pending/approved/rejected proposals (`entityType` for future modules)
- `audits` — immutable decision log
- `notifications` — lightweight in-app notifications

## Apply path

`approve()` → `hardware.service.create|update` → `sync.service.trigger()` (placeholder) → audit + notify submitter.

Snapshots (`snapshotBefore` / `snapshotAfter`) are never mutated after insert.
