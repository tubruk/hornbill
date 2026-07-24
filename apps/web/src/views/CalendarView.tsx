import { useMemo, useState } from "react";
import { useSearch, useNavigate, Link } from "@tanstack/react-router";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  differenceInDays,
  parseISO,
  subDays,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  AlertCircle,
  Clock,
  Loader2,
  Calendar,
  Banknote,
  Palmtree,
  MoreVertical,
  Eye,
  Edit3,
} from "lucide-react";

import { useAppCtx } from "../context/AppContext";
import {
  useBills,
  usePayments,
  usePayPayment,
  useUpdatePayment,
  useDeletePayment,
  useCreatePayment,
  useAccountHolidays,
  type EnrichedPayment,
} from "../api/queries";
import { getPaymentState, calculateNextDueDate, getPayPeriodBounds, DEFAULT_UPCOMING_THRESHOLD_DAYS, type Payment, type Bill } from "@hornbill/core";
import { PayPaymentModal } from "../components/PayPaymentModal";
import { Button } from "../components/Button";
import { PaymentDetailsModal } from "../components/PaymentDetailsModal";
import { Dropdown, DropdownItem } from "../components/Dropdown";
import { SplitButton } from "../components/SplitButton";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCents(cents: number, currency = "USD"): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency });
}

function formatDatePretty(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateStr(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ── Projection Merging Algorithm ───────────────────────────────────────────

function getProjectedPaymentsForBill(
  bill: Bill,
  actualPayments: Payment[],
  gridStartStr: string,
  gridEndStr: string
): Payment[] {
  if (!bill.active) return [];
  if (bill.start_date > gridEndStr) return [];

  const projections: Payment[] = [];
  const billActuals = actualPayments.filter((p) => p.bill_id === bill.id);
  
  if (billActuals.length === 0) return []; // In practice, always has at least 1 record.

  // Find the latest actual payment (paid or unpaid)
  const sortedActuals = [...billActuals].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const latestActual = sortedActuals[sortedActuals.length - 1];

  let currentDueDate = latestActual.due_date;
  const seenDates = new Set<string>();
  let safetyCounter = 0;

  while (currentDueDate <= gridEndStr && safetyCounter < 100) {
    safetyCounter++;

    // Mock a paid payment to advance the recurrence cycle
    const mockPayment: Payment = {
      id: "mock",
      bill_id: bill.id,
      due_date: currentDueDate,
      amount_cents: bill.amount_cents,
      paid_at: Math.floor(Date.now() / 1000), // mock paid
      created_at: 0,
      updated_at: 0,
    };

    const nextDueDate = calculateNextDueDate(bill, mockPayment);

    if (nextDueDate <= currentDueDate || seenDates.has(nextDueDate)) {
      break;
    }

    currentDueDate = nextDueDate;
    seenDates.add(currentDueDate);

    if (currentDueDate >= gridStartStr && currentDueDate <= gridEndStr) {
      // Check if there is already an actual record in the database
      const hasActual = billActuals.some((p) => p.due_date === currentDueDate);
      if (!hasActual) {
        projections.push({
          id: `projected-${bill.id}-${currentDueDate}`,
          bill_id: bill.id,
          due_date: currentDueDate,
          amount_cents: bill.amount_cents,
          paid_at: null,
          notes: "Projected billing cycle",
          created_at: 0,
          updated_at: 0,
        });
      }
    }
  }

  return projections;
}

export function CalendarView() {
  const { currentAccount, openAddModal, notify } = useAppCtx();
  const search = useSearch({ from: "/calendar" });
  const navigate = useNavigate({ from: "/calendar" });

  const activeYear = search.year ?? new Date().getFullYear();
  const activeMonth = search.month ?? (new Date().getMonth() + 1);

  const activeDate = useMemo(() => {
    return new Date(activeYear, activeMonth - 1, 1);
  }, [activeYear, activeMonth]);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // ── Selected Date State (for mobile/tablet agenda view) ──────────────────
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    // Default to today if it's the current month, otherwise the 1st of the active month
    if (today.getFullYear() === activeYear && (today.getMonth() + 1) === activeMonth) {
      return today;
    }
    return new Date(activeYear, activeMonth - 1, 1);
  });

  // Keep selectedDate in sync when navigating to another month
  const handleMonthChange = (nextDate: Date) => {
    navigate({
      search: {
        year: nextDate.getFullYear(),
        month: nextDate.getMonth() + 1,
      },
    });
    setSelectedDate(nextDate);
  };

  // ── Modals State ─────────────────────────────────────────────────────────
  const [payingPayment, setPayingPayment] = useState<{
    id: string;
    name: string;
    dueDate: string;
    isUpcoming: boolean;
    amountCents: number;
    currency: string;
    isProjected: boolean;
  } | null>(null);

  const [editingPayment, setEditingPayment] = useState<{
    id: string;
    billName: string;
    dueDate: string;
    amountCents: number;
    currency: string;
    paidAtDate: string | null;
    notes: string;
  } | null>(null);

  const [viewingPayment, setViewingPayment] = useState<EnrichedPayment | null>(null);

  // ── Fetching Data ────────────────────────────────────────────────────────
  const billsQuery = useBills(currentAccount?.id);
  const bills = useMemo(() => billsQuery.data ?? [], [billsQuery.data]);

  const paymentsQuery = usePayments(currentAccount?.id, billsQuery.data);
  const dbPayments = useMemo(() => paymentsQuery.data ?? [], [paymentsQuery.data]);

  const holidaysQuery = useAccountHolidays(currentAccount?.id);
  const holidaysMap = useMemo(() => {
    const list = holidaysQuery.data ?? [];
    return new Map(list.map((h) => [h.date, h]));
  }, [holidaysQuery.data]);

  // Mutations
  const payMut = usePayPayment();
  const updateMut = useUpdatePayment();
  const deleteMut = useDeletePayment();
  const createPaymentMut = useCreatePayment();

  // ── Grid calculation (Sunday to Saturday) ────────────────────────────────
  const { gridDays, gridStartStr, gridEndStr } = useMemo(() => {
    const monthStart = startOfMonth(activeDate);
    const monthEnd = endOfMonth(monthStart);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return {
      gridDays: eachDayOfInterval({ start: gridStart, end: gridEnd }),
      gridStartStr: format(gridStart, "yyyy-MM-dd"),
      gridEndStr: format(gridEnd, "yyyy-MM-dd"),
    };
  }, [activeDate]);

  // ── Merge Actual + Projected Payments ────────────────────────────────────
  const { paymentsByDate, monthlySummary } = useMemo(() => {
    const billMap = new Map(bills.map((b) => [b.id, b]));
    
    // 1. Gather all actual database payments enriched with bill details
    const actualsEnriched: EnrichedPayment[] = dbPayments.map((p) => {
      const bill = billMap.get(p.bill_id) ?? null;
      return { ...p, bill };
    });

    // 2. Generate projected payments for active bills within the grid range
    const projectedPayments: EnrichedPayment[] = [];
    bills.forEach((bill) => {
      const projections = getProjectedPaymentsForBill(bill, dbPayments, gridStartStr, gridEndStr);
      projections.forEach((proj) => {
        projectedPayments.push({
          ...proj,
          bill,
        });
      });
    });

    // 3. Merge and sort
    const merged = [...actualsEnriched, ...projectedPayments].sort((a, b) =>
      a.due_date.localeCompare(b.due_date)
    );

    // 4. Group by date string (YYYY-MM-DD)
    const byDate = new Map<string, EnrichedPayment[]>();
    merged.forEach((item) => {
      const list = byDate.get(item.due_date) || [];
      list.push(item);
      byDate.set(item.due_date, list);
    });

    // 5. Calculate monthly summary split by currency (only for active month)
    const summary: {
      active: Record<string, number>;
      settled: Record<string, number>;
      projected: Record<string, number>;
    } = {
      active: {},
      settled: {},
      projected: {},
    };

    const activeMonthStr = format(activeDate, "yyyy-MM");

    merged.forEach((p) => {
      if (!p.due_date.startsWith(activeMonthStr)) return; // Only summarize this active month

      const currency = p.bill?.currency ?? "USD";
      const isProjected = p.id.startsWith("projected-");
      const isSettled = !!p.paid_at;

      if (isProjected) {
        summary.projected[currency] = (summary.projected[currency] || 0) + p.amount_cents;
      } else if (isSettled) {
        summary.settled[currency] = (summary.settled[currency] || 0) + p.amount_cents;
      } else {
        summary.active[currency] = (summary.active[currency] || 0) + p.amount_cents;
      }
    });

    return {
      allPayments: merged,
      paymentsByDate: byDate,
      monthlySummary: summary,
    };
  }, [bills, dbPayments, gridStartStr, gridEndStr, activeDate]);

  // ── Persistent View Mode State (localStorage) ────────────────────────────
  const [storedViewMode, setStoredViewMode] = useState<"month" | "payday">(() => {
    try {
      const stored = localStorage.getItem("hb_calendar_view");
      return stored === "payday" ? "payday" : "month";
    } catch {
      return "month";
    }
  });

  const viewMode = search.view ?? storedViewMode;

  const handleViewModeChange = (mode: "month" | "payday") => {
    try {
      localStorage.setItem("hb_calendar_view", mode);
    } catch {
      // Ignore storage quota / access errors
    }
    setStoredViewMode(mode);
    navigate({ search: { ...search, view: mode } });
  };

  const [paydayRefDate, setPaydayRefDate] = useState<string>(todayStr);

  const holidayDatesSet = useMemo(() => new Set(holidaysMap.keys()), [holidaysMap]);

  const paydayBounds = useMemo(() => {
    if (!currentAccount?.payday_config?.enabled) return null;
    return getPayPeriodBounds(paydayRefDate, currentAccount.payday_config, holidayDatesSet);
  }, [currentAccount, paydayRefDate, holidayDatesSet]);

  const handleNextCycle = () => {
    if (paydayBounds) {
      setPaydayRefDate(paydayBounds.next_payday);
    }
  };

  const handlePrevCycle = () => {
    if (paydayBounds) {
      const prevDate = format(subDays(parseISO(paydayBounds.start_date), 1), "yyyy-MM-dd");
      setPaydayRefDate(prevDate);
    }
  };

  const handleCurrentCycle = () => {
    setPaydayRefDate(todayStr);
  };

  const paydayData = useMemo(() => {
    if (!paydayBounds) return null;

    const startStr = paydayBounds.start_date;
    const endStr = paydayBounds.end_date;
    const billMap = new Map(bills.map((b) => [b.id, b]));

    const actualsEnriched: EnrichedPayment[] = dbPayments
      .filter((p) => p.due_date >= startStr && p.due_date <= endStr)
      .map((p) => ({ ...p, bill: billMap.get(p.bill_id) ?? null }));

    const projectedPayments: EnrichedPayment[] = [];
    bills.forEach((bill) => {
      const projections = getProjectedPaymentsForBill(bill, dbPayments, startStr, endStr);
      projections.forEach((proj) => {
        if (proj.due_date >= startStr && proj.due_date <= endStr) {
          projectedPayments.push({ ...proj, bill });
        }
      });
    });

    const merged = [...actualsEnriched, ...projectedPayments].sort((a, b) =>
      a.due_date.localeCompare(b.due_date)
    );

    const byDate = new Map<string, EnrichedPayment[]>();
    merged.forEach((item) => {
      const list = byDate.get(item.due_date) || [];
      list.push(item);
      byDate.set(item.due_date, list);
    });

    const summary = {
      active: {} as Record<string, number>,
      settled: {} as Record<string, number>,
      projected: {} as Record<string, number>,
    };

    merged.forEach((p) => {
      const currency = p.bill?.currency ?? "USD";
      const isProjected = p.id.startsWith("projected-");
      const isSettled = !!p.paid_at;

      if (isProjected) {
        summary.projected[currency] = (summary.projected[currency] || 0) + p.amount_cents;
      } else if (isSettled) {
        summary.settled[currency] = (summary.settled[currency] || 0) + p.amount_cents;
      } else {
        summary.active[currency] = (summary.active[currency] || 0) + p.amount_cents;
      }
    });

    const startISO = parseISO(startStr);
    const endISO = parseISO(endStr);
    const cycleDays = eachDayOfInterval({ start: startISO, end: endISO });

    const totalDays = differenceInDays(endISO, startISO) + 1;
    const todayISO = parseISO(todayStr);
    let daysElapsed = differenceInDays(todayISO, startISO) + 1;
    if (todayStr < startStr) daysElapsed = 0;
    if (todayStr > endStr) daysElapsed = totalDays;
    const progressPct = Math.min(100, Math.max(0, Math.round((daysElapsed / totalDays) * 100)));

    return {
      startStr,
      endStr,
      merged,
      byDate,
      summary,
      cycleDays,
      totalDays,
      daysElapsed,
      progressPct,
    };
  }, [paydayBounds, bills, dbPayments, todayStr]);

  // ── Action Handlers ──────────────────────────────────────────────────────

  const handlePay = (
    paymentId: string,
    billName: string,
    dueDate: string,
    isUpcoming: boolean,
    amountCents: number,
    currency: string,
    isProjected: boolean
  ) => {
    setPayingPayment({
      id: paymentId,
      name: billName,
      dueDate,
      isUpcoming,
      amountCents,
      currency,
      isProjected,
    });
  };

  const handlePayConfirm = async (
    amountCents: number,
    paidAtDate?: string,
    _dueDate?: string,
    notes?: string
  ) => {
    if (!payingPayment || !currentAccount) return;

    if (payingPayment.isProjected) {
      // Create a new paid payment for the projection
      const billId = payingPayment.id.split("-")[1]; // projected-billId-date
      const finalPaidAt = paidAtDate
        ? Math.floor(new Date(paidAtDate).getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      await createPaymentMut.mutateAsync(
        {
          payload: {
            bill_id: billId,
            due_date: payingPayment.dueDate,
            amount_cents: amountCents,
            paid_at: finalPaidAt,
            notes: notes || null,
          },
          accountId: currentAccount.id,
        },
        {
          onSuccess: () => {
            notify(`"${payingPayment.name}" recorded as paid.`, "success");
            setPayingPayment(null);
          },
          onError: (err: unknown) =>
            notify(err instanceof Error ? err.message : "Failed to record payment.", "error"),
        }
      );
    } else {
      // Settle standard database record
      await payMut.mutateAsync(
        {
          paymentId: payingPayment.id,
          accountId: currentAccount.id,
          paidAt: paidAtDate,
          amountCents,
          notes,
        },
        {
          onSuccess: () => {
            notify(`"${payingPayment.name}" marked as paid.`, "success");
            setPayingPayment(null);
          },
          onError: (err: unknown) =>
            notify(err instanceof Error ? err.message : "Failed to mark as paid.", "error"),
        }
      );
    }
  };

  const handleEdit = (payment: EnrichedPayment) => {
    const paidAtDate = payment.paid_at
      ? new Date(payment.paid_at * 1000).toISOString().split("T")[0]
      : null;

    setEditingPayment({
      id: payment.id,
      billName: payment.bill?.name ?? "Bill",
      dueDate: payment.due_date,
      amountCents: payment.amount_cents,
      currency: payment.bill?.currency ?? "USD",
      paidAtDate,
      notes: payment.notes || "",
    });
  };

  const handleEditConfirm = async (
    amountCents: number,
    paidAtDate?: string,
    dueDate?: string,
    notes?: string
  ) => {
    if (!editingPayment || !currentAccount) return;

    await updateMut.mutateAsync(
      {
        id: editingPayment.id,
        accountId: currentAccount.id,
        updates: {
          amount_cents: amountCents,
          paid_at: paidAtDate,
          due_date: dueDate,
          notes: notes || null,
        },
      },
      {
        onSuccess: () => {
          notify(`Payment for "${editingPayment.billName}" updated.`, "success");
          setEditingPayment(null);
        },
        onError: (err: unknown) =>
          notify(err instanceof Error ? err.message : "Failed to update payment.", "error"),
      }
    );
  };

  const handleEditDelete = async () => {
    if (!editingPayment || !currentAccount) return;

    if (!window.confirm("Are you sure you want to delete this payment record? This cannot be undone.")) {
      return;
    }

    await deleteMut.mutateAsync(
      { id: editingPayment.id, accountId: currentAccount.id },
      {
        onSuccess: () => {
          notify("Payment record deleted.", "success");
          setEditingPayment(null);
        },
        onError: (err: unknown) =>
          notify(err instanceof Error ? err.message : "Failed to delete payment.", "error"),
      }
    );
  };

  // Trigger add bill pre-filled with selected day
  const handleBlankDayClick = (day: Date) => {
    openAddModal(format(day, "yyyy-MM-dd"));
  };

  if (!currentAccount) {
    return (
      <div className="py-20 text-center text-text-secondary font-semibold">
        Select an account to view the calendar.
      </div>
    );
  }

  // ── Currencies summary arrays ────────────────────────────────────────────
  const activeCurrencies = Object.keys({
    ...monthlySummary.active,
    ...monthlySummary.settled,
    ...monthlySummary.projected,
  });

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const selectedDayPayments = paymentsByDate.get(selectedDateStr) || [];

  return (
    <div className="space-y-6">

      {/* ── View Switcher Controls Header ──────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-warm border border-border-warm p-4 rounded-sm">
        <div className="flex items-center gap-3">
          <div className="inline-flex p-1 bg-surface-raised border border-border-warm rounded-sm">
            <button
              type="button"
              onClick={() => handleViewModeChange("month")}
              className={`px-3 py-1.5 text-[13px] font-semibold rounded-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                viewMode === "month"
                  ? "bg-surface-warm text-text-primary shadow-sm border border-border-warm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Calendar className="w-4 h-4 text-primary" />
              <span>Month Grid</span>
            </button>
            {currentAccount?.payday_config?.enabled ? (
              <button
                type="button"
                onClick={() => handleViewModeChange("payday")}
                className={`px-3 py-1.5 text-[13px] font-semibold rounded-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "payday"
                    ? "bg-surface-warm text-text-primary shadow-sm border border-border-warm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Banknote className="w-4 h-4 text-primary" />
                <span>Payday Cycle</span>
              </button>
            ) : (
              <Link
                to="/settings"
                search={{ tab: "general" }}
                className="px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:text-primary transition-colors flex items-center gap-1 opacity-75 hover:opacity-100"
                title="Enable Payday Cycle in Settings to activate salary-aligned views"
              >
                <span>+ Enable Payday View</span>
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[13px] text-text-secondary">
          <Link
            to="/settings"
            search={{ tab: "integrations" }}
            className="hover:text-primary transition-colors flex items-center gap-1"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Calendar iCal Feed</span>
          </Link>
        </div>
      </div>

      {viewMode === "payday" && paydayData ? (
        <div className="space-y-6">
          {/* Payday Cycle Navigation & Summary */}
          <div className="flex flex-col xl:flex-row xl:items-stretch gap-6">
            <div className="flex items-center justify-between xl:justify-start gap-4 bg-surface-warm border border-border-warm p-4 rounded-sm xl:w-[420px] shrink-0">
              <button
                type="button"
                onClick={handlePrevCycle}
                className="p-2 border border-border-warm bg-background-warm rounded-sm transition-colors hover:bg-surface-raised cursor-pointer text-text-secondary"
                title="Previous Pay Period"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-center xl:flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary block mb-0.5">
                  PAY CYCLE BOUNDS
                </span>
                <h3 className="font-display font-bold text-[18px] md:text-[20px] text-text-primary capitalize leading-none">
                  {formatDateStr(paydayData.startStr)} – {formatDateStr(paydayData.endStr)}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleNextCycle}
                className="p-2 border border-border-warm bg-background-warm rounded-sm transition-colors hover:bg-surface-raised cursor-pointer text-text-secondary"
                title="Next Pay Period"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 bg-surface-warm border border-border-warm p-4 rounded-sm flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="text-[12px] font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5 text-primary" /> Cycle Budget Progress & Status
                </div>
                <button
                  type="button"
                  onClick={handleCurrentCycle}
                  className="text-[12px] font-medium text-primary hover:underline cursor-pointer"
                >
                  Current Cycle
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[12px] font-medium">
                  <span className="text-text-primary">
                    Day {paydayData.daysElapsed} of {paydayData.totalDays}
                  </span>
                  <span className="text-text-secondary font-mono">{paydayData.progressPct}% elapsed</span>
                </div>
                <div className="w-full bg-surface-raised h-2 rounded-full overflow-hidden border border-border-warm/60">
                  <div
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${paydayData.progressPct}%` }}
                  />
                </div>
              </div>

              {Object.keys({ ...paydayData.summary.active, ...paydayData.summary.settled, ...paydayData.summary.projected }).length === 0 ? (
                <span className="text-[13px] text-text-secondary italic">No bills scheduled in this pay cycle.</span>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="bg-background-warm border border-border-warm/60 p-2.5 rounded-sm">
                    <span className="text-[10px] font-bold text-text-secondary block">ACTIVE (UNPAID)</span>
                    <div className="text-[15px] font-mono font-bold text-text-primary mt-0.5">
                      {Object.keys({ ...paydayData.summary.active, ...paydayData.summary.settled, ...paydayData.summary.projected }).map((cur) => (
                        <div key={cur}>{formatCents(paydayData.summary.active[cur] || 0, cur)}</div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-background-warm border border-border-warm/60 p-2.5 rounded-sm">
                    <span className="text-[10px] font-bold text-text-secondary block">PAID (SETTLED)</span>
                    <div className="text-[15px] font-mono font-bold text-success mt-0.5">
                      {Object.keys({ ...paydayData.summary.active, ...paydayData.summary.settled, ...paydayData.summary.projected }).map((cur) => (
                        <div key={cur}>{formatCents(paydayData.summary.settled[cur] || 0, cur)}</div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-background-warm border border-border-warm/60 p-2.5 rounded-sm">
                    <span className="text-[10px] font-bold text-text-secondary block">PROJECTED FUTURE</span>
                    <div className="text-[15px] font-mono font-bold text-text-secondary mt-0.5 italic">
                      {Object.keys({ ...paydayData.summary.active, ...paydayData.summary.settled, ...paydayData.summary.projected }).map((cur) => (
                        <div key={cur}>{formatCents(paydayData.summary.projected[cur] || 0, cur)}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payday Cycle Google Calendar-style Single Agenda Timeline List */}
          <div className="bg-surface-warm border border-border-warm rounded-sm shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border-warm flex items-center justify-between bg-surface-raised/40">
              <h4 className="font-display font-bold text-[18px] text-text-primary">
                Payday Cycle Timeline
              </h4>
              <span className="text-[13px] font-mono text-text-secondary">
                {paydayData.merged.length} {paydayData.merged.length === 1 ? "item" : "items"} scheduled
              </span>
            </div>

            <div className="divide-y divide-border-warm">
              {paydayData.cycleDays.map((dayDate) => {
                const dStr = format(dayDate, "yyyy-MM-dd");
                const items = paydayData.byDate.get(dStr) || [];
                const holiday = holidaysMap.get(dStr);
                const isDayToday = dStr === todayStr;

                if (items.length === 0 && !holiday) return null;

                return (
                  <div key={dStr} className="divide-y divide-border-warm/60">
                    {/* Streamlined Inline Date Header Row */}
                    <div className="bg-surface-raised/80 px-4 py-2.5 flex items-center justify-between text-[13px] font-bold text-text-primary border-t first:border-t-0 border-border-warm">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{format(dayDate, "EEEE, MMM d, yyyy")}</span>
                        {isDayToday && (
                          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary text-white rounded-full">
                            Today
                          </span>
                        )}
                        {holiday && (
                          <span className="px-2 py-0.5 text-[11px] font-medium bg-surface-raised text-text-secondary border border-border-warm rounded-sm flex items-center gap-1">
                            <Palmtree className="w-3.5 h-3.5 text-text-secondary" />
                            <span>{holiday.name}</span>
                          </span>
                        )}
                      </div>
                      {items.length > 0 && (
                        <span className="text-[12px] font-normal text-text-secondary font-mono">
                          {items.length} {items.length === 1 ? "bill" : "bills"}
                        </span>
                      )}
                    </div>

                    {/* Flat Payment Rows directly under Date Header */}
                    {items.map((p) => {
                      const isSettled = !!p.paid_at;
                      const isProjected = p.id.startsWith("projected-");
                      const threshold = p.bill?.upcoming_threshold_days ?? currentAccount?.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS;
                      const { status, paidLateByDays, unpaidOverdueByDays } = getPaymentState(p, todayStr, threshold);
                      const daysUntilDue = differenceInDays(parseISO(p.due_date), parseISO(todayStr));
                      const isPaying = payMut.isPending && payMut.variables?.paymentId === p.id;

                      return (
                        <div
                          key={p.id}
                          className="px-4 py-3 bg-background-warm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-raised/40 transition-colors"
                        >
                          <div
                            onClick={() => setViewingPayment(p)}
                            className="cursor-pointer hover:opacity-80 transition-opacity flex-1"
                          >
                            <div className="text-[14px] md:text-[15px] font-semibold flex items-center gap-2 flex-wrap">
                              <span className={
                                isProjected
                                  ? "italic text-text-secondary font-medium"
                                  : status === "overdue"
                                  ? "text-error font-bold"
                                  : "text-text-primary"
                              }>
                                {p.bill?.name ?? "—"}
                              </span>
                              {isProjected && (
                                <span className="text-[9px] font-bold bg-[#E7E5E4] border border-[#D6D3D1] border-dashed text-text-secondary px-2 py-0.5 rounded-full uppercase tracking-wider italic">
                                  Projected
                                </span>
                              )}
                              {!isProjected && !isSettled && (
                                <span
                                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                                    status === "overdue"
                                      ? "bg-[#FEE2E2] text-error border border-[#FCA5A5]"
                                      : status === "due_soon"
                                      ? "bg-[#FEF3C7] text-warning border border-[#FDE68A]"
                                      : "bg-[#F5F5F4] text-text-secondary border border-[#D6D3D1]"
                                  }`}
                                >
                                  {status === "overdue" && <AlertCircle className="w-2.5 h-2.5" />}
                                  {status === "due_soon" && <Clock className="w-2.5 h-2.5" />}
                                  {status === "overdue"
                                    ? `Overdue by ${unpaidOverdueByDays} ${unpaidOverdueByDays === 1 ? "day" : "days"}`
                                    : daysUntilDue === 0
                                    ? "Due today"
                                    : `Due in ${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"}`}
                                </span>
                              )}
                              {isSettled && (
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-0.5 ${
                                  status === "paid_late"
                                    ? "bg-[#FEF3C7] text-warning border border-[#FDE68A]"
                                    : "bg-[#DCFCE7] text-success border border-[#BBF7D0]"
                                }`}>
                                  <Check className="w-2.5 h-2.5" />
                                  {status === "paid_late"
                                    ? `Late ${paidLateByDays} ${paidLateByDays === 1 ? "day" : "days"}`
                                    : "On Time"}
                                </span>
                              )}
                            </div>
                            {p.notes && (
                              <div className="text-[12px] text-text-secondary italic mt-0.5">
                                Note: {p.notes}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border-warm/40">
                            <span className={`text-[15px] font-mono font-semibold mr-1 ${
                              isProjected
                                ? "italic text-text-secondary font-medium"
                                : status === "overdue"
                                ? "text-error font-bold"
                                : "text-text-primary"
                            }`}>
                              {formatCents(p.amount_cents, p.bill?.currency ?? "USD")}
                            </span>

                            {isProjected ? (
                              <SplitButton
                                primaryLabel="Record Pay"
                                onPrimaryClick={() =>
                                  handlePay(
                                    p.id,
                                    p.bill?.name ?? "Bill",
                                    p.due_date,
                                    false,
                                    p.bill?.amount_cents ?? p.amount_cents,
                                    p.bill?.currency ?? "USD",
                                    true
                                  )
                                }
                                dropdownItems={
                                  <DropdownItem onClick={() => setViewingPayment(p)}>
                                    <Eye className="w-3.5 h-3.5 text-text-secondary" />
                                    <span>View Details</span>
                                  </DropdownItem>
                                }
                              />
                            ) : !isSettled ? (
                              <SplitButton
                                primaryLabel={isPaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Mark Paid"}
                                onPrimaryClick={() =>
                                  handlePay(
                                    p.id,
                                    p.bill?.name ?? "Bill",
                                    p.due_date,
                                    status === "upcoming",
                                    p.bill?.amount_cents ?? p.amount_cents,
                                    p.bill?.currency ?? "USD",
                                    false
                                  )
                                }
                                disabled={isPaying}
                                dropdownItems={
                                  <>
                                    <DropdownItem onClick={() => setViewingPayment(p)}>
                                      <Eye className="w-3.5 h-3.5 text-text-secondary" />
                                      <span>View Details</span>
                                    </DropdownItem>
                                    <DropdownItem onClick={() => handleEdit(p)}>
                                      <Edit3 className="w-3.5 h-3.5 text-text-secondary" />
                                      <span>Edit Payment</span>
                                    </DropdownItem>
                                  </>
                                }
                              />
                            ) : (
                              <Dropdown
                                align="right"
                                widthClass="w-40"
                                trigger={
                                  <button
                                    type="button"
                                    className="p-1.5 border border-border-warm bg-surface-raised hover:bg-stone-300/40 text-text-secondary rounded-sm transition-colors cursor-pointer"
                                    title="More options"
                                    aria-label="More options"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                }
                              >
                                <DropdownItem onClick={() => setViewingPayment(p)}>
                                  <Eye className="w-3.5 h-3.5 text-text-secondary" />
                                  <span>View Details</span>
                                </DropdownItem>
                                <DropdownItem onClick={() => handleEdit(p)}>
                                  <Edit3 className="w-3.5 h-3.5 text-text-secondary" />
                                  <span>Edit Payment</span>
                                </DropdownItem>
                              </Dropdown>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Calendar Header & Summary Card ────────────────── */}
          <div className="flex flex-col xl:flex-row xl:items-stretch gap-6">
            
            {/* Month Selector */}
            <div className="flex items-center justify-between xl:justify-start gap-4 bg-surface-warm border border-border-warm p-4 rounded-sm xl:w-96 shrink-0">
              <button
                type="button"
                onClick={() => handleMonthChange(subMonths(activeDate, 1))}
                className="p-2 border border-border-warm bg-background-warm rounded-sm transition-colors hover:bg-surface-raised cursor-pointer text-text-secondary"
                title="Previous Month"
                aria-label="Previous Month"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-center xl:flex-1">
                <h3 className="font-display font-bold text-[22px] text-text-primary capitalize leading-none">
                  {format(activeDate, "MMMM yyyy")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => handleMonthChange(addMonths(activeDate, 1))}
                className="p-2 border border-border-warm bg-background-warm rounded-sm transition-colors hover:bg-surface-raised cursor-pointer text-text-secondary"
                title="Next Month"
                aria-label="Next Month"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Totals Summary */}
            <div className="flex-1 bg-surface-warm border border-border-warm p-4 rounded-sm flex flex-col justify-center">
              <div className="flex items-center justify-between gap-4 mb-2">
                <div className="text-[12px] font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5 text-primary" /> Month Projections & Settle Status
                </div>
              </div>
              {activeCurrencies.length === 0 ? (
                <span className="text-[14px] text-text-secondary font-medium">No activity scheduled for this month.</span>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Active (Unpaid) */}
                  <div className="bg-background-warm border border-border-warm/60 p-3 rounded-sm">
                    <span className="text-[11px] font-semibold text-text-secondary block">ACTIVE (UNPAID)</span>
                    <div className="text-[16px] font-mono font-bold text-text-primary mt-1">
                      {activeCurrencies.map((cur) => (
                        <div key={cur}>{formatCents(monthlySummary.active[cur] || 0, cur)}</div>
                      ))}
                    </div>
                  </div>
                  {/* Settled (Paid) */}
                  <div className="bg-background-warm border border-border-warm/60 p-3 rounded-sm">
                    <span className="text-[11px] font-semibold text-text-secondary block">PAID (SETTLED)</span>
                    <div className="text-[16px] font-mono font-bold text-success mt-1">
                      {activeCurrencies.map((cur) => (
                        <div key={cur}>{formatCents(monthlySummary.settled[cur] || 0, cur)}</div>
                      ))}
                    </div>
                  </div>
                  {/* Projected */}
                  <div className="bg-background-warm border border-border-warm/60 p-3 rounded-sm">
                    <span className="text-[11px] font-semibold text-text-secondary block">PROJECTED FUTURE</span>
                    <div className="text-[16px] font-mono font-bold text-text-secondary mt-1 italic">
                      {activeCurrencies.map((cur) => (
                        <div key={cur}>{formatCents(monthlySummary.projected[cur] || 0, cur)}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

      {/* ── Main Calendar Content Grid ───────────────────── */}
      <div className="bg-surface-warm border border-border-warm rounded-sm shadow-sm overflow-visible select-none">
        
        {/* Grid Day Names Headers */}
        <div className="grid grid-cols-7 border-b border-border-warm bg-surface-raised text-center py-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        {/* 7x5 or 7x6 Day Cells Grid */}
        <div className="grid grid-cols-7 grid-rows-5 md:grid-rows-6 auto-rows-fr divide-x divide-y divide-border-warm bg-border-warm">
          {gridDays.map((day) => {
            const isCurrentMonth = isSameMonth(day, activeDate);
            const dateStr = format(day, "yyyy-MM-dd");
            const dayPayments = paymentsByDate.get(dateStr) || [];
            const isSelected = isSameDay(day, selectedDate);
            const isDayToday = isToday(day);

            const holiday = holidaysMap.get(dateStr);

            return (
              <div
                key={day.toString()}
                onClick={() => {
                  setSelectedDate(day);
                }}
                className={`bg-background-warm min-h-[56px] md:min-h-[110px] p-1.5 md:p-2.5 flex flex-col justify-between transition-colors relative cursor-pointer group/cell hover:z-20 ${
                  isCurrentMonth ? "" : "opacity-45 bg-[#FAFAF9]"
                } ${
                  isSelected ? "ring-2 ring-primary ring-inset z-10" : "hover:bg-surface-raised"
                }`}
              >
                {/* Cell header: Day number + Today indicator + Holiday badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[12px] md:text-[14px] font-mono font-bold ${
                        isDayToday
                          ? "bg-primary text-white w-6 h-6 flex items-center justify-center rounded-full shadow-sm"
                          : "text-text-primary"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {holiday && (
                      <span
                        title={holiday.name}
                        className="inline-flex items-center justify-center text-text-secondary bg-surface-raised border border-border-warm p-0.5 rounded-sm cursor-help shrink-0 select-none"
                      >
                        <Palmtree className="w-3 h-3 text-text-secondary" />
                      </span>
                    )}
                  </div>
                  
                  {/* Plus button on hover (Desktop only) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBlankDayClick(day);
                    }}
                    className="hidden md:group-hover/cell:flex p-0.5 hover:bg-surface-raised text-text-secondary hover:text-primary rounded-sm transition-colors cursor-pointer"
                    title="Add Bill starting this day"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Desktop Payments List */}
                <div className="hidden md:flex flex-col gap-1 mt-1.5 overflow-visible flex-1 justify-end">
                  {dayPayments.slice(0, 3).map((p) => {
                    const isSettled = !!p.paid_at;
                    const isProjected = p.id.startsWith("projected-");
                    const threshold = p.bill?.upcoming_threshold_days ?? currentAccount?.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS;
                    const { status } = getPaymentState(p, todayStr, threshold);

                    let badgeClass = "text-text-secondary bg-surface-raised border border-border-warm";
                    let prefixIcon = null;

                    const statusLabel = isProjected
                      ? "Projected"
                      : isSettled
                      ? "Paid"
                      : status === "overdue"
                      ? "Overdue"
                      : status === "due_soon"
                      ? "Due Soon"
                      : "Upcoming";

                    let statusBadgeColor = "text-text-secondary bg-surface-raised border border-border-warm";

                    if (isProjected) {
                      badgeClass = "text-text-secondary border border-dashed border-neutral bg-background-warm/30 italic";
                      statusBadgeColor = "text-text-secondary border border-dashed border-neutral bg-background-warm/30 italic";
                    } else if (status === "paid_late") {
                      badgeClass = "text-warning bg-[#FEF3C7]/40 border border-[#FDE68A]/60 line-through opacity-60";
                      statusBadgeColor = "text-warning bg-[#FEF3C7]/40 border border-[#FDE68A]/60 opacity-60";
                      prefixIcon = <Check className="w-2.5 h-2.5 shrink-0" />;
                    } else if (status === "paid") {
                      badgeClass = "text-success bg-[#DCFCE7]/40 border border-[#BBF7D0]/60 line-through opacity-60";
                      statusBadgeColor = "text-success bg-[#DCFCE7]/40 border border-[#BBF7D0]/60 opacity-60";
                      prefixIcon = <Check className="w-2.5 h-2.5 shrink-0" />;
                    } else if (status === "overdue") {
                      badgeClass = "text-error bg-[#FEE2E2]/60 border border-[#FCA5A5]/60 font-semibold";
                      statusBadgeColor = "text-error bg-[#FEE2E2]/60 border border-[#FCA5A5]/60 font-semibold";
                      prefixIcon = <AlertCircle className="w-2.5 h-2.5 shrink-0 animate-pulse" />;
                    } else if (status === "due_soon") {
                      badgeClass = "text-warning bg-[#FEF3C7]/60 border border-[#FDE68A]/60 font-semibold";
                      statusBadgeColor = "text-warning bg-[#FEF3C7]/60 border border-[#FDE68A]/60 font-semibold";
                      prefixIcon = <Clock className="w-2.5 h-2.5 shrink-0" />;
                    } else if (status === "upcoming") {
                      badgeClass = "text-text-secondary bg-[#F5F5F4] border border-[#D6D3D1] font-semibold";
                      statusBadgeColor = "text-text-secondary bg-[#F5F5F4] border border-[#D6D3D1] font-semibold";
                    }

                    return (
                      <div key={p.id} className="relative group w-full">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingPayment(p);
                          }}
                          className={`w-full flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-sm text-[11px] font-medium leading-none truncate cursor-pointer hover:brightness-95 transition-all ${badgeClass}`}
                        >
                          <span className="flex items-center gap-0.5 truncate">
                            {prefixIcon}
                            <span className="truncate">{p.bill?.name}</span>
                          </span>
                          <span className="font-mono text-[9px] shrink-0">
                            {formatCents(p.amount_cents, p.bill?.currency).replace(/\.00$/, "")}
                          </span>
                        </button>

                        {/* Hover Popup Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 w-64 bg-surface-warm border border-border-warm rounded-sm shadow-md p-3 text-left pointer-events-none animate-fadeIn select-text">
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-surface-warm" />
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-border-warm -z-10 mt-[1px]" />

                          <div className="space-y-1.5 text-text-primary text-[12px] font-body">
                            <div className="flex items-center justify-between gap-2 border-b border-border-warm/60 pb-1.5">
                              <h5 className="font-display font-bold text-[14px] leading-tight truncate">
                                {p.bill?.name ?? "Bill"}
                              </h5>
                              <span className="font-mono font-semibold text-[13px] shrink-0 text-text-primary">
                                {formatCents(p.amount_cents, p.bill?.currency ?? "USD")}
                              </span>
                            </div>

                            <div>
                              <span className="text-text-secondary font-semibold">Due: </span>
                              <span className="font-mono font-medium">{formatDateStr(p.due_date)}</span>
                            </div>

                            {isSettled && p.paid_at && (
                              <div>
                                <span className="text-success font-semibold">Paid: </span>
                                <span className="font-mono font-medium text-success">
                                  {formatDateStr(new Date(p.paid_at * 1000).toISOString().split("T")[0])}
                                </span>
                              </div>
                            )}

                            <div>
                              <span className="text-text-secondary font-semibold">Status: </span>
                              <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-sm ${statusBadgeColor}`}>
                                {statusLabel}
                              </span>
                            </div>

                            {p.bill?.recurrence && (
                              <div className="text-[11px] text-text-secondary font-medium">
                                Recurrence: <span className="capitalize">{p.bill.recurrence.type}</span>
                              </div>
                            )}

                            {p.notes && (
                              <div className="text-[11px] text-text-secondary italic border-t border-border-warm/40 pt-1.5 mt-1">
                                &quot;{p.notes}&quot;
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {dayPayments.length > 3 && (
                    <span className="text-[9px] font-bold text-text-secondary px-1 py-0.5 text-right uppercase tracking-wider block">
                      +{dayPayments.length - 3} more
                    </span>
                  )}
                </div>

                {/* Mobile Dot Indicators */}
                <div className="flex md:hidden items-center justify-center gap-0.5 mt-1">
                  {dayPayments.map((p) => {
                    const isProjected = p.id.startsWith("projected-");
                    const threshold = p.bill?.upcoming_threshold_days ?? currentAccount?.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS;
                    const { status } = getPaymentState(p, todayStr, threshold);

                    let dotClass = "bg-neutral";
                    if (isProjected) {
                      dotClass = "bg-neutral border border-dashed border-stone-600 bg-transparent";
                    } else if (status === "paid_late") {
                      dotClass = "bg-warning opacity-70";
                    } else if (status === "paid") {
                      dotClass = "bg-success";
                    } else if (status === "overdue") {
                      dotClass = "bg-error animate-pulse";
                    } else if (status === "due_soon") {
                      dotClass = "bg-warning";
                    } else if (status === "upcoming") {
                      dotClass = "bg-primary";
                    }

                    return (
                      <span
                        key={p.id}
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`}
                      />
                    );
                  })}
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* ── Daily Agenda Details Section (Responsive) ────── */}
      <div className="bg-surface-warm border border-border-warm rounded-sm p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-warm pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary shrink-0" />
            <h4 className="font-display font-bold text-[18px] text-text-primary">
              Payments due on {formatDatePretty(selectedDate)}
            </h4>
          </div>
          <Button
            variant="secondary"
            size="small"
            onClick={() => handleBlankDayClick(selectedDate)}
            className="self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Bill
          </Button>
        </div>

        {holidaysMap.get(selectedDateStr) && (
          <div className="p-3 rounded-sm bg-surface-raised border border-border-warm text-text-secondary text-[13px] font-body flex items-center gap-2 animate-fadeIn">
            <Palmtree className="w-4 h-4 text-text-secondary shrink-0" />
            <strong className="font-semibold text-text-primary">{holidaysMap.get(selectedDateStr)!.name}</strong>
          </div>
        )}

        {selectedDayPayments.length === 0 ? (
          <p className="text-[14px] text-text-secondary font-medium py-4 text-center">
            No payments scheduled for this date.
          </p>
        ) : (
          <div className="divide-y divide-border-warm">
            {selectedDayPayments.map((p) => {
              const isSettled = !!p.paid_at;
              const isProjected = p.id.startsWith("projected-");
              const threshold = p.bill?.upcoming_threshold_days ?? currentAccount?.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS;
              const { status, paidLateByDays, unpaidOverdueByDays } = getPaymentState(p, todayStr, threshold);
              const daysUntilDue = differenceInDays(parseISO(p.due_date), parseISO(todayStr));
              const isPaying = payMut.isPending && payMut.variables?.paymentId === p.id;

              return (
                <div
                  key={p.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0"
                >
                  <div
                    onClick={() => setViewingPayment(p)}
                    className="cursor-pointer hover:opacity-80 transition-opacity flex-1"
                  >
                    <div className="text-[15px] font-semibold flex items-center gap-2 flex-wrap">
                      <span className={
                        isProjected
                          ? "italic text-text-secondary font-medium"
                          : status === "overdue"
                          ? "text-error font-bold"
                          : "text-text-primary"
                      }>
                        {p.bill?.name ?? "—"}
                      </span>
                      {isProjected && (
                        <span className="text-[9px] font-bold bg-[#E7E5E4] border border-[#D6D3D1] border-dashed text-text-secondary px-2 py-0.5 rounded-full uppercase tracking-wider italic">
                          Projected
                        </span>
                      )}
                      {!isProjected && !isSettled && (
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                            status === "overdue"
                              ? "bg-[#FEE2E2] text-error border border-[#FCA5A5]"
                              : status === "due_soon"
                              ? "bg-[#FEF3C7] text-warning border border-[#FDE68A]"
                              : "bg-[#F5F5F4] text-text-secondary border border-[#D6D3D1]"
                          }`}
                        >
                          {status === "overdue" && <AlertCircle className="w-2.5 h-2.5" />}
                          {status === "due_soon" && <Clock className="w-2.5 h-2.5" />}
                          {status === "overdue"
                            ? `Overdue by ${unpaidOverdueByDays} ${unpaidOverdueByDays === 1 ? "day" : "days"}`
                            : daysUntilDue === 0
                            ? "Due today"
                            : `Due in ${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"}`}
                        </span>
                      )}
                      {isSettled && (
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-0.5 ${
                          status === "paid_late"
                            ? "bg-[#FEF3C7] text-warning border border-[#FDE68A]"
                            : "bg-[#DCFCE7] text-success border border-[#BBF7D0]"
                        }`}>
                          <Check className="w-2.5 h-2.5" />
                          {status === "paid_late"
                            ? `Late ${paidLateByDays} ${paidLateByDays === 1 ? "day" : "days"}`
                            : "On Time"}
                        </span>
                      )}
                    </div>
                    {isSettled && (
                      <div className="text-[12px] text-text-secondary font-mono mt-0.5">
                        Paid on {formatDateStr(new Date(p.paid_at! * 1000).toISOString().split("T")[0])}
                      </div>
                    )}
                    {p.notes && (
                      <div className="text-[13px] text-text-secondary italic mt-1 max-w-lg">
                        Note: {p.notes}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border-warm/40">
                    <span className={`text-[15px] font-mono font-semibold ${
                      isProjected
                        ? "italic text-text-secondary font-medium"
                        : status === "overdue"
                        ? "text-error font-bold"
                        : "text-text-primary"
                    }`}>
                      {formatCents(p.amount_cents, p.bill?.currency ?? "USD")}
                    </span>

                    {/* Action buttons */}
                    {isProjected ? (
                      <Button
                        variant="primary"
                        size="small"
                        onClick={() =>
                          handlePay(
                            p.id,
                            p.bill?.name ?? "Bill",
                            p.due_date,
                            false,
                            p.bill?.amount_cents ?? p.amount_cents,
                            p.bill?.currency ?? "USD",
                            true
                          )
                        }
                      >
                        Record Pay
                      </Button>
                    ) : !isSettled ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="primary"
                          size="small"
                          disabled={isPaying}
                          onClick={() =>
                            handlePay(
                              p.id,
                              p.bill?.name ?? "Bill",
                              p.due_date,
                              status === "upcoming",
                              p.bill?.amount_cents ?? p.amount_cents,
                              p.bill?.currency ?? "USD",
                              false
                            )
                          }
                        >
                          {isPaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Mark Paid"}
                        </Button>
                        <Button variant="secondary" size="small" onClick={() => handleEdit(p)}>
                          Edit
                        </Button>
                      </div>
                    ) : (
                      <Button variant="secondary" size="small" onClick={() => handleEdit(p)}>
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  )}

      {/* ── Action Modals ────────────────────────────────── */}

      {payingPayment && (
        <PayPaymentModal
          billName={payingPayment.name}
          dueDate={payingPayment.dueDate}
          isUpcoming={payingPayment.isUpcoming}
          amountCents={payingPayment.amountCents}
          currency={payingPayment.currency}
          onConfirm={handlePayConfirm}
          onClose={() => setPayingPayment(null)}
          isSubmitting={payMut.isPending || createPaymentMut.isPending}
        />
      )}

      {editingPayment && (
        <PayPaymentModal
          billName={editingPayment.billName}
          dueDate={editingPayment.dueDate}
          isUpcoming={false}
          amountCents={editingPayment.amountCents}
          currency={editingPayment.currency}
          isEditing={true}
          initialNotes={editingPayment.notes}
          paidAtDate={editingPayment.paidAtDate}
          onConfirm={handleEditConfirm}
          onClose={() => setEditingPayment(null)}
          onDelete={handleEditDelete}
          isSubmitting={updateMut.isPending || deleteMut.isPending}
        />
      )}

      {viewingPayment && (
        <PaymentDetailsModal
          payment={viewingPayment}
          upcomingThreshold={currentAccount?.upcoming_threshold_days}
          onClose={() => setViewingPayment(null)}
          onEdit={() => {
            const p = viewingPayment;
            setViewingPayment(null);
            handleEdit(p);
          }}
          onPay={() => {
            const p = viewingPayment;
            setViewingPayment(null);
            const threshold = p.bill?.upcoming_threshold_days ?? currentAccount?.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS;
            const { status } = getPaymentState(p, todayStr, threshold);
            handlePay(
              p.id,
              p.bill?.name ?? "Bill",
              p.due_date,
              status === "upcoming",
              p.bill?.amount_cents ?? p.amount_cents,
              p.bill?.currency ?? "USD",
              p.id.startsWith("projected-")
            );
          }}
        />
      )}

    </div>
  );
}
