// const target = msg.codeWiseTarget;

// if (!target || !target.device || !target.shift || !target.shiftDate) {
//     node.error("Cannot update shift: codeWiseTarget is invalid", msg);
//     return null;
// }

// msg.collection = "shifts";
// msg.mode = "collection";
// msg.operation = "updateOne";

// msg.payload = [
//     {
//         "lineStats.device": target.device,
//         "lineStats.shift": target.shift,
//         "lineStats.shiftDate": target.shiftDate
//     },
//     {
//         $set: {
//             // Aggregated unique design totals in first-produced order.
//             "lineStats.codeWiseProduction":
//                 Array.isArray(msg.codeWiseProduction)
//                     ? msg.codeWiseProduction
//                     : [],

//             // Complete run order. This preserves A -> B -> A.
//             "lineStats.codeWiseProductionTimeline":
//                 Array.isArray(msg.codeWiseProductionTimeline)
//                     ? msg.codeWiseProductionTimeline
//                     : [],

//             "lineStats.codeWiseUpdatedAt": new Date().toISOString()
//         }
//     }
// ];

// return msg;

const target = msg.codeWiseTarget;

if (!target || !target.device || !target.shift || !target.shiftDate) {
    node.error("Cannot update shift: codeWiseTarget is invalid", msg);
    return null;
}

const codeWise = Array.isArray(msg.codeWiseProduction)
    ? msg.codeWiseProduction
    : [];

const timeline = Array.isArray(msg.codeWiseProductionTimeline)
    ? msg.codeWiseProductionTimeline
    : [];

function round(value, decimals = 2) {
    const p = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * p) / p;
}

function normalizeSize(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/Ã—/g, "x");
}

function tileAreaM2(size) {
    const dimensions = size.split("x").map(Number);

    if (
        dimensions.length !== 2 ||
        !dimensions.every(n => Number.isFinite(n) && n > 0)
    ) {
        return null;
    }

    // Dimensions are in centimetres.
    return dimensions[0] * dimensions[1] / 10000;
}

const sizes = new Map();

for (const row of codeWise) {
    const tileSize = normalizeSize(row.tileSize);
    const tileCount = Number(row.tileCount);
    const area = tileAreaM2(tileSize);

    if (
        area === null ||
        !Number.isFinite(tileCount) ||
        tileCount < 0
    ) {
        node.error(
            "Cannot calculate size-wise production: invalid tile size/count",
            msg
        );
        return null;
    }

    if (!sizes.has(tileSize)) {
        sizes.set(tileSize, {
            tileSize,
            tileCount: 0,
            production: 0,
            productionUnit: "mÂ²"
        });
    }

    const item = sizes.get(tileSize);

    item.tileCount += tileCount;
    item.production += tileCount * area;
}

const sizeWiseProduction = [...sizes.values()].map(item => ({
    ...item,
    production: round(item.production)
}));

// Calculate the total before rounding individual size totals.
const totalProduction = round(
    [...sizes.values()].reduce(
        (sum, item) => sum + item.production,
        0
    )
);

const tileSizes = sizeWiseProduction.map(item => item.tileSize);
const updatedAt = new Date().toISOString();

msg.collection = "shifts";
msg.mode = "collection";
msg.operation = "updateOne";

msg.payload = [
    {
        "lineStats.device": target.device,
        "lineStats.shift": target.shift,
        "lineStats.shiftDate": target.shiftDate
    },
    {
        $set: {
            "lineStats.codeWiseProduction": codeWise,
            "lineStats.codeWiseProductionTimeline": timeline,
            "lineStats.sizeWiseProduction": sizeWiseProduction,

            // All sizes produced during this shift.
            "lineStats.tileSizes": tileSizes,
            "lineStats.multipleTileSizes": tileSizes.length > 1,

            // Correct total mÂ² using each size's actual count.
            "lineStats.production": totalProduction,
            "lineStats.productionUnit": "mÂ²",

            "lineStats.codeWiseUpdatedAt": updatedAt
        }
    }
];

return msg;