import StockChart from "./StockChart";
import { getFloorStock } from "../api/dashboardApi";

export default function FloorStockChart() {
  return <StockChart loadStock={getFloorStock} title="Floor Stocks" label="Floor stock" valueField="floorStockM2" totalField="totalFloorStockM2" />;
}
