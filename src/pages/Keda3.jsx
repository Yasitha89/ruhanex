import ProductionLineDashboard from "../components/ProductionLineDashboard";
import { PRODUCTION_LINES } from "../utils/constants";

export default function Keda3() {
  return <ProductionLineDashboard line={PRODUCTION_LINES[2]} title="Keda 3" />;
}
