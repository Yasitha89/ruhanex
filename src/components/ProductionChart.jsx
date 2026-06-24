
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Brush
} from "recharts";

export default function ProductionChart({
  data
}) {

  return (

    <ResponsiveContainer
      width="100%"
      height={500}
    >

      <LineChart data={data} >

        <CartesianGrid
          strokeDasharray="3 3"
        />

        <XAxis
          dataKey="time"
          tickFormatter={(value) => new Date(value).toLocaleTimeString([], {hour: "2-digit",minute: "2-digit" })}
        />

        <YAxis />

        <Tooltip 
         labelFormatter={(value) =>
    new Date(value).toLocaleString()
  }
        
        />

        <Line
          type="monotone"
          dataKey="value"
          dot={false}
        />
        <Brush
          dataKey="time"
          height={30}
          stroke="#8884d8"
        />

      </LineChart>

      
    </ResponsiveContainer>

  );
}