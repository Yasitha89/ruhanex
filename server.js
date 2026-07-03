const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

// Tell Express to serve the static files from the Vite build folder
app.use(express.static(path.join(__dirname, "dist")));

// Route all requests to index.html so React Router works
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
