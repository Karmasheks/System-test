import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sql = postgres(url, { max: 1, connect_timeout: 15 });

const tables = [
  "equipment",
  "equipment_types",
  "equipment_links",
  "equipment_event_log",
  "subdivisions",
  "users",
  "tasks",
  "task_status_history",
  "task_comments",
  "task_coexecutors",
  "maintenance_records",
  "maintenance_status_history",
  "service_requests",
  "request_time_entries",
  "request_status_history",
  "request_comments",
  "request_audit_log",
  "request_parts",
  "request_coexecutors",
  "request_links",
  "request_checklist_items",
  "part_reservations",
  "warehouse_parts",
  "warehouse_movements",
  "warehouse_part_comments",
  "warehouse_stock_alerts",
  "warehouse_alert_resolutions",
  "budget_entries",
  "contacts",
  "suppliers",
  "remarks",
  "daily_inspections",
  "inspection_checklists",
  "notifications",
  "activities",
  "campaigns",
  "metrics",
  "documents",
];

try {
  for (const table of tables) {
    const [{ count }] = await sql.unsafe(`SELECT COUNT(*)::int AS count FROM ${table}`);
    if (count > 0) console.log(`${table}: ${count}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
