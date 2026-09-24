const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

/* ================================
   HOME
================================ */

app.get("/", (req, res) => {
  res.json({
    message: "GODDEN TECH backend is running 🚀"
  });
});


/* ================================
   HEALTH CHECK
================================ */

app.get("/health", (req, res) => {
  res.json({
    status: "ok"
  });
});


/* ================================
   CREATE ORDER
================================ */

app.post("/api/orders", (req, res) => {
  const { customer, items, total } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Order must contain at least one product."
    });
  }

  if (total === undefined || total === null) {
    return res.status(400).json({
      success: false,
      message: "Order total is required."
    });
  }

  const order = {
    orderId: `GT-${Date.now()}`,
    customer: customer || {},
    items,
    total,
    createdAt: new Date().toISOString()
  };

  console.log("NEW GODDEN TECH ORDER:");
  console.log(JSON.stringify(order, null, 2));

  res.status(201).json({
    success: true,
    message: "Order received successfully.",
    order
  });
});


/* ================================
   404
================================ */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found."
  });
});


/* ================================
   START SERVER
================================ */

app.listen(PORT, () => {
  console.log(`GODDEN TECH backend running on port ${PORT}`);
});