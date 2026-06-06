export type CalendarSourceType =
  | "maintenance"
  | "task"
  | "service_request"
  | "remark"
  | "inspection"
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
      return `/remarks?remark=${sourceId}`;
    case "inspection":
      return `/daily-inspection-new?inspection=${sourceId}`;
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
    default:
      return "Событие";
  }
}
