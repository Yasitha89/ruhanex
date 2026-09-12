// import React, { useEffect, useState } from "react";
// import { Col, Row, Typography, Spin, Alert } from "antd";
// import LineSummaryCard from "../components/LineSummaryCard";
// import { getDashboardStats } from "../api/dashboardApi";
// import { getCurrentShiftTimeRange } from "../utils/shiftUtils";

// const { Title, Text } = Typography;

// export default function Dashboard() {
//   const [lineStats, setLineStats] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");

//   const { currentShiftFromTime, currentShiftToTime, currentShift } =
//     getCurrentShiftTimeRange();

//   const loadData = async () => {
//     try {
//       const data = await getDashboardStats(
//         "Keda 1",
//         currentShift,
//         currentShiftFromTime,
//         currentShiftToTime,
//       );

//       if (data.success) {
//         setLineStats(data.lineStats);
//         setError("");
//       } else {
//         throw new Error("Invalid response");
//       }
//     } catch (err) {
//       console.error(err);
//       setError(err.message);
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     loadData();

//     const timer = setInterval(loadData, 5000);

//     return () => clearInterval(timer);
//   }, []);

//   if (loading) {
//     return (
//       <div style={{ textAlign: "center", padding: 60 }}>
//         <Spin size="large" />
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <Alert type="error" message="Connection Error" description={error} />
//     );
//   }

//   return (
//     <div style={{ width: "100%" }}>
//       <div style={{ marginBottom: 20 }}>
//         <Title level={3} style={{ marginBottom: 4 }}>
//           Production Dashboard
//         </Title>

//         <Text type="secondary">
//           Current production-line performance summary
//         </Text>
//       </div>

//       <Row gutter={[20, 20]}>
//         <Col xs={24} md={24} lg={12} xl={8}>
//           <LineSummaryCard
//             lineName={lineStats.lineName}
//             status={lineStats.status}
//             ole={lineStats.ole}
//             availability={lineStats.availability}
//             performance={lineStats.performance}
//             production={lineStats.production}
//             downtime={lineStats.formattedDowntime}
//           />
//         </Col>
//       </Row>
//     </div>
//   );
// }

import React, { useEffect, useState } from "react";
import { Col, Row, Typography, Spin, Alert } from "antd";
import LineSummaryCard from "../components/LineSummaryCard";
import { getDashboardStats } from "../api/dashboardApi";
import { getCurrentShiftTimeRange } from "../utils/shiftUtils";
import { PRODUCTION_LINES } from "../utils/constants";

const { Title, Text } = Typography;

export default function Dashboard() {
  const [keda1Stats, setKeda1Stats] = useState(null);
  const [glazeLine1Stats, setGlazeLine1Stats] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    try {
      const { currentShiftFromTime, currentShiftToTime, currentShift } =
        getCurrentShiftTimeRange();

      const [keda1Data, glazeLine1Data] = await Promise.all([
        getDashboardStats(
          PRODUCTION_LINES[0],
          currentShift,
          currentShiftFromTime,
          currentShiftToTime,
        ),

        getDashboardStats(
          PRODUCTION_LINES[3],
          currentShift,
          currentShiftFromTime,
          currentShiftToTime,
        ),
      ]);

      if (!keda1Data?.success) {
        throw new Error("Unable to load Keda 1 data");
      }

      if (!glazeLine1Data?.success) {
        throw new Error("Unable to load Glaze Line 1 data");
      }

      setKeda1Stats(keda1Data.lineStats);
      setGlazeLine1Stats(glazeLine1Data.lineStats);

      setError("");
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error ? err.message : "Unable to load dashboard data",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const timer = setInterval(loadData, 5000);

    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: 60,
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert type="error" message="Connection Error" description={error} />
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          Production Dashboard
        </Title>

        <Text type="secondary">
          Current production-line performance summary
        </Text>
      </div>

      <Row gutter={[20, 20]}>
        {/* KEDA 1 */}
        {keda1Stats && (
          <Col xs={24} md={24} lg={12} xl={8}>
            <LineSummaryCard
              lineName={keda1Stats.lineName}
              status={keda1Stats.status}
              ole={keda1Stats.ole}
              availability={keda1Stats.availability}
              performance={keda1Stats.performance}
              production={keda1Stats.production}
              downtime={keda1Stats.formattedDowntime}
            />
          </Col>
        )}

        {/* GLAZE LINE 1 */}
        {glazeLine1Stats && (
          <Col xs={24} md={24} lg={12} xl={8}>
            <LineSummaryCard
              lineName={glazeLine1Stats.lineName}
              status={glazeLine1Stats.status}
              ole={glazeLine1Stats.ole}
              availability={glazeLine1Stats.availability}
              performance={glazeLine1Stats.performance}
              production={glazeLine1Stats.production}
              downtime={glazeLine1Stats.formattedDowntime}
            />
          </Col>
        )}
      </Row>
    </div>
  );
}
