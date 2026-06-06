/**
 * Creates two subdivisions + two scoped test users with sample data split.
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const SUB_A = "Тест — Подразделение А";
const SUB_B = "Тест — Подразделение Б";
const USER_A = { email: "test.sub.a@test.local", name: "Тестовый А", password: "test1234" };
const USER_B = { email: "test.sub.b@test.local", name: "Тестовый Б", password: "test1234" };

async function ensureSubdivision(name) {
  const [existing] = await sql`
    SELECT id, name FROM subdivisions WHERE name = ${name} LIMIT 1
  `;
  if (existing) return existing.id;
  const [row] = await sql`
    INSERT INTO subdivisions (name, is_active) VALUES (${name}, true) RETURNING id
  `;
  return row.id;
}

async function upsertUser({ email, name, password, role, subdivisionId }) {
  const hash = await bcrypt.hash(password, 10);
  const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing) {
    await sql`
      UPDATE users SET
        name = ${name},
        password = ${hash},
        role = ${role},
        subdivision_id = ${subdivisionId},
        view_all_subdivisions = false,
        extra_subdivision_ids = '[]'::jsonb,
        managed_subdivision_ids = '[]'::jsonb,
        is_active = true
      WHERE id = ${existing.id}
    `;
    return existing.id;
  }
  const [row] = await sql`
    INSERT INTO users (name, email, password, role, subdivision_id, view_all_subdivisions, is_active)
    VALUES (${name}, ${email}, ${hash}, ${role}, ${subdivisionId}, false, true)
    RETURNING id
  `;
  return row.id;
}

try {
  const subA = await ensureSubdivision(SUB_A);
  const subB = await ensureSubdivision(SUB_B);
  console.log("Subdivisions:", { subA, subB });

  const userAId = await upsertUser({ ...USER_A, role: "engineer", subdivisionId: subA });
  const userBId = await upsertUser({ ...USER_B, role: "engineer", subdivisionId: subB });
  console.log("Users:", { userAId, userBId });

  const equipment = await sql`SELECT id, name FROM equipment ORDER BY id`;
  if (equipment.length >= 2) {
    await sql`
      UPDATE equipment SET subdivision_id = ${subA}, subdivision_name = ${SUB_A}, department = ${SUB_A}
      WHERE id = ${equipment[0].id}
    `;
    await sql`
      UPDATE equipment SET subdivision_id = ${subB}, subdivision_name = ${SUB_B}, department = ${SUB_B}
      WHERE id = ${equipment[1].id}
    `;
    if (equipment[2]) {
      await sql`
        UPDATE equipment SET subdivision_id = ${subA}, subdivision_name = ${SUB_A}, department = ${SUB_A}
        WHERE id = ${equipment[2].id}
      `;
    }
    if (equipment[3]) {
      await sql`
        UPDATE equipment SET subdivision_id = ${subB}, subdivision_name = ${SUB_B}, department = ${SUB_B}
        WHERE id = ${equipment[3].id}
      `;
    }
    console.log("Equipment assigned to A/B");
  }

  await sql`UPDATE tasks SET subdivision_id = ${subA} WHERE id IN (SELECT id FROM tasks ORDER BY id LIMIT 6)`;
  await sql`UPDATE tasks SET subdivision_id = ${subB} WHERE id IN (SELECT id FROM tasks ORDER BY id OFFSET 6)`;

  const parts = await sql`SELECT id FROM warehouse_parts ORDER BY id`;
  for (let i = 0; i < parts.length; i++) {
    const subId = i % 2 === 0 ? subA : subB;
    const subName = i % 2 === 0 ? SUB_A : SUB_B;
    await sql`
      UPDATE warehouse_parts SET subdivision_id = ${subId}, subdivision_name = ${subName}
      WHERE id = ${parts[i].id}
    `;
  }

  await sql`UPDATE service_requests SET subdivision_id = ${subA} WHERE id % 2 = 1`;
  await sql`UPDATE service_requests SET subdivision_id = ${subB} WHERE id % 2 = 0`;
  await sql`UPDATE remarks SET subdivision_id = ${subA} WHERE id % 2 = 1`;
  await sql`UPDATE remarks SET subdivision_id = ${subB} WHERE id % 2 = 0`;

  console.log("\nTest credentials:");
  console.log(`  ${USER_A.email} / ${USER_A.password}  → ${SUB_A}`);
  console.log(`  ${USER_B.email} / ${USER_B.password}  → ${SUB_B}`);
  console.log("  admin@admin.ru / admin  → все подразделения");
} finally {
  await sql.end();
}
