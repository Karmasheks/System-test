import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { taskStatusLabel } from "@shared/task-status-constants";
import { maintenanceStatusLabel } from "@shared/maintenance-status-constants";
import {
  UTF8_BOM,
  downloadCsv,
  downloadTextFile,
  formatRuDate,
  reportFilename,
  rowsToCsv,
} from "@/lib/export-utils";

export interface ExportTask {
  id: number;
  title?: string | null;
  description?: string | null;
  status: string;
  priority?: string | null;
  equipmentId?: string | null;
  maintenanceType?: string | null;
  dueDate?: Date | string | null;
  createdBy?: string | null;
  createdAt: Date | string;
  modifiedBy?: string | null;
  modifiedAt?: Date | string | null;
  closedBy?: string | null;
  closedAt?: Date | string | null;
}

export interface ExportRemark {
  id: string | number;
  title?: string | null;
  description?: string | null;
  status: string;
  priority?: string | null;
  type?: string | null;
  equipmentId?: string | null;
  equipmentName?: string | null;
  reportedBy?: string | null;
  createdAt: Date | string;
  lastModifiedBy?: string | null;
  updatedAt?: Date | string | null;
  resolvedBy?: string | null;
  resolvedAt?: Date | string | null;
}

export interface ExportMaintenance {
  id: number;
  equipmentId?: string | null;
  equipmentName?: string | null;
  maintenanceType?: string | null;
  status: string;
  priority?: string | null;
  scheduledDate?: Date | string | null;
  completedDate?: Date | string | null;
  responsible?: string | null;
  notes?: string | null;
  duration?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface ExportEquipment {
  id: string;
  name?: string | null;
  type?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  status?: string | null;
  installationDate?: Date | string | null;
  description?: string | null;
}

export interface ExportData {
  tasks: ExportTask[];
  remarks: ExportRemark[];
  maintenance: ExportMaintenance[];
  equipment: ExportEquipment[];
}

function getPriorityText(priority: string | null | undefined): string {
  const map: Record<string, string> = {
    low: "Низкий",
    medium: "Средний",
    high: "Высокий",
    critical: "Критический",
    urgent: "Срочный",
  };
  return priority ? map[priority] ?? priority : "";
}

function getMaintenanceStatusText(status: string): string {
  if (status === "scheduled") return "Запланировано";
  if (status === "pending") return "Ожидает";
  return maintenanceStatusLabel(status);
}

function buildTableSection(title: string, headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "";
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`
    )
    .join("");
  return `
    <section style="margin-bottom:24px;">
      <h2 style="font-size:16px;margin:0 0 8px;color:#1e3a5f;">${escapeHtml(title)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr style="background:#e8f0fe;">${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReportHtml(data: ExportData, title: string): string {
  const taskRows = data.tasks.map((task) => [
    String(task.id),
    task.title ?? "",
    taskStatusLabel(task.status),
    getPriorityText(task.priority),
    task.equipmentId ?? "",
    formatRuDate(task.dueDate),
    task.createdBy ?? "",
    formatRuDate(task.createdAt),
  ]);

  const remarkRows = data.remarks.map((remark) => [
    String(remark.id),
    remark.title ?? remark.description?.slice(0, 80) ?? "",
    remark.status,
    remark.equipmentName ?? "",
    remark.type ?? "",
    remark.reportedBy ?? "",
    formatRuDate(remark.createdAt),
  ]);

  const maintenanceRows = data.maintenance.map((item) => [
    String(item.id),
    item.equipmentName ?? "",
    item.maintenanceType ?? "",
    getMaintenanceStatusText(item.status),
    formatRuDate(item.scheduledDate),
    item.responsible ?? "",
  ]);

  const equipmentRows = data.equipment.map((item) => [
    item.id,
    item.name ?? "",
    item.type ?? "",
    item.status ?? "",
    item.location ?? "",
    formatRuDate(item.installationDate),
  ]);

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;color:#111;padding:24px;background:#fff;">
      <h1 style="font-size:20px;margin:0 0 6px;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 20px;color:#555;font-size:12px;">
        Дата формирования: ${formatRuDate(new Date())}
      </p>
      ${buildTableSection("Задачи", ["ID", "Название", "Статус", "Приоритет", "Оборудование", "Срок", "Создал", "Создана"], taskRows)}
      ${buildTableSection("Замечания", ["ID", "Текст", "Статус", "Оборудование", "Источник", "Автор", "Дата"], remarkRows)}
      ${buildTableSection("Техобслуживание", ["ID", "Оборудование", "Тип ТО", "Статус", "Плановая дата", "Ответственный"], maintenanceRows)}
      ${buildTableSection("Оборудование", ["ID", "Название", "Тип", "Статус", "Расположение", "Установлено"], equipmentRows)}
    </div>
  `;
}

export async function exportToPDF(data: ExportData, title: string): Promise<void> {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;";
  container.innerHTML = buildReportHtml(data, title);
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
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        -offsetY,
        imgWidth,
        imgHeight
      );
      offsetY += pageHeight;
      page += 1;
    }

    pdf.save(reportFilename("otchet_sistema", "pdf"));
  } finally {
    document.body.removeChild(container);
  }
}

export function exportToExcel(data: ExportData, _title: string): void {
  const workbook = XLSX.utils.book_new();

  if (data.tasks.length > 0) {
    const taskData = data.tasks.map((task) => ({
      ID: task.id,
      Название: task.title ?? "",
      Описание: task.description ?? "",
      Статус: taskStatusLabel(task.status),
      Приоритет: getPriorityText(task.priority),
      Оборудование: task.equipmentId ?? "",
      "Тип ТО": task.maintenanceType ?? "",
      "Срок выполнения": formatRuDate(task.dueDate),
      Создал: task.createdBy ?? "",
      "Дата создания": formatRuDate(task.createdAt),
      Изменил: task.modifiedBy ?? "",
      "Дата изменения": formatRuDate(task.modifiedAt),
      Закрыл: task.closedBy ?? "",
      "Дата закрытия": formatRuDate(task.closedAt),
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(taskData), "Задачи");
  }

  if (data.remarks.length > 0) {
    const remarkData = data.remarks.map((remark) => ({
      ID: remark.id,
      Название: remark.title ?? "",
      Описание: remark.description ?? "",
      Статус: remark.status,
      Приоритет: remark.priority ?? "",
      Тип: remark.type ?? "",
      "Оборудование ID": remark.equipmentId ?? "",
      Оборудование: remark.equipmentName ?? "",
      Создал: remark.reportedBy ?? "",
      "Дата создания": formatRuDate(remark.createdAt),
      Изменил: remark.lastModifiedBy ?? "",
      "Дата изменения": formatRuDate(remark.updatedAt),
      Закрыл: remark.resolvedBy ?? "",
      "Дата закрытия": formatRuDate(remark.resolvedAt),
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(remarkData), "Замечания");
  }

  if (data.maintenance.length > 0) {
    const maintenanceData = data.maintenance.map((item) => ({
      ID: item.id,
      "Оборудование ID": item.equipmentId ?? "",
      Оборудование: item.equipmentName ?? "",
      "Тип ТО": item.maintenanceType ?? "",
      Статус: getMaintenanceStatusText(item.status),
      Приоритет: item.priority ?? "",
      "Плановая дата": formatRuDate(item.scheduledDate),
      "Дата выполнения": formatRuDate(item.completedDate),
      Ответственный: item.responsible ?? "",
      Заметки: item.notes ?? "",
      Длительность: item.duration ?? "",
      "Дата создания": formatRuDate(item.createdAt),
      "Дата обновления": formatRuDate(item.updatedAt),
    }));
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(maintenanceData),
      "Техобслуживание"
    );
  }

  if (data.equipment.length > 0) {
    const equipmentData = data.equipment.map((item) => ({
      ID: item.id,
      Название: item.name ?? "",
      Тип: item.type ?? "",
      Производитель: item.manufacturer ?? "",
      Модель: item.model ?? "",
      "Серийный номер": item.serialNumber ?? "",
      Расположение: item.location ?? "",
      Статус: item.status ?? "",
      "Дата установки": formatRuDate(item.installationDate),
      Описание: item.description ?? "",
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(equipmentData), "Оборудование");
  }

  if (workbook.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Нет данных за выбранный период"]]),
      "Отчёт"
    );
  }

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    reportFilename("otchet_sistema", "xlsx")
  );
}

export function exportToCSV(data: ExportData, title: string): void {
  const rows: Array<Array<string | number | null | undefined>> = [
    [title],
    [`Дата формирования: ${formatRuDate(new Date())}`],
    [],
  ];

  if (data.tasks.length > 0) {
    rows.push(["ЗАДАЧИ"]);
    rows.push([
      "ID",
      "Название",
      "Статус",
      "Приоритет",
      "Оборудование",
      "Срок выполнения",
      "Создал",
      "Дата создания",
    ]);
    for (const task of data.tasks) {
      rows.push([
        task.id,
        task.title ?? "",
        taskStatusLabel(task.status),
        getPriorityText(task.priority),
        task.equipmentId ?? "",
        formatRuDate(task.dueDate),
        task.createdBy ?? "",
        formatRuDate(task.createdAt),
      ]);
    }
    rows.push([]);
  }

  if (data.remarks.length > 0) {
    rows.push(["ЗАМЕЧАНИЯ"]);
    rows.push(["ID", "Название", "Статус", "Оборудование", "Источник", "Создал", "Дата создания"]);
    for (const remark of data.remarks) {
      rows.push([
        remark.id,
        remark.title ?? remark.description?.slice(0, 120) ?? "",
        remark.status,
        remark.equipmentName ?? "",
        remark.type ?? "",
        remark.reportedBy ?? "",
        formatRuDate(remark.createdAt),
      ]);
    }
    rows.push([]);
  }

  if (data.maintenance.length > 0) {
    rows.push(["ТЕХНИЧЕСКОЕ ОБСЛУЖИВАНИЕ"]);
    rows.push(["ID", "Оборудование", "Тип ТО", "Статус", "Плановая дата", "Ответственный"]);
    for (const item of data.maintenance) {
      rows.push([
        item.id,
        item.equipmentName ?? "",
        item.maintenanceType ?? "",
        getMaintenanceStatusText(item.status),
        formatRuDate(item.scheduledDate),
        item.responsible ?? "",
      ]);
    }
  }

  downloadTextFile(
    UTF8_BOM + rowsToCsv(rows),
    reportFilename("otchet_sistema", "csv"),
    "text/csv;charset=utf-8"
  );
}
