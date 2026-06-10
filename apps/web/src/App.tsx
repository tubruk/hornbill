import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { AppProvider } from "./context/AppContext";
import { AuthProvider } from "./context/AuthContext";
import { RootLayout } from "./layout/RootLayout";
import { DashboardView } from "./views/DashboardView";
import { CalendarView } from "./views/CalendarView";
import { BillsView } from "./views/BillsView";
import { PaymentsView } from "./views/PaymentsView";
import { SettingsView } from "./views/SettingsView";

// ── TanStack Query client ───────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,           // Data fresh for 60 s
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

type CalendarSearch = {
  year?: number;
  month?: number;
};

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/calendar",
  validateSearch: (search: Record<string, unknown>): CalendarSearch => {
    return {
      year: typeof search.year === "number" ? search.year : (typeof search.year === "string" && !isNaN(parseInt(search.year, 10)) ? parseInt(search.year, 10) : undefined),
      month: typeof search.month === "number" ? search.month : (typeof search.month === "string" && !isNaN(parseInt(search.month, 10)) ? parseInt(search.month, 10) : undefined),
    };
  },
  component: CalendarView,
});

const billsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bills",
  component: BillsView,
});

type PaymentsSearch = {
  billId?: string;
  filter?: "unpaid" | "settled";
};

const paymentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments",
  validateSearch: (search: Record<string, unknown>): PaymentsSearch => {
    return {
      billId: typeof search.billId === "string" ? search.billId : undefined,
      filter: (search.filter === "unpaid" || search.filter === "settled") ? (search.filter as "unpaid" | "settled") : undefined,
    };
  },
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
    calendarRoute,
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
  const [isMobile, setIsMobile] = useState(() => {
    return typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false;
  });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppProvider>
          <RouterProvider router={router} />
        </AppProvider>
      </AuthProvider>
      {import.meta.env.DEV && (
        <ReactQueryDevtools 
          initialIsOpen={false} 
          buttonPosition={isMobile ? "top-right" : "bottom-right"} 
        />
      )}
    </QueryClientProvider>
  );
}
