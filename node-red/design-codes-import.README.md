# Import design codes from the product-range workbook

Source: `Product_Range(RCL_HORANA_as_@_01112026)_RSS - Copy.xls`. Extracted all numbered product rows from the seven **Present Range** sheets. The first sheet of proposed designs was excluded because it supplies no tile-size/design-code mapping. No duplicate size/code pairs were found.

| Tile size used by Ruhanex | Source sheet | Codes |
| --- | --- | ---: |
| 60x60 | Present Range (6060) | 72 |
| 60x30 | Present Range (6030) | 70 |
| 90x45 | Present Range (4590) | 27 |
| 120x60 | Present Range (60120) | 22 |
| 80x80 | Present Range (8080) | 64 |
| 120x80 | Present Range (80120) | 49 |
| 100x100 | Present Range (100100) | 43 |
| Total | | 347 |

Size orientation follows `src/utils/constants.js`: 45x90 becomes 90x45, 60x120 becomes 120x60, and 80x120 becomes 120x80. Design codes retain their spelling and punctuation; surrounding whitespace is removed. Commercial name maps to `description`. Shade, R value and first-production date are not imported because the current master-data UI does not use them.

## Import

1. Import `design-codes-import.flow.json` in Node-RED. It creates a separate tab with **no public endpoint** and does not write anything automatically.
2. Open **Bulk upsert design_codes** and select the existing MongoDB configuration for the production RCLH database if it is not resolved automatically. The flow reuses configuration ID `8120871193b8f276`; credentials are not included.
3. Review the mapping/counts above. Deploy, then click **MANUAL: import 347 design codes** once.
4. Inspect **Design-code import result** in Debug. Expect `success:true`, with `added` plus `existingMatches` totalling 347. `modified` should be 0.
5. Refresh **Settings → Admin → Master Data**, choose each size, and search for a code. The existing search API limits results to 50, so not every code may appear in an unfiltered list.

Each operation matches by tile size and case-insensitive exact design code, inserting only when missing. Existing descriptions, active flags and codes are **not overwritten or reactivated**. Repeating this manual import matches existing rows instead of adding them again; avoid simultaneous imports or other concurrent code-creation operations. Unordered bulk writes can partially succeed; correct errors and retry.

The Mongo node's `maxTimeMS` property is 0 because `bulkWrite` options belong in `msg.payload`: `[operations, {ordered:false,maxTimeMS:60000}]`. This avoids the earlier unsupported maxTimeMS-node-property error.

`design-codes.product-range.seed.json` is also provided for reviewing the extracted records. The Node-RED import performs the matching/upsert logic; importing that data JSON directly through Compass would not provide the same duplicate handling.

No database writes were performed while preparing these files.
