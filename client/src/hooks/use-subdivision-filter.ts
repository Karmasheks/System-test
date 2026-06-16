import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import { useSubdivisions } from "@/hooks/use-subdivisions";

/** Выбор подразделения: админ — любое + «все»; остальные — только закреплённое в профиле. */
export function useSubdivisionFilter() {
  const { user } = useAuth();
  const { isSystemAdmin, permissions } = useAccessControl();
  const { data: subdivisions = [] } = useSubdivisions();

  const isAdmin = isSystemAdmin();
  const primarySubdivisionId =
    permissions?.primarySubdivisionId ?? user?.subdivisionId ?? null;

  const availableSubdivisions = useMemo(() => {
    if (isAdmin) return subdivisions;
    if (primarySubdivisionId) {
      return subdivisions.filter((s) => s.id === primarySubdivisionId);
    }
    return [];
  }, [subdivisions, isAdmin, primarySubdivisionId]);

  const [filterValue, setFilterValue] = useState(() =>
    isAdmin ? "all" : primarySubdivisionId ? String(primarySubdivisionId) : "all"
  );

  useEffect(() => {
    if (!isAdmin && primarySubdivisionId) {
      setFilterValue(String(primarySubdivisionId));
    }
  }, [isAdmin, primarySubdivisionId]);

  const showFilter = isAdmin || availableSubdivisions.length > 1;

  const filterSubdivisionId: number | null =
    filterValue === "all" ? null : Number(filterValue);

  const filterLabel =
    filterSubdivisionId == null
      ? "Все подразделения"
      : availableSubdivisions.find((s) => s.id === filterSubdivisionId)?.name ?? "";

  return {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    showFilter,
    filterLabel,
    allowAllOption: isAdmin,
    isAdmin,
    primarySubdivisionId,
  };
}
