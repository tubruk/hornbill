import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { AppProvider } from "./context/AppContext";
import { RootLayout } from "./layout/RootLayout";
import { DashboardView } from "./views/DashboardView";
import { BillsView } from "./views/BillsView";
import { PaymentsView } from "./views/PaymentsView";
import { SettingsView } from "./views/SettingsView";

// ── TanStack Query client ───────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // Data fresh for 30 s
      retry: 1,                    // Fail fast when API is offline
      refetchOnWindowFocus: false,
    },
  },
});

// ── TanStack Router ─────────────────────────────────────────────────────────

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardView,
});

const billsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bills",
  component: BillsView,
});

const paymentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments",
  component: PaymentsView,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsView,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    billsRoute,
    paymentsRoute,
    settingsRoute,
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// ── App root ────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>
    </QueryClientProvider>
  );
}
