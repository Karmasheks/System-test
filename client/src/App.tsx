import { Switch, Route, useLocation } from "wouter";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Schedule from "@/pages/schedule";
import Equipment from "@/pages/equipment";
import Users from "@/pages/users";
import Reports from "@/pages/reports";
import DailyInspection from "@/pages/daily-inspection-new";
import Profile from "@/pages/profile";
import Tasks from "@/pages/tasks";
import ServiceRequests from "@/pages/service-requests";
import ServiceRequestDetail from "@/pages/service-request-detail";
import ChecklistTemplates from "@/pages/checklist-templates";
import Contacts from "@/pages/contacts";
import Suppliers from "@/pages/suppliers";
import Budget from "@/pages/budget";
import Warehouse from "@/pages/warehouse";
import Documents from "@/pages/documents";
import Planning from "@/pages/planning";
import Messages from "@/pages/messages";
import { MobileSidebarProvider } from "@/hooks/use-mobile-sidebar";
import { AuthProvider } from "@/hooks/use-auth";
import { UserStatusProvider } from "@/hooks/use-user-status";
import { EquipmentProvider } from "@/hooks/use-equipment-data";
import { RemarksProvider } from "@/hooks/use-remarks-data";
import { InspectionChecklistProvider } from "@/hooks/use-inspection-checklists";
import { LegacyRouteRedirect } from "@/components/legacy-route-redirect";
import { SidebarProvider } from "@/hooks/use-sidebar-state";
import { TaskDialogProvider } from "@/hooks/use-task-dialog";
import { useModalBodyCleanup } from "@/hooks/use-modal-body-cleanup";
import { BlockerRecovery } from "@/components/blocker-recovery";
import { ProtectedLayout } from "@/components/layout/protected-layout";

/** Один AppShell на все защищённые страницы — не пересоздаём шапку/сайдбар при каждом переходе. */
function ProtectedAppRoutes() {
  const [location] = useLocation();
  const scrollable = !location.startsWith("/planning");

  return (
    <ProtectedLayout scrollable={scrollable}>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/schedule" component={Schedule} />
        <Route path="/equipment" component={Equipment} />
        <Route path="/daily-inspection" component={DailyInspection} />
        <Route path="/daily-inspection-new" component={DailyInspection} />
        <Route path="/users" component={Users} />
        <Route path="/maintenance">
          <LegacyRouteRedirect to="/schedule" />
        </Route>
        <Route path="/tasks" component={Tasks} />
        <Route path="/messages" component={Messages} />
        <Route path="/service-requests" component={ServiceRequests} />
        <Route path="/service-requests/templates" component={ChecklistTemplates} />
        <Route path="/service-requests/:id" component={ServiceRequestDetail} />
        <Route path="/remarks">
          <LegacyRouteRedirect to="/tasks?section=remarks" />
        </Route>
        <Route path="/reports" component={Reports} />
        <Route path="/contacts" component={Contacts} />
        <Route path="/suppliers" component={Suppliers} />
        <Route path="/budget" component={Budget} />
        <Route path="/warehouse" component={Warehouse} />
        <Route path="/documents" component={Documents} />
        <Route path="/planning" component={Planning} />
        <Route path="/profile" component={Profile} />
        <Route path="/" component={Dashboard} />
        <Route component={NotFound} />
      </Switch>
    </ProtectedLayout>
  );
}

function Router() {
  useModalBodyCleanup();
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route component={ProtectedAppRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <AuthProvider>
      <SidebarProvider>
        <EquipmentProvider>
          <RemarksProvider>
            <InspectionChecklistProvider>
              <UserStatusProvider>
                <MobileSidebarProvider>
                  <TaskDialogProvider>
                    <BlockerRecovery />
                    <Router />
                  </TaskDialogProvider>
                </MobileSidebarProvider>
              </UserStatusProvider>
            </InspectionChecklistProvider>
          </RemarksProvider>
        </EquipmentProvider>
      </SidebarProvider>
    </AuthProvider>
  );
}

export default App;
