require("dotenv").config();

const express = require("express");
const cors = require("cors");
const apiRoutes = require("./routes");
require("./database");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", apiRoutes);

app.listen(PORT, () => {
  console.log(`Cognitron AI server running on port ${PORT}`);
});
