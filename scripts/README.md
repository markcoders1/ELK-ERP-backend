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

## Notes

- Passwords are hashed with bcrypt (12 rounds), same as the auth service.
- There is no public signup UI. User accounts are seeded or managed internally.
- `POST /api/auth/register` exists on the API but is not exposed in the client login flow.
