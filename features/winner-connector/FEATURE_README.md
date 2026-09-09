# Winner Desktop Connector (Backend)

Accepts Winner ASCII files from the **Winner Desktop Connector** running on client Windows PCs.

Connector responsibility: filesystem watch + stable delivery only.  
Backend responsibility: auth, validation, idempotency, parse/quote (reuses `ascii-quote`), **persist import for the web UI**.

---

## Why

Winner exports land in a local folder on a design PC. The connector uploads them over **HTTPS** to the hosted ELK ERP API. The web-app cookie JWT is not used for upload.

After accept, each file becomes a **Winner Import** visible under **Pricing → Winner Imports** so staff can:

- see which ASCII arrived
- open the stored ELK quote
- download the original ASCII
- export the quotation PDF again (same PDF helper as ASCII Design Quote)

---

## Production API base

```text
https://your-backend-host/api
```

Set via server env `WINNER_CONNECTOR_API_BASE` (no hardcoded production host in repo).

### Connector upload

```text
POST /integrations/winner/import
Authorization: Bearer <connectorToken>
```

### Web history (cookie session)

```text
GET /winner-imports
GET /winner-imports/:id
GET /winner-imports/:id/ascii
```

---

## Auth

**Connector:** `Authorization: Bearer <connectorToken>` + multipart `connectorId`.  
Tokens stored hashed (`bcrypt`).  

Create devices from **Winner Imports → Add New Device** (Administrator), or optionally `npm run seed:connector`.  
Set `WINNER_CONNECTOR_API_BASE` in server env (e.g. `https://your-backend/api`) so the UI/seed can show the API base to copy.

**Web list/detail:** normal `authenticate` cookie JWT (same as rest of ERP). List includes `connectorId` + `connectorName`.

### Admin create device

```text
POST /winner-connectors
Authorization: cookie JWT (Administrator)
Body: { "name": "Showroom PC - Fatima" }
```

Response includes one-time `connectorToken` (never stored in plain text).

---

## Persistence (AD-030)

On accept the server stores:

| What | Where |
|------|--------|
| Original ASCII bytes | `server/uploads/winner-imports/<importId>/<fileName>` |
| Full quote `{ header, summary, lines }` | MongoDB `WinnerImport.quote` |
| List summary | `quoteSummary` + `jobName` / `city` |

Idempotency: `connectorId + sha256` — same file content does not create a second import.  
Same filename with **new** content (new hash) creates a **new** import row.

PDF is generated in the browser from the stored quote (no separate PDF file on disk in V1).

---

## Connector response

**New (201):**

```json
{
  "success": true,
  "data": {
    "status": "accepted",
    "importId": "...",
    "fileName": "Project123.ASC",
    "jobName": "...",
    "quoteSummary": {}
  }
}
```

**Duplicate (200):** `status: "already_processed"` with the existing `importId`.

Does **not** write Hardware / BOM / catalogue master data.
