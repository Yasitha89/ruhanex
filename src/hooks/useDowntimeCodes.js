import { useEffect, useState } from "react";
import { getDowntimeCodeRecords } from "../api/downtimeCodesApi";

export default function useDowntimeCodes({ open, line, type, plannedCategory }) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({ key: "", rows: [], error: "" });
  const enabled = open && Boolean(line) && ["planned", "unplanned"].includes(type) && (type !== "planned" || Boolean(plannedCategory));
  const category = type === "planned" ? plannedCategory : null;
  const key = enabled ? JSON.stringify([line, type, category, revision]) : "";
  useEffect(() => {
    if (!key) return;
    let active = true;
    const controller = new AbortController();
    getDowntimeCodeRecords({ line, type, plannedCategory: category, signal: controller.signal }).then(
      (rows) => { if (active) setResult({ key, rows: rows.filter((row) => row.type === type && row.lines?.includes(line) && (type !== "planned" || row.plannedCategory === category)), error: "" }); },
      (err) => { if (active) setResult({ key, rows: [], error: err.response?.data?.error || err.message || "Unable to load downtime codes." }); },
    );
    return () => { active = false; controller.abort(); };
  }, [key, line, type, category]);
  return {
    options: key && result.key === key ? result.rows.map(({ value, label }) => ({ value, label })) : [],
    loading: Boolean(key && result.key !== key),
    error: key && result.key === key ? result.error : "",
    retry: () => setRevision((value) => value + 1),
  };
}
