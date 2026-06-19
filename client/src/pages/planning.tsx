import { useMemo } from "react";
import { Helmet } from "react-helmet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import { useAccessControl } from "@/hooks/use-access-control";
import {
  useProductionKpiSummary,
  useProductionProducts,
  useProductionTooling,
} from "@/hooks/use-production-planning";
import { PlanningKpiCards } from "@/components/planning/planning-kpi-cards";
import { PlanningScheduleTab } from "@/components/planning/planning-schedule-tab";
import { PlanningMaterialsTab } from "@/components/planning/planning-materials-tab";
import { PlanningWarehouseTab } from "@/components/planning/planning-warehouse-tab";
import { PlanningToolingTab } from "@/components/planning/planning-tooling-tab";
import { PlanningProductsTab } from "@/components/planning/planning-products-tab";
import { PlanningConflictsTab } from "@/components/planning/planning-conflicts-tab";
import { PlanningAnalyticsTab } from "@/components/planning/planning-analytics-tab";
import { PlanningOeeTab } from "@/components/planning/planning-oee-tab";
import { PlanningSettingsTab } from "@/components/planning/planning-settings-tab";
import { useProductionDisplayConfig } from "@/hooks/use-production-display-config";
import { Factory } from "lucide-react";
import { cn } from "@/lib/utils";
import { mobileTabsListClass, mobileTabsTriggerClass } from "@/lib/mobile-tabs";
import { ProductionExportMenu } from "@/components/planning/production-export-menu";

export default function PlanningPage() {
  const { canViewModule } = useAccessControl();
  const {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    showFilter,
    filterLabel,
    allowAllOption,
    primarySubdivisionId,
  } = useSubdivisionFilter();

  const effectiveSubdivisionId = useMemo(() => {
    if (filterSubdivisionId != null) return filterSubdivisionId;
    if (availableSubdivisions.length === 1) return availableSubdivisions[0].id;
    if (
      primarySubdivisionId != null &&
      availableSubdivisions.some((s) => s.id === primarySubdivisionId)
    ) {
      return primarySubdivisionId;
    }
    return availableSubdivisions[0]?.id ?? null;
  }, [filterSubdivisionId, availableSubdivisions, primarySubdivisionId]);

  const { data: kpi, isLoading: kpiLoading } = useProductionKpiSummary(
    effectiveSubdivisionId
  );
  const { data: catalogProducts = [], isLoading: productsLoading } = useProductionProducts({
    subdivisionId: effectiveSubdivisionId ?? undefined,
  });
  const { data: catalogTooling = [], isLoading: toolingLoading } = useProductionTooling(
    effectiveSubdivisionId
  );
  const { config: displayConfig } = useProductionDisplayConfig(effectiveSubdivisionId);
  const tabs = displayConfig.planningTabs;

  const defaultPlanningTab = useMemo(() => {
    const order = [
      "schedule",
      "warehouse",
      "tooling",
      "products",
      "materials",
      "conflicts",
      "analytics",
      "oee",
      "settings",
    ] as const;
    for (const key of order) {
      if (key === "settings" || tabs[key]) return key;
    }
    return "settings";
  }, [tabs]);

  if (!canViewModule("production_planning")) {
    return (
      <div className="p-6 text-muted-foreground">
        Нет доступа к модулю планирования производства
      </div>
    );
  }

  const needsSubdivision =
    effectiveSubdivisionId == null && availableSubdivisions.length > 1 && filterSubdivisionId == null;

  return (
    <>
      <Helmet>
        <title>Планирование производства</title>
      </Helmet>

      <div className="space-y-4 p-4 md:p-6">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Factory className="h-7 w-7 text-primary shrink-0" />
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                  Планирование производства
                </h1>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {filterLabel
                    ? `${filterLabel} · график, заказы и склад`
                    : "График плана, заказы и внутренний склад"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {effectiveSubdivisionId != null && (
                <ProductionExportMenu subdivisionId={effectiveSubdivisionId} />
              )}
              {showFilter && (
                <SubdivisionFilterSelect
                  inline
                  value={filterValue}
                  onChange={setFilterValue}
                  subdivisions={availableSubdivisions}
                  showAll={allowAllOption}
                  className="w-[200px]"
                />
              )}
            </div>
          </div>

          {effectiveSubdivisionId != null && (
            <PlanningKpiCards
              kpi={kpi}
              catalogCounts={{
                productsTotal: catalogProducts.length,
                toolingTotal: catalogTooling.length,
              }}
              loading={kpiLoading}
              countsLoading={productsLoading || toolingLoading}
            />
          )}
        </div>

        {needsSubdivision ? (
          <p className="text-sm text-muted-foreground rounded-md border p-4">
            Выберите подразделение в фильтре для работы с вкладками
          </p>
        ) : (
          <Tabs
            key={`${effectiveSubdivisionId}-${defaultPlanningTab}`}
            defaultValue={defaultPlanningTab}
            className="space-y-3"
          >
            <TabsList className={cn(mobileTabsListClass, "sm:grid sm:grid-cols-3 lg:grid-cols-6")}>
              {tabs.schedule && (
                <TabsTrigger value="schedule" className={mobileTabsTriggerClass}>
                  График и заказы
                </TabsTrigger>
              )}
              {tabs.warehouse && (
                <TabsTrigger value="warehouse" className={mobileTabsTriggerClass}>
                  Внутренний склад
                </TabsTrigger>
              )}
              {tabs.tooling && (
                <TabsTrigger value="tooling" className={mobileTabsTriggerClass}>
                  Оснастка/ПФ
                </TabsTrigger>
              )}
              {tabs.products && (
                <TabsTrigger value="products" className={mobileTabsTriggerClass}>
                  Изделия
                </TabsTrigger>
              )}
              {tabs.materials && (
                <TabsTrigger value="materials" className={mobileTabsTriggerClass}>
                  Материалы
                </TabsTrigger>
              )}
              {tabs.conflicts && (
                <TabsTrigger value="conflicts" className={mobileTabsTriggerClass}>
                  Конфликты
                </TabsTrigger>
              )}
              {tabs.analytics && (
                <TabsTrigger value="analytics" className={mobileTabsTriggerClass}>
                  Аналитика
                </TabsTrigger>
              )}
              {tabs.oee && (
                <TabsTrigger value="oee" className={mobileTabsTriggerClass}>
                  OEE
                </TabsTrigger>
              )}
              <TabsTrigger value="settings" className={mobileTabsTriggerClass}>
                Настройки
              </TabsTrigger>
            </TabsList>

            {tabs.schedule && (
              <TabsContent value="schedule">
                <PlanningScheduleTab subdivisionId={effectiveSubdivisionId!} />
              </TabsContent>
            )}
            {tabs.warehouse && (
              <TabsContent value="warehouse">
                <PlanningWarehouseTab subdivisionId={effectiveSubdivisionId!} />
              </TabsContent>
            )}
            {tabs.tooling && (
              <TabsContent value="tooling">
                <PlanningToolingTab subdivisionId={effectiveSubdivisionId!} />
              </TabsContent>
            )}
            {tabs.products && (
              <TabsContent value="products">
                <PlanningProductsTab subdivisionId={effectiveSubdivisionId!} />
              </TabsContent>
            )}
            {tabs.materials && (
              <TabsContent value="materials">
                <PlanningMaterialsTab subdivisionId={effectiveSubdivisionId!} />
              </TabsContent>
            )}
            {tabs.conflicts && (
              <TabsContent value="conflicts">
                <PlanningConflictsTab subdivisionId={effectiveSubdivisionId!} />
              </TabsContent>
            )}
            {tabs.analytics && (
              <TabsContent value="analytics">
                <PlanningAnalyticsTab subdivisionId={effectiveSubdivisionId!} />
              </TabsContent>
            )}
            {tabs.oee && (
              <TabsContent value="oee">
                <PlanningOeeTab subdivisionId={effectiveSubdivisionId!} />
              </TabsContent>
            )}
            <TabsContent value="settings">
              <PlanningSettingsTab
                subdivisionId={effectiveSubdivisionId!}
                subdivisionName={filterLabel}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
}
