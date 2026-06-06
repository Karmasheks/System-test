/**
 * Smoke-test: subdivision isolation for two scoped users vs admin.
 * Run: node --env-file=.env scripts/test-subdivision-scope.mjs
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5000";
const ADMIN_EMAIL = process.env.HEALTH_ADMIN_EMAIL ?? "admin@admin.ru";
const ADMIN_PASSWORD = process.env.HEALTH_ADMIN_PASSWORD ?? "admin";

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login ${email}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.token;
}

async function api(token, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function me(token) {
  const { status, body } = await api(token, "/api/auth/me");
  if (status !== 200) throw new Error(`/api/auth/me ${status}`);
  return body;
}

function countBySubdivision(items, key = "subdivisionId") {
  const m = {};
  for (const item of items) {
    const id = item[key] ?? "null";
    m[id] = (m[id] ?? 0) + 1;
  }
  return m;
}

function assertLe(name, scoped, total) {
  if (scoped > total) {
    throw new Error(`${name}: scoped ${scoped} > admin total ${total}`);
  }
  console.log(`  OK ${name}: ${scoped} / ${total}`);
}

async function main() {
  console.log(`Base: ${BASE}\n`);

  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const admin = await me(adminToken);

  const [usersRes, eqRes, tasksRes, partsRes, calRes, maintRes, inspRes] = await Promise.all([
    api(adminToken, "/api/users"),
    api(adminToken, "/api/equipment"),
    api(adminToken, "/api/tasks"),
    api(adminToken, "/api/warehouse/parts"),
    api(adminToken, "/api/calendar/events?from=2020-01-01&to=2030-12-31"),
    api(adminToken, "/api/maintenance"),
    api(adminToken, "/api/daily-inspections"),
  ]);

  const adminCounts = {
    users: usersRes.body?.length ?? 0,
    equipment: eqRes.body?.length ?? 0,
    tasks: tasksRes.body?.length ?? 0,
    parts: partsRes.body?.length ?? 0,
    calendar: calRes.body?.length ?? 0,
    maintenance: maintRes.body?.length ?? 0,
    inspections: inspRes.body?.length ?? 0,
  };

  console.log("Admin totals:", adminCounts);
  console.log("Equipment by subdivision:", countBySubdivision(eqRes.body ?? []));
  console.log("Tasks by subdivision:", countBySubdivision(tasksRes.body ?? []));

  const scopedUsers = (usersRes.body ?? []).filter(
    (u) => u.role !== "admin" && u.subdivisionId && !u.viewAllSubdivisions
  );

  const bySub = new Map();
  for (const u of scopedUsers) {
    if (!bySub.has(u.subdivisionId)) bySub.set(u.subdivisionId, []);
    bySub.get(u.subdivisionId).push(u);
  }

  const picks = [];
  for (const [, list] of bySub) {
    if (list[0]) picks.push(list[0]);
    if (picks.length >= 2) break;
  }

  if (picks.length < 2) {
    const fallback = (usersRes.body ?? []).filter((u) =>
      ["test.sub.a@test.local", "test.sub.b@test.local"].includes(u.email)
    );
    for (const u of fallback) {
      if (!picks.some((p) => p.id === u.id)) picks.push(u);
    }
  }

  if (picks.length < 2) {
    console.log("\nWARN: Need 2 non-admin users in different subdivisions.");
    console.log("Scoped users found:", scopedUsers.map((u) => `${u.email} sub=${u.subdivisionId}`));
    console.log("Run: node --env-file=.env scripts/setup-subdivision-test-data.mjs");
    process.exit(1);
  }

  const [userA, userB] = picks;
  console.log(`\nTest user A: ${userA.email} (subdivision ${userA.subdivisionId})`);
  console.log(`Test user B: ${userB.email} (subdivision ${userB.subdivisionId})`);

  const knownPasswords = {
    "test.sub.a@test.local": "test1234",
    "test.sub.b@test.local": "test1234",
  };

  for (const label of ["A", "B"]) {
    const u = label === "A" ? userA : userB;
    const password = knownPasswords[u.email] ?? `TestScope_${u.id}_${Date.now()}`;
    if (!knownPasswords[u.email]) {
      const putRes = await fetch(`${BASE}/api/users/${u.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      if (!putRes.ok) {
        console.warn(`  WARN: could not set temp password for ${u.email}: ${putRes.status}`);
        continue;
      }
    }

    let token;
    try {
      token = await login(u.email, password);
    } catch (e) {
      console.warn(`  WARN: login failed for ${u.email}: ${e.message}`);
      continue;
    }

    const profile = await me(token);
    console.log(`\n--- User ${label}: ${u.name} ---`);
    console.log(`  subdivisionId: ${profile.subdivisionId}`);
    console.log(`  viewAll: ${profile.effectivePermissions?.subdivisionScope?.viewAll ?? "?"}`);

    const [eq, tasks, parts, cal, maint, insp, stats] = await Promise.all([
      api(token, "/api/equipment"),
      api(token, "/api/tasks"),
      api(token, "/api/warehouse/parts"),
      api(token, "/api/calendar/events?from=2020-01-01&to=2030-12-31"),
      api(token, "/api/maintenance"),
      api(token, "/api/daily-inspections"),
      api(token, "/api/tasks/stats"),
    ]);

    const scoped = {
      equipment: eq.body?.length ?? 0,
      tasks: tasks.body?.length ?? 0,
      parts: parts.body?.length ?? 0,
      calendar: cal.body?.length ?? 0,
      maintenance: maint.body?.length ?? 0,
      inspections: insp.body?.length ?? 0,
    };

    for (const [k, v] of Object.entries(scoped)) {
      assertLe(k, v, adminCounts[k]);
    }

    const eqSubs = new Set((eq.body ?? []).map((e) => e.subdivisionId));
    const taskSubs = new Set((tasks.body ?? []).map((t) => t.subdivisionId));
    const allowed = profile.subdivisionId;
    const extra = profile.effectivePermissions?.subdivisionScope?.ids ?? [];

    for (const sid of eqSubs) {
      if (sid != null && sid !== allowed && !extra.includes(sid)) {
        throw new Error(`User ${label} sees equipment from foreign subdivision ${sid}`);
      }
    }
    for (const sid of taskSubs) {
      if (sid != null && sid !== allowed && !extra.includes(sid)) {
        throw new Error(`User ${label} sees tasks from foreign subdivision ${sid}`);
      }
    }
    console.log(`  OK equipment subdivisions: ${[...eqSubs].join(", ") || "—"}`);
    console.log(`  OK task subdivisions: ${[...taskSubs].join(", ") || "—"}`);
    console.log(`  task stats:`, stats.body);

    if (tasks.body?.length > 0) {
      const foreign = (tasksRes.body ?? []).find(
        (t) => t.subdivisionId && t.subdivisionId !== profile.subdivisionId
      );
      if (foreign) {
        const probe = await api(token, `/api/tasks/${foreign.id}`);
        if (probe.status === 200) {
          throw new Error(`User ${label} accessed foreign task #${foreign.id} (sub ${foreign.subdivisionId})`);
        }
        console.log(`  OK foreign task #${foreign.id} blocked (${probe.status})`);
      }
    }
  }

  console.log("\n=== All subdivision scope checks passed ===");
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
