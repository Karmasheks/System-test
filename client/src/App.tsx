import { Switch, Route } from "wouter";
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

function Router() {
  useModalBodyCleanup();
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard">
        <ProtectedLayout>
          <Dashboard />
        </ProtectedLayout>
      </Route>
      <Route path="/schedule">
        <ProtectedLayout>
          <Schedule />
        </ProtectedLayout>
      </Route>
      <Route path="/equipment">
        <ProtectedLayout>
          <Equipment />
        </ProtectedLayout>
      </Route>
      <Route path="/daily-inspection">
        <ProtectedLayout>
          <DailyInspection />
        </ProtectedLayout>
      </Route>
      <Route path="/daily-inspection-new">
        <ProtectedLayout>
          <DailyInspection />
        </ProtectedLayout>
      </Route>
      <Route path="/users">
        <ProtectedLayout>
          <Users />
        </ProtectedLayout>
      </Route>
      <Route path="/maintenance">
        <LegacyRouteRedirect to="/schedule" />
      </Route>
      <Route path="/tasks">
        <ProtectedLayout>
          <Tasks />
        </ProtectedLayout>
      </Route>
      <Route path="/service-requests">
        <ProtectedLayout>
          <ServiceRequests />
        </ProtectedLayout>
      </Route>
      <Route path="/service-requests/templates">
        <ProtectedLayout>
          <ChecklistTemplates />
        </ProtectedLayout>
      </Route>
      <Route path="/service-requests/:id">
        <ProtectedLayout>
          <ServiceRequestDetail />
        </ProtectedLayout>
      </Route>
      <Route path="/remarks">
        <LegacyRouteRedirect to="/tasks?section=remarks" />
      </Route>
      <Route path="/reports">
        <ProtectedLayout>
          <Reports />
        </ProtectedLayout>
      </Route>
      <Route path="/contacts">
        <ProtectedLayout><Contacts /></ProtectedLayout>
      </Route>
      <Route path="/suppliers">
        <ProtectedLayout><Suppliers /></ProtectedLayout>
      </Route>
      <Route path="/budget">
        <ProtectedLayout><Budget /></ProtectedLayout>
      </Route>
      <Route path="/warehouse">
        <ProtectedLayout>
          <Warehouse />
        </ProtectedLayout>
      </Route>
      <Route path="/documents">
        <ProtectedLayout><Documents /></ProtectedLayout>
      </Route>
      <Route path="/planning">
        <ProtectedLayout scrollable>
          <Planning />
        </ProtectedLayout>
      </Route>
      <Route path="/profile">
        <ProtectedLayout>
          <Profile />
        </ProtectedLayout>
      </Route>
      <Route path="/">
        <ProtectedLayout>
          <Dashboard />
        </ProtectedLayout>
      </Route>
      <Route component={NotFound} />
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
