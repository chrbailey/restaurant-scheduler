import { Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import {
  ErrorComponent,
  ThemedLayoutV2,
  ThemedSiderV2,
  useNotificationProvider,
} from "@refinedev/antd";
import { BrowserRouter, Routes, Route, Outlet } from "react-router";
import routerProvider, {
  NavigateToResource,
  UnsavedChangesNotifier,
  DocumentTitleHandler,
} from "@refinedev/react-router";
import { ConfigProvider, App as AntdApp, theme } from "antd";
import {
  CalendarOutlined,
  TeamOutlined,
  SwapOutlined,
  SettingOutlined,
  DashboardOutlined,
  ShopOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
  ShareAltOutlined,
  FireOutlined,
  LineChartOutlined,
  RobotOutlined,
  WalletOutlined,
} from "@ant-design/icons";

import { dataProvider } from "./providers/dataProvider";
import { authProvider } from "./providers/authProvider";

import { DashboardPage } from "./pages/dashboard";
import { ShiftList, ShiftCreate, ShiftEdit, ShiftShow } from "./pages/shifts";
import { WorkerList, WorkerShow } from "./pages/workers";
import { ClaimList } from "./pages/claims";
import { SwapList } from "./pages/swaps";
import { SettingsPage } from "./pages/settings";
import { LoginPage } from "./pages/login";
import { NetworkList, NetworkShow, NetworkCreate } from "./pages/network";
import { CrossTrainingList, CrossTrainingShow } from "./pages/cross-training";
import { NetworkShiftsList } from "./pages/network-shifts";
import {
  GhostKitchenDashboard,
  GhostKitchenForecast,
  GhostKitchenAnalytics,
  GhostKitchenSessions,
  GhostKitchenSettings,
} from "./pages/ghost-kitchen";
import {
  AnalyticsDashboard,
  LaborAnalytics,
  ForecastingAnalytics,
  WorkerAnalytics,
  WorkerDetail,
} from "./pages/analytics";
import { AISuggestions, ScheduleOptimizer } from "./pages/ai-scheduling";
import { MarketplaceList } from "./pages/marketplace";
import { PaymentsOverview, PaymentsWorkers } from "./pages/payments";

import "@refinedev/antd/dist/reset.css";
import "./styles/index.css";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ConfigProvider
          theme={{
            algorithm: theme.darkAlgorithm,
            token: {
              colorPrimary: "#4a90d9",
              colorBgContainer: "#1a1a2e",
              colorBgElevated: "#16213e",
              colorBgLayout: "#0f0f23",
            },
          }}
        >
          <AntdApp>
            <Refine
              routerProvider={routerProvider}
              dataProvider={dataProvider}
              authProvider={authProvider}
              notificationProvider={useNotificationProvider}
              resources={[
                {
                  name: "dashboard",
                  list: "/dashboard",
                  meta: {
                    label: "Dashboard",
                    icon: <DashboardOutlined />,
                  },
                },
                {
                  name: "shifts",
                  list: "/shifts",
                  create: "/shifts/create",
                  edit: "/shifts/edit/:id",
                  show: "/shifts/show/:id",
                  meta: {
                    label: "Shifts",
                    icon: <CalendarOutlined />,
                  },
                },
                {
                  name: "workers",
                  list: "/workers",
                  show: "/workers/show/:id",
                  meta: {
                    label: "Workers",
                    icon: <TeamOutlined />,
                  },
                },
                {
                  name: "claims",
                  list: "/claims",
                  meta: {
                    label: "Pending Claims",
                    icon: <ShopOutlined />,
                  },
                },
                {
                  name: "swaps",
                  list: "/swaps",
                  meta: {
                    label: "Swap Requests",
                    icon: <SwapOutlined />,
                  },
                },
                {
                  name: "networks",
                  list: "/networks",
                  show: "/networks/show/:id",
                  create: "/networks/create",
                  meta: {
                    label: "Networks",
                    icon: <GlobalOutlined />,
                  },
                },
                {
                  name: "cross-training",
                  list: "/cross-training",
                  show: "/cross-training/show/:id",
                  meta: {
                    label: "Cross-Training",
                    icon: <SafetyCertificateOutlined />,
                  },
                },
                {
                  name: "network-shifts",
                  list: "/network-shifts",
                  meta: {
                    label: "Network Shifts",
                    icon: <ShareAltOutlined />,
                  },
                },
                {
                  name: "ghost-kitchen",
                  list: "/ghost-kitchen",
                  meta: {
                    label: "Ghost Kitchen",
                    icon: <FireOutlined />,
                  },
                },
                {
                  name: "analytics",
                  list: "/analytics",
                  meta: {
                    label: "Analytics",
                    icon: <LineChartOutlined />,
                  },
                },
                {
                  name: "ai-scheduling",
                  list: "/ai-scheduling",
                  meta: {
                    label: "AI Scheduling",
                    icon: <RobotOutlined />,
                  },
                },
                {
                  name: "marketplace",
                  list: "/marketplace",
                  meta: {
                    label: "Trade Marketplace",
                    icon: <SwapOutlined />,
                  },
                },
                {
                  name: "payments",
                  list: "/payments",
                  meta: {
                    label: "Instant Pay",
                    icon: <WalletOutlined />,
                  },
                },
                {
                  name: "settings",
                  list: "/settings",
                  meta: {
                    label: "Settings",
                    icon: <SettingOutlined />,
                  },
                },
              ]}
              options={{
                syncWithLocation: true,
                warnWhenUnsavedChanges: true,
                useNewQueryKeys: true,
                projectId: "restaurant-scheduler",
              }}
            >
              <Routes>
                <Route
                  element={
                    <ThemedLayoutV2
                      Sider={() => <ThemedSiderV2 Title={() => <h3>Scheduler</h3>} />}
                    >
                      <Outlet />
                    </ThemedLayoutV2>
                  }
                >
                  <Route index element={<NavigateToResource resource="dashboard" />} />
                  <Route path="/dashboard" element={<DashboardPage />} />

                  <Route path="/shifts">
                    <Route index element={<ShiftList />} />
                    <Route path="create" element={<ShiftCreate />} />
                    <Route path="edit/:id" element={<ShiftEdit />} />
                    <Route path="show/:id" element={<ShiftShow />} />
                  </Route>

                  <Route path="/workers">
                    <Route index element={<WorkerList />} />
                    <Route path="show/:id" element={<WorkerShow />} />
                  </Route>

                  <Route path="/claims" element={<ClaimList />} />
                  <Route path="/swaps" element={<SwapList />} />

                  <Route path="/networks">
                    <Route index element={<NetworkList />} />
                    <Route path="show/:id" element={<NetworkShow />} />
                    <Route path="create" element={<NetworkCreate />} />
                  </Route>

                  <Route path="/cross-training">
                    <Route index element={<CrossTrainingList />} />
                    <Route path="show/:id" element={<CrossTrainingShow />} />
                  </Route>

                  <Route path="/network-shifts" element={<NetworkShiftsList />} />

                  <Route path="/ghost-kitchen">
                    <Route index element={<GhostKitchenDashboard />} />
                    <Route path="forecast" element={<GhostKitchenForecast />} />
                    <Route path="analytics" element={<GhostKitchenAnalytics />} />
                    <Route path="sessions" element={<GhostKitchenSessions />} />
                    <Route path="settings" element={<GhostKitchenSettings />} />
                  </Route>

                  <Route path="/analytics">
                    <Route index element={<AnalyticsDashboard />} />
                    <Route path="labor" element={<LaborAnalytics />} />
                    <Route path="forecasting" element={<ForecastingAnalytics />} />
                    <Route path="workers" element={<WorkerAnalytics />} />
                    <Route path="workers/:id" element={<WorkerDetail />} />
                  </Route>

                  <Route path="/ai-scheduling">
                    <Route index element={<AISuggestions />} />
                    <Route path="suggestions" element={<AISuggestions />} />
                    <Route path="optimizer" element={<ScheduleOptimizer />} />
                  </Route>

                  <Route path="/marketplace" element={<MarketplaceList />} />

                  <Route path="/payments">
                    <Route index element={<PaymentsOverview />} />
                    <Route path="workers" element={<PaymentsWorkers />} />
                  </Route>

                  <Route path="/settings" element={<SettingsPage />} />

                  <Route path="*" element={<ErrorComponent />} />
                </Route>

                <Route path="/login" element={<LoginPage />} />
              </Routes>

              <RefineKbar />
              <UnsavedChangesNotifier />
              <DocumentTitleHandler />
            </Refine>
          </AntdApp>
        </ConfigProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
