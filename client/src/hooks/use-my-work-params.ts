import { useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";

export type MyWorkScope = "assigned" | "created" | "all";
export type MyWorkSection = "tasks" | "requests" | "maintenance" | "remarks";

/** @deprecated use section */
export type MyWorkTab = "main" | "remarks";
/** @deprecated use section */
export type MyWorkCategory = "all" | "maintenance" | "service_requests";

function parseSection(params: URLSearchParams): MyWorkSection {
  const section = params.get("section");
  if (section === "requests" || section === "maintenance" || section === "remarks") {
    return section;
  }
  if (params.get("tab") === "remarks") return "remarks";
  if (params.get("category") === "maintenance") return "maintenance";
  if (params.get("category") === "service_requests") return "requests";
  return "tasks";
}

function parseSearch(search: string): { scope: MyWorkScope; section: MyWorkSection } {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const scopeParam = params.get("scope");
  const scope: MyWorkScope =
    scopeParam === "created" ? "created" : scopeParam === "all" ? "all" : "assigned";
  return { scope, section: parseSection(params) };
}

function buildSearch(scope: MyWorkScope, section: MyWorkSection): string {
  const params = new URLSearchParams();
  if (scope === "created") params.set("scope", "created");
  else if (scope === "all") params.set("scope", "all");
  if (section !== "tasks") params.set("section", section);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useMyWorkParams() {
  const [pathname, setLocation] = useLocation();
  const search = useSearch();

  const { scope, section } = useMemo(() => parseSearch(search), [search]);

  const setMyWork = useCallback(
    (next: {
      scope?: MyWorkScope;
      section?: MyWorkSection;
      /** @deprecated */
      tab?: MyWorkTab;
      /** @deprecated */
      category?: MyWorkCategory;
    }) => {
      const current = parseSearch(search);
      const scopeValue = next.scope ?? current.scope;

      let sectionValue = next.section ?? current.section;
      if (next.tab === "remarks") sectionValue = "remarks";
      else if (next.tab === "main" && !next.section && !next.category) {
        sectionValue = sectionValue === "remarks" ? "tasks" : sectionValue;
      }
      if (next.category === "maintenance") sectionValue = "maintenance";
      else if (next.category === "service_requests") sectionValue = "requests";
      else if (next.category === "all" && !next.section) sectionValue = "tasks";

      setLocation(`/tasks${buildSearch(scopeValue, sectionValue)}`);
    },
    [setLocation, search]
  );

  const tab: MyWorkTab = section === "remarks" ? "remarks" : "main";
  const category: MyWorkCategory =
    section === "maintenance"
      ? "maintenance"
      : section === "requests"
        ? "service_requests"
        : "all";

  return { scope, section, tab, category, setMyWork, location: pathname };
}

export function myWorkSectionLabel(section: MyWorkSection): string {
  switch (section) {
    case "tasks":
      return "Задачи";
    case "requests":
      return "Заявки";
    case "maintenance":
      return "ТО";
    case "remarks":
      return "Замечания";
  }
}

export function myWorkScopeLabel(scope: MyWorkScope): string {
  switch (scope) {
    case "assigned":
      return "Назначено мне";
    case "created":
      return "Создано мной";
    case "all":
      return "Все";
  }
}

export function myWorkPageSubtitle(scope: MyWorkScope, section: MyWorkSection): string {
  if (section === "remarks") {
    return "Замечания по оборудованию — статус и создание задач";
  }
  const scopePart =
    scope === "assigned"
      ? "назначенные вам"
      : scope === "created"
        ? "созданные вами"
        : "все в системе";
  switch (section) {
    case "tasks":
      return `Задачи, ${scopePart}`;
    case "requests":
      return `Сервисные заявки, ${scopePart}`;
    case "maintenance":
      return `Плановое ТО (задачи типа «ТО»), ${scopePart}`;
  }
}
