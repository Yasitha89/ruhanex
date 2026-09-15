import ProductionLineDashboard from "../components/ProductionLineDashboard";
import { PRODUCTION_LINES } from "../utils/constants";

export default function GlazeLine1() {
  return <ProductionLineDashboard line={PRODUCTION_LINES[3]} title="Glaze Line 1" />;
}
