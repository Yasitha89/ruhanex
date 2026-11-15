# Design Grades

Grades now also have an optional **category** (trimmed text, at most 100 characters) editable by Admins and displayed in the catalogue table. It is stored on each grade entry in the same `ruhanex_config.designGrades` document, for example `{ "grade": "A", "description": "First quality", "category": "Quality" }`. Existing entries without a category appear as Uncategorized; no migration is required. Updates from older clients that omit category preserve the saved category. New filtering controls are not introduced yet.

The Admin **Line Settings — Administration** screen now has **Design Grades** immediately after **Downtime Codes**. Admins can enter a grade and description, view saved grades, and edit descriptions. Grade identifiers cannot be renamed through Edit. Both fields are required; grade is at most 80 characters and description at most 500. Grades are trimmed and case-insensitive for duplicate detection; entered display casing is preserved.

## Deploy

1. Import **design-grades.flow.json** as a new Node-RED tab. There is no change to the line-settings API or existing design-code/downtime data.
2. Select your existing MongoDB connection in both MongoDB nodes (reference `8120871193b8f276`).
3. Deploy the flow and updated frontend, then open the Admin line-settings section → **Design Grades**.

Writes require `X-Ruhanex-Role: Admin`; reads allow Admin and Manager so Managers can assign sensor slots on Keda lines. Roles must be supplied by your existing authenticated Nginx `auth_request` gateway. Keep Node-RED private and use the supplied gateway that overwrites client role headers; never expose these endpoints through an unrestricted proxy. Supervisors cannot access this API and Managers cannot create/edit grades. The existing gateway rejects unauthorized writes/origins; no new Nginx location is required with the supplied `/api/api/` gateway.

| Method | Node-RED path | Body |
| --- | --- | --- |
| GET | `/api/design-grades` | None |
| POST | `/api/design-grades` | `{ "grade": "A", "description": "First quality" }` |
| PUT | `/api/design-grades/:grade` | Same grade, new description |

Public URLs use the existing extra `/api` prefix, e.g. `/api/api/design-grades`. An empty list is returned before the document exists. The first successful create initializes this single MongoDB document:

```json
{
  "_id": "designGrades",
  "grades": [
    {
      "grade": "A",
      "gradeKey": "a",
      "description": "First quality",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

Collection: **ruhanex_config**. Document ID: **designGrades**. Creation uses an atomic conditional array append; description updates affect only the matched array entry. Other configuration documents and concurrently added grades are preserved. No global context/restart or seed data is needed. The grade catalogue is not automatically assigned to production records.

Local checks: `node node-red/test-design-grades.mjs`. Rebuild: `node node-red/build-design-grades-flow.mjs`. Tests use simulated MongoDB; live validation is required after deployment.
