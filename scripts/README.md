# Server Scripts

Development utilities for the ELK ERP API. Not used in production runtime.

---

## Seed users

Creates one account per RBAC role for local development and QA.

### When to run

- First-time developer setup (after MongoDB is running)
- After resetting the local database
- When you need all four roles for permission testing

The script is **idempotent**. Re-running it skips accounts that already exist.

### Command

From the `server/` directory:

```bash
npm run seed:users
```

Requires `MONGODB_URI` in `.env` (see `.env.example`).

### Default accounts

| Role | Email | Password |
|------|-------|----------|
| Administrator | `admin@elk-erp.com` | `Admin@12345` |
| Manager | `manager@elk-erp.com` | `Manager@12345` |
| Data Entry | `dataentry@elk-erp.com` | `DataEntry@12345` |
| Consultant | `consultant@elk-erp.com` | `Consultant@12345` |

**Development only.** Change passwords before any shared or production environment.

### Environment overrides

Optional `.env` variables per account:

- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`
- `SEED_MANAGER_EMAIL`, `SEED_MANAGER_PASSWORD`, `SEED_MANAGER_NAME`
- `SEED_DATA_ENTRY_EMAIL`, `SEED_DATA_ENTRY_PASSWORD`, `SEED_DATA_ENTRY_NAME`
- `SEED_CONSULTANT_EMAIL`, `SEED_CONSULTANT_PASSWORD`, `SEED_CONSULTANT_NAME`

---

## Seed admin only (legacy)

Creates a single Administrator account:

```bash
npm run seed:admin
```

Prefer `npm run seed:users` for full role coverage.

---

## Seed hardware (development only)

Populates the Hardware Master File collection with representative SKUs so developers can exercise list, search, pagination, and upcoming UI slices.

**This is not Excel import.** It does not update or delete existing records. Re-running skips stock codes that already exist.

### Command

From the `server/` directory:

```bash
npm run seed:hardware
```

Requires `MONGODB_URI` in `.env`. Seed data lives in `scripts/data/hardware.seed.json`.

### Expected output

```
MongoDB connected
Inserted: X
Skipped: Y
```

---

## Seed components (Carcasses & BIC Catalogue)

Replaces demo Components & BOM data with workbook-style catalogue products.

**Development only.** By default this **deletes all** existing components, sections, and section items, then inserts catalogue rows (`1000DH`, `1200H_SD`, …) with:

- Catalogue identity (Range, Type, Modification Class, Region, Colour Code, Match flags, …)
- Workbook cost metrics (HW Cost / Markup / Retail, Masonite & Board usage, Edging, FC Markup, Wastage)
- Finish Pricing matrix (Super White BisonLam, Sonae, PG Accent/Demand/…, ELKP, KC, Egger — **named finishes only**)
- PG / SB codes stored as attributes on each finish (colour / price-group mapping) — **not** fake "Edging PG87" columns
- Supporting BOARD / HARDWARE / FACTORY lines linked to Hardware Master when available

### Command

From the `server/` directory:

```bash
npm run seed:hardware   # recommended first (for live HW links)
npm run seed:components
```

Requires `MONGODB_URI` in `.env`.

Seed generators live in:

- `scripts/data/catalogueProducts.js`
- `scripts/data/catalogueFinishes.js`

### Keep existing (no wipe)

```bash
SEED_COMPONENTS_KEEP=1 npm run seed:components
```

### Expected output

```
Wiped existing Components & BOM: …
Catalogue finishes per product: 58
Products inserted: 34
No legacy demo codes (BU-/DR-/TW-) remain.
```

---

## Seed NCL cascade (HW / FC / Catalogue)

Loads the National Components List MASTER workbook into:

- `HwComponentLine` (sheet **HW Components List**) — cost from HIR MNF / Hardware Master
- `FcComponentLine` (sheet **FC Components List**) — `boardM2` / `edgingLinearMeter` via `fcFormulas`
- `Component` APPROVED rows (sheet **Carcasses & BIC Catalogue**, header row 5) — identity + `catalogueMetrics`, then cascade `hwCost` / `hwRetail`

**Wipes only** HW/FC line collections (not Hardware Master / HIR). Components are upserted by `componentCode`. Board Range is skipped (Board model has no `pricePerM2`).

### Command

From the `server/` directory (after Hardware is seeded):

```bash
npm run seed:hardware   # if HIR/MNF not already present
npm run seed:ncl-cascade
```

Optional path override:

```bash
NCL_XLSX_PATH="/path/to/National Components List_MASTER 2026.xlsx" npm run seed:ncl-cascade
```

Default path: `/home/syed-ahad/Downloads/National Components List_MASTER 2026 (2).xlsx`

The workbook is ~48MB; the script loads only the three required sheets.

---

## Notes

- Passwords are hashed with bcrypt (12 rounds), same as the auth service.
- There is no public signup UI. User accounts are seeded or managed internally.
- `POST /api/auth/register` exists on the API but is not exposed in the client login flow.
