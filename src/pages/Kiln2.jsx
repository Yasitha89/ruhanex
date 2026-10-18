import ProductionLineDashboard from "../components/ProductionLineDashboard";
import { PRODUCTION_LINES } from "../utils/constants";

export default function Kiln2() {
  return <ProductionLineDashboard line={PRODUCTION_LINES[7]} title="Kiln 2" />;
}
