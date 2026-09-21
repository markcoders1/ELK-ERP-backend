# DQS Sync — Backend

Push live Carcasses & BIC **VARIANT finish sell prices** from ELK-ERP to the Dynamic Quoting System (DQS).

ELK is the author of catalogue finish prices. DQS is a quoting consumer — it must not recalculate hardware BOM, FC materials, markups, or wastage.

**Status:** COMPLETE (v1 sender)

---

## Contract

```http
POST {DQS_SYNC_URL}
Authorization: Bearer {DQS_SYNC_TOKEN}
Content-Type: application/json
```

`DQS_SYNC_URL` is the **full** POST URL (no `/api` prefix — IIS strips it):

`{DQS_BASE}/integrations/elk/carcass-base-prices`

Body:

```json
{
  "source": "elk-erp",
  "mode": "delta" | "snapshot",
  "reason": "hardware-cascade" | "hardware-import" | "component-finish" | "snapshot" | "replay",
  "sourceUpdatedAt": "ISO-8601",
  "items": [
    {
      "itemCode": "1000DH",
      "finishes": [
        { "finishName": "Super White BisonLam", "price": 3722.3 }
      ]
    }
  ]
}
```

- Send ELK `componentCode` (catalogue Code), not colour codes (`C-…`)
- Send ELK `finishName` as stored (whitespace collapsed); DQS maps to materials
- Omit `null` / `0` prices
- Chunk at `DQS_SYNC_MAX_SKUS_PER_POST` (default 500)
- Never block ELK `approve()` on DQS failure — retry / snapshot later

---

## When we send

| Trigger | Mode | Reason | How |
| --- | --- | --- | --- |
| Hardware approve → create/update → cascade | delta | `hardware-cascade` | `sync.service.trigger` Dynamic Quote adapter |
| Admin hardware import (DIRECT) → cascade | delta | `hardware-import` | `hardware.service` enqueue after cascade |
| Component approve (live VARIANT applied) | delta | `component-finish` | `sync.service.trigger` |
| Component import (DIRECT) | delta | `component-finish` | enqueue after import |
| Ops snapshot | snapshot | `snapshot` / `replay` | `POST /api/dqs-sync/snapshot` or `npm run dqs:snapshot` |

**Never** on change-request submit. Pending snapshots are not source of truth.

---

## Module layout

```
server/features/dqs-sync/
  dqsSync.payload.js   # live Component + VARIANT → items[]
  dqsSync.client.js    # HTTP POST, chunk, retry
  dqsSync.service.js   # syncDelta / syncSnapshot / enqueueDelta
  dqsSync.routes.js    # Admin status + snapshot
  dqsSync.controller.js
  FEATURE_README.md
```

Env (see `server/.env.example`):

- `DQS_SYNC_URL`
- `DQS_SYNC_TOKEN`
- `DQS_SYNC_TIMEOUT_MS` (default 30000)
- `DQS_SYNC_MAX_SKUS_PER_POST` (default 500)
- `DQS_SYNC_MAX_RETRIES` (default 3)

---

## Ops

```bash
# From server/
npm run dqs:snapshot
```

Or as Administrator:

```http
POST /api/dqs-sync/snapshot
GET  /api/dqs-sync/status
```

First production cutover: one snapshot, then rely on deltas.

---

## Out of scope

- Winner / EKOOMS / Consultant List real adapters (still placeholders in `sync.service.js`)
- DQS side-category, surcharge, doors/edging
- Writing DQS Mongo directly
- Changing cascade / finish formulas
