const express = require("express")
const fs = require("fs")
const bcrypt = require("bcrypt")
const { v4: uuid } = require("uuid")

const app = express()

app.use(express.json())
app.use(express.static(__dirname))

const USERS = "./database/users.json"
const PRODUCTS = "./database/products.json"
const SALES = "./database/sales.json"

function read(file){
return JSON.parse(fs.readFileSync(file))
}

function write(file,data){
fs.writeFileSync(file,JSON.stringify(data,null,2))
}

/* SIGNUP */

app.post("/signup", async (req,res)=>{

const users = read(USERS)

const {username,password} = req.body

const hashed = await bcrypt.hash(password,10)

users.push({
id:uuid(),
username,
password:hashed,
role:"admin"
})

write(USERS,users)

res.json({message:"User created"})

})

/* LOGIN */

app.post("/login", async (req,res)=>{

const users = read(USERS)

const {username,password} = req.body

const user = users.find(u=>u.username===username)

if(!user){
return res.status(400).json({error:"User not found"})
}

const valid = await bcrypt.compare(password,user.password)

if(!valid){
return res.status(400).json({error:"Wrong password"})
}

res.json({message:"Login success",user})

})

/* PRODUCTS */

app.get("/products",(req,res)=>{
res.json(read(PRODUCTS))
})

app.post("/products",(req,res)=>{

const products = read(PRODUCTS)

const product={
id:uuid(),
name:req.body.name,
price:req.body.price,
stock:req.body.stock
}

products.push(product)

write(PRODUCTS,products)

res.json(product)

})

app.delete("/products/:id",(req,res)=>{

let products = read(PRODUCTS)

products = products.filter(p=>p.id!==req.params.id)

write(PRODUCTS,products)

res.json({message:"Deleted"})

})

/* SALES */

app.post("/sale",(req,res)=>{

const sales = read(SALES)
const products = read(PRODUCTS)

const product = products.find(p=>p.id===req.body.productId)

if(!product){
return res.status(404).json({error:"Product not found"})
}

if(product.stock < req.body.quantity){
return res.status(400).json({error:"Not enough stock"})
}

product.stock -= req.body.quantity

sales.push({
id:uuid(),
product:product.name,
quantity:req.body.quantity,
date:new Date()
})

write(PRODUCTS,products)
write(SALES,sales)

res.json({message:"Sale recorded"})

})

/* DASHBOARD */

app.get("/dashboard",(req,res)=>{

const products = read(PRODUCTS)
const sales = read(SALES)

const revenue = sales.reduce((sum,s)=>sum+s.quantity,0)

const lowStock = products.filter(p=>p.stock < 5)

res.json({
totalProducts:products.length,
totalSales:sales.length,
revenue,
lowStock
})

})

/* EXPORT SALES */

app.get("/export-sales",(req,res)=>{
res.json(read(SALES))
})
app.get("/", (req, res) => {
  res.redirect("/login.html")
})
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
console.log("Server running on port " + PORT)
})
