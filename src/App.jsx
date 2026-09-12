import { BrowserRouter, Routes, Route } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import AuthorityGate from "./components/AuthorityGate";
import Login from "./pages/login";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Keda1 from "./pages/Keda1";
import GlazeLine1 from "./pages/GlazeLine1";
import HistoricalReport from "./pages/HistoricalReport";
import EnergyDashboard from "./pages/EnergyDashboard";
import EnergyOverview from "./pages/EnergyOverview";
import EnergyHistoricalReport from "./pages/EnergyHistoricalReport";
import EnergyLiveMonitor from "./pages/EnergyLiveMonitor";
import DeviceAdministration from "./pages/DeviceAdministration";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="keda1" element={<Keda1 />} />
          <Route path="gl1" element={<GlazeLine1 />} />
          <Route path="historical_data" element={<HistoricalReport />} />
          <Route
            path="settings"
            element={
              <AuthorityGate
                authorityLevel="production_manager"
                title="Production Manager Access Required"
              >
                <Settings />
              </AuthorityGate>
            }
          />
          <Route
            path="device_administration"
            element={
              <AuthorityGate
                authorityLevel="administrator"
                title="Administrator Access Required"
              >
                <DeviceAdministration />
              </AuthorityGate>
            }
          />
          <Route path="energyoverview" element={<EnergyOverview />} />
          <Route path="energydashboard" element={<EnergyDashboard />} />
          <Route path="energy_live" element={<EnergyLiveMonitor />} />
          <Route
            path="historical_data_energy"
            element={<EnergyHistoricalReport />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
