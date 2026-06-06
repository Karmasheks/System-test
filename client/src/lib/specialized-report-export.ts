import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { budgetCategoryLabel } from "@shared/asset-constants";
import { warehouseAlertLabel } from "@shared/warehouse-constants";
import {
  downloadCsv,
  formatRuDate,
  formatRuDateTime,
  reportFilename,
} from "@/lib/export-utils";
import type { WarehousePart } from "@shared/schema";
import type {
  BudgetReport,
  EmployeeWorkReport,
  UserWorkReport,
  WarehouseReport,
} from "@/hooks/use-asset-management";

export type ReportFileFormat = "csv" | "excel" | "pdf";

function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}

async function downloadPdfFromHtml(html: string, filename: string) {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;";
  container.innerHTML = html;
  document.body.appendChild(container);
  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let offsetY = 0;
    let page = 0;
    while (offsetY < imgHeight) {
      if (page > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, -offsetY, imgWidth, imgHeight);
      offsetY += pageHeight;
      page += 1;
    }
    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlTable(title: string, headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "";
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  return `
    <section style="margin-bottom:20px;">
      <h2 style="font-size:15px;margin:0 0 8px;color:#1e3a5f;">${escapeHtml(title)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr style="background:#e8f0fe;">${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>
  `;
}

export function exportEmployeeWorkReport(
  data: EmployeeWorkReport,
  format: ReportFileFormat,
  from: string,
  to: string
) {
  const baseName = `raboty-${data.userName.replace(/\s+/g, "-")}-${from}-${to}`;

  const openRows = data.openTasks.map((t) => [
    String(t.id),
    t.title,
    t.statusLabel,
    formatRuDateTime(t.createdAt),
    formatRuDateTime(t.assigneeAssignedAt),
    t.assignedDurationHours != null ? String(t.assignedDurationHours) : "",
  ]);

  const completedRows = data.completedTasks.map((t) => [
    String(t.id),
    t.title,
    formatRuDateTime(t.createdAt),
    formatRuDateTime(t.assigneeAssignedAt),
    formatRuDateTime(t.completedAt),
    String(t.actualHours),
    t.assignedDurationHours != null ? String(t.assignedDurationHours) : "",
    t.completionComment ?? "",
  ]);

  if (format === "csv") {
    downloadCsv(
      [
        ["Сотрудник", data.userName],
        ["Должность", data.position ?? ""],
        ["Подразделение", data.department ?? ""],
        ["Период", from, "—", to],
        [],
        ["Задачи на сотруднике"],
        ["ID", "Название", "Статус", "Создана", "Назначена", "В работе, ч"],
        ...openRows,
        [],
        ["Закрытые задачи за период"],
        ["ID", "Название", "Создана", "Назначена", "Закрыта", "Факт, ч", "От назнач., ч", "Итог работ"],
        ...completedRows,
        [],
        ["Итого закрыто", String(data.summary.completedTasksCount)],
        ["Часов за период", String(data.summary.totalHoursInPeriod)],
      ],
      `${baseName}.csv`
    );
    return;
  }

  if (format === "excel") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Сотрудник", data.userName],
        ["Должность", data.position ?? ""],
        ["Подразделение", data.department ?? ""],
        ["Период", `${from} — ${to}`],
        ["Закрыто за период", data.summary.completedTasksCount],
        ["Часов за период", data.summary.totalHoursInPeriod],
      ]),
      "Сводка"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["ID", "Название", "Статус", "Создана", "Назначена", "В работе, ч"],
        ...openRows,
      ]),
      "На сотруднике"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["ID", "Название", "Создана", "Назначена", "Закрыта", "Факт, ч", "От назнач., ч", "Итог"],
        ...completedRows,
      ]),
      "Закрытые"
    );
    downloadWorkbook(wb, `${baseName}.xlsx`);
    return;
  }

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;padding:24px;color:#111;">
      <h1 style="font-size:18px;margin:0 0 8px;">Работы сотрудника: ${escapeHtml(data.userName)}</h1>
      <p style="margin:0 0 16px;font-size:12px;color:#555;">
        ${escapeHtml(data.position ?? "")}${data.department ? ` · ${escapeHtml(data.department)}` : ""}<br/>
        Период: ${from} — ${to} · Закрыто: ${data.summary.completedTasksCount} · Часов: ${data.summary.totalHoursInPeriod}
      </p>
      ${htmlTable("На сотруднике", ["ID", "Задача", "Статус", "Создана", "Назначена", "В работе, ч"], openRows)}
      ${htmlTable("Закрытые за период", ["ID", "Задача", "Создана", "Назначена", "Закрыта", "Факт, ч", "От назнач., ч", "Итог"], completedRows)}
    </div>
  `;
  return downloadPdfFromHtml(html, `${baseName}.pdf`);
}

export function warehouseStockStatusFromPart(part: {
  quantity?: number | null;
  minStock?: number | null;
}): "zero" | "low" | "ok" {
  const quantity = part.quantity ?? 0;
  const minStock = part.minStock ?? 0;
  if (quantity <= 0) return "zero";
  if (minStock > 0 && quantity <= minStock) return "low";
  return "ok";
}

export function buildWarehouseStockReportFromParts(
  parts: WarehousePart[],
  subdivisionId: number | null = null
): WarehouseReport {
  const mappedParts = parts.map((p) => ({
    id: p.id,
    name: p.name,
    categoryName: p.categoryName,
    quantity: p.quantity,
    minStock: p.minStock,
    reservedQuantity: p.reservedQuantity,
    unitCost: p.unitCost,
    equipmentName: p.equipmentName,
    subdivisionName: p.subdivisionName,
    storageLocation: p.storageLocation,
    stockStatus: warehouseStockStatusFromPart(p),
  }));
  const estimatedStockValue = parts.reduce(
    (sum, p) => sum + (p.quantity ?? 0) * (p.unitCost ?? 0),
    0
  );

  return {
    period: { from: null, to: null },
    subdivisionId,
    summary: {
      totalParts: parts.length,
      zeroStockCount: mappedParts.filter((p) => p.stockStatus === "zero").length,
      lowStockCount: mappedParts.filter((p) => p.stockStatus === "low").length,
      unresolvedAlerts: 0,
      movementsCount: 0,
      incomingQuantity: 0,
      outgoingQuantity: 0,
      estimatedStockValue: Math.round(estimatedStockValue * 100) / 100,
    },
    parts: mappedParts,
    movements: [],
    alerts: [],
  };
}

function warehouseStockStatusLabel(status: "zero" | "low" | "ok") {
  if (status === "zero") return "Нет на складе";
  if (status === "low") return "Ниже минимума";
  return "В норме";
}

const WAREHOUSE_STOCK_HEADERS = [
  "ID",
  "Название",
  "Категория",
  "Подразделение",
  "Место хранения",
  "Остаток",
  "Резерв",
  "Доступно",
  "Мин.",
  "Статус",
  "Цена за ед.",
  "Сумма",
  "Оборудование",
] as const;

function buildWarehouseStockRows(parts: WarehouseReport["parts"]) {
  return parts.map((p) => {
    const available = Math.max(0, (p.quantity ?? 0) - (p.reservedQuantity ?? 0));
    const lineTotal = (p.quantity ?? 0) * (p.unitCost ?? 0);
    return [
      String(p.id),
      p.name,
      p.categoryName ?? "",
      p.subdivisionName ?? "",
      p.storageLocation ?? "",
      String(p.quantity),
      String(p.reservedQuantity ?? 0),
      String(available),
      String(p.minStock),
      warehouseStockStatusLabel(p.stockStatus),
      p.unitCost != null ? String(p.unitCost) : "",
      String(Math.round(lineTotal * 100) / 100),
      p.equipmentName ?? "",
    ];
  });
}

export function exportWarehouseStockSnapshot(
  data: WarehouseReport,
  format: ReportFileFormat,
  subdivisionLabel: string
) {
  const dateStamp = formatRuDate(new Date().toISOString());
  const safeLabel = subdivisionLabel.replace(/\s+/g, "-");
  const baseName = `ostatki-sklada-${safeLabel}-${dateStamp}`;
  const stockRows = buildWarehouseStockRows(data.parts);
  const zeroCount = data.parts.filter((p) => p.stockStatus === "zero").length;
  const lowCount = data.parts.filter((p) => p.stockStatus === "low").length;
  const okCount = data.parts.filter((p) => p.stockStatus === "ok").length;

  if (format === "csv") {
    downloadCsv(
      [
        ["Выгрузка остатков склада"],
        ["Дата", dateStamp],
        ["Подразделение", subdivisionLabel],
        ["Позиций", String(data.parts.length)],
        ["Нет на складе", String(zeroCount)],
        ["Ниже минимума", String(lowCount)],
        ["В норме", String(okCount)],
        ["Оценка остатков", String(data.summary.estimatedStockValue)],
        [],
        [...WAREHOUSE_STOCK_HEADERS],
        ...stockRows,
      ],
      `${baseName}.csv`
    );
    return;
  }

  if (format === "excel") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Выгрузка остатков склада"],
        ["Дата", dateStamp],
        ["Подразделение", subdivisionLabel],
        ["Позиций", data.parts.length],
        ["Нет на складе", zeroCount],
        ["Ниже минимума", lowCount],
        ["В норме", okCount],
        ["Оценка остатков", data.summary.estimatedStockValue],
      ]),
      "Сводка"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([[...WAREHOUSE_STOCK_HEADERS], ...stockRows]),
      "Остатки"
    );
    downloadWorkbook(wb, `${baseName}.xlsx`);
    return;
  }

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;padding:24px;color:#111;">
      <h1 style="font-size:18px;margin:0 0 8px;">Остатки склада</h1>
      <p style="margin:0 0 16px;font-size:12px;color:#555;">
        Дата: ${dateStamp} · ${escapeHtml(subdivisionLabel)}<br/>
        Позиций: ${data.parts.length} · Нет: ${zeroCount} · Мало: ${lowCount} · В норме: ${okCount}
      </p>
      ${htmlTable("Все позиции", [...WAREHOUSE_STOCK_HEADERS], stockRows)}
    </div>
  `;
  return downloadPdfFromHtml(html, `${baseName}.pdf`);
}

export function exportAllEmployeesWorkReport(
  data: UserWorkReport,
  format: ReportFileFormat,
  from: string,
  to: string
) {
  const baseName = `raboty-vse-sotrudniki-${from}-${to}`;
  const summaryRows = data.users.map((u) => [
    u.userName,
    u.position ?? "",
    u.department ?? "",
    String(u.openTasksCount),
    String(u.openServiceRequestsCount),
    String(u.completedTasksInPeriod.length),
    String(u.totalHoursInPeriod),
    String(u.taskHoursInPeriod),
    String(u.serviceRequestHoursInPeriod),
  ]);

  const totals = data.users.reduce(
    (acc, u) => ({
      openTasks: acc.openTasks + u.openTasksCount,
      openRequests: acc.openRequests + u.openServiceRequestsCount,
      completed: acc.completed + u.completedTasksInPeriod.length,
      hours: acc.hours + u.totalHoursInPeriod,
    }),
    { openTasks: 0, openRequests: 0, completed: 0, hours: 0 }
  );

  if (format === "csv") {
    const rows: string[][] = [
      ["Сводный отчёт по всем сотрудникам"],
      ["Период", from, "—", to],
      ["Сотрудников", String(data.users.length)],
      ["Открытых задач", String(totals.openTasks)],
      ["Закрыто за период", String(totals.completed)],
      ["Часов за период", String(Math.round(totals.hours * 100) / 100)],
      [],
      [
        "Сотрудник",
        "Должность",
        "Подразделение",
        "Открытых задач",
        "Открытых заявок",
        "Закрыто за период",
        "Часов всего",
        "Часов по задачам",
        "Часов по заявкам",
      ],
      ...summaryRows,
    ];

    for (const u of data.users) {
      rows.push([]);
      rows.push([`Сотрудник: ${u.userName}`]);
      rows.push(["Задачи на сотруднике"]);
      rows.push(["ID", "Название", "Статус", "Срок", "Назначена", "В работе, ч"]);
      for (const t of u.openTasks) {
        rows.push([
          String(t.id),
          t.title,
          t.statusLabel,
          t.dueDate ? formatRuDate(t.dueDate) : "",
          formatRuDateTime(t.assigneeAssignedAt),
          t.assignedDurationHours != null ? String(t.assignedDurationHours) : "",
        ]);
      }
      rows.push([]);
      rows.push(["Закрытые задачи за период"]);
      rows.push(["ID", "Название", "Закрыта", "Факт, ч", "Итог работ"]);
      for (const t of u.completedTasksInPeriod) {
        rows.push([
          String(t.id),
          t.title,
          formatRuDateTime(t.completedAt),
          String(t.actualHours),
          t.completionComment ?? "",
        ]);
      }
    }

    downloadCsv(rows, `${baseName}.csv`);
    return;
  }

  if (format === "excel") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Период", `${from} — ${to}`],
        ["Сотрудников", data.users.length],
        ["Открытых задач", totals.openTasks],
        ["Закрыто за период", totals.completed],
        ["Часов за период", Math.round(totals.hours * 100) / 100],
      ]),
      "Сводка"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [
          "Сотрудник",
          "Должность",
          "Подразделение",
          "Открытых задач",
          "Открытых заявок",
          "Закрыто за период",
          "Часов всего",
          "Часов по задачам",
          "Часов по заявкам",
        ],
        ...summaryRows,
      ]),
      "По сотрудникам"
    );

    for (const u of data.users) {
      const sheetName = u.userName.slice(0, 28).replace(/[\\/*?:[\]]/g, "");
      const openRows = u.openTasks.map((t) => [
        String(t.id),
        t.title,
        t.statusLabel,
        t.dueDate ? formatRuDate(t.dueDate) : "",
        formatRuDateTime(t.assigneeAssignedAt),
        t.assignedDurationHours != null ? String(t.assignedDurationHours) : "",
      ]);
      const completedRows = u.completedTasksInPeriod.map((t) => [
        String(t.id),
        t.title,
        formatRuDateTime(t.completedAt),
        String(t.actualHours),
        t.completionComment ?? "",
      ]);
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Сотрудник", u.userName],
          ["Должность", u.position ?? ""],
          ["Подразделение", u.department ?? ""],
          [],
          ["На сотруднике"],
          ["ID", "Название", "Статус", "Срок", "Назначена", "В работе, ч"],
          ...openRows,
          [],
          ["Закрытые за период"],
          ["ID", "Название", "Закрыта", "Факт, ч", "Итог"],
          ...completedRows,
        ]),
        sheetName || `User-${u.userId}`
      );
    }

    downloadWorkbook(wb, `${baseName}.xlsx`);
    return;
  }

  const detailSections = data.users
    .map((u) => {
      const openRows = u.openTasks.map((t) => [
        String(t.id),
        t.title,
        t.statusLabel,
        t.dueDate ? formatRuDate(t.dueDate) : "",
        formatRuDateTime(t.assigneeAssignedAt),
        t.assignedDurationHours != null ? String(t.assignedDurationHours) : "",
      ]);
      const completedRows = u.completedTasksInPeriod.map((t) => [
        String(t.id),
        t.title,
        formatRuDateTime(t.completedAt),
        String(t.actualHours),
        t.completionComment ?? "",
      ]);
      return `
        <section style="margin-bottom:24px;page-break-inside:avoid;">
          <h2 style="font-size:15px;margin:0 0 4px;">${escapeHtml(u.userName)}</h2>
          <p style="font-size:11px;color:#555;margin:0 0 8px;">
            ${escapeHtml(u.position ?? "")}${u.department ? ` · ${escapeHtml(u.department)}` : ""}
            · Открыто: ${u.openTasksCount} · Закрыто: ${u.completedTasksInPeriod.length} · Часов: ${u.totalHoursInPeriod}
          </p>
          ${htmlTable("На сотруднике", ["ID", "Задача", "Статус", "Срок", "Назначена", "В работе, ч"], openRows)}
          ${htmlTable("Закрытые", ["ID", "Задача", "Закрыта", "Факт, ч", "Итог"], completedRows)}
        </section>
      `;
    })
    .join("");

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;padding:24px;color:#111;">
      <h1 style="font-size:18px;margin:0 0 8px;">Работы всех сотрудников</h1>
      <p style="margin:0 0 16px;font-size:12px;color:#555;">
        Период: ${from} — ${to} · Сотрудников: ${data.users.length}
        · Открыто задач: ${totals.openTasks} · Закрыто: ${totals.completed} · Часов: ${Math.round(totals.hours * 100) / 100}
      </p>
      ${htmlTable(
        "Сводка по сотрудникам",
        [
          "Сотрудник",
          "Должность",
          "Подразделение",
          "Открытых",
          "Заявок",
          "Закрыто",
          "Часов",
          "Задачи, ч",
          "Заявки, ч",
        ],
        summaryRows
      )}
      ${detailSections}
    </div>
  `;
  return downloadPdfFromHtml(html, `${baseName}.pdf`);
}

export function exportBudgetReport(
  data: BudgetReport,
  format: ReportFileFormat,
  from: string,
  to: string
) {
  const baseName = `zatraty-${from}-${to}`;
  const categoryRows = Object.entries(data.byCategory).map(([code, sum]) => [
    budgetCategoryLabel(code),
    String(sum),
  ]);
  const equipmentRows = data.byEquipment.map((row) => [
    row.equipmentName,
    String(row.total),
    String(row.count),
  ]);
  const entryRows = data.entries.map((e) => [
    String(e.id),
    e.title,
    budgetCategoryLabel(e.category),
    String(e.amount),
    e.equipmentName ?? "",
    formatRuDate(e.expenseDate),
  ]);

  if (format === "csv") {
    downloadCsv(
      [
        ["Период", from, "—", to],
        ["Всего потрачено", String(data.total)],
        ["Записей", String(data.count)],
        [],
        ["По категориям"],
        ["Категория", "Сумма"],
        ...categoryRows,
        [],
        ["По оборудованию"],
        ["Оборудование", "Сумма", "Записей"],
        ...equipmentRows,
        [],
        ["Детализация"],
        ["ID", "Название", "Категория", "Сумма", "Оборудование", "Дата"],
        ...entryRows,
      ],
      `${baseName}.csv`
    );
    return;
  }

  if (format === "excel") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Период", `${from} — ${to}`],
        ["Всего", data.total],
        ["Записей", data.count],
        [],
        ["Категория", "Сумма"],
        ...categoryRows,
      ]),
      "Сводка"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Оборудование", "Сумма", "Записей"],
        ...equipmentRows,
      ]),
      "По оборудованию"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.entries.map((e) => ({
          ID: e.id,
          Название: e.title,
          Категория: budgetCategoryLabel(e.category),
          Сумма: e.amount,
          Оборудование: e.equipmentName ?? "",
          Дата: formatRuDate(e.expenseDate),
        }))
      ),
      "Записи"
    );
    downloadWorkbook(wb, `${baseName}.xlsx`);
    return;
  }

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;padding:24px;color:#111;">
      <h1 style="font-size:18px;">Отчёт по затратам</h1>
      <p style="font-size:12px;color:#555;">Период: ${from} — ${to} · Всего: ${data.total} · Записей: ${data.count}</p>
      ${htmlTable("По категориям", ["Категория", "Сумма"], categoryRows)}
      ${htmlTable("По оборудованию", ["Оборудование", "Сумма", "Записей"], equipmentRows)}
      ${htmlTable("Записи", ["ID", "Название", "Категория", "Сумма", "Оборудование", "Дата"], entryRows)}
    </div>
  `;
  return downloadPdfFromHtml(html, `${baseName}.pdf`);
}

export function exportWarehouseReport(
  data: WarehouseReport,
  format: ReportFileFormat,
  from: string,
  to: string
) {
  const baseName = `sklad-${from}-${to}`;
  const partRows = data.parts.map((p) => [
    String(p.id),
    p.name,
    p.categoryName ?? "",
    String(p.quantity),
    String(p.minStock),
    p.stockStatus === "zero" ? "Нет" : p.stockStatus === "low" ? "Мало" : "OK",
    p.subdivisionName ?? "",
  ]);
  const movementRows = data.movements.map((m) => [
    formatRuDateTime(m.createdAt),
    m.partName,
    m.typeLabel,
    String(m.quantity),
    m.equipmentName ?? "",
    m.performedByName,
    m.comment ?? "",
  ]);
  const alertRows = data.alerts.map((a) => [
    a.partName,
    warehouseAlertLabel(a.alertType),
    String(a.quantity),
    String(a.minStock),
    formatRuDateTime(a.createdAt),
  ]);

  if (format === "csv") {
    downloadCsv(
      [
        ["Период", from, "—", to],
        ["Позиций", String(data.summary.totalParts)],
        ["Движений", String(data.summary.movementsCount)],
        ["Приход", String(data.summary.incomingQuantity)],
        ["Списание", String(data.summary.outgoingQuantity)],
        ["Оценка склада", String(data.summary.estimatedStockValue)],
        [],
        ["Остатки"],
        ["ID", "Название", "Категория", "Остаток", "Мин.", "Статус", "Подразделение"],
        ...partRows,
        [],
        ["Движения"],
        ["Дата", "Запчасть", "Тип", "Кол-во", "Оборудование", "Исполнитель", "Комментарий"],
        ...movementRows,
        [],
        ["Алерты"],
        ["Запчасть", "Тип", "Остаток", "Мин.", "Создан"],
        ...alertRows,
      ],
      `${baseName}.csv`
    );
    return;
  }

  if (format === "excel") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Период", `${from} — ${to}`],
        ["Позиций", data.summary.totalParts],
        ["Движений", data.summary.movementsCount],
        ["Приход", data.summary.incomingQuantity],
        ["Списание", data.summary.outgoingQuantity],
        ["Оценка склада", data.summary.estimatedStockValue],
        ["Нет на складе", data.summary.zeroStockCount],
        ["Ниже минимума", data.summary.lowStockCount],
        ["Алерты", data.summary.unresolvedAlerts],
      ]),
      "Сводка"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["ID", "Название", "Категория", "Остаток", "Мин.", "Статус", "Подразделение"],
        ...partRows,
      ]),
      "Остатки"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Дата", "Запчасть", "Тип", "Кол-во", "Оборудование", "Исполнитель", "Комментарий"],
        ...movementRows,
      ]),
      "Движения"
    );
    if (alertRows.length > 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Запчасть", "Тип", "Остаток", "Мин.", "Создан"],
          ...alertRows,
        ]),
        "Алерты"
      );
    }
    downloadWorkbook(wb, `${baseName}.xlsx`);
    return;
  }

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;padding:24px;color:#111;">
      <h1 style="font-size:18px;">Отчёт по складу</h1>
      <p style="font-size:12px;color:#555;">
        Период: ${from} — ${to} · Позиций: ${data.summary.totalParts} · Движений: ${data.summary.movementsCount}
      </p>
      ${htmlTable("Остатки", ["ID", "Название", "Категория", "Остаток", "Мин.", "Статус", "Подразделение"], partRows)}
      ${htmlTable("Движения", ["Дата", "Запчасть", "Тип", "Кол-во", "Оборудование", "Исполнитель", "Комментарий"], movementRows)}
      ${htmlTable("Алерты", ["Запчасть", "Тип", "Остаток", "Мин.", "Создан"], alertRows)}
    </div>
  `;
  return downloadPdfFromHtml(html, `${baseName}.pdf`);
}
