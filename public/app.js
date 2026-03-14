// LOGIN FUNCTION
async function login() {

const username = document.getElementById("username").value
const password = document.getElementById("password").value

const res = await fetch("/login", {
method: "POST",
headers: {
"Content-Type": "application/json"
},
body: JSON.stringify({
username: username,
password: password
})
})

const data = await res.json()

if (data.user) {

alert("Login successful")
window.location = "dashboard.html"

} else {

alert(data.error || "Login failed")

}

}


// DASHBOARD LOAD FUNCTION
async function loadDashboard() {

try {

const res = await fetch("/dashboard")
const data = await res.json()

const p = document.getElementById("products")
const s = document.getElementById("sales")
const r = document.getElementById("revenue")

if (!p) return  // if not on dashboard page

p.innerText = data.totalProducts
s.innerText = data.totalSales
r.innerText = data.revenue

const chartElement = document.getElementById("chart")

if (chartElement) {

new Chart(chartElement, {
type: "bar",
data: {
labels: ["Products", "Sales", "Revenue"],
datasets: [{
label: "Inventory Stats",
data: [
data.totalProducts,
data.totalSales,
data.revenue
]
}]
}
})

}

} catch (err) {
console.error(err)
}

}

// run dashboard automatically if page has dashboard elements
document.addEventListener("DOMContentLoaded", loadDashboard)