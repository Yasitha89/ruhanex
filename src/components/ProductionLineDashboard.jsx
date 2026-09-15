// import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// import {
//   Badge,
//   Button,
//   Card,
//   Col,
//   DatePicker,
//   Descriptions,
//   Form,
//   Input,
//   Modal,
//   Row,
//   Select,
//   Space,
//   Table,
//   Tag,
//   Typography,
//   message,
// } from "antd";
// import {
//   BarChartOutlined,
//   CalendarOutlined,
//   ClockCircleOutlined,
//   DashboardOutlined,
//   ReloadOutlined,
//   RiseOutlined,
// } from "@ant-design/icons";
// import dayjs from "dayjs";
// import ProductionMonthlyPanel from "./ProductionMonthlyPanel";
// import ShiftDowntimeBarChart from "./ShiftDowntimeBarChart";
// import ShiftTileCountChart from "./ShiftTileCountChart";
// import {
//   getProductionLiveSummary,
//   getProductionMonthlySummary,
//   getProductionShiftCountSeries,
//   getProductionShiftStoppages,
//   getProductionShiftSummary,
//   updateProductionDowntimeReason,
// } from "../api/productionDashboardApi";
// import { calculateTileSqm } from "../utils/shiftUtils";
// import {
//   DOWNTIME_TYPES,
//   PLANNED_CATEGORIES,
//   getDowntimeCodes,
// } from "../utils/downtimeCodes";
// import "./ProductionLineDashboard.css";

// const { Text } = Typography;
// const SHIFTS = ["06-14", "14-22", "22-06"];

// function fmt(value, digits = 1) {
//   return Number(value || 0).toLocaleString("en-US", {
//     maximumFractionDigits: digits,
//   });
// }

// function minutesBetween(from, to) {
//   const a = new Date(from).getTime();
//   const b = new Date(to).getTime();
//   if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
//   return Math.max(0, (b - a) / 60000);
// }

// function getCurrentShiftSelection() {
//   const now = dayjs();
//   const hour = now.hour();
//   if (hour >= 6 && hour < 14)
//     return { date: now.startOf("day"), shift: "06-14" };
//   if (hour >= 14 && hour < 22)
//     return { date: now.startOf("day"), shift: "14-22" };
//   if (hour >= 22) return { date: now.startOf("day"), shift: "22-06" };
//   return { date: now.subtract(1, "day").startOf("day"), shift: "22-06" };
// }

// function mergePoints(previous, incoming) {
//   const map = new Map();
//   for (const row of previous || []) map.set(row.time, row);
//   for (const row of incoming || []) map.set(row.time, row);
//   return [...map.values()].sort((a, b) => new Date(a.time) - new Date(b.time));
// }

// function KpiCard({ icon, label, value, suffix, children, tone = "blue" }) {
//   return (
//     <Card className={`production-kpi-card production-kpi-${tone}`}>
//       <div className="production-kpi-layout">
//         <div className="production-kpi-icon">{icon}</div>
//         <div className="production-kpi-content">
//           <div className="production-kpi-label">{label}</div>
//           <div className="production-kpi-value">
//             {value}
//             {suffix ? (
//               <span className="production-kpi-suffix">{suffix}</span>
//             ) : null}
//           </div>
//           <div className="production-kpi-subcontent">{children}</div>
//         </div>
//       </div>
//     </Card>
//   );
// }

// export default function ProductionLineDashboard({ line, title = line }) {
//   const [live, setLive] = useState(null);
//   const [liveError, setLiveError] = useState("");
//   const [currentStops, setCurrentStops] = useState([]);
//   const [currentStopSummary, setCurrentStopSummary] = useState({
//     totalDowntimeMinutes: 0,
//     completedStops: 0,
//     openStop: false,
//   });

//   const [month, setMonth] = useState(dayjs().startOf("month"));
//   const [monthly, setMonthly] = useState(null);
//   const [monthlyLoading, setMonthlyLoading] = useState(true);

//   const initialShiftSelection = useMemo(() => getCurrentShiftSelection(), []);
//   const [selectedDate, setSelectedDate] = useState(initialShiftSelection.date);
//   const [selectedShift, setSelectedShift] = useState(
//     initialShiftSelection.shift,
//   );
//   const [tileSeries, setTileSeries] = useState([]);
//   const [tileCursor, setTileCursor] = useState(null);
//   const [selectedStops, setSelectedStops] = useState([]);
//   const [selectedStopSummary, setSelectedStopSummary] = useState({
//     totalDowntimeMinutes: 0,
//     completedStops: 0,
//     openStop: false,
//   });
//   const [selectedShiftStats, setSelectedShiftStats] = useState(null);
//   const [analysisLoading, setAnalysisLoading] = useState(true);

//   const [selectedDowntime, setSelectedDowntime] = useState(null);
//   const [downtimeModalOpen, setDowntimeModalOpen] = useState(false);
//   const [savingDowntime, setSavingDowntime] = useState(false);
//   const [downtimeForm] = Form.useForm();
//   const selectedDowntimeType = Form.useWatch("downtimeType", downtimeForm);
//   const selectedPlannedCategory = Form.useWatch(
//     "plannedCategory",
//     downtimeForm,
//   );

//   const initializedSelection = useRef(true);
//   const countRequestBusy = useRef(false);
//   const fullSeriesRequestRef = useRef(0);
//   const selectionRef = useRef({
//     date: selectedDate.format("YYYY-MM-DD"),
//     shift: selectedShift,
//   });
//   selectionRef.current = {
//     date: selectedDate.format("YYYY-MM-DD"),
//     shift: selectedShift,
//   };

//   const selectedDateString = selectedDate.format("YYYY-MM-DD");

//   const isSelectedCurrentShift = Boolean(
//     live &&
//     live.shiftDate === selectedDateString &&
//     live.currentShift === selectedShift,
//   );

//   const loadLive = useCallback(async () => {
//     try {
//       const response = await getProductionLiveSummary(line);

//       setLive((previous) => {
//         if (!previous) {
//           return response;
//         }

//         const previousCountTimestamp = Number(
//           previous.shiftCountTimestamp || previous.lastSeen || 0,
//         );

//         const responseCountTimestamp = Number(
//           response?.shiftCountTimestamp || response?.lastSeen || 0,
//         );

//         /*
//          * The incremental chart API can return a newer shift_count sample
//          * before /live-summary finishes. Do not allow an older live-summary
//          * response to overwrite the newer count already shown in the KPI.
//          */
//         if (
//           previousCountTimestamp > 0 &&
//           responseCountTimestamp > 0 &&
//           responseCountTimestamp < previousCountTimestamp
//         ) {
//           return {
//             ...response,
//             shiftCount: previous.shiftCount,
//             productionSqm: previous.productionSqm,
//             tileSize: previous.tileSize,
//             shiftCountTimestamp: previousCountTimestamp,
//           };
//         }

//         return response;
//       });

//       setLiveError("");
//     } catch (error) {
//       console.error(`${line}: live summary failed`, error);
//       setLiveError("Live data unavailable");
//     }
//   }, [line]);

//   const loadCurrentStops = useCallback(async () => {
//     if (!live?.shiftDate || !live?.currentShift) return;

//     try {
//       const response = await getProductionShiftStoppages({
//         line,
//         date: live.shiftDate,
//         shift: live.currentShift,
//       });

//       setCurrentStops(response?.stoppages || []);
//       setCurrentStopSummary(response?.summary || {});
//     } catch (error) {
//       console.error(`${line}: current stoppages failed`, error);
//     }
//   }, [line, live?.shiftDate, live?.currentShift]);

//   const loadMonthly = useCallback(async () => {
//     setMonthlyLoading(true);
//     try {
//       const response = await getProductionMonthlySummary(
//         line,
//         month.format("YYYY-MM"),
//       );
//       setMonthly(response);
//     } catch (error) {
//       console.error(`${line}: monthly summary failed`, error);
//       setMonthly(null);
//     } finally {
//       setMonthlyLoading(false);
//     }
//   }, [line, month]);

//   const loadSelectedStoppages = useCallback(async () => {
//     if (isSelectedCurrentShift) {
//       setSelectedStops(currentStops);
//       setSelectedStopSummary(currentStopSummary);
//       return;
//     }

//     const requestDate = selectedDateString;
//     const requestShift = selectedShift;
//     const response = await getProductionShiftStoppages({
//       line,
//       date: requestDate,
//       shift: requestShift,
//     });
//     if (
//       selectionRef.current.date !== requestDate ||
//       selectionRef.current.shift !== requestShift
//     )
//       return;
//     setSelectedStops(response?.stoppages || []);
//     setSelectedStopSummary(response?.summary || {});
//   }, [
//     isSelectedCurrentShift,
//     currentStops,
//     currentStopSummary,
//     line,
//     selectedDateString,
//     selectedShift,
//   ]);

//   const loadSelectedSummary = useCallback(async () => {
//     try {
//       const requestDate = selectedDateString;
//       const requestShift = selectedShift;
//       const response = await getProductionShiftSummary({
//         line,
//         date: requestDate,
//         shift: requestShift,
//       });
//       if (
//         selectionRef.current.date !== requestDate ||
//         selectionRef.current.shift !== requestShift
//       )
//         return;
//       setSelectedShiftStats(response?.lineStats || null);
//     } catch (error) {
//       console.error(`${line}: shift summary failed`, error);

//       // For the current shift the page still has the live-summary +
//       // stoppage data as a fallback while the API recovers.
//       if (!isSelectedCurrentShift) {
//         setSelectedShiftStats(null);
//       }
//     }
//   }, [isSelectedCurrentShift, line, selectedDateString, selectedShift]);

//   const loadFullTileSeries = useCallback(async () => {
//     const requestId = ++fullSeriesRequestRef.current;
//     const requestDate = selectedDateString;
//     const requestShift = selectedShift;
//     try {
//       const response = await getProductionShiftCountSeries({
//         line,
//         date: requestDate,
//         shift: requestShift,
//       });
//       if (
//         requestId !== fullSeriesRequestRef.current ||
//         selectionRef.current.date !== requestDate ||
//         selectionRef.current.shift !== requestShift
//       )
//         return;
//       setTileSeries(response?.points || []);
//       setTileCursor(response?.cursor || null);
//     } catch (error) {
//       console.error(`${line}: production series failed`, error);
//     }
//   }, [line, selectedDateString, selectedShift]);

//   const loadIncrementalTileSeries = useCallback(async () => {
//     if (!isSelectedCurrentShift || !tileCursor || countRequestBusy.current)
//       return;
//     countRequestBusy.current = true;

//     try {
//       const response = await getProductionShiftCountSeries({
//         line,
//         date: selectedDateString,
//         shift: selectedShift,
//         after: tileCursor,
//       });

//       const incoming = response?.points || [];

//       if (incoming.length) {
//         setTileSeries((old) => mergePoints(old, incoming));

//         const latestPoint = incoming[incoming.length - 1];

//         setTileCursor(response?.cursor || latestPoint?.time || tileCursor);

//         /*
//          * The shift-count chart already has the newest cumulative shift count.
//          * Reuse that value immediately for the top Shift Production KPI instead
//          * of waiting for the next /live-summary response.
//          *
//          * /live-summary still refreshes line status, speed, sensor state, shift
//          * information and configuration every 5 seconds.
//          */
//         const latestCount = Number(latestPoint?.value);

//         if (Number.isFinite(latestCount)) {
//           setLive((previous) => {
//             if (!previous) return previous;

//             const latestTileSize =
//               String(latestPoint?.tileSize || "").trim() || previous.tileSize;

//             const latestTimestamp = new Date(latestPoint?.time).getTime();

//             return {
//               ...previous,
//               shiftCount: latestCount,
//               tileSize: latestTileSize,
//               productionSqm: calculateTileSqm(latestTileSize, latestCount),
//               shiftCountTimestamp: Number.isFinite(latestTimestamp)
//                 ? latestTimestamp
//                 : Number(
//                     previous.shiftCountTimestamp || previous.lastSeen || 0,
//                   ),
//             };
//           });
//         }
//       }
//     } catch (error) {
//       console.error(`${line}: incremental production series failed`, error);
//     } finally {
//       countRequestBusy.current = false;
//     }
//   }, [
//     isSelectedCurrentShift,
//     tileCursor,
//     line,
//     selectedDateString,
//     selectedShift,
//   ]);

//   const refreshSelectedAnalysis = useCallback(async () => {
//     setAnalysisLoading(true);
//     try {
//       await Promise.all([
//         loadFullTileSeries(),
//         loadSelectedStoppages(),
//         loadSelectedSummary(),
//       ]);
//     } catch (error) {
//       console.error(`${line}: shift analysis failed`, error);
//     } finally {
//       setAnalysisLoading(false);
//     }
//   }, [line, loadFullTileSeries, loadSelectedStoppages, loadSelectedSummary]);

//   useEffect(() => {
//     loadLive();
//     const timer = window.setInterval(loadLive, 5000);
//     return () => window.clearInterval(timer);
//   }, [loadLive]);

//   useEffect(() => {
//     loadCurrentStops();
//     const timer = window.setInterval(loadCurrentStops, 10000);
//     return () => window.clearInterval(timer);
//   }, [loadCurrentStops]);

//   useEffect(() => {
//     loadMonthly();
//     const currentMonth = month.isSame(dayjs(), "month");
//     if (!currentMonth) return undefined;
//     const timer = window.setInterval(loadMonthly, 60000);
//     return () => window.clearInterval(timer);
//   }, [loadMonthly, month]);

//   useEffect(() => {
//     setTileSeries([]);
//     setTileCursor(null);
//     setSelectedStops([]);
//     setSelectedShiftStats(null);
//     refreshSelectedAnalysis();
//   }, [selectedDateString, selectedShift, line]);

//   useEffect(() => {
//     if (!isSelectedCurrentShift) return undefined;
//     setSelectedStops(currentStops);
//     setSelectedStopSummary(currentStopSummary);

//     const timer = window.setInterval(loadIncrementalTileSeries, 5000);
//     return () => window.clearInterval(timer);
//   }, [
//     isSelectedCurrentShift,
//     currentStops,
//     currentStopSummary,
//     loadIncrementalTileSeries,
//   ]);

//   const currentCalculations = useMemo(() => {
//     if (!live) return {};

//     // /live-summary is the single source of truth for the live KPIs.
//     // It already merges InfluxDB production data with MongoDB downtime
//     // classifications and applies the progressive standard planned allowance.
//     return {
//       elapsedMinutes: Number(live.elapsedShiftMinutes || 0),
//       plannedDowntimeMinutes: Number(live.plannedDowntimeMinutes || 0),
//       unplannedDowntimeMinutes: Number(live.unplannedDowntimeMinutes || 0),
//       plannedProductionMinutes: Number(live.plannedProductionMinutes || 0),
//       operatingMinutes: Number(live.actualOperatingMinutes || 0),
//       availability: Number(live.availability || 0),
//       ratedLineSpeed: Number(
//         live.ratedLineSpeed ?? live.configuredLineSpeed ?? 0,
//       ),
//       targetTiles: Number(live.targetTiles || 0),
//       targetSqm: Number(live.targetProduction || 0),
//       achievement: Number(live.performance || 0),
//       maximumDowntimeMinutes: Number(live.maximumDowntimeMinutes || 0),
//       completedStops: Number(live.completedStops || 0),
//       totalDowntimeMinutes: Number(live.totalDowntimeMinutes || 0),
//       standardPlannedDowntimeMinutes: Number(
//         live.standardPlannedDowntimeMinutes || 0,
//       ),
//       recordedStandardDowntimeMinutes: Number(
//         live.recordedStandardDowntimeMinutes || 0,
//       ),
//       distributedStandardAllowanceMinutes: Number(
//         live.distributedStandardAllowanceMinutes || 0,
//       ),
//       additionalPlannedDowntimeMinutes: Number(
//         live.additionalPlannedDowntimeMinutes || 0,
//       ),
//       standardExcessDowntimeMinutes: Number(
//         live.standardExcessDowntimeMinutes || 0,
//       ),
//     };
//   }, [live]);

//   const selectedDetails = useMemo(() => {
//     // Preferred source for both current and historical selections.
//     //
//     // Current shift:
//     //   /api/production/shift-summary -> InfluxDB + stoppages MongoDB
//     //
//     // Historical shift:
//     //   /api/production/shift-summary -> saved MongoDB shifts document
//     if (selectedShiftStats) {
//       return selectedShiftStats;
//     }

//     // Current-shift fallback. This keeps the UI useful if the hybrid
//     // shift-summary request temporarily fails.
//     if (isSelectedCurrentShift && live) {
//       return {
//         tileSize: live.tileSize,
//         tileCount: Number(live.shiftCount || 0),
//         production: Number(
//           live.productionSqm ||
//             calculateTileSqm(live.tileSize, live.shiftCount),
//         ),
//         actualOperatingMinutes: currentCalculations.operatingMinutes,
//         configuredPlannedDowntime: Number(
//           live.configuredStandardPlannedDowntime ?? live.plannedDowntime ?? 0,
//         ),
//         plannedDowntimeMinutes: Number(live.plannedDowntimeMinutes || 0),
//         standardPlannedDowntimeMinutes: Number(
//           live.standardPlannedDowntimeMinutes || 0,
//         ),
//         additionalPlannedDowntimeMinutes: Number(
//           live.additionalPlannedDowntimeMinutes || 0,
//         ),
//         unplannedDowntimeMinutes: Number(live.unplannedDowntimeMinutes || 0),
//         standardExcessDowntimeMinutes: Number(
//           live.standardExcessDowntimeMinutes || 0,
//         ),
//         totalDowntimeMinutes: Number(live.totalDowntimeMinutes || 0),
//         maximumDowntimeMinutes: Number(live.maximumDowntimeMinutes || 0),
//         completedStops: Number(live.completedStops || 0),
//         availability: currentCalculations.availability,
//         performance: currentCalculations.achievement,
//         currentSpeed: Number(live.speed || 0),
//         source: "live-fallback",
//       };
//     }

//     return {};
//   }, [
//     selectedShiftStats,
//     isSelectedCurrentShift,
//     live,
//     currentCalculations,
//     selectedStopSummary,
//   ]);

//   const openDowntimeModal = (row) => {
//     setSelectedDowntime(row);
//     downtimeForm.setFieldsValue({
//       machine: row?.machine || "",
//       reason: row?.reason || "",
//       downtimeType: row?.downtimeType || "unplanned",
//       plannedCategory:
//         row?.downtimeType === "planned"
//           ? row?.plannedCategory || "standard"
//           : undefined,
//       downtimeCode: row?.downtimeCode || undefined,
//     });
//     setDowntimeModalOpen(true);
//   };

//   const saveDowntimeReason = async () => {
//     if (!selectedDowntime?._id) return;

//     try {
//       const values = await downtimeForm.validateFields();
//       setSavingDowntime(true);
//       await updateProductionDowntimeReason({
//         id: selectedDowntime._id,
//         date: selectedDowntime.date,
//         shift: selectedDowntime.shift,
//         line: selectedDowntime.line,
//         stopStart_ts: selectedDowntime.stopStart_ts,
//         reason: values.reason.trim(),
//         machine: values.machine?.trim() || "",
//         downtimeType: values.downtimeType,
//         plannedCategory:
//           values.downtimeType === "planned" ? values.plannedCategory : null,
//         downtimeCode: values.downtimeCode,
//       });
//       message.success("Downtime details updated.");
//       setDowntimeModalOpen(false);
//       await Promise.all([
//         loadCurrentStops(),
//         loadSelectedStoppages(),
//         loadSelectedSummary(),
//         loadLive(),
//       ]);
//     } catch (error) {
//       if (!error?.errorFields) {
//         message.error(
//           error?.response?.data?.error || "Unable to update downtime reason.",
//         );
//       }
//     } finally {
//       setSavingDowntime(false);
//     }
//   };

//   const tableColumns = [
//     { title: "#", width: 48, render: (_, __, i) => i + 1 },
//     {
//       title: "Start",
//       dataIndex: "stopStart_ts",
//       render: (v) => dayjs(Number(v)).format("HH:mm:ss"),
//     },
//     {
//       title: "End",
//       dataIndex: "stopStop_ts",
//       render: (v) =>
//         v ? (
//           dayjs(Number(v)).format("HH:mm:ss")
//         ) : (
//           <Tag color="processing">Ongoing</Tag>
//         ),
//     },
//     {
//       title: "Duration (min)",
//       dataIndex: "durationMinutes",
//       render: (v) => fmt(v, 1),
//     },
//     {
//       title: "Type",
//       dataIndex: "downtimeType",
//       render: (v) => (
//         <Tag color={v === "planned" ? "blue" : "red"}>
//           {v === "planned" ? "Planned" : "Unplanned"}
//         </Tag>
//       ),
//     },
//     { title: "Code", dataIndex: "downtimeCode", render: (v) => v || "-" },
//     { title: "Machine", dataIndex: "machine", render: (v) => v || "-" },
//     {
//       title: "Reason",
//       dataIndex: "reason",
//       render: (v) => v || <Text type="secondary">Not specified</Text>,
//     },
//   ];

//   return (
//     <div className="production-line-dashboard">
//       <section className="production-dashboard-heading">
//         <div>
//           <h1>{title}</h1>
//           <div className="production-heading-subtitle">
//             Production Monitoring &amp; Analysis
//           </div>
//         </div>

//         <div className="production-heading-statuses">
//           <div className="production-header-chip">
//             <DashboardOutlined />
//             <div>
//               <small>Line Speed</small>
//               <strong>{fmt(live?.speed, 1)} tiles/min</strong>
//             </div>
//           </div>
//           <div className="production-header-chip">
//             <CalendarOutlined />
//             <div>
//               <small>Current Shift</small>
//               <strong>{live?.currentShift || "-"}</strong>
//             </div>
//           </div>
//           <div className="production-header-chip">
//             <CalendarOutlined />
//             <div>
//               <small>Shift Date</small>
//               <strong>
//                 {live?.shiftDate
//                   ? dayjs(live.shiftDate).format("DD MMM YYYY")
//                   : "-"}
//               </strong>
//             </div>
//           </div>
//           <div className="production-header-chip production-running-chip">
//             <Badge
//               status={
//                 (currentStopSummary?.openStop
//                   ? "Stopped"
//                   : live?.shiftStatus) === "Running"
//                   ? "success"
//                   : "error"
//               }
//             />
//             <div>
//               <small>Line Status</small>
//               <strong>
//                 {currentStopSummary?.openStop
//                   ? "Stopped"
//                   : live?.shiftStatus || "Unknown"}
//               </strong>
//             </div>
//           </div>
//         </div>
//       </section>

//       {liveError ? (
//         <div className="production-live-warning">{liveError}</div>
//       ) : null}

//       <Row gutter={[12, 12]}>
//         <Col xs={12} lg={6}>
//           <KpiCard
//             icon={<BarChartOutlined />}
//             label="Shift Production"
//             value={fmt(live?.productionSqm, 1)}
//             suffix="m²"
//             tone="blue"
//           >
//             <span>{fmt(live?.shiftCount, 0)} tiles</span>
//             <span>
//               Tile Size: <strong>{live?.tileSize || "-"}</strong>
//             </span>
//           </KpiCard>
//         </Col>
//         <Col xs={12} lg={6}>
//           <KpiCard
//             icon={<RiseOutlined />}
//             label="Availability"
//             value={fmt(live?.availability, 1)}
//             suffix="%"
//             tone="green"
//           >
//             <span>
//               Operating Time{" "}
//               <strong>{fmt(live?.actualOperatingMinutes, 0)} min</strong>
//             </span>
//             <span>
//               Planned Downtime{" "}
//               <strong>{fmt(live?.plannedDowntimeMinutes, 1)} min</strong>
//             </span>
//           </KpiCard>
//         </Col>
//         <Col xs={12} lg={6}>
//           <KpiCard
//             icon={<ClockCircleOutlined />}
//             label="Downtime"
//             value={fmt(live?.totalDowntimeMinutes, 0)}
//             suffix="min"
//             tone="orange"
//           >
//             <span>
//               <strong>{Number(live?.completedStops || 0)}</strong> completed
//               stoppages
//             </span>
//             <span>
//               Maximum Downtime{" "}
//               <strong>{fmt(live?.maximumDowntimeMinutes, 1)} min</strong>
//             </span>
//           </KpiCard>
//         </Col>
//         <Col xs={12} lg={6}>
//           <KpiCard
//             icon={<DashboardOutlined />}
//             label="Performance vs Target"
//             value={fmt(live?.performance, 1)}
//             suffix="%"
//             tone="purple"
//           >
//             <span>
//               Target <strong>{fmt(live?.targetProduction, 1)} m²</strong>
//             </span>
//             <span>
//               Actual <strong>{fmt(live?.productionSqm, 1)} m²</strong>
//             </span>
//           </KpiCard>
//         </Col>
//       </Row>

//       <Card
//         className="production-dashboard-card production-monthly-card"
//         title={
//           <div className="production-section-title">
//             <span>Monthly Production</span>
//             <Space size={8}>
//               <span className="analysis-filter-label">Month</span>
//               <DatePicker
//                 picker="month"
//                 allowClear={false}
//                 value={month}
//                 onChange={(value) => value && setMonth(value.startOf("month"))}
//                 format="MMMM YYYY"
//               />
//             </Space>
//           </div>
//         }
//       >
//         <ProductionMonthlyPanel
//           line={line}
//           month={month}
//           data={monthly}
//           loading={monthlyLoading}
//         />
//       </Card>

//       <Card
//         className="production-dashboard-card production-analysis-card"
//         title={
//           <div className="production-analysis-title">
//             <span>Current Shift Analysis</span>
//             <Space size={8} wrap>
//               <span className="analysis-filter-label">Date</span>
//               <DatePicker
//                 value={selectedDate}
//                 allowClear={false}
//                 onChange={(value) =>
//                   value && setSelectedDate(value.startOf("day"))
//                 }
//               />
//               <span className="analysis-filter-label">Shift</span>
//               <Select
//                 value={selectedShift}
//                 onChange={setSelectedShift}
//                 style={{ width: 118 }}
//                 options={SHIFTS.map((value) => ({ value, label: value }))}
//               />
//               <Button
//                 icon={<ReloadOutlined />}
//                 onClick={refreshSelectedAnalysis}
//               >
//                 Refresh
//               </Button>
//             </Space>
//           </div>
//         }
//       >
//         <Row gutter={[12, 12]}>
//           <Col xs={24} xl={12}>
//             <div className="production-analysis-panel">
//               <div className="production-panel-heading">
//                 <strong>Current Shift Downtime ({selectedShift})</strong>
//                 <span>
//                   Total:{" "}
//                   <strong>
//                     {fmt(selectedStopSummary?.totalDowntimeMinutes, 0)} min
//                   </strong>{" "}
//                   &nbsp; {Number(selectedStopSummary?.completedStops || 0)}{" "}
//                   stoppages
//                 </span>
//               </div>
//               <ShiftDowntimeBarChart
//                 data={selectedStops}
//                 onBarClick={openDowntimeModal}
//               />
//             </div>
//           </Col>
//           <Col xs={24} xl={12}>
//             <div className="production-analysis-panel">
//               <div className="production-panel-heading">
//                 <strong>Shift Tile Count ({selectedShift})</strong>
//                 <span>
//                   Latest:{" "}
//                   <strong>{fmt(tileSeries.at(-1)?.value, 0)} tiles</strong>
//                 </span>
//               </div>
//               <ShiftTileCountChart
//                 data={tileSeries}
//                 loading={analysisLoading}
//               />
//             </div>
//           </Col>
//         </Row>

//         <Row
//           gutter={[12, 12]}
//           align="top"
//           className="production-bottom-row production-analysis-details-row"
//         >
//           <Col xs={24} xl={15}>
//             <Card
//               className="production-dashboard-card production-bottom-card production-stoppage-card"
//               title={`Stoppage Details (${selectedShift}, ${selectedDate.format("DD MMM YYYY")})`}
//             >
//               <Table
//                 className="production-stoppage-table"
//                 size="small"
//                 rowKey={(row) => String(row._id || row.stopStart_ts)}
//                 columns={tableColumns}
//                 dataSource={selectedStops}
//                 pagination={false}
//                 onRow={(record) => ({
//                   onClick: () => openDowntimeModal(record),
//                   style: { cursor: "pointer" },
//                 })}
//               />
//             </Card>
//           </Col>
//           <Col xs={24} xl={9}>
//             <Card
//               className="production-dashboard-card production-bottom-card production-shift-details-card"
//               title={`Shift Production Details (${selectedShift})`}
//             >
//               <Descriptions
//                 className="production-shift-details"
//                 column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }}
//                 size="small"
//                 bordered={false}
//               >
//                 <Descriptions.Item label="Tile Size">
//                   {selectedDetails.tileSize || "-"}
//                 </Descriptions.Item>
//                 <Descriptions.Item label="Tile Count">
//                   {fmt(selectedDetails.tileCount, 0)} tiles
//                 </Descriptions.Item>
//                 <Descriptions.Item label="Production">
//                   {fmt(selectedDetails.production, 1)} m²
//                 </Descriptions.Item>
//                 <Descriptions.Item label="Operating Time">
//                   {fmt(selectedDetails.actualOperatingMinutes, 0)} min
//                 </Descriptions.Item>
//                 <Descriptions.Item label="Planned Downtime">
//                   {fmt(
//                     selectedDetails.plannedDowntimeMinutes ??
//                       selectedDetails.appliedPlannedDowntime ??
//                       selectedDetails.configuredPlannedDowntime,
//                     1,
//                   )}{" "}
//                   min
//                 </Descriptions.Item>
//                 <Descriptions.Item label="Unplanned Downtime">
//                   {fmt(
//                     selectedDetails.unplannedDowntimeMinutes ??
//                       selectedDetails.unplannedDowntime ??
//                       selectedDetails.totalDowntimeMinutes,
//                     1,
//                   )}{" "}
//                   min
//                 </Descriptions.Item>
//                 <Descriptions.Item label="Total Stops">
//                   {Number(selectedDetails.completedStops || 0)}
//                 </Descriptions.Item>
//                 <Descriptions.Item label="Availability">
//                   {fmt(selectedDetails.availability, 1)} %
//                 </Descriptions.Item>
//                 <Descriptions.Item label="Performance">
//                   {fmt(selectedDetails.performance, 1)} %
//                 </Descriptions.Item>
//                 {isSelectedCurrentShift ? (
//                   <Descriptions.Item label="Current Speed">
//                     {fmt(selectedDetails.currentSpeed, 0)} tiles/min
//                   </Descriptions.Item>
//                 ) : null}
//               </Descriptions>
//             </Card>
//           </Col>
//         </Row>
//       </Card>

//       <Modal
//         title="Downtime Details"
//         open={downtimeModalOpen}
//         onCancel={() => setDowntimeModalOpen(false)}
//         onOk={saveDowntimeReason}
//         okText="Save"
//         confirmLoading={savingDowntime}
//         destroyOnHidden
//       >
//         {selectedDowntime ? (
//           <>
//             <Descriptions
//               size="small"
//               column={1}
//               bordered
//               style={{ marginBottom: 16 }}
//             >
//               <Descriptions.Item label="Line">
//                 {selectedDowntime.line || line}
//               </Descriptions.Item>
//               <Descriptions.Item label="Shift">
//                 {selectedDowntime.shift}
//               </Descriptions.Item>
//               <Descriptions.Item label="Start">
//                 {dayjs(Number(selectedDowntime.stopStart_ts)).format(
//                   "YYYY-MM-DD HH:mm:ss",
//                 )}
//               </Descriptions.Item>
//               <Descriptions.Item label="End">
//                 {selectedDowntime.stopStop_ts
//                   ? dayjs(Number(selectedDowntime.stopStop_ts)).format(
//                       "YYYY-MM-DD HH:mm:ss",
//                     )
//                   : "Ongoing"}
//               </Descriptions.Item>
//               <Descriptions.Item label="Duration">
//                 {fmt(selectedDowntime.durationMinutes, 1)} min
//               </Descriptions.Item>
//             </Descriptions>
//             <Form form={downtimeForm} layout="vertical">
//               <Form.Item
//                 label="Downtime Type"
//                 name="downtimeType"
//                 rules={[
//                   { required: true, message: "Select planned or unplanned" },
//                 ]}
//               >
//                 <Select
//                   options={DOWNTIME_TYPES}
//                   onChange={(value) => {
//                     downtimeForm.setFieldValue(
//                       "plannedCategory",
//                       value === "planned" ? "standard" : undefined,
//                     );
//                     downtimeForm.setFieldValue("downtimeCode", undefined);
//                   }}
//                 />
//               </Form.Item>
//               {selectedDowntimeType === "planned" ? (
//                 <Form.Item
//                   label="Planned Downtime Category"
//                   name="plannedCategory"
//                   rules={[
//                     {
//                       required: true,
//                       message: "Select standard or additional planned downtime",
//                     },
//                   ]}
//                 >
//                   <Select
//                     options={PLANNED_CATEGORIES}
//                     onChange={() =>
//                       downtimeForm.setFieldValue("downtimeCode", undefined)
//                     }
//                   />
//                 </Form.Item>
//               ) : null}
//               <Form.Item
//                 label="Downtime Code"
//                 name="downtimeCode"
//                 rules={[{ required: true, message: "Select a downtime code" }]}
//               >
//                 <Select
//                   showSearch
//                   optionFilterProp="label"
//                   options={getDowntimeCodes(
//                     selectedDowntimeType,
//                     selectedPlannedCategory,
//                   ).map(({ value, label }) => ({ value, label }))}
//                 />
//               </Form.Item>
//               <Form.Item label="Machine" name="machine">
//                 <Input maxLength={100} />
//               </Form.Item>
//               <Form.Item
//                 label="Downtime Reason"
//                 name="reason"
//                 rules={[
//                   {
//                     required: true,
//                     whitespace: true,
//                     message: "Please enter the downtime reason",
//                   },
//                 ]}
//               >
//                 <Input.TextArea rows={4} maxLength={500} showCount />
//               </Form.Item>
//             </Form>
//           </>
//         ) : null}
//       </Modal>
//     </div>
//   );
// }
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  BarChartOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  ReloadOutlined,
  RiseOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import ProductionMonthlyPanel from "./ProductionMonthlyPanel";
import ShiftDowntimeBarChart from "./ShiftDowntimeBarChart";
import ShiftTileCountChart from "./ShiftTileCountChart";
import {
  getProductionLiveSummary,
  getProductionMonthlySummary,
  getProductionShiftCountSeries,
  getProductionShiftStoppages,
  getProductionShiftSummary,
  updateProductionDowntimeReason,
} from "../api/productionDashboardApi";
import { calculateTileSqm } from "../utils/shiftUtils";
import {
  DOWNTIME_TYPES,
  PLANNED_CATEGORIES,
  getDowntimeCodes,
} from "../utils/downtimeCodes";
import "./ProductionLineDashboard.css";

const { Text } = Typography;
const SHIFTS = ["06-14", "14-22", "22-06"];

function fmt(value, digits = 1) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

function minutesBetween(from, to) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, (b - a) / 60000);
}

function getCurrentShiftSelection() {
  const now = dayjs();
  const hour = now.hour();
  if (hour >= 6 && hour < 14)
    return { date: now.startOf("day"), shift: "06-14" };
  if (hour >= 14 && hour < 22)
    return { date: now.startOf("day"), shift: "14-22" };
  if (hour >= 22) return { date: now.startOf("day"), shift: "22-06" };
  return { date: now.subtract(1, "day").startOf("day"), shift: "22-06" };
}

function mergePoints(previous, incoming) {
  const map = new Map();
  for (const row of previous || []) map.set(row.time, row);
  for (const row of incoming || []) map.set(row.time, row);
  return [...map.values()].sort((a, b) => new Date(a.time) - new Date(b.time));
}

function KpiCard({ icon, label, value, suffix, children, tone = "blue" }) {
  return (
    <Card className={`production-kpi-card production-kpi-${tone}`}>
      <div className="production-kpi-layout">
        <div className="production-kpi-icon">{icon}</div>
        <div className="production-kpi-content">
          <div className="production-kpi-label">{label}</div>
          <div className="production-kpi-value">
            {value}
            {suffix ? (
              <span className="production-kpi-suffix">{suffix}</span>
            ) : null}
          </div>
          <div className="production-kpi-subcontent">{children}</div>
        </div>
      </div>
    </Card>
  );
}

export default function ProductionLineDashboard({ line, title = line }) {
  const [live, setLive] = useState(null);
  const [liveError, setLiveError] = useState("");
  const [currentStops, setCurrentStops] = useState([]);
  const [currentStopSummary, setCurrentStopSummary] = useState({
    totalDowntimeMinutes: 0,
    completedStops: 0,
    openStop: false,
  });

  const [month, setMonth] = useState(dayjs().startOf("month"));
  const [monthly, setMonthly] = useState(null);
  const [monthlyLoading, setMonthlyLoading] = useState(true);

  const initialShiftSelection = useMemo(() => getCurrentShiftSelection(), []);
  const [selectedDate, setSelectedDate] = useState(initialShiftSelection.date);
  const [selectedShift, setSelectedShift] = useState(
    initialShiftSelection.shift,
  );
  const [tileSeries, setTileSeries] = useState([]);
  const [tileCursor, setTileCursor] = useState(null);
  const [selectedStops, setSelectedStops] = useState([]);
  const [selectedStopSummary, setSelectedStopSummary] = useState({
    totalDowntimeMinutes: 0,
    completedStops: 0,
    openStop: false,
  });
  const [selectedShiftStats, setSelectedShiftStats] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);

  const [selectedDowntime, setSelectedDowntime] = useState(null);
  const [downtimeModalOpen, setDowntimeModalOpen] = useState(false);
  const [savingDowntime, setSavingDowntime] = useState(false);
  const [downtimeForm] = Form.useForm();
  const selectedDowntimeType = Form.useWatch("downtimeType", downtimeForm);
  const selectedPlannedCategory = Form.useWatch(
    "plannedCategory",
    downtimeForm,
  );

  const initializedSelection = useRef(true);
  const countRequestBusy = useRef(false);
  const fullSeriesRequestRef = useRef(0);
  const selectionRef = useRef({
    date: selectedDate.format("YYYY-MM-DD"),
    shift: selectedShift,
  });
  selectionRef.current = {
    date: selectedDate.format("YYYY-MM-DD"),
    shift: selectedShift,
  };

  const selectedDateString = selectedDate.format("YYYY-MM-DD");

  const isSelectedCurrentShift = Boolean(
    live &&
    live.shiftDate === selectedDateString &&
    live.currentShift === selectedShift,
  );

  const loadLive = useCallback(async () => {
    try {
      const response = await getProductionLiveSummary(line);

      setLive((previous) => {
        if (!previous) {
          return response;
        }

        const previousCountTimestamp = Number(
          previous.shiftCountTimestamp || previous.lastSeen || 0,
        );

        const responseCountTimestamp = Number(
          response?.shiftCountTimestamp || response?.lastSeen || 0,
        );

        /*
         * The incremental chart API can return a newer shift_count sample
         * before /live-summary finishes. Do not allow an older live-summary
         * response to overwrite the newer count already shown in the KPI.
         */
        if (
          previousCountTimestamp > 0 &&
          responseCountTimestamp > 0 &&
          responseCountTimestamp < previousCountTimestamp
        ) {
          return {
            ...response,
            shiftCount: previous.shiftCount,
            productionSqm: previous.productionSqm,
            tileSize: previous.tileSize,
            shiftCountTimestamp: previousCountTimestamp,
          };
        }

        return response;
      });

      setLiveError("");
    } catch (error) {
      console.error(`${line}: live summary failed`, error);
      setLiveError("Live data unavailable");
    }
  }, [line]);

  const loadCurrentStops = useCallback(async () => {
    if (!live?.shiftDate || !live?.currentShift) return;

    try {
      const response = await getProductionShiftStoppages({
        line,
        date: live.shiftDate,
        shift: live.currentShift,
      });

      setCurrentStops(response?.stoppages || []);
      setCurrentStopSummary(response?.summary || {});
    } catch (error) {
      console.error(`${line}: current stoppages failed`, error);
    }
  }, [line, live?.shiftDate, live?.currentShift]);

  const loadMonthly = useCallback(async () => {
    setMonthlyLoading(true);
    try {
      const response = await getProductionMonthlySummary(
        line,
        month.format("YYYY-MM"),
      );
      setMonthly(response);
    } catch (error) {
      console.error(`${line}: monthly summary failed`, error);
      setMonthly(null);
    } finally {
      setMonthlyLoading(false);
    }
  }, [line, month]);

  const loadSelectedStoppages = useCallback(async () => {
    if (isSelectedCurrentShift) {
      setSelectedStops(currentStops);
      setSelectedStopSummary(currentStopSummary);
      return;
    }

    const requestDate = selectedDateString;
    const requestShift = selectedShift;
    const response = await getProductionShiftStoppages({
      line,
      date: requestDate,
      shift: requestShift,
    });
    if (
      selectionRef.current.date !== requestDate ||
      selectionRef.current.shift !== requestShift
    )
      return;
    setSelectedStops(response?.stoppages || []);
    setSelectedStopSummary(response?.summary || {});
  }, [
    isSelectedCurrentShift,
    currentStops,
    currentStopSummary,
    line,
    selectedDateString,
    selectedShift,
  ]);

  const loadSelectedSummary = useCallback(async () => {
    try {
      const requestDate = selectedDateString;
      const requestShift = selectedShift;
      const response = await getProductionShiftSummary({
        line,
        date: requestDate,
        shift: requestShift,
      });
      if (
        selectionRef.current.date !== requestDate ||
        selectionRef.current.shift !== requestShift
      )
        return;
      setSelectedShiftStats(response?.lineStats || null);
    } catch (error) {
      console.error(`${line}: shift summary failed`, error);

      // For the current shift the page still has the live-summary +
      // stoppage data as a fallback while the API recovers.
      if (!isSelectedCurrentShift) {
        setSelectedShiftStats(null);
      }
    }
  }, [isSelectedCurrentShift, line, selectedDateString, selectedShift]);

  const loadFullTileSeries = useCallback(async () => {
    const requestId = ++fullSeriesRequestRef.current;
    const requestDate = selectedDateString;
    const requestShift = selectedShift;
    try {
      const response = await getProductionShiftCountSeries({
        line,
        date: requestDate,
        shift: requestShift,
      });
      if (
        requestId !== fullSeriesRequestRef.current ||
        selectionRef.current.date !== requestDate ||
        selectionRef.current.shift !== requestShift
      )
        return;
      setTileSeries(response?.points || []);
      setTileCursor(response?.cursor || null);
    } catch (error) {
      console.error(`${line}: production series failed`, error);
    }
  }, [line, selectedDateString, selectedShift]);

  const loadIncrementalTileSeries = useCallback(async () => {
    if (!isSelectedCurrentShift || !tileCursor || countRequestBusy.current)
      return;
    countRequestBusy.current = true;

    try {
      const response = await getProductionShiftCountSeries({
        line,
        date: selectedDateString,
        shift: selectedShift,
        after: tileCursor,
      });

      const incoming = response?.points || [];

      if (incoming.length) {
        setTileSeries((old) => mergePoints(old, incoming));

        const latestPoint = incoming[incoming.length - 1];

        setTileCursor(response?.cursor || latestPoint?.time || tileCursor);

        /*
         * The shift-count chart already has the newest cumulative shift count.
         * Reuse that value immediately for the top Shift Production KPI instead
         * of waiting for the next /live-summary response.
         *
         * /live-summary still refreshes line status, speed, sensor state, shift
         * information and configuration every 5 seconds.
         */
        const latestCount = Number(latestPoint?.value);

        if (Number.isFinite(latestCount)) {
          setLive((previous) => {
            if (!previous) return previous;

            const latestTileSize =
              String(latestPoint?.tileSize || "").trim() || previous.tileSize;

            const latestTimestamp = new Date(latestPoint?.time).getTime();

            return {
              ...previous,
              shiftCount: latestCount,
              tileSize: latestTileSize,
              productionSqm: calculateTileSqm(latestTileSize, latestCount),
              shiftCountTimestamp: Number.isFinite(latestTimestamp)
                ? latestTimestamp
                : Number(
                    previous.shiftCountTimestamp || previous.lastSeen || 0,
                  ),
            };
          });
        }
      }
    } catch (error) {
      console.error(`${line}: incremental production series failed`, error);
    } finally {
      countRequestBusy.current = false;
    }
  }, [
    isSelectedCurrentShift,
    tileCursor,
    line,
    selectedDateString,
    selectedShift,
  ]);

  const refreshSelectedAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    try {
      await Promise.all([
        loadFullTileSeries(),
        loadSelectedStoppages(),
        loadSelectedSummary(),
      ]);
    } catch (error) {
      console.error(`${line}: shift analysis failed`, error);
    } finally {
      setAnalysisLoading(false);
    }
  }, [line, loadFullTileSeries, loadSelectedStoppages, loadSelectedSummary]);

  useEffect(() => {
    loadLive();
    const timer = window.setInterval(loadLive, 5000);
    return () => window.clearInterval(timer);
  }, [loadLive]);

  useEffect(() => {
    loadCurrentStops();
    const timer = window.setInterval(loadCurrentStops, 10000);
    return () => window.clearInterval(timer);
  }, [loadCurrentStops]);

  useEffect(() => {
    loadMonthly();
    const currentMonth = month.isSame(dayjs(), "month");
    if (!currentMonth) return undefined;
    const timer = window.setInterval(loadMonthly, 60000);
    return () => window.clearInterval(timer);
  }, [loadMonthly, month]);

  useEffect(() => {
    setTileSeries([]);
    setTileCursor(null);
    setSelectedStops([]);
    setSelectedShiftStats(null);
    refreshSelectedAnalysis();
  }, [selectedDateString, selectedShift, line]);

  useEffect(() => {
    if (!isSelectedCurrentShift) return undefined;
    setSelectedStops(currentStops);
    setSelectedStopSummary(currentStopSummary);

    const timer = window.setInterval(loadIncrementalTileSeries, 5000);
    return () => window.clearInterval(timer);
  }, [
    isSelectedCurrentShift,
    currentStops,
    currentStopSummary,
    loadIncrementalTileSeries,
  ]);

  const currentCalculations = useMemo(() => {
    if (!live) return {};

    // /live-summary is the single source of truth for the live KPIs.
    // It already merges InfluxDB production data with MongoDB downtime
    // classifications and applies the progressive standard planned allowance.
    return {
      elapsedMinutes: Number(live.elapsedShiftMinutes || 0),
      plannedDowntimeMinutes: Number(live.plannedDowntimeMinutes || 0),
      unplannedDowntimeMinutes: Number(live.unplannedDowntimeMinutes || 0),
      plannedProductionMinutes: Number(live.plannedProductionMinutes || 0),
      operatingMinutes: Number(live.actualOperatingMinutes || 0),
      availability: Number(live.availability || 0),
      ratedLineSpeed: Number(
        live.ratedLineSpeed ?? live.configuredLineSpeed ?? 0,
      ),
      targetTiles: Number(live.targetTiles || 0),
      targetSqm: Number(live.targetProduction || 0),
      achievement: Number(live.performance || 0),
      maximumDowntimeMinutes: Number(live.maximumDowntimeMinutes || 0),
      completedStops: Number(live.completedStops || 0),
      totalDowntimeMinutes: Number(live.totalDowntimeMinutes || 0),
      standardPlannedDowntimeMinutes: Number(
        live.standardPlannedDowntimeMinutes || 0,
      ),
      recordedStandardDowntimeMinutes: Number(
        live.recordedStandardDowntimeMinutes || 0,
      ),
      distributedStandardAllowanceMinutes: Number(
        live.distributedStandardAllowanceMinutes || 0,
      ),
      additionalPlannedDowntimeMinutes: Number(
        live.additionalPlannedDowntimeMinutes || 0,
      ),
      standardExcessDowntimeMinutes: Number(
        live.standardExcessDowntimeMinutes || 0,
      ),
    };
  }, [live]);

  const selectedDetails = useMemo(() => {
    // Preferred source for both current and historical selections.
    //
    // Current shift:
    //   /api/production/shift-summary -> InfluxDB + stoppages MongoDB
    //
    // Historical shift:
    //   /api/production/shift-summary -> saved MongoDB shifts document
    if (selectedShiftStats) {
      return selectedShiftStats;
    }

    // Current-shift fallback. This keeps the UI useful if the hybrid
    // shift-summary request temporarily fails.
    if (isSelectedCurrentShift && live) {
      return {
        tileSize: live.tileSize,
        tileCount: Number(live.shiftCount || 0),
        production: Number(
          live.productionSqm ||
            calculateTileSqm(live.tileSize, live.shiftCount),
        ),
        actualOperatingMinutes: currentCalculations.operatingMinutes,
        configuredPlannedDowntime: Number(
          live.configuredStandardPlannedDowntime ?? live.plannedDowntime ?? 0,
        ),
        plannedDowntimeMinutes: Number(live.plannedDowntimeMinutes || 0),
        standardPlannedDowntimeMinutes: Number(
          live.standardPlannedDowntimeMinutes || 0,
        ),
        additionalPlannedDowntimeMinutes: Number(
          live.additionalPlannedDowntimeMinutes || 0,
        ),
        unplannedDowntimeMinutes: Number(live.unplannedDowntimeMinutes || 0),
        standardExcessDowntimeMinutes: Number(
          live.standardExcessDowntimeMinutes || 0,
        ),
        totalDowntimeMinutes: Number(live.totalDowntimeMinutes || 0),
        maximumDowntimeMinutes: Number(live.maximumDowntimeMinutes || 0),
        completedStops: Number(live.completedStops || 0),
        availability: currentCalculations.availability,
        performance: currentCalculations.achievement,
        currentSpeed: Number(live.speed || 0),
        source: "live-fallback",
      };
    }

    return {};
  }, [
    selectedShiftStats,
    isSelectedCurrentShift,
    live,
    currentCalculations,
    selectedStopSummary,
  ]);

  const openDowntimeModal = (row) => {
    setSelectedDowntime(row);
    downtimeForm.setFieldsValue({
      machine: row?.machine || "",
      reason: row?.reason || "",
      downtimeType: row?.downtimeType || "unplanned",
      plannedCategory:
        row?.downtimeType === "planned"
          ? row?.plannedCategory || "standard"
          : undefined,
      downtimeCode: row?.downtimeCode || undefined,
    });
    setDowntimeModalOpen(true);
  };

  const saveDowntimeReason = async () => {
    if (!selectedDowntime?._id) return;

    try {
      const values = await downtimeForm.validateFields();
      setSavingDowntime(true);
      await updateProductionDowntimeReason({
        id: selectedDowntime._id,
        date: selectedDowntime.date,
        shift: selectedDowntime.shift,
        line: selectedDowntime.line,
        stopStart_ts: selectedDowntime.stopStart_ts,
        reason: values.reason.trim(),
        machine: values.machine?.trim() || "",
        downtimeType: values.downtimeType,
        plannedCategory:
          values.downtimeType === "planned" ? values.plannedCategory : null,
        downtimeCode: values.downtimeCode,
      });
      message.success("Downtime details updated.");
      setDowntimeModalOpen(false);
      await Promise.all([
        loadCurrentStops(),
        loadSelectedStoppages(),
        loadSelectedSummary(),
        loadLive(),
      ]);
    } catch (error) {
      if (!error?.errorFields) {
        message.error(
          error?.response?.data?.error || "Unable to update downtime reason.",
        );
      }
    } finally {
      setSavingDowntime(false);
    }
  };

  const tableColumns = [
    { title: "#", width: 48, render: (_, __, i) => i + 1 },
    {
      title: "Start",
      dataIndex: "stopStart_ts",
      render: (v) => dayjs(Number(v)).format("HH:mm:ss"),
    },
    {
      title: "End",
      dataIndex: "stopStop_ts",
      render: (v) =>
        v ? (
          dayjs(Number(v)).format("HH:mm:ss")
        ) : (
          <Tag color="processing">Ongoing</Tag>
        ),
    },
    {
      title: "Duration (min)",
      dataIndex: "durationMinutes",
      render: (v) => fmt(v, 1),
    },
    {
      title: "Type",
      dataIndex: "downtimeType",
      render: (v) => (
        <Tag color={v === "planned" ? "blue" : "red"}>
          {v === "planned" ? "Planned" : "Unplanned"}
        </Tag>
      ),
    },
    { title: "Code", dataIndex: "downtimeCode", render: (v) => v || "-" },
    { title: "Machine", dataIndex: "machine", render: (v) => v || "-" },
    {
      title: "Reason",
      dataIndex: "reason",
      render: (v) => v || <Text type="secondary">Not specified</Text>,
    },
  ];

  return (
    <div className="production-line-dashboard">
      <section className="production-dashboard-heading">
        <div>
          <h1>{title}</h1>
          <div className="production-heading-subtitle">
            Production Monitoring &amp; Analysis
          </div>
        </div>

        <div className="production-heading-statuses">
          <div className="production-header-chip">
            <DashboardOutlined />
            <div>
              <small>Line Speed</small>
              <strong>{fmt(live?.speed, 1)} tiles/min</strong>
            </div>
          </div>
          <div className="production-header-chip">
            <CalendarOutlined />
            <div>
              <small>Current Shift</small>
              <strong>{live?.currentShift || "-"}</strong>
            </div>
          </div>
          <div className="production-header-chip">
            <CalendarOutlined />
            <div>
              <small>Shift Date</small>
              <strong>
                {live?.shiftDate
                  ? dayjs(live.shiftDate).format("DD MMM YYYY")
                  : "-"}
              </strong>
            </div>
          </div>
          <div className="production-header-chip production-running-chip">
            <Badge
              status={
                (currentStopSummary?.openStop
                  ? "Stopped"
                  : live?.shiftStatus) === "Running"
                  ? "success"
                  : "error"
              }
            />
            <div>
              <small>Line Status</small>
              <strong>
                {currentStopSummary?.openStop
                  ? "Stopped"
                  : live?.shiftStatus || "Unknown"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {liveError ? (
        <div className="production-live-warning">{liveError}</div>
      ) : null}

      <Row gutter={[12, 12]}>
        <Col xs={12} lg={6}>
          <KpiCard
            icon={<BarChartOutlined />}
            label="Shift Production"
            value={fmt(live?.productionSqm, 1)}
            suffix="m²"
            tone="blue"
          >
            <span>{fmt(live?.shiftCount, 0)} tiles</span>
            <span>
              Tile Size: <strong>{live?.tileSize || "-"}</strong>
            </span>
          </KpiCard>
        </Col>
        <Col xs={12} lg={6}>
          <KpiCard
            icon={<RiseOutlined />}
            label="Availability"
            value={fmt(live?.availability, 1)}
            suffix="%"
            tone="green"
          >
            <span>
              Operating Time{" "}
              <strong>{fmt(live?.actualOperatingMinutes, 0)} min</strong>
            </span>
            <span>
              Planned Downtime{" "}
              <strong>{fmt(live?.plannedDowntimeMinutes, 1)} min</strong>
            </span>
          </KpiCard>
        </Col>
        <Col xs={12} lg={6}>
          <KpiCard
            icon={<ClockCircleOutlined />}
            label="Downtime"
            value={fmt(live?.totalDowntimeMinutes, 0)}
            suffix="min"
            tone="orange"
          >
            <span
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                gap: 12,
              }}
            >
              <span>Completed stoppages</span>
              <strong>{Number(live?.completedStops || 0)}</strong>
            </span>
            <span>
              Maximum Downtime{" "}
              <strong>{fmt(live?.maximumDowntimeMinutes, 1)} min</strong>
            </span>
          </KpiCard>
        </Col>
        <Col xs={12} lg={6}>
          <KpiCard
            icon={<DashboardOutlined />}
            label="Performance vs Target"
            value={fmt(live?.performance, 1)}
            suffix="%"
            tone="purple"
          >
            <span>
              Target <strong>{fmt(live?.targetProduction, 1)} m²</strong>
            </span>
            <span>
              Actual <strong>{fmt(live?.productionSqm, 1)} m²</strong>
            </span>
          </KpiCard>
        </Col>
      </Row>

      <Card
        className="production-dashboard-card production-monthly-card"
        title={
          <div className="production-section-title">
            <span>Monthly Production</span>
            <Space size={8}>
              <span className="analysis-filter-label">Month</span>
              <DatePicker
                picker="month"
                allowClear={false}
                value={month}
                onChange={(value) => value && setMonth(value.startOf("month"))}
                format="MMMM YYYY"
              />
            </Space>
          </div>
        }
      >
        <ProductionMonthlyPanel
          line={line}
          month={month}
          data={monthly}
          loading={monthlyLoading}
        />
      </Card>

      <Card
        className="production-dashboard-card production-analysis-card"
        title={
          <div className="production-analysis-title">
            <span>Current Shift Analysis</span>
            <Space size={8} wrap>
              <span className="analysis-filter-label">Date</span>
              <DatePicker
                value={selectedDate}
                allowClear={false}
                onChange={(value) =>
                  value && setSelectedDate(value.startOf("day"))
                }
              />
              <span className="analysis-filter-label">Shift</span>
              <Select
                value={selectedShift}
                onChange={setSelectedShift}
                style={{ width: 118 }}
                options={SHIFTS.map((value) => ({ value, label: value }))}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={refreshSelectedAnalysis}
              >
                Refresh
              </Button>
            </Space>
          </div>
        }
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} xl={12}>
            <div className="production-analysis-panel">
              <div className="production-panel-heading">
                <strong>Current Shift Downtime ({selectedShift})</strong>
                <span>
                  Total:{" "}
                  <strong>
                    {fmt(selectedStopSummary?.totalDowntimeMinutes, 0)} min
                  </strong>{" "}
                  &nbsp; {Number(selectedStopSummary?.completedStops || 0)}{" "}
                  stoppages
                </span>
              </div>
              <ShiftDowntimeBarChart
                data={selectedStops}
                onBarClick={openDowntimeModal}
              />
            </div>
          </Col>
          <Col xs={24} xl={12}>
            <div className="production-analysis-panel">
              <div className="production-panel-heading">
                <strong>Shift Tile Count ({selectedShift})</strong>
                <span>
                  Latest:{" "}
                  <strong>{fmt(tileSeries.at(-1)?.value, 0)} tiles</strong>
                </span>
              </div>
              <ShiftTileCountChart
                data={tileSeries}
                loading={analysisLoading}
              />
            </div>
          </Col>
        </Row>

        <Row
          gutter={[12, 12]}
          align="top"
          className="production-bottom-row production-analysis-details-row"
        >
          <Col xs={24} xl={15}>
            <Card
              className="production-dashboard-card production-bottom-card production-stoppage-card"
              title={`Stoppage Details (${selectedShift}, ${selectedDate.format("DD MMM YYYY")})`}
            >
              <Table
                className="production-stoppage-table"
                size="small"
                rowKey={(row) => String(row._id || row.stopStart_ts)}
                columns={tableColumns}
                dataSource={selectedStops}
                pagination={false}
                onRow={(record) => ({
                  onClick: () => openDowntimeModal(record),
                  style: { cursor: "pointer" },
                })}
              />
            </Card>
          </Col>
          <Col xs={24} xl={9}>
            <Card
              className="production-dashboard-card production-bottom-card production-shift-details-card"
              title={`Shift Production Details (${selectedShift})`}
            >
              <Descriptions
                className="production-shift-details"
                column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }}
                size="small"
                bordered={false}
              >
                <Descriptions.Item label="Tile Size">
                  {selectedDetails.tileSize || "-"}
                </Descriptions.Item>
                <Descriptions.Item label="Tile Count">
                  {fmt(selectedDetails.tileCount, 0)} tiles
                </Descriptions.Item>
                <Descriptions.Item label="Production">
                  {fmt(selectedDetails.production, 1)} m²
                </Descriptions.Item>
                <Descriptions.Item label="Operating Time">
                  {fmt(selectedDetails.actualOperatingMinutes, 0)} min
                </Descriptions.Item>
                <Descriptions.Item label="Planned Downtime">
                  {fmt(
                    selectedDetails.plannedDowntimeMinutes ??
                      selectedDetails.appliedPlannedDowntime ??
                      selectedDetails.configuredPlannedDowntime,
                    1,
                  )}{" "}
                  min
                </Descriptions.Item>
                <Descriptions.Item label="Unplanned Downtime">
                  {fmt(
                    selectedDetails.unplannedDowntimeMinutes ??
                      selectedDetails.unplannedDowntime ??
                      selectedDetails.totalDowntimeMinutes,
                    1,
                  )}{" "}
                  min
                </Descriptions.Item>
                <Descriptions.Item label="Total Stops">
                  {Number(selectedDetails.completedStops || 0)}
                </Descriptions.Item>
                <Descriptions.Item label="Availability">
                  {fmt(selectedDetails.availability, 1)} %
                </Descriptions.Item>
                <Descriptions.Item label="Performance">
                  {fmt(selectedDetails.performance, 1)} %
                </Descriptions.Item>
                {isSelectedCurrentShift ? (
                  <Descriptions.Item label="Current Speed">
                    {fmt(selectedDetails.currentSpeed, 0)} tiles/min
                  </Descriptions.Item>
                ) : null}
              </Descriptions>
            </Card>
          </Col>
        </Row>
      </Card>

      <Modal
        title="Downtime Details"
        open={downtimeModalOpen}
        onCancel={() => setDowntimeModalOpen(false)}
        onOk={saveDowntimeReason}
        okText="Save"
        confirmLoading={savingDowntime}
        destroyOnHidden
      >
        {selectedDowntime ? (
          <>
            <Descriptions
              size="small"
              column={1}
              bordered
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="Line">
                {selectedDowntime.line || line}
              </Descriptions.Item>
              <Descriptions.Item label="Shift">
                {selectedDowntime.shift}
              </Descriptions.Item>
              <Descriptions.Item label="Start">
                {dayjs(Number(selectedDowntime.stopStart_ts)).format(
                  "YYYY-MM-DD HH:mm:ss",
                )}
              </Descriptions.Item>
              <Descriptions.Item label="End">
                {selectedDowntime.stopStop_ts
                  ? dayjs(Number(selectedDowntime.stopStop_ts)).format(
                      "YYYY-MM-DD HH:mm:ss",
                    )
                  : "Ongoing"}
              </Descriptions.Item>
              <Descriptions.Item label="Duration">
                {fmt(selectedDowntime.durationMinutes, 1)} min
              </Descriptions.Item>
            </Descriptions>
            <Form form={downtimeForm} layout="vertical">
              <Form.Item
                label="Downtime Type"
                name="downtimeType"
                rules={[
                  { required: true, message: "Select planned or unplanned" },
                ]}
              >
                <Select
                  options={DOWNTIME_TYPES}
                  onChange={(value) => {
                    downtimeForm.setFieldValue(
                      "plannedCategory",
                      value === "planned" ? "standard" : undefined,
                    );
                    downtimeForm.setFieldValue("downtimeCode", undefined);
                  }}
                />
              </Form.Item>
              {selectedDowntimeType === "planned" ? (
                <Form.Item
                  label="Planned Downtime Category"
                  name="plannedCategory"
                  rules={[
                    {
                      required: true,
                      message: "Select standard or additional planned downtime",
                    },
                  ]}
                >
                  <Select
                    options={PLANNED_CATEGORIES}
                    onChange={() =>
                      downtimeForm.setFieldValue("downtimeCode", undefined)
                    }
                  />
                </Form.Item>
              ) : null}
              <Form.Item
                label="Downtime Code"
                name="downtimeCode"
                rules={[{ required: true, message: "Select a downtime code" }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={getDowntimeCodes(
                    selectedDowntimeType,
                    selectedPlannedCategory,
                  ).map(({ value, label }) => ({ value, label }))}
                />
              </Form.Item>
              <Form.Item label="Machine" name="machine">
                <Input maxLength={100} />
              </Form.Item>
              <Form.Item
                label="Downtime Reason"
                name="reason"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: "Please enter the downtime reason",
                  },
                ]}
              >
                <Input.TextArea rows={4} maxLength={500} showCount />
              </Form.Item>
            </Form>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
