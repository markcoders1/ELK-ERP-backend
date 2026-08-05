# Components (server)

Manufacturing component catalogue + generic BOM sections.

## Structure

- `component.model.js` — header (code, description, category, finish, dimensions, retail, hybrid versioning) plus optional catalogue identity (`range`, `type`, `modificationClass`, `region`, `categoryDescription`, `colourCode`, match flags) and `catalogueMetrics` (workbook source HW/FC/edging inputs)
- `component.service.js` — list/detail, section/item orchestration, SUPERSEDED clone on update, import create
- `component.controller.js` / `component.routes.js` / `component.validator.js`

Dev seed (wipes demo, inserts Carcasses & BIC catalogue): `npm run seed:components` — see `server/scripts/README.md`.

Related features:

- `component-sections/` — generic section documents (`sectionType` open string)
- `section-items/` — generic line items (`attributes` Mixed; HARDWARE stores `hardwareId` only)
- `calculations/` — isolated section calculator registry + component rollup
- `component-approvals/` — submit create/update; approve clones prior live → SUPERSEDED
- `component-import/` — Admin DIRECT Excel migration (AD-021 pattern)

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/components` | Paginated list + section counts + pricing summary |
| GET | `/api/components/:id` | Detail + role-aware pricing |
| GET | `/api/components/:id/sections` | Section meta + counts |
| GET | `/api/components/:id/sections/:sectionId/items` | Lazy items + line costs |
| GET | `/api/components/:id/versions` | APPROVED + SUPERSEDED history |
| POST | `/api/components` | Submit create (pending approval) |
| PATCH | `/api/components/:id` | Submit update (pending approval) |
| PATCH | `/api/components/:id/sections/:sectionType` | Section-scoped submit |
| DELETE | `/api/components/:id` | Soft delete (Admin) |

## Rules

- Never store rolled-up totals (AD-005 / AD-022)
- Hardware prices always resolve from Hardware Master at read time (DB-03)
- Consultants never receive cost / margin fields
- Manual CRUD → approvals; Admin import → live DIRECT write
- List search includes product header fields plus child hardware codes/descriptions, board names/codes, factory operation names, and finish / price-group names on VARIANT items
- Default section display names: Boards, Hardware, Factory, Finish Pricing (sectionType VARIANT unchanged)
