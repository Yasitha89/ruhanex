import ProductionLineDashboard from "../components/ProductionLineDashboard";
import { PRODUCTION_LINES } from "../utils/constants";

export default function Keda1() {
  return <ProductionLineDashboard line={PRODUCTION_LINES[0]} title="Keda 1" />;
}
