import ReactECharts from "echarts-for-react";

export default function ShiftGradeChart({ first, second }) {
  const option = {
    color: ["#16a34a", "#faad14"],
    tooltip: { trigger: "item", confine: true, formatter: "{b}: {c}%" },
    legend: { bottom: 8, left: "center", itemWidth: 12, itemHeight: 12 },
    series: [{
      type: "pie",
      radius: ["40%", "65%"],
      center: ["50%", "44%"],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: "#fff", borderWidth: 3, borderRadius: 5 },
      label: { position: "inside", formatter: "{c}%", color: "#fff", fontWeight: 700 },
      data: [
        { name: "First quality", value: first },
        { name: "Second quality", value: second },
      ],
    }],
  };

  return <ReactECharts option={option} style={{ height: 300, width: "100%" }} />;
}
