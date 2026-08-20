import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";

// Route-level code splitting: each page is downloaded only when it is opened.
const Login = lazy(() => import("./pages/login"));
const MainLayout = lazy(() => import("./layouts/MainLayout"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const Keda1 = lazy(() => import("./pages/Keda1"));
const HistoricalReport = lazy(() => import("./pages/HistoricalReport"));
const EnergyDashboard = lazy(() => import("./pages/EnergyDashboard"));
const EnergyOverview = lazy(() => import("./pages/EnergyOverview"));
const EnergyHistoricalReport = lazy(() =>
  import("./pages/EnergyHistoricalReport"),
);

function PageLoadingFallback() {
  return (
    <div
      style={{
        minHeight: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ textAlign: "center", color: "#667085" }}>
        <div
          style={{
            width: 30,
            height: 30,
            margin: "0 auto 12px",
            border: "3px solid #e5e7eb",
            borderTopColor: "#1677ff",
            borderRadius: "50%",
            animation: "ruhanex-route-spin 0.8s linear infinite",
          }}
        />
        <span>Loading...</span>
        <style>{`
          @keyframes ruhanex-route-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}

function lazyElement(Component) {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Component />
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={lazyElement(Login)} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoadingFallback />}>
                <MainLayout />
              </Suspense>
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={lazyElement(Dashboard)} />
          <Route path="keda1" element={lazyElement(Keda1)} />
          <Route
            path="historical_data"
            element={lazyElement(HistoricalReport)}
          />
          <Route path="settings" element={lazyElement(Settings)} />
          <Route
            path="energyoverview"
            element={lazyElement(EnergyOverview)}
          />
          <Route
            path="energydashboard"
            element={lazyElement(EnergyDashboard)}
          />
          <Route
            path="historical_data_energy"
            element={lazyElement(EnergyHistoricalReport)}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
