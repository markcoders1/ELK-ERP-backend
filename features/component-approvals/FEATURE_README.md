# Component Approvals (server)

Component change requests reuse the shared `HardwareChangeRequest` collection with `entityType: COMPONENT`.

## Behaviour

- Submit create / update → PENDING request (catalogue unchanged)
- Approve CREATE → live APPROVED Component + default sections
- Approve UPDATE → clone live → SUPERSEDED (AD-023), apply snapshot to live, bump version
- Reject → reason required; catalogue untouched
- Audit + notifications via existing hardware-approvals helpers
- Shared Approvals queue lists HARDWARE + COMPONENT by default

## BOM diff engine

Business-friendly changes are produced by `server/shared/bomDiff.js` (`computeBomChanges`).

Stored on ChangeRequest / AuditLog as structured `changedFields` objects:

```js
{ section, field, action, oldValue, newValue, itemKey?, itemLabel?, path? }
```

Approval UI and Audit both consume this list (client mirror: `features/approvals/utils/bomDiff.js`). Legacy raw-path entries still render by recomputing from snapshots.
