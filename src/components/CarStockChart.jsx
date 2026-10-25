import StockChart from "./StockChart";
import { getCarStock } from "../api/dashboardApi";

export default function CarStockChart() {
  return <StockChart loadStock={getCarStock} title="Car Stocks" label="Car stock" valueField="carStockM2" totalField="totalCarStockM2" colors={["#0f766e", "#0d9488", "#14b8a6"]} hiddenWarnings={["No carStocks snapshot found. Opening car stock initialized to zero at the current shift start."]} />;
}
