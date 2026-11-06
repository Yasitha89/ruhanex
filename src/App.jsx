import { BrowserRouter, Routes, Route } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import AuthProvider from "./components/AuthProvider";
import Profile from "./pages/Profile";
import Users from "./pages/Users";
import Login from "./pages/login";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Keda1 from "./pages/Keda1";
import Keda2 from "./pages/Keda2";
import Kiln2 from "./pages/Kiln2";
import Kiln1 from "./pages/Kiln1";
import Keda3 from "./pages/Keda3";
import GlazeLine1 from "./pages/GlazeLine1";
import GlazeLine3 from "./pages/GlazeLine3";
import HistoricalReport from "./pages/HistoricalReport";
import ProductionBreakdownReport from "./pages/ProductionBreakdownReport";
import EnergyDashboard from "./pages/EnergyDashboard";
import EnergyOverview from "./pages/EnergyOverview";
import EnergyHistoricalReport from "./pages/EnergyHistoricalReport";
import EnergyLiveMonitor from "./pages/EnergyLiveMonitor";
import DeviceAdministration from "./pages/DeviceAdministration";
import ProductionMasterData from "./pages/ProductionMasterData";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
          <Route path="profile" element={<Profile />} />
          <Route path="users" element={<Users />} />
          <Route path="keda1" element={<Keda1 />} />
          <Route path="keda2" element={<Keda2 />} />
          <Route path="kiln2" element={<Kiln2 />} />
          <Route path="kiln1" element={<Kiln1 />} />
          <Route path="keda3" element={<Keda3 />} />
          <Route path="gl1" element={<GlazeLine1 />} />
          <Route path="gl3" element={<GlazeLine3 />} />
          <Route path="historical_data" element={<HistoricalReport />} />
          <Route path="production_breakdown" element={<ProductionBreakdownReport />} />
          <Route
            path="settings"
            element={
                <Settings />
            }
          />
          <Route
            path="line_administration"
            element={
                <Settings administration />
            }
          />
          <Route
            path="device_administration"
            element={
                <DeviceAdministration />
            }
          />
          <Route
            path="production_master_data"
            element={
                <ProductionMasterData />
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
    </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
