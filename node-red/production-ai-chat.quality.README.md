# Ruhana quality tools

Import `production-ai-chat.quality.patch.flow.json` using replacement for matching node IDs. Only these three functions change:

- **Authenticate + tools** (`4729824a10a95881`): register quality tools and correct obsolete assumed-quality instructions.
- **Validate + next data tool** (`a4aa3b199eae51cc`): allowlisted quality routes and existing identity forwarding.
- **Append tool result** (`7c5046e63d5db398`): normalize quality results and preserve actual coverage limitations.

The complete variant is `production-ai-chat.quality.complete.flow.json`. Use either the patch or complete variant, not both. Existing wiring, model request settings and other tools are preserved. Database or connection credentials are not added.

Deploy the API endpoints first:

- GET `/api/production/monthly-quality?month=YYYY-MM` from `overview-monthly-quality-api.flow.json`: all Keda lines, saved-shift totals, category percentages and tile/box counts, sizeWiseQuality and per-line counts.
- GET `/api/production/shift-quality?line=Keda%202&date=YYYY-MM-DD&shift=06-14` from the existing selected-shift quality API: current live or historical saved quality, categories/designs/grades.

Monthly quality does not include unsaved current-shift data. The AI now distinguishes measured quality, missing data and assumed quality. It calculates comparisons using tile-weighted counts and respects incomplete historical grade/size breakdowns. No model training is required.

The executor forwards existing `x-ruhanex-user` / `x-ruhanex-role` only for the two quality tools and retains the existing server-side `PRODUCTION_API_BEARER_TOKEN` mechanism. It does not create an Admin identity or forward the OpenAI credential. These identity headers must originate from your trusted authenticated application/proxy. If the Telegram/server integration supplies no authenticated user identity, the quality endpoints will return 401 until that existing integration provides the approved mapped identity. Keep the API base pointing to the trusted production service; do not remove endpoint authentication to bypass 401 errors.

Examples:

- “Show this month's first quality, normal damages and cut damages.”
- “Compare quality for 60x30 and 80x80 this month.”
- “Show Keda 2 previous shift quality by design and grade.”

Local checks compile all attached Function bodies and verify the new tools' paths, month validation, Keda restrictions and result normalization. Actual production HTTP/model calls were not executed.
