import postgres from "postgres";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5000";
const ADMIN_EMAIL = process.env.HEALTH_ADMIN_EMAIL ?? "admin@admin.ru";
const ADMIN_PASSWORD = process.env.HEALTH_ADMIN_PASSWORD ?? "admin";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("FAIL: DATABASE_URL не задан");
  process.exit(1);
}

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`OK   ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const sql = postgres(url, { connect_timeout: 15, max: 1 });

try {
  const [{ db }] = await sql`SELECT current_database() AS db`;
  pass("DB connect", db);

  const [{ cnt: tableCount }] = await sql`
    SELECT count(*)::int AS cnt FROM pg_tables WHERE schemaname = 'public'
  `;
  pass("Public tables", `${tableCount} tables`);

  const rlsRows = await sql`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  const withoutRls = rlsRows.filter((r) => !r.rowsecurity);
  if (withoutRls.length === 0) {
    pass("RLS enabled", `all ${rlsRows.length} public tables`);
  } else {
    fail("RLS enabled", `${withoutRls.length} without RLS: ${withoutRls.map((r) => r.tablename).join(", ")}`);
  }

  const probes = [
    ["users", sql`SELECT count(*)::int AS c FROM users`],
    ["equipment", sql`SELECT count(*)::int AS c FROM equipment`],
    ["tasks", sql`SELECT count(*)::int AS c FROM tasks`],
    ["service_requests", sql`SELECT count(*)::int AS c FROM service_requests`],
    ["warehouse_parts", sql`SELECT count(*)::int AS c FROM warehouse_parts`],
    ["notifications", sql`SELECT count(*)::int AS c FROM notifications`],
    ["budget_entries", sql`SELECT count(*)::int AS c FROM budget_entries`],
  ];

  for (const [table, query] of probes) {
    try {
      const [{ c }] = await query;
      pass(`Read ${table}`, `${c} rows`);
    } catch (e) {
      fail(`Read ${table}`, e.message);
    }
  }

  try {
    const [row] = await sql`
      INSERT INTO activities (user_id, action, resource_type)
      VALUES (1, 'health_check', 'system')
      RETURNING id
    `;
    await sql`DELETE FROM activities WHERE id = ${row.id}`;
    pass("Write probe", "INSERT/DELETE ok");
  } catch (e) {
    fail("Write probe", e.message);
  }
} catch (e) {
  fail("DB checks", e.message);
} finally {
  await sql.end({ timeout: 5 });
}

let token = null;
try {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!loginRes.ok) {
    fail("API login", `${loginRes.status} ${await loginRes.text()}`);
  } else {
    const data = await loginRes.json();
    token = data.token;
    pass("API login", data.user?.email ?? ADMIN_EMAIL);
  }
} catch (e) {
  fail("API login", e.message);
}

const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

const apiEndpoints = [
  ["/api/auth/me", "GET"],
  ["/api/equipment", "GET"],
  ["/api/tasks", "GET"],
  ["/api/service-requests", "GET"],
  ["/api/service-requests/meta", "GET"],
  ["/api/warehouse/parts", "GET"],
  ["/api/notifications?sync=0", "GET"],
  ["/api/remarks", "GET"],
  ["/api/maintenance", "GET"],
  ["/api/daily-inspections", "GET"],
  ["/api/budget", "GET"],
  ["/api/suppliers", "GET"],
  ["/api/contacts", "GET"],
];

for (const [path, method] of apiEndpoints) {
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers: authHeaders });
    if (res.ok) {
      const body = await res.json();
      const size = Array.isArray(body) ? body.length : body?.id ?? "ok";
      pass(`API ${method} ${path}`, String(size));
    } else {
      fail(`API ${method} ${path}`, `${res.status} ${(await res.text()).slice(0, 120)}`);
    }
  } catch (e) {
    fail(`API ${method} ${path}`, e.message);
  }
}

const failed = results.filter((r) => !r.ok);
console.log("\n---");
console.log(`Passed: ${results.length - failed.length}/${results.length}`);
if (failed.length > 0) {
  console.log("Failed checks:");
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log("System health: OK");
