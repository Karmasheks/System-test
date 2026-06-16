export type CalendarSourceType =
  | "maintenance"
  | "task"
  | "service_request"
  | "remark"
  | "inspection"
  | "production_schedule"
  | (string & {});

/** URL для перехода к объекту из календаря «План ТО». */
export function getCalendarItemHref(
  sourceType: CalendarSourceType,
  sourceId: number
): string | null {
  switch (sourceType) {
    case "maintenance":
      return `/tasks?task=${sourceId}`;
    case "task":
      return `/tasks?task=${sourceId}`;
    case "service_request":
      return `/service-requests/${sourceId}`;
    case "remark":
      return `/tasks?section=remarks`;
    case "inspection":
      return `/daily-inspection-new?inspection=${sourceId}`;
    case "production_schedule":
      return "/planning";
    default:
      return null;
  }
}

export function getCalendarItemLabel(sourceType: CalendarSourceType): string {
  switch (sourceType) {
    case "maintenance":
      return "ТО";
    case "task":
      return "Задача";
    case "service_request":
      return "Заявка";
    case "remark":
      return "Замечание";
    case "inspection":
      return "Осмотр";
    case "production_schedule":
      return "Производство";
    default:
      return "Событие";
  }
}
