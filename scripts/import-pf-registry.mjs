/**
 * Импорт пресс-форм из scripts/data/pf-registry.json в production_tooling.
 *
 *   node --env-file=.env scripts/import-pf-registry.mjs
 *   node --env-file=.env scripts/import-pf-registry.mjs --subdivision 111
 *   node --env-file=.env scripts/import-pf-registry.mjs --dry-run
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const subdivisionArg = args.find((a) => a.startsWith("--subdivision="))?.split("=")[1]
  ?? (args.includes("--subdivision") ? args[args.indexOf("--subdivision") + 1] : null);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const registry = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "pf-registry.json"), "utf8")
);

const sql = postgres(url, { max: 1, connect_timeout: 30 });

function tsOrNull(isoDate) {
  if (!isoDate) return null;
  return new Date(`${isoDate}T12:00:00.000Z`);
}

async function resolveSubdivisionId() {
  if (subdivisionArg) {
    const id = Number(subdivisionArg);
    if (!Number.isFinite(id)) throw new Error(`Некорректный subdivision: ${subdivisionArg}`);
    const [row] = await sql`SELECT id, name FROM subdivisions WHERE id = ${id}`;
    if (!row) throw new Error(`Подразделение id=${id} не найдено`);
    return row;
  }
  const [byName] = await sql`
    SELECT id, name FROM subdivisions
    WHERE name ILIKE ${"%победит 4%"}
    ORDER BY id LIMIT 1
  `;
  if (byName) return byName;
  const [byNameAlt] = await sql`
    SELECT id, name FROM subdivisions
    WHERE name ILIKE ${"%инструментальн%"}
    ORDER BY id LIMIT 1
  `;
  if (byNameAlt) return byNameAlt;
  const [fallback] = await sql`SELECT id, name FROM subdivisions ORDER BY id LIMIT 1`;
  if (!fallback) throw new Error("Нет подразделений в БД");
  return fallback;
}

function rowToValues(rec, subdivisionId) {
  return {
    subdivision_id: subdivisionId,
    pf_number: rec.pfNumber,
    name: rec.name,
    tooling_type: "press_form",
    status: rec.status || "ok",
    cavities: rec.cavities ?? null,
    cavities_layout: rec.cavitiesLayout ?? null,
    pieces_per_cycle: rec.piecesPerCycle ?? null,
    storage_location: rec.storageLocation ?? null,
    requires_maintenance_level2: false,
    cycles_until_guarantee: rec.cyclesUntilGuarantee ?? null,
    maintenance_cycle_interval: rec.maintenanceCycleInterval ?? 15000,
    cycle_counter_total: rec.cycleCounterTotal ?? 0,
    cycles_since_maintenance: rec.cyclesSinceMaintenance ?? 0,
    cycles_at_last_maintenance: rec.cyclesAtLastMaintenance ?? null,
    last_maintenance_at: tsOrNull(rec.lastMaintenanceAt),
    fixed_asset_number: rec.fixedAssetNumber ?? null,
    info_updated_at: tsOrNull(rec.infoUpdatedAt),
    next_maintenance_planned_at: tsOrNull(rec.nextMaintenancePlannedAt),
    applicable_equipment_ids: [],
  };
}

try {
  const sub = await resolveSubdivisionId();
  console.log(`Подразделение: ${sub.id} — ${sub.name}`);
  console.log(`Записей в реестре: ${registry.length}${dryRun ? " (dry-run)" : ""}`);

  const existing = await sql`
    SELECT id, pf_number FROM production_tooling WHERE subdivision_id = ${sub.id}
  `;
  const byPf = new Map(existing.map((r) => [r.pf_number.toUpperCase(), r.id]));
  console.log(`Уже в БД: ${existing.length}`);

  let inserted = 0;
  let updated = 0;

  for (const rec of registry) {
    const v = rowToValues(rec, sub.id);
    const pfKey = rec.pfNumber.toUpperCase();
    const existingId = byPf.get(pfKey);

    if (dryRun) {
      console.log(existingId ? `UPDATE ${pfKey}` : `INSERT ${pfKey}`, "—", rec.name);
      if (existingId) updated++;
      else inserted++;
      continue;
    }

    if (existingId) {
      await sql`
        UPDATE production_tooling SET
          name = ${v.name},
          status = ${v.status},
          cavities = ${v.cavities},
          cavities_layout = ${v.cavities_layout},
          pieces_per_cycle = ${v.pieces_per_cycle},
          storage_location = ${v.storage_location},
          cycles_until_guarantee = ${v.cycles_until_guarantee},
          maintenance_cycle_interval = ${v.maintenance_cycle_interval},
          cycle_counter_total = ${v.cycle_counter_total},
          cycles_since_maintenance = ${v.cycles_since_maintenance},
          cycles_at_last_maintenance = ${v.cycles_at_last_maintenance},
          last_maintenance_at = ${v.last_maintenance_at},
          fixed_asset_number = ${v.fixed_asset_number},
          info_updated_at = ${v.info_updated_at},
          next_maintenance_planned_at = ${v.next_maintenance_planned_at},
          updated_at = NOW()
        WHERE id = ${existingId}
      `;
      updated++;
    } else {
      const [row] = await sql`
        INSERT INTO production_tooling (
          subdivision_id, pf_number, name, tooling_type, status,
          cavities, cavities_layout, pieces_per_cycle, storage_location,
          requires_maintenance_level2, cycles_until_guarantee,
          maintenance_cycle_interval, cycle_counter_total,
          cycles_since_maintenance, cycles_at_last_maintenance,
          last_maintenance_at, fixed_asset_number, info_updated_at,
          next_maintenance_planned_at, applicable_equipment_ids
        ) VALUES (
          ${v.subdivision_id}, ${v.pf_number}, ${v.name}, ${v.tooling_type}, ${v.status},
          ${v.cavities}, ${v.cavities_layout}, ${v.pieces_per_cycle}, ${v.storage_location},
          ${v.requires_maintenance_level2}, ${v.cycles_until_guarantee},
          ${v.maintenance_cycle_interval}, ${v.cycle_counter_total},
          ${v.cycles_since_maintenance}, ${v.cycles_at_last_maintenance},
          ${v.last_maintenance_at}, ${v.fixed_asset_number}, ${v.info_updated_at},
          ${v.next_maintenance_planned_at}, ${JSON.stringify(v.applicable_equipment_ids)}::jsonb
        )
        RETURNING id
      `;
      byPf.set(pfKey, row.id);
      inserted++;
    }
  }

  const [count] = await sql`
    SELECT COUNT(*)::int AS c FROM production_tooling WHERE subdivision_id = ${sub.id}
  `;
  console.log(`Готово: +${inserted} новых, ${updated} обновлено. Всего в подразделении: ${count.c}`);
} finally {
  await sql.end();
}
