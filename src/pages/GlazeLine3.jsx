import ProductionLineDashboard from "../components/ProductionLineDashboard";
import { PRODUCTION_LINES } from "../utils/constants";

export default function GlazeLine3() {
  return <ProductionLineDashboard line={PRODUCTION_LINES[5]} title="Glaze Line 3" />;
}
