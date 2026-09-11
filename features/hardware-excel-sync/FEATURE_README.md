# Hardware Excel Sync (Backend)

Excel / Office Script is a **proposal source** for Hardware Master updates — not a live-write path.

```
Excel Master File edits
  → Office Script (changed rows only)
  → POST /api/hardware-excel-sync
  → verify via hardwarePricing.service
  → hardwareApprovals.service.submitUpdate()
  → HardwareChangeRequest PENDING
  → Manager/Admin approve (existing)
  → hardware.service.update + cascade (existing)
```

Does **not** use `/api/hardware-import` (that remains Admin direct live write).  
Does **not** change manual `PATCH /api/hardware-items/:id` behavior.

---

## Endpoint

`POST /api/hardware-excel-sync`  
Alias: `POST /api/hardware-excel-sync/submit`

**Auth:** `Authorization: Bearer <EXCEL_SYNC_TOKEN>` (not cookie JWT)

**Body (conceptual):**

```json
{
  "workbook": { "sheetName": "Master File" },
  "rows": [
    {
      "excelRowNumber": 42,
      "stockCode": "ACC0001-CO1",
      "source": {
        "groupCode": "ACC",
        "description": "...",
        "regionalCosts": { "cpt": 1.87, "jhb": 1.2 },
        "pricingBasis": "Agreed",
        "mnfMarkup": 1.114,
        "frcMarkup": 1.52,
        "retailMarkup": 1.54,
        "retFromSupplier": null,
        "weight": null,
        "isImport": false,
        "isActive": true
      },
      "verification": {
        "var": -0.67,
        "agreed": 1.87,
        "mnfPrice": 2.0832,
        "frcPrice": 2.8424,
        "retPriceExclVat": 4.3773,
        "retPriceInclVat": 5.0339,
        "marginFranRet": 35.06,
        "marginHwMnf": 10.23,
        "marginHwFran": 34.21
      },
      "fingerprint": "groupCode=ACC|..."
    }
  ]
}
```

**Response `data`:** `{ summary, results[], sheetName, requestId }`

Row statuses: `PENDING` | `NO_CHANGE` | `INVALID` | `PENDING_CONFLICT` | `UNKNOWN_STOCK_CODE` | `FAILED`

Update Office Script baseline only for `PENDING` and `NO_CHANGE`.

---

## Authentication setup

| Variable | Purpose |
|----------|---------|
| `HARDWARE_EXCEL_SYNC_TOKEN_HASH` | bcrypt hash of bearer token (**preferred**) |
| `HARDWARE_EXCEL_SYNC_TOKEN` | Plain token (local/dev only) |
| `HARDWARE_EXCEL_SYNC_USER_ID` | Active user `_id` with Admin/Manager/Data Entry role (`submittedBy`) |
| `HARDWARE_EXCEL_SYNC_MAX_ROWS` | Max batch size (default 100) |
| `HARDWARE_EXCEL_SYNC_CORS_ORIGINS` | Extra allowed CORS origins (comma-separated) |

Generate hash:

```bash
node -e "require('bcrypt').hash('your-long-random-token', 10).then(console.log)"
```

Revoke by rotating the hash/token in env and restarting the server.

Do **not** put a normal user JWT in the Office Script.

---

## CORS

Office Scripts `fetch` is picky:

1. Helmet must **not** use `Cross-Origin-Resource-Policy: same-origin` (we set `cross-origin`).
2. For `/api/hardware-excel-sync` only, responses use `Access-Control-Allow-Origin: *` (Microsoft docs: specific origins can break because the Office Scripts runtime Origin can change).
3. Remaining API routes still use `CLIENT_URL` + Microsoft Excel hosts + `HARDWARE_EXCEL_SYNC_CORS_ORIGINS`.

Use **HTTPS** in production. After changing CORS/Helmet, **redeploy** the Render service.

---

## Idempotency

Duplicate pending CRs are blocked by existing `assertNoPendingConflict` → row status `PENDING_CONFLICT`.

Optional headers: `X-Request-Id` / `Idempotency-Key` (logged; not a full response cache).

---

## Workbook requirements

- Sheet name: **Master File** only
- Identity: **STOCK CODE** (immutable via this API)
- Hidden state sheet: `__HardwareSyncState` (managed by Office Script)
- Formulas on Master File are never overwritten by the script

---

## Failure behavior

Partial success is mandatory. Failed / invalid / conflict rows keep their old baseline fingerprint and remain retryable after the user fixes Excel or resolves the pending CR.
