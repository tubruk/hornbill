import type { PaydayConfig, PaydayAdjustment, PayPeriodBounds } from "./types";

/**
 * Format a Date object to YYYY-MM-DD string in local/UTC date representation.
 */
export function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse YYYY-MM-DD string into a Date object at midnight UTC.
 */
export function parseDateStr(dateStr: string): Date {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0] ?? 2026;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(year, month - 1, day);
}

/**
 * Check if a given Date is a non-working day (Saturday, Sunday, or in holiday set).
 */
export function isNonWorkingDay(date: Date, holidayDates: Set<string>): boolean {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  const dateStr = formatDateStr(date);
  return dayOfWeek === 0 || dayOfWeek === 6 || holidayDates.has(dateStr);
}

/**
 * Get the actual shifted payday for a target nominal date YYYY-MM-DD.
 */
export function getActualPayday(
  nominalDateStr: string,
  adjustment: PaydayAdjustment,
  holidayDates: Set<string>
): string {
  const date = parseDateStr(nominalDateStr);

  if (adjustment === "exact_date") {
    return formatDateStr(date);
  }

  const step = adjustment === "previous_working_day" ? -1 : 1;

  while (isNonWorkingDay(date, holidayDates)) {
    date.setDate(date.getDate() + step);
  }

  return formatDateStr(date);
}

/**
 * Helper to compute nominal payday for a specific year, month (1-indexed), and target day of month.
 * Automatically caps day of month to last day of month if necessary (e.g. Feb 30 -> Feb 28/29).
 */
function getNominalMonthlyDate(year: number, month: number, targetDay: number): string {
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const day = Math.min(targetDay, lastDayOfMonth);
  const mStr = String(month).padStart(2, "0");
  const dStr = String(day).padStart(2, "0");
  return `${year}-${mStr}-${dStr}`;
}

/**
 * Subtract 1 day from YYYY-MM-DD string.
 */
export function getPreviousDayStr(dateStr: string): string {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() - 1);
  return formatDateStr(d);
}

/**
 * Compute current PayPeriod bounds for a reference date given PaydayConfig and holiday set.
 */
export function getPayPeriodBounds(
  referenceDateStr: string,
  config: PaydayConfig,
  holidayDates: Set<string> = new Set()
): PayPeriodBounds {
  const refDate = parseDateStr(referenceDateStr);
  const refYear = refDate.getFullYear();
  const refMonth = refDate.getMonth() + 1; // 1-indexed

  const adjustment = config.adjustment ?? "previous_working_day";
  const dayOfMonth = config.day_of_month ?? 25;

  if (config.frequency === "monthly" || !config.frequency) {
    // 1. Calculate shifted payday for current month (M)
    const nominalCurrentMonth = getNominalMonthlyDate(refYear, refMonth, dayOfMonth);
    const actualCurrentMonth = getActualPayday(nominalCurrentMonth, adjustment, holidayDates);

    let startPayday: string;
    let nextPayday: string;

    if (referenceDateStr >= actualCurrentMonth) {
      // We are on or after current month's payday -> Cycle runs from actualCurrentMonth to next month's payday
      startPayday = actualCurrentMonth;

      const nextMonthYear = refMonth === 12 ? refYear + 1 : refYear;
      const nextMonth = refMonth === 12 ? 1 : refMonth + 1;
      const nominalNextMonth = getNominalMonthlyDate(nextMonthYear, nextMonth, dayOfMonth);
      nextPayday = getActualPayday(nominalNextMonth, adjustment, holidayDates);
    } else {
      // We are before current month's payday -> Cycle runs from previous month's payday to actualCurrentMonth
      nextPayday = actualCurrentMonth;

      const prevMonthYear = refMonth === 1 ? refYear - 1 : refYear;
      const prevMonth = refMonth === 1 ? 12 : refMonth - 1;
      const nominalPrevMonth = getNominalMonthlyDate(prevMonthYear, prevMonth, dayOfMonth);
      startPayday = getActualPayday(nominalPrevMonth, adjustment, holidayDates);
    }

    return {
      start_date: startPayday,
      end_date: getPreviousDayStr(nextPayday),
      next_payday: nextPayday,
    };
  }

  if (config.frequency === "weekly" || config.frequency === "bi_weekly") {
    const intervalDays = config.frequency === "weekly" ? 7 : 14;
    const nominalCurrent = getNominalMonthlyDate(refYear, refMonth, dayOfMonth);
    const actualCurrent = getActualPayday(nominalCurrent, adjustment, holidayDates);

    let startP: string;
    let nextP: string;

    if (referenceDateStr >= actualCurrent) {
      startP = actualCurrent;
      const nextDate = parseDateStr(actualCurrent);
      nextDate.setDate(nextDate.getDate() + intervalDays);
      nextP = getActualPayday(formatDateStr(nextDate), adjustment, holidayDates);
    } else {
      nextP = actualCurrent;
      const prevDate = parseDateStr(actualCurrent);
      prevDate.setDate(prevDate.getDate() - intervalDays);
      startP = getActualPayday(formatDateStr(prevDate), adjustment, holidayDates);
    }

    return {
      start_date: startP,
      end_date: getPreviousDayStr(nextP),
      next_payday: nextP,
    };
  }

  // Default monthly calculation
  const nominalCurrent = getNominalMonthlyDate(refYear, refMonth, dayOfMonth);
  const actualCurrent = getActualPayday(nominalCurrent, adjustment, holidayDates);

  let startP: string;
  let nextP: string;

  if (referenceDateStr >= actualCurrent) {
    startP = actualCurrent;
    const nY = refMonth === 12 ? refYear + 1 : refYear;
    const nM = refMonth === 12 ? 1 : refMonth + 1;
    nextP = getActualPayday(getNominalMonthlyDate(nY, nM, dayOfMonth), adjustment, holidayDates);
  } else {
    nextP = actualCurrent;
    const pY = refMonth === 1 ? refYear - 1 : refYear;
    const pM = refMonth === 1 ? 12 : refMonth - 1;
    startP = getActualPayday(getNominalMonthlyDate(pY, pM, dayOfMonth), adjustment, holidayDates);
  }

  return {
    start_date: startP,
    end_date: getPreviousDayStr(nextP),
    next_payday: nextP,
  };
}

/**
 * Parse an iCal (.ics) string to extract all-day holiday dates and event summary titles.
 */
export function parseIcsHolidays(icsContent: string): Array<{ date: string; name: string }> {
  const holidays: Array<{ date: string; name: string }> = [];
  const lines = icsContent.split(/\r?\n/);

  let inVevent = false;
  let dtStartStr: string | null = null;
  let summaryStr: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "BEGIN:VEVENT") {
      inVevent = true;
      dtStartStr = null;
      summaryStr = null;
      continue;
    }

    if (trimmed === "END:VEVENT") {
      if (inVevent && dtStartStr) {
        // Extract YYYY-MM-DD from DTSTART
        const rawDate = dtStartStr.replace(/[^0-9]/g, "").slice(0, 8);
        if (rawDate.length === 8) {
          const formattedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
          holidays.push({
            date: formattedDate,
            name: summaryStr && summaryStr.length > 0 ? summaryStr : "Public Holiday",
          });
        }
      }
      inVevent = false;
      dtStartStr = null;
      summaryStr = null;
      continue;
    }

    if (inVevent) {
      if (trimmed.startsWith("DTSTART")) {
        const parts = trimmed.split(":");
        dtStartStr = parts[parts.length - 1] ?? null;
      } else if (trimmed.startsWith("SUMMARY")) {
        const parts = trimmed.split(":");
        summaryStr = parts.slice(1).join(":").trim();
      }
    }
  }

  return holidays;
}
