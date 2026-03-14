/* ── TOKEN HELPERS ── */

function getToken() { return localStorage.getItem("token"); }
function saveToken(token) { localStorage.setItem("token", token); }
function saveUser(user) { localStorage.setItem("user", JSON.stringify(user)); }
function getUser() { try { return JSON.parse(localStorage.getItem("user")); } catch { return null; } }
function clearAuth() { localStorage.removeItem("token"); localStorage.removeItem("user"); }

function api(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  options.headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) options.headers["Authorization"] = "Bearer " + token;
  return fetch(url, options);
}

/* ── SHARED NAV SETUP ── */

let currentUser = null;
let allProducts = [];
let allSales = [];

async function initPage() {
  currentUser = getUser();
  if (!currentUser || !getToken()) { window.location = "/login.html"; return; }
  const res = await api("/me");
  if (!res.ok) { clearAuth(); window.location = "/login.html"; return; }
  currentUser = await res.json();
  saveUser(currentUser);
  const badge = document.getElementById("userBadge");
  if (badge) badge.textContent = currentUser.username + " (" + currentUser.role + ")";
  const adminLink = document.getElementById("adminLink");
  if (adminLink && currentUser.role === "admin") adminLink.classList.remove("hidden");
}

async function logout() {
  clearAuth();
  window.location = "/login.html";
}

/* ── LOGIN ── */

async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const errEl = document.getElementById("loginError");
  errEl.classList.add("hidden");
  if (!username || !password) { showError(errEl, "Please fill in all fields"); return; }
  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.token) {
    saveToken(data.token);
    saveUser(data.user);
    window.location = "/dashboard.html";
  } else {
    showError(errEl, data.error || "Login failed");
  }
}

/* ── SIGNUP ── */

async function signup() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;
  const msgEl = document.getElementById("signupMsg");
  msgEl.classList.add("hidden");
  if (!username || !password) { showMsg(msgEl, "Please fill in all fields", "red"); return; }
  const res = await fetch("/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, role })
  });
  const data = await res.json();
  if (data.message) {
    showMsg(msgEl, "Account created! Redirecting to login...", "green");
    setTimeout(() => window.location = "/login.html", 1500);
  } else {
    showMsg(msgEl, data.error || "Signup failed", "red");
  }
}

/* ── DASHBOARD ── */

async function loadDashboard() {
  await initPage();
  const res = await api("/dashboard");
  if (!res.ok) return;
  const data = await res.json();

  document.getElementById("totalProducts").textContent = data.totalProducts;
  document.getElementById("totalSales").textContent = data.totalSales;
  document.getElementById("revenue").textContent = "R " + data.revenue;
  document.getElementById("lowStockCount").textContent = data.lowStock.length;

  const labels = Object.keys(data.last7Days);
  const values = Object.values(data.last7Days);
  new Chart(document.getElementById("revenueChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "Revenue (R)", data: values, borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,0.1)", fill: true, tension: 0.4 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });

  const productLabels = Object.keys(data.salesByProduct).slice(0, 8);
  const productValues = productLabels.map(k => data.salesByProduct[k]);
  new Chart(document.getElementById("productChart"), {
    type: "bar",
    data: {
      labels: productLabels.length ? productLabels : ["No sales yet"],
      datasets: [{ label: "Units Sold", data: productValues.length ? productValues : [0], backgroundColor: "#6366f1" }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });

  const list = document.getElementById("lowStockList");
  if (data.lowStock.length === 0) {
    list.innerHTML = "<p class='text-gray-400 text-sm'>All products are well stocked.</p>";
  } else {
    list.innerHTML = data.lowStock.map(p =>
      "<div class='flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3'>" +
      "<span class='font-semibold text-gray-700'>" + p.name + "</span>" +
      "<span class='text-red-600 font-bold'>" + p.stock + " left (threshold: " + (p.low_stock_threshold || 5) + ")</span>" +
      "</div>"
    ).join("");
  }
}

/* ── PRODUCTS ── */

async function loadProducts() {
  await initPage();
  const res = await api("/products");
  if (!res.ok) return;
  allProducts = await res.json();
  renderProducts(allProducts);
  populateCategoryFilter(allProducts);
}

function renderProducts(products) {
  const tbody = document.getElementById("productTable");
  if (!products.length) {
    tbody.innerHTML = "<tr><td colspan='6' class='p-6 text-center text-gray-400'>No products yet. Add one!</td></tr>";
    return;
  }
  tbody.innerHTML = products.map(p => {
    const threshold = p.low_stock_threshold || 5;
    const isLow = p.stock <= threshold;
    const statusBadge = isLow
      ? "<span class='bg-red-100 text-red-600 px-2 py-1 rounded-full text-xs font-bold'>Low Stock</span>"
      : "<span class='bg-green-100 text-green-600 px-2 py-1 rounded-full text-xs font-bold'>In Stock</span>";
    const adminActions = currentUser && currentUser.role === "admin"
      ? "<button onclick=\"deleteProduct('" + p.id + "')\" class='text-red-500 hover:text-red-700 font-semibold ml-3'>Delete</button>"
      : "";
    return "<tr class='border-t hover:bg-gray-50'>" +
      "<td class='p-4 font-semibold text-gray-800'>" + p.name + "</td>" +
      "<td class='p-4 text-gray-500'>" + p.category + "</td>" +
      "<td class='p-4 text-gray-700'>R " + parseFloat(p.price).toFixed(2) + "</td>" +
      "<td class='p-4 font-bold " + (isLow ? "text-red-600" : "text-gray-700") + "'>" + p.stock + "</td>" +
      "<td class='p-4'>" + statusBadge + "</td>" +
      "<td class='p-4'><button onclick=\"openProductModal('" + p.id + "')\" class='text-indigo-600 hover:text-indigo-800 font-semibold'>Edit</button>" + adminActions + "</td>" +
      "</tr>";
  }).join("");
}

function populateCategoryFilter(products) {
  const cats = [...new Set(products.map(p => p.category))];
  const sel = document.getElementById("categoryFilter");
  sel.innerHTML = "<option value=''>All Categories</option>" + cats.map(c => "<option value='" + c + "'>" + c + "</option>").join("");
}

function filterProducts() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const cat = document.getElementById("categoryFilter").value;
  renderProducts(allProducts.filter(p => p.name.toLowerCase().includes(search) && (cat === "" || p.category === cat)));
}

function openProductModal(id) {
  document.getElementById("productModal").classList.remove("hidden");
  document.getElementById("productError").classList.add("hidden");
  if (id) {
    const p = allProducts.find(x => x.id === id);
    document.getElementById("modalTitle").textContent = "Edit Product";
    document.getElementById("editId").value = p.id;
    document.getElementById("pName").value = p.name;
    document.getElementById("pCategory").value = p.category;
    document.getElementById("pPrice").value = p.price;
    document.getElementById("pStock").value = p.stock;
    document.getElementById("pThreshold").value = p.low_stock_threshold || 5;
  } else {
    document.getElementById("modalTitle").textContent = "Add Product";
    ["editId","pName","pCategory","pPrice","pStock","pThreshold"].forEach(id => document.getElementById(id).value = "");
  }
}

function closeProductModal() {
  document.getElementById("productModal").classList.add("hidden");
}

async function saveProduct() {
  const id = document.getElementById("editId").value;
  const body = {
    name: document.getElementById("pName").value.trim(),
    category: document.getElementById("pCategory").value.trim() || "General",
    price: document.getElementById("pPrice").value,
    stock: document.getElementById("pStock").value,
    lowStockThreshold: document.getElementById("pThreshold").value || 5
  };
  const errEl = document.getElementById("productError");
  if (!body.name || !body.price || body.stock === "") { showError(errEl, "Name, price and stock are required"); return; }
  const res = await api(id ? "/products/" + id : "/products", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (data.error) { showError(errEl, data.error); return; }
  closeProductModal();
  loadProducts();
}

async function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;
  await api("/products/" + id, { method: "DELETE" });
  loadProducts();
}

/* ── SALES ── */

async function loadSales() {
  await initPage();
  const [pRes, sRes] = await Promise.all([api("/products"), api("/sales")]);
  allProducts = await pRes.json();
  allSales = await sRes.json();

  const sel = document.getElementById("saleProduct");
  sel.innerHTML = "<option value=''>Select Product</option>" + allProducts.map(p =>
    "<option value='" + p.id + "'>" + p.name + " (Stock: " + p.stock + ") - R" + parseFloat(p.price).toFixed(2) + "</option>"
  ).join("");

  renderSales(allSales);

  if (currentUser && currentUser.role === "admin") {
    const header = document.getElementById("deleteColHeader");
    if (header) header.textContent = "Delete";
  }
}

function renderSales(sales) {
  const tbody = document.getElementById("salesTable");
  if (!sales.length) {
    tbody.innerHTML = "<tr><td colspan='6' class='p-6 text-center text-gray-400'>No sales recorded yet.</td></tr>";
    return;
  }
  tbody.innerHTML = sales.map(s => {
    const deleteBtn = currentUser && currentUser.role === "admin"
      ? "<button onclick=\"deleteSale('" + s.id + "')\" class='text-red-500 hover:text-red-700 font-semibold text-xs'>Delete</button>"
      : "";
    return "<tr class='border-t hover:bg-gray-50'>" +
      "<td class='p-4 font-semibold text-gray-800'>" + s.product + "</td>" +
      "<td class='p-4 text-gray-700'>" + s.quantity + "</td>" +
      "<td class='p-4 text-green-700 font-bold'>R " + parseFloat(s.total || 0).toFixed(2) + "</td>" +
      "<td class='p-4 text-gray-500'>" + (s.sold_by || "-") + "</td>" +
      "<td class='p-4 text-gray-400 text-xs'>" + new Date(s.date).toLocaleString() + "</td>" +
      "<td class='p-4'>" + deleteBtn + "</td>" +
      "</tr>";
  }).join("");
}

function filterSales() {
  const search = document.getElementById("salesSearch").value.toLowerCase();
  renderSales(allSales.filter(s => s.product.toLowerCase().includes(search)));
}

async function recordSale() {
  const productId = document.getElementById("saleProduct").value;
  const quantity = document.getElementById("saleQty").value;
  const msgEl = document.getElementById("saleMsg");
  msgEl.classList.add("hidden");
  if (!productId || !quantity || quantity < 1) { showMsg(msgEl, "Select a product and enter a valid quantity", "red"); return; }
  const res = await api("/sale", { method: "POST", body: JSON.stringify({ productId, quantity: parseInt(quantity) }) });
  const data = await res.json();
  if (data.error) { showMsg(msgEl, data.error, "red"); return; }
  showMsg(msgEl, "Sale recorded successfully!", "green");
  document.getElementById("saleQty").value = "";
  loadSales();
}

async function deleteSale(id) {
  if (!confirm("Delete this sale? Stock will be restored.")) return;
  await api("/sales/" + id, { method: "DELETE" });
  loadSales();
}

/* ── ADMIN ── */

async function loadAdmin() {
  await initPage();
  if (!currentUser || currentUser.role !== "admin") { window.location = "/dashboard.html"; return; }
  const res = await api("/admin/users");
  const users = await res.json();
  const tbody = document.getElementById("usersTable");
  tbody.innerHTML = users.map(u =>
    "<tr class='border-t hover:bg-gray-50'>" +
    "<td class='p-4 font-semibold text-gray-800'>" + u.username + "</td>" +
    "<td class='p-4'><span class='px-2 py-1 rounded-full text-xs font-bold " + (u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600") + "'>" + u.role + "</span></td>" +
    "<td class='p-4 text-gray-400 text-xs'>" + new Date(u.created_at).toLocaleDateString() + "</td>" +
    "<td class='p-4 flex gap-3'>" +
    "<button onclick=\"toggleRole('" + u.id + "', '" + u.role + "')\" class='text-indigo-600 hover:text-indigo-800 font-semibold text-xs'>" + (u.role === "admin" ? "Make Staff" : "Make Admin") + "</button>" +
    "<button onclick=\"deleteUser('" + u.id + "')\" class='text-red-500 hover:text-red-700 font-semibold text-xs'>Delete</button>" +
    "</td></tr>"
  ).join("");
}

async function toggleRole(id, currentRole) {
  const newRole = currentRole === "admin" ? "staff" : "admin";
  await api("/admin/users/" + id + "/role", { method: "PUT", body: JSON.stringify({ role: newRole }) });
  loadAdmin();
}

async function deleteUser(id) {
  if (!confirm("Delete this user?")) return;
  const res = await api("/admin/users/" + id, { method: "DELETE" });
  const data = await res.json();
  if (data.error) { alert(data.error); return; }
  loadAdmin();
}

/* ── HELPERS ── */

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function showMsg(el, msg, color) {
  el.textContent = msg;
  el.className = "text-sm mt-3 text-center text-" + color + "-600";
  el.classList.remove("hidden");
}

/* ── PAGE ROUTER ── */

document.addEventListener("DOMContentLoaded", () => {
  const page = window.location.pathname.split("/").pop() || "login.html";
  if (page === "dashboard.html") loadDashboard();
  else if (page === "products.html") loadProducts();
  else if (page === "sales.html") loadSales();
  else if (page === "admin.html") loadAdmin();
});
