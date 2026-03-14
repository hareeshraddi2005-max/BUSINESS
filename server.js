const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuid } = require("uuid");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ── SUPABASE ── */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || "invnt-jwt-secret-2024";

/* ── AUTH MIDDLEWARE ── */
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Not logged in" });
  try {
    req.user = jwt.verify(header.replace("Bearer ", ""), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

/* ── AUTH ROUTES ── */

app.post("/signup", async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  const { data: existing } = await supabase.from("users").select("id").eq("username", username).single();
  if (existing) return res.status(400).json({ error: "Username already taken" });

  const hashed = await bcrypt.hash(password, 10);
  const { error } = await supabase.from("users").insert({
    id: uuid(), username, password: hashed,
    role: role === "admin" ? "admin" : "staff",
    created_at: new Date()
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Account created" });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const { data: user } = await supabase.from("users").select("*").eq("username", username).single();
  if (!user) return res.status(400).json({ error: "User not found" });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: "Wrong password" });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get("/me", auth, (req, res) => {
  res.json(req.user);
});

/* ── PRODUCTS ── */

app.get("/products", auth, async (req, res) => {
  const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/products", auth, async (req, res) => {
  const { name, price, stock, category, lowStockThreshold } = req.body;
  if (!name || price == null || stock == null) return res.status(400).json({ error: "Name, price and stock required" });
  const { data, error } = await supabase.from("products").insert({
    id: uuid(), name,
    price: parseFloat(price),
    stock: parseInt(stock),
    category: category || "General",
    low_stock_threshold: parseInt(lowStockThreshold) || 5,
    created_at: new Date()
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put("/products/:id", auth, async (req, res) => {
  const { name, price, stock, category, lowStockThreshold } = req.body;
  const { data, error } = await supabase.from("products").update({
    name, price: parseFloat(price), stock: parseInt(stock),
    category: category || "General",
    low_stock_threshold: parseInt(lowStockThreshold) || 5
  }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/products/:id", auth, adminOnly, async (req, res) => {
  const { error } = await supabase.from("products").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Deleted" });
});

/* ── SALES ── */

app.get("/sales", auth, async (req, res) => {
  const { data, error } = await supabase.from("sales").select("*").order("date", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/sale", auth, async (req, res) => {
  const { productId, quantity } = req.body;
  const qty = parseInt(quantity);

  const { data: product } = await supabase.from("products").select("*").eq("id", productId).single();
  if (!product) return res.status(404).json({ error: "Product not found" });
  if (product.stock < qty) return res.status(400).json({ error: "Not enough stock" });

  const { error: stockErr } = await supabase.from("products").update({ stock: product.stock - qty }).eq("id", productId);
  if (stockErr) return res.status(500).json({ error: stockErr.message });

  const { data: sale, error: saleErr } = await supabase.from("sales").insert({
    id: uuid(), product_id: product.id, product: product.name,
    quantity: qty, price: product.price, total: product.price * qty,
    sold_by: req.user.username, date: new Date()
  }).select().single();
  if (saleErr) return res.status(500).json({ error: saleErr.message });
  res.json(sale);
});

app.delete("/sales/:id", auth, adminOnly, async (req, res) => {
  const { data: sale } = await supabase.from("sales").select("*").eq("id", req.params.id).single();
  if (!sale) return res.status(404).json({ error: "Sale not found" });

  const { data: product } = await supabase.from("products").select("*").eq("id", sale.product_id).single();
  if (product) await supabase.from("products").update({ stock: product.stock + sale.quantity }).eq("id", product.id);

  const { error } = await supabase.from("sales").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Sale deleted and stock restored" });
});

/* ── DASHBOARD ── */

app.get("/dashboard", auth, async (req, res) => {
  const { data: products } = await supabase.from("products").select("*");
  const { data: sales } = await supabase.from("sales").select("*");

  const safeProducts = products || [];
  const safeSales = sales || [];

  const revenue = safeSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const lowStock = safeProducts.filter(p => p.stock <= (p.low_stock_threshold || 5));

  const salesByProduct = {};
  safeSales.forEach(s => { salesByProduct[s.product] = (salesByProduct[s.product] || 0) + s.quantity; });

  const last7 = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    last7[d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })] = 0;
  }
  safeSales.forEach(s => {
    const label = new Date(s.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    if (label in last7) last7[label] += s.total || 0;
  });

  res.json({
    totalProducts: safeProducts.length,
    totalSales: safeSales.length,
    revenue: revenue.toFixed(2),
    lowStock,
    salesByProduct,
    last7Days: last7
  });
});

/* ── ADMIN ── */

app.get("/admin/users", auth, adminOnly, async (req, res) => {
  const { data, error } = await supabase.from("users").select("id, username, role, created_at");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/admin/users/:id", auth, adminOnly, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "Cannot delete yourself" });
  const { error } = await supabase.from("users").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "User deleted" });
});

app.put("/admin/users/:id/role", auth, adminOnly, async (req, res) => {
  const role = req.body.role === "admin" ? "admin" : "staff";
  const { error } = await supabase.from("users").update({ role }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Role updated" });
});

/* ── ROOT ── */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("*", (req, res) => {
  const fs = require("fs");
  const file = path.join(__dirname, "public", path.basename(req.path));
  if (fs.existsSync(file)) return res.sendFile(file);
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* ── START ── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("INVNT running on http://localhost:" + PORT));
