const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "GODDEN TECH backend is running 🚀"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

app.listen(PORT, () => {
  console.log(`GODDEN TECH backend running on port ${PORT}`);
});
