const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const { v4: uuid } = require("uuid");
const session = require("express-session");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: "invnt-secret-key-2024",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

/* ── DATABASE SETUP ── */

const DB = path.join(__dirname, "database");
const USERS    = path.join(DB, "users.json");
const PRODUCTS = path.join(DB, "products.json");
const SALES    = path.join(DB, "sales.json");

// Auto-create database folder and empty JSON files if they don't exist
if (!fs.existsSync(DB)) fs.mkdirSync(DB, { recursive: true });
if (!fs.existsSync(USERS))    fs.writeFileSync(USERS,    "[]");
if (!fs.existsSync(PRODUCTS)) fs.writeFileSync(PRODUCTS, "[]");
if (!fs.existsSync(SALES))    fs.writeFileSync(SALES,    "[]");

function read(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return []; }
}

function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ── MIDDLEWARE ── */

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  next();
}

function adminOnly(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin")
    return res.status(403).json({ error: "Admin only" });
  next();
}

/* ── AUTH ── */

app.post("/signup", async (req, res) => {
  const users = read(USERS);
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  if (users.find(u => u.username === username)) return res.status(400).json({ error: "Username already taken" });
  const hashed = await bcrypt.hash(password, 10);
  const newUser = { id: uuid(), username, password: hashed, role: role === "admin" ? "admin" : "staff", createdAt: new Date() };
  users.push(newUser);
  write(USERS, users);
  res.json({ message: "Account created" });
});

app.post("/login", async (req, res) => {
  const users = read(USERS);
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: "User not found" });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: "Wrong password" });
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.json({ user: req.session.user });
});

app.post("/logout", (req, res) => {
  req.session.destroy();
  res.json({ message: "Logged out" });
});

app.get("/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  res.json(req.session.user);
});

/* ── PRODUCTS ── */

app.get("/products", auth, (req, res) => {
  res.json(read(PRODUCTS));
});

app.post("/products", auth, (req, res) => {
  const products = read(PRODUCTS);
  const { name, price, stock, category, lowStockThreshold } = req.body;
  if (!name || price == null || stock == null) return res.status(400).json({ error: "Name, price and stock required" });
  const product = {
    id: uuid(), name,
    price: parseFloat(price),
    stock: parseInt(stock),
    category: category || "General",
    lowStockThreshold: parseInt(lowStockThreshold) || 5,
    createdAt: new Date()
  };
  products.push(product);
  write(PRODUCTS, products);
  res.json(product);
});

app.put("/products/:id", auth, (req, res) => {
  const products = read(PRODUCTS);
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Product not found" });
  const { name, price, stock, category, lowStockThreshold } = req.body;
  products[idx] = {
    ...products[idx], name,
    price: parseFloat(price),
    stock: parseInt(stock),
    category: category || products[idx].category,
    lowStockThreshold: parseInt(lowStockThreshold) || products[idx].lowStockThreshold
  };
  write(PRODUCTS, products);
  res.json(products[idx]);
});

app.delete("/products/:id", auth, adminOnly, (req, res) => {
  let products = read(PRODUCTS);
  products = products.filter(p => p.id !== req.params.id);
  write(PRODUCTS, products);
  res.json({ message: "Deleted" });
});

/* ── SALES ── */

app.get("/sales", auth, (req, res) => {
  res.json(read(SALES));
});

app.post("/sale", auth, (req, res) => {
  const sales = read(SALES);
  const products = read(PRODUCTS);
  const { productId, quantity } = req.body;
  const product = products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: "Product not found" });
  const qty = parseInt(quantity);
  if (product.stock < qty) return res.status(400).json({ error: "Not enough stock" });
  product.stock -= qty;
  const sale = {
    id: uuid(), productId: product.id, product: product.name,
    quantity: qty, price: product.price, total: product.price * qty,
    soldBy: req.session.user.username, date: new Date()
  };
  sales.push(sale);
  write(PRODUCTS, products);
  write(SALES, sales);
  res.json(sale);
});

app.delete("/sales/:id", auth, adminOnly, (req, res) => {
  let sales = read(SALES);
  const sale = sales.find(s => s.id === req.params.id);
  if (!sale) return res.status(404).json({ error: "Sale not found" });
  const products = read(PRODUCTS);
  const product = products.find(p => p.id === sale.productId);
  if (product) { product.stock += sale.quantity; write(PRODUCTS, products); }
  sales = sales.filter(s => s.id !== req.params.id);
  write(SALES, sales);
  res.json({ message: "Sale deleted and stock restored" });
});

/* ── DASHBOARD ── */

app.get("/dashboard", auth, (req, res) => {
  const products = read(PRODUCTS);
  const sales = read(SALES);
  const revenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);
  const lowStock = products.filter(p => p.stock <= (p.lowStockThreshold || 5));
  const salesByProduct = {};
  sales.forEach(s => { salesByProduct[s.product] = (salesByProduct[s.product] || 0) + s.quantity; });
  const last7 = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    last7[d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })] = 0;
  }
  sales.forEach(s => {
    const label = new Date(s.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    if (label in last7) last7[label] += s.total || 0;
  });
  res.json({
    totalProducts: products.length, totalSales: sales.length,
    revenue: revenue.toFixed(2), lowStock, salesByProduct, last7Days: last7
  });
});

/* ── ADMIN ── */

app.get("/admin/users", auth, adminOnly, (req, res) => {
  const users = read(USERS).map(u => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt }));
  res.json(users);
});

app.delete("/admin/users/:id", auth, adminOnly, (req, res) => {
  let users = read(USERS);
  const target = users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.id === req.session.user.id) return res.status(400).json({ error: "Cannot delete yourself" });
  users = users.filter(u => u.id !== req.params.id);
  write(USERS, users);
  res.json({ message: "User deleted" });
});

app.put("/admin/users/:id/role", auth, adminOnly, (req, res) => {
  const users = read(USERS);
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.role = req.body.role === "admin" ? "admin" : "staff";
  write(USERS, users);
  res.json({ message: "Role updated" });
});

/* ── ROOT ── */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Catch-all: serve login for any unmatched HTML page request
app.get("*", (req, res) => {
  const file = path.join(__dirname, "public", path.basename(req.path));
  if (fs.existsSync(file)) return res.sendFile(file);
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* ── START ── */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("INVNT running on http://localhost:" + PORT));
