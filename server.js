const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("ERROR: JWT_SECRET environment variable is missing.");
  process.exit(1);
}

/* ================================
   DATABASE
================================ */

const DATA_DIR = process.env.DATA_DIR || "/data";

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "database.db"));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS carts (
    user_id INTEGER PRIMARY KEY,
    items_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    items_json TEXT NOT NULL,
    total REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

/* ================================
   EXPRESS
================================ */

app.use(express.json());

/* ================================
   CORS
================================ */

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

/* ================================
   HELPERS
================================ */

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email
    },
    JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}

function getPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at
  };
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });
  }

  const token = header.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired login session."
    });
  }
}

/* ================================
   HOME
================================ */

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "GODDEN TECH backend is running 🚀"
  });
});

/* ================================
   HEALTH CHECK
================================ */

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok"
  });
});

/* ================================
   REGISTER
================================ */

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required."
      });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();

    if (cleanName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Name must contain at least 2 characters."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address."
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters."
      });
    }

    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(cleanEmail);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);

    const createdAt = new Date().toISOString();

    const result = db
      .prepare(
        `
        INSERT INTO users
        (name, email, password_hash, created_at)
        VALUES (?, ?, ?, ?)
        `
      )
      .run(
        cleanName,
        cleanEmail,
        passwordHash,
        createdAt
      );

    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(result.lastInsertRowid);

    const token = createToken(user);

    res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user: getPublicUser(user)
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create account."
    });
  }
});

/* ================================
   LOGIN
================================ */

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required."
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const user = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(cleanEmail);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const passwordMatches = await bcrypt.compare(
      String(password),
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const token = createToken(user);

    res.json({
      success: true,
      message: "Login successful.",
      token,
      user: getPublicUser(user)
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to log in."
    });
  }
});

/* ================================
   CURRENT USER
================================ */

app.get("/api/auth/me", authenticate, (req, res) => {
  const user = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(req.user.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User account not found."
    });
  }

  res.json({
    success: true,
    user: getPublicUser(user)
  });
});

/* ================================
   CART - GET
================================ */

app.get("/api/cart", authenticate, (req, res) => {
  const cart = db
    .prepare("SELECT items_json FROM carts WHERE user_id = ?")
    .get(req.user.id);

  let items = [];

  if (cart) {
    try {
      items = JSON.parse(cart.items_json);
    } catch {
      items = [];
    }
  }

  res.json({
    success: true,
    items
  });
});

/* ================================
   CART - SAVE
================================ */

app.put("/api/cart", authenticate, (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items)) {
    return res.status(400).json({
      success: false,
      message: "Cart items must be an array."
    });
  }

  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO carts
    (user_id, items_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id)
    DO UPDATE SET
      items_json = excluded.items_json,
      updated_at = excluded.updated_at
    `
  ).run(
    req.user.id,
    JSON.stringify(items),
    now
  );

  res.json({
    success: true,
    message: "Cart saved successfully.",
    items
  });
});

/* ================================
   CART - CLEAR
================================ */

app.delete("/api/cart", authenticate, (req, res) => {
  db.prepare("DELETE FROM carts WHERE user_id = ?")
    .run(req.user.id);

  res.json({
    success: true,
    message: "Cart cleared."
  });
});

/* ================================
   CREATE ORDER
================================ */

app.post("/api/orders", authenticate, (req, res) => {
  try {
    const { items, total } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order must contain at least one product."
      });
    }

    const numericTotal = Number(total);

    if (!Number.isFinite(numericTotal) || numericTotal < 0) {
      return res.status(400).json({
        success: false,
        message: "A valid order total is required."
      });
    }

    const orderId = `GT-${Date.now()}-${Math.floor(
      Math.random() * 1000
    )}`;

    const createdAt = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO orders
      (order_id, user_id, items_json, total, created_at)
      VALUES (?, ?, ?, ?, ?)
      `
    ).run(
      orderId,
      req.user.id,
      JSON.stringify(items),
      numericTotal,
      createdAt
    );

    // Clear the user's saved cart after successful checkout.
    db.prepare("DELETE FROM carts WHERE user_id = ?")
      .run(req.user.id);

    console.log("NEW GODDEN TECH ORDER:", orderId);

    res.status(201).json({
      success: true,
      message: "Order created successfully.",
      order: {
        orderId,
        items,
        total: numericTotal,
        createdAt
      }
    });
  } catch (error) {
    console.error("ORDER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create order."
    });
  }
});

/* ================================
   ORDER HISTORY
================================ */

app.get("/api/orders", authenticate, (req, res) => {
  const orders = db
    .prepare(
      `
      SELECT
        order_id,
        items_json,
        total,
        created_at
      FROM orders
      WHERE user_id = ?
      ORDER BY id DESC
      `
    )
    .all(req.user.id);

  const formattedOrders = orders.map((order) => {
    let items = [];

    try {
      items = JSON.parse(order.items_json);
    } catch {
      items = [];
    }

    return {
      orderId: order.order_id,
      items,
      total: order.total,
      createdAt: order.created_at
    };
  });

  res.json({
    success: true,
    orders: formattedOrders
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
   ERROR HANDLER
================================ */

app.use((error, req, res, next) => {
  console.error("SERVER ERROR:", error);

  res.status(500).json({
    success: false,
    message: "Internal server error."
  });
});

/* ================================
   START SERVER
================================ */

app.listen(PORT, () => {
  console.log(`GODDEN TECH backend running on port ${PORT}`);
});