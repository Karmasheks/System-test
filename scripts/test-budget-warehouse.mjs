const base = "http://127.0.0.1:5000";

const loginRes = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@admin.ru", password: "admin" }),
});
const { token } = await loginRes.json();

const payload = {
  title: "Подшипник SKF budget test",
  amount: 1500,
  category: "parts",
  expenseDate: "2026-05-27",
  currency: "RUB",
  linkToWarehouse: true,
  warehouseInitialQuantity: 2,
  storageLocation: "Стеллаж A-3",
};

const res = await fetch(`${base}/api/budget`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
});
const text = await res.text();
console.log("budget status", res.status);
console.log("budget body", text.slice(0, 500));

const partsRes = await fetch(`${base}/api/warehouse/parts`, {
  headers: { Authorization: `Bearer ${token}` },
});
const parts = await partsRes.json();
console.log("parts count", parts.length);
console.log("last part", parts[0]?.name, parts[0]?.quantity);
