async function signup(){

const username=document.getElementById("username").value
const password=document.getElementById("password").value

await fetch("/signup",{
method:"POST",
headers:{ "Content-Type":"application/json" },
body:JSON.stringify({username,password})
})

alert("Account created")

}

async function login(){

const username=document.getElementById("username").value
const password=document.getElementById("password").value

const res = await fetch("/login",{
method:"POST",
headers:{ "Content-Type":"application/json" },
body:JSON.stringify({username,password})
})

const data = await res.json()

if(data.user){
window.location="dashboard.html"
}else{
alert("Login failed")
}

}

async function loadDashboard(){

const res = await fetch("/dashboard")
const data = await res.json()

document.getElementById("products").innerText=data.totalProducts
document.getElementById("sales").innerText=data.totalSales
document.getElementById("revenue").innerText=data.revenue

}

loadDashboard()