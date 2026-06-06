const base = "http://127.0.0.1:5000";

const loginRes = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@admin.ru", password: "admin" }),
});
console.log("login status", loginRes.status);
const login = await loginRes.json();
console.log("login", login.message ?? login.token?.slice(0, 20));

const token = login.token;
if (!token) process.exit(1);

const payload = {
  name: "Test Part " + Date.now(),
  sapNumber: null,
  inventoryNumber: null,
  categoryId: null,
  categoryName: null,
  equipmentId: null,
  equipmentName: null,
  storageLocation: "A-1",
  minStock: 5,
  unitCost: null,
  externalLink: null,
  notes: null,
  initialQuantity: 3,
};

const res = await fetch(`${base}/api/warehouse/parts`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
});
const text = await res.text();
console.log("create status", res.status);
console.log("create body", text);
