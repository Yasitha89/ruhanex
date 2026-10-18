import ProductionLineDashboard from "../components/ProductionLineDashboard";
import { PRODUCTION_LINES } from "../utils/constants";

export default function Keda2() {
  return <ProductionLineDashboard line={PRODUCTION_LINES[1]} title="Keda 2" />;
}
