# Energy Overview - Async Loading and Professional Chart Update

## Changes

- Each summary chart now has its own loading and error state.
- All summary API requests still start concurrently, but each chart renders immediately when its own request completes.
- The main Day / Week / Month / Year / Total chart remains independently loaded.
- X-axis titles are dynamic:
  - 1h: Time (Sri Lanka)
  - 1d: Date
  - 1mo Year view: Month
  - 1mo Total view: Month / Year
- Y-axis title: Energy Consumption (kWh)
- Improved ECharts appearance with rounded gradient bars, cleaner dashed grid lines, dark professional tooltips, hover emphasis, refined axis typography, and improved data-zoom styling.
- Existing Asia/Colombo timezone handling, Excel export, PNG export, centered period selector, routing and APIs remain unchanged.
