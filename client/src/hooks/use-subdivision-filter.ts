import { useMemo, useState } from "react";
import { useAccessControl } from "@/hooks/use-access-control";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { canAccessSubdivision } from "@shared/subdivision-scope";

/** Выбор подразделения для панели и отчётов (админ — любое; остальные — только доступные). */
export function useSubdivisionFilter() {
  const { subdivisionScope, isAdmin } = useAccessControl();
  const { data: subdivisions = [] } = useSubdivisions();
  const [filterValue, setFilterValue] = useState("all");

  const scope = subdivisionScope();

  const availableSubdivisions = useMemo(() => {
    if (!scope || scope.viewAll) return subdivisions;
    return subdivisions.filter((s) => canAccessSubdivision(scope, s.id));
  }, [subdivisions, scope]);

  const showFilter = availableSubdivisions.length > 1 || isAdmin;

  const filterSubdivisionId: number | null =
    filterValue === "all" ? null : Number(filterValue);

  const filterLabel =
    filterSubdivisionId == null
      ? scope && !scope.viewAll && availableSubdivisions.length === 1
        ? availableSubdivisions[0]?.name
        : "Все подразделения"
      : availableSubdivisions.find((s) => s.id === filterSubdivisionId)?.name ?? "";

  return {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    showFilter,
    filterLabel,
    scope,
  };
}
