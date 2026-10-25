import ProductionLineDashboard from "../components/ProductionLineDashboard";
import { PRODUCTION_LINES } from "../utils/constants";

export default function Kiln1() {
  return <ProductionLineDashboard line={PRODUCTION_LINES[6]} title="Kiln 1" />;
}
