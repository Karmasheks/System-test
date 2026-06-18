import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = fs.readFileSync(path.join(__dirname, "data", "pf-registry-raw.txt"), "utf8");

function parseIntSpaced(s) {
  if (!s || s === "-" || s === "—") return null;
  const n = Number(String(s).replace(/\s/g, "").replace(/,/g, ".").split(".")[0]);
  return Number.isFinite(n) ? n : null;
}

function parseDate(s) {
  if (!s || s === "-" || s === "—") return null;
  const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  if (Number(y) < 1990) return null;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseCavities(raw) {
  const s = (raw || "").trim();
  if (!s) return {};
  if (s.includes("+")) {
    const parts = s.split("+").map((x) => parseInt(x, 10)).filter((n) => n > 0);
    return { cavitiesLayout: s.replace(/\s/g, ""), cavities: parts.reduce((a, b) => a + b, 0) };
  }
  const m = s.match(/^(\d+)\((\d+)\)$/);
  if (m) return { cavities: Number(m[1]), piecesPerCycle: Number(m[2]) };
  const n = parseInt(s, 10);
  if (Number.isInteger(n) && n > 0) return { cavities: n };
  return {};
}

const STATUS_MAP = [
  [/выполнено\s*то/i, "maintenance_completed"],
  [/выпуск\s*продукции/i, "in_production"],
  [/заказ\s*завершен/i, "in_production"],
  [/хранение\s*на\s*складе/i, "storage"],
  [/на\s*консервации/i, "conservation"],
  [/пф\s*на\s*доработке/i, "repair"],
  [/требует\s*ремонта/i, "repair"],
  [/сервисном\s*обслуживании/i, "on_maintenance"],
  [/отгружена/i, "decommissioned"],
  [/выполнен\s*ремонт/i, "maintenance_completed"],
  [/выполнена\s*доработка/i, "maintenance_completed"],
  [/готова\s*к\s*перемещению/i, "storage"],
  [/уточнить\s*статус/i, "ok"],
];

function mapStatus(text) {
  if (!text) return "ok";
  for (const [re, code] of STATUS_MAP) {
    if (re.test(text)) return code;
  }
  return "ok";
}

function parseLine(line) {
  line = line.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
  const pfMatch = line.match(/\b(SL\d{3,4})\b/i);
  if (!pfMatch) return null;
  const pfNumber = pfMatch[1].toUpperCase();
  let rest = line.slice(line.indexOf(pfNumber) + pfNumber.length).trim();

  const dateRe = /\d{1,2}\.\d{1,2}\.\d{4}/g;
  const dates = [...rest.matchAll(dateRe)].map((m) => m[0]);

  let productName = rest;
  let cavitiesRaw = "";

  if (dates.length > 0) {
    const firstDatePos = rest.search(dateRe);
    const beforeDate = rest.slice(0, firstDatePos).trim();
    const cavAtEnd = beforeDate.match(/(\d+(?:\+\d+)+|\d+\(\d+\)|\d+)\s*$/);
    if (cavAtEnd) {
      cavitiesRaw = cavAtEnd[1];
      productName = beforeDate.slice(0, beforeDate.length - cavAtEnd[0].length).trim();
    } else {
      productName = beforeDate;
    }
  } else {
    const trailingNum = rest.match(/\b(\d+(?:\+\d+)+|\d+\(\d+\)|\d+)\s*$/);
    if (trailingNum) {
      const token = trailingNum[1];
      const plain = /^\d+$/.test(token) ? Number(token) : null;
      if (plain != null && plain >= 10000) {
        productName = rest.slice(0, rest.length - trailingNum[0].length).trim();
      } else {
        cavitiesRaw = token;
        productName = rest.slice(0, rest.length - trailingNum[0].length).trim();
      }
    }
  }

  productName = productName.replace(/\s+/g, " ").trim() || pfNumber;

  const osMatch = rest.match(/\b(100\d{4})\b/);
  const fixedAssetNumber = osMatch ? osMatch[1] : null;

  let cycleCounterTotal = 0;
  let cyclesUntilGuarantee = null;
  let cyclesSinceMaintenance = 0;

  if (dates.length > 0) {
    const afterFirst = rest.slice(rest.indexOf(dates[0]) + dates[0].length);
    const totalM = afterFirst.match(/^\s*([\d\s]+?)\s*-/);
    if (totalM) cycleCounterTotal = parseIntSpaced(totalM[1]) ?? 0;

    const guaranteeM = rest.match(/([\d\s]+)\s*000\s*-/);
    if (guaranteeM) cyclesUntilGuarantee = parseIntSpaced(guaranteeM[1] + "000");

    const afterSecondDate =
      dates.length > 1 ? rest.slice(rest.indexOf(dates[1]) + dates[1].length) : "";
    const sinceM = afterSecondDate.match(/^\s*([\d\s]+?)\s+15000/);
    if (sinceM) cyclesSinceMaintenance = parseIntSpaced(sinceM[1]) ?? 0;
  } else {
    const g = rest.match(/\b(\d{4,6})\s*$/);
    if (g && Number(g[1]) >= 10000) cyclesUntilGuarantee = Number(g[1]);
  }

  const locationMatch = rest.match(
    /(Цех[^0-9%]+?)(?:\s+\d|,|\s+Требуется|\s+Малый|\s+Большой|\s+Вставка|$)/i
  );
  const storageLocation = locationMatch ? locationMatch[1].trim() : null;

  const status = mapStatus(rest);
  const cav = parseCavities(cavitiesRaw);

  return {
    pfNumber,
    name: productName,
    ...cav,
    infoUpdatedAt: dates[0] ? parseDate(dates[0]) : null,
    cycleCounterTotal,
    cyclesUntilGuarantee,
    cyclesSinceMaintenance,
    cyclesAtLastMaintenance: Math.max(0, cycleCounterTotal - cyclesSinceMaintenance),
    maintenanceCycleInterval: 15000,
    lastMaintenanceAt: dates[1] ? parseDate(dates[1]) : null,
    nextMaintenancePlannedAt: dates[2] ? parseDate(dates[2]) : null,
    fixedAssetNumber,
    storageLocation,
    status,
  };
}

const lines = raw.split(/\r?\n/).filter((l) => /SL\d{3,4}/i.test(l));
const byPf = new Map();
for (const line of lines) {
  const rec = parseLine(line);
  if (rec) byPf.set(rec.pfNumber, rec);
}
const unique = [...byPf.values()].sort((a, b) => a.pfNumber.localeCompare(b.pfNumber));

fs.writeFileSync(
  path.join(__dirname, "data", "pf-registry.json"),
  JSON.stringify(unique, null, 2),
  "utf8"
);
console.log(`Parsed ${unique.length} PF records`);
