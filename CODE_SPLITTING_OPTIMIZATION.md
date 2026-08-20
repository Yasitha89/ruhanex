# Code-splitting optimization

This version adds route-level lazy loading with React.lazy() and Suspense.

Lazy-loaded routes:
- Login
- Main layout
- Dashboard
- KEDA 1
- Production History
- Settings
- Energy Overview
- Energy Dashboard
- Energy History

Excel export optimization:
- ExcelJS and file-saver are no longer imported when report/dashboard pages load.
- They are dynamically imported only when an Excel export button is clicked.

No API routes, dashboard logic, mobile chart behavior, or page URLs were changed.
