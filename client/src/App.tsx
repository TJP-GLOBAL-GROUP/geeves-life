import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import { GeevesChat } from "./components/GeevesChat";
import Home from "./pages/Home";
import Shopping from "./pages/Shopping";
import ShoppingListDetail from "./pages/ShoppingListDetail";
import Orders from "./pages/Orders";
import Accounts from "./pages/Accounts";
import Expenses from "./pages/Expenses";
import Family from "./pages/Family";
import FamilyView from "./pages/FamilyView";
import WhatsAppImport from "./pages/WhatsAppImport";
import OrderPrep from "./pages/OrderPrep";
import ShopAgent from "./pages/ShopAgent";
import ScanList from "./pages/ScanList";
import CalendarView from "./pages/CalendarView";
import Household from "./pages/Household";
import Properties from "./pages/Properties";
import Notes from "./pages/Notes";
import Settings from "./pages/Settings";
import Verticals from "./pages/Verticals";
import JoinHousehold from "./pages/JoinHousehold";
import InvitationAccept from "@/pages/InvitationAccept";
import SuperAdmin from "@/pages/SuperAdmin";
import VerticalAccessMatrix from "@/pages/VerticalAccessMatrix";
import MemberPermissions from "@/pages/MemberPermissions";
import ConstellationMembers from "@/pages/ConstellationMembers";
import { Redirect } from "wouter";
import CustomRoles from "@/pages/CustomRoles";
import ExpenseCategorisation from "@/pages/ExpenseCategorisation";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import { useDeviceLocation } from "@/hooks/useDeviceLocation";

function Router() {
  return (
    <Switch>
      {/* Public standalone pages — no sidebar */}
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/join" component={JoinHousehold} />
      <Route path="/invitation-accept" component={InvitationAccept} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      {/* All other routes get the dashboard layout */}
      <Route>
        <DashboardLayout>
          <Switch>
        <Route path="/dashboard" component={Home} />
        <Route path="/shopping" component={Shopping} />
        <Route path="/shopping/:id" component={ShoppingListDetail} />
        <Route path="/shopping/:id/order" component={OrderPrep} />
        <Route path="/orders" component={Orders} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/expenses" component={Expenses} />
        {/* /family is deprecated — redirect to Constellation Members */}
        <Route path="/family">{() => <Redirect to="/constellation-members" />}</Route>
        <Route path="/family/views">{() => <Redirect to="/constellation-members" />}</Route>
        <Route path="/family/child">{() => <Redirect to="/constellation-members" />}</Route>
        <Route path="/family/elder">{() => <Redirect to="/constellation-members" />}</Route>
        <Route path="/family/caregiver">{() => <Redirect to="/constellation-members" />}</Route>
        <Route path="/whatsapp" component={WhatsAppImport} />
        <Route path="/calendar" component={CalendarView} />
        <Route path="/household" component={Household} />
        <Route path="/properties" component={Properties} />
        <Route path="/notes" component={Notes} />
        <Route path="/settings" component={Settings} />
        <Route path="/verticals" component={Verticals} />
        <Route path="/verticals/:id" component={Verticals} />
        <Route path="/scan-list" component={ScanList} />
        <Route path="/shop-agent" component={ShopAgent} />
        <Route path="/shop-agent/:id" component={ShopAgent} />
        <Route path="/super-admin" component={SuperAdmin} />
        <Route path="/vertical-access" component={VerticalAccessMatrix} />
        {/* /member-permissions is deprecated — redirect to Constellation Members */}
        <Route path="/member-permissions">{() => <Redirect to="/constellation-members" />}</Route>
        <Route path="/constellation-members" component={ConstellationMembers} />
        <Route path="/custom-roles" component={CustomRoles} />
        <Route path="/expense-categorisation" component={ExpenseCategorisation} />
        <Route path="/walmart-categorization">{() => <Redirect to="/expense-categorisation" />}</Route>
        <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </DashboardLayout>
    </Route>
    </Switch>
  );
}

/**
 * AppInit — runs side-effects that need tRPC context (providers are already mounted).
 * Calls useDeviceLocation to persist the device IANA timezone to the server on every load.
 */
function AppInit() {
  useDeviceLocation();
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable={true}>
        <TooltipProvider>
          <Toaster />
          <AppInit />
          <Router />
          <GeevesChat />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
