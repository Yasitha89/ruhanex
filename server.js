import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// API routes
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from Express" });
});

// Static files
app.use(express.static(path.join(__dirname, "dist")));

// Catch-all for React Router
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
