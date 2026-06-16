import { useMemo } from "react";
import { Helmet } from "react-helmet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import { useAccessControl } from "@/hooks/use-access-control";
import {
  useProductionAnalytics,
  useProductionConflicts,
} from "@/hooks/use-production-planning";
import { PlanningKpiCards } from "@/components/planning/planning-kpi-cards";
import { PlanningOrdersTab } from "@/components/planning/planning-orders-tab";
import { PlanningScheduleTab } from "@/components/planning/planning-schedule-tab";
import { PlanningMaterialsTab } from "@/components/planning/planning-materials-tab";
import { PlanningWarehouseTab } from "@/components/planning/planning-warehouse-tab";
import { PlanningToolingTab } from "@/components/planning/planning-tooling-tab";
import { PlanningProductsTab } from "@/components/planning/planning-products-tab";
import { PlanningFactsTab } from "@/components/planning/planning-facts-tab";
import { PlanningConflictsTab } from "@/components/planning/planning-conflicts-tab";
import { PlanningAnalyticsTab } from "@/components/planning/planning-analytics-tab";
import { PlanningOeeTab } from "@/components/planning/planning-oee-tab";
import { PlanningSettingsTab } from "@/components/planning/planning-settings-tab";
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
  } = useSubdivisionFilter();

  const effectiveSubdivisionId = useMemo(() => {
    if (filterSubdivisionId != null) return filterSubdivisionId;
    if (availableSubdivisions.length === 1) return availableSubdivisions[0].id;
    return null;
  }, [filterSubdivisionId, availableSubdivisions]);

  const { data: analytics, isLoading: analyticsLoading } = useProductionAnalytics(
    effectiveSubdivisionId
  );
  const { data: conflicts } = useProductionConflicts(effectiveSubdivisionId);

  if (!canViewModule("production_planning")) {
    return (
      <div className="p-6 text-muted-foreground">
        Нет доступа к модулю планирования производства
      </div>
    );
  }

  const needsSubdivision = effectiveSubdivisionId == null;

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
                    ? `${filterLabel} · заказ и календарь плана`
                    : "Заказ, календарь плана и факт выпуска"}
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
              analytics={analytics}
              conflicts={conflicts}
              loading={analyticsLoading}
            />
          )}
        </div>

        {needsSubdivision ? (
          <p className="text-sm text-muted-foreground rounded-md border p-4">
            Выберите подразделение в фильтре для работы с вкладками
          </p>
        ) : (
          <Tabs defaultValue="schedule" className="space-y-3">
            <TabsList className={cn(mobileTabsListClass, "sm:grid sm:grid-cols-3 lg:grid-cols-6")}>
              <TabsTrigger value="schedule" className={mobileTabsTriggerClass}>
                График планирования
              </TabsTrigger>
              <TabsTrigger value="orders" className={mobileTabsTriggerClass}>
                Потребность и заказ
              </TabsTrigger>
              <TabsTrigger value="facts" className={mobileTabsTriggerClass}>
                Факт выпуска
              </TabsTrigger>
              <TabsTrigger value="warehouse" className={mobileTabsTriggerClass}>
                Внутренний склад
              </TabsTrigger>
              <TabsTrigger value="tooling" className={mobileTabsTriggerClass}>
                Оснастка
              </TabsTrigger>
              <TabsTrigger value="products" className={mobileTabsTriggerClass}>
                Изделия
              </TabsTrigger>
              <TabsTrigger value="materials" className={mobileTabsTriggerClass}>
                Материалы
              </TabsTrigger>
              <TabsTrigger value="conflicts" className={mobileTabsTriggerClass}>
                Конфликты
              </TabsTrigger>
              <TabsTrigger value="analytics" className={mobileTabsTriggerClass}>
                Аналитика
              </TabsTrigger>
              <TabsTrigger value="oee" className={mobileTabsTriggerClass}>
                OEE
              </TabsTrigger>
              <TabsTrigger value="settings" className={mobileTabsTriggerClass}>
                Настройки
              </TabsTrigger>
            </TabsList>

            <TabsContent value="schedule">
              <PlanningScheduleTab subdivisionId={effectiveSubdivisionId!} />
            </TabsContent>
            <TabsContent value="orders">
              <PlanningOrdersTab subdivisionId={effectiveSubdivisionId!} />
            </TabsContent>
            <TabsContent value="facts">
              <PlanningFactsTab subdivisionId={effectiveSubdivisionId!} />
            </TabsContent>
            <TabsContent value="warehouse">
              <PlanningWarehouseTab subdivisionId={effectiveSubdivisionId!} />
            </TabsContent>
            <TabsContent value="tooling">
              <PlanningToolingTab subdivisionId={effectiveSubdivisionId!} />
            </TabsContent>
            <TabsContent value="products">
              <PlanningProductsTab subdivisionId={effectiveSubdivisionId!} />
            </TabsContent>
            <TabsContent value="materials">
              <PlanningMaterialsTab subdivisionId={effectiveSubdivisionId!} />
            </TabsContent>
            <TabsContent value="conflicts">
              <PlanningConflictsTab subdivisionId={effectiveSubdivisionId!} />
            </TabsContent>
            <TabsContent value="analytics">
              <PlanningAnalyticsTab analytics={analytics} />
            </TabsContent>
            <TabsContent value="oee">
              <PlanningOeeTab subdivisionId={effectiveSubdivisionId!} />
            </TabsContent>
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
