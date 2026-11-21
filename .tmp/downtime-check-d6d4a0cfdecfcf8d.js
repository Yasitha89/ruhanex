const req = msg.summaryRequest;

if (
    !req ||
    !req.device ||
    !req.shift ||
    !req.shiftDate ||
    !req.fromTime ||
    !req.toTime
) {
    node.warn(
        "Code-wise enrichment skipped: summaryRequest is missing"
    );
    return null;
}

function esc(v) {
    return String(v ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
}

msg.codeWiseTarget = {
    device: req.device,
    line: req.line,
    shift: req.shift,
    shiftDate: req.shiftDate,
    fromTime: req.fromTime,
    toTime: req.toTime,
    productionRunIdAtShiftEnd: req.productionRunIdAtShiftEnd || null,
    productionRunStartTimeAtShiftEnd: req.productionRunStartTimeAtShiftEnd || null
};

const device = esc(req.device);
const shift = esc(req.shift);
const shiftDate = esc(req.shiftDate);
const fromTime = esc(req.fromTime);
const toTime = esc(req.toTime);

// Read the completed shift's cumulative shift_count records.
// Difference calculation and design-code grouping are performed
// in the next Node-RED function for better Flux compatibility.
msg.query = `
from(bucket: "RCLH")
  |> range(
      start: time(v: "${fromTime}"),
      stop: time(v: "${toTime}")
  )
  |> filter(fn: (r) =>
      r["_measurement"] == "tile_events" and
      r["_field"] == "shift_count" and
      r["device"] == "${device}" and
      r["shift"] == "${shift}" and
      r["shiftDate"] == "${shiftDate}"
  )
  |> group(columns: ["device", "shift", "shiftDate"])
  |> sort(columns: ["_time"])
  |> keep(
      columns: [
          "_time",
          "_value",
          "designCode",
          "tileSize",
          "productionRunId",
          "productionRunStartTime"
      ]
  )
`;

node.warn(
    `Code-wise shift_count query: ${req.device} | ` +
    `${req.shiftDate} | ${req.shift} | ` +
    `${req.fromTime} -> ${req.toTime}`
);

return msg;