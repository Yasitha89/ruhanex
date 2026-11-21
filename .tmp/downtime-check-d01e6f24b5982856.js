const r = msg.summaryRequest;
if (!r) return null;

msg.collection = "stoppages";
msg.operation = "find";

// Shift-boundary logic splits open stoppages at boundaries,
// therefore each stoppage document belongs to exactly one shift.
msg.payload = [
    {
        device: r.device,
        date: r.shiftDate,
        shift: r.shift
    },
    {
        sort: {
            stopStart_ts: 1
        }
    }
];

return msg;