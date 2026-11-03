import StockChart from "./StockChart";
import { getFloorStock } from "../api/dashboardApi";

export default function FloorStockChart() {
  return <StockChart loadStock={getFloorStock} title="Floor Stocks" label="Floor stock" valueField="floorStockM2" totalField="totalFloorStockM2" hiddenWarnings={["Latest floorStocks snapshot is behind the active shift; live production is counted from the snapshot end. A missing shift snapshot may change historical zero-floor clamping."]} />;
}
