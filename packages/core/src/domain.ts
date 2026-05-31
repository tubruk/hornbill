import { differenceInDays, parseISO, format, addDays, addMonths, endOfMonth, setDate } from "date-fns";
import type { Bill, Payment } from "./types";

/**
 * Calculates the next due date based on the Bill recurrence strategy and its latest paid payment.
 * 
 * @param bill The active bill configuration
 * @param latestPaidPayment The most recent paid payment record (if any)
 * @returns Next due date as a ISO-8601 Date string (YYYY-MM-DD)
 */
export function calculateNextDueDate(bill: Bill, latestPaidPayment?: Payment): string {
  // 1. Determine Base Date:
  // - If interval unit recurrence and configured to run from "paid_at", use paid_at date.
  // - Else if there's a paid payment, use its due_date.
  // - Otherwise, use the bill start_date.
  const baseDateString = latestPaidPayment 
    ? (bill.recurrence.type === "interval" && bill.recurrence.interval.from === "paid_at" && latestPaidPayment.paid_at
        ? format(new Date(latestPaidPayment.paid_at * 1000), "yyyy-MM-dd")
        : latestPaidPayment.due_date)
    : bill.start_date;

  const baseDate = parseISO(baseDateString);
  const recurrence = bill.recurrence;

  switch (recurrence.type) {
    case "monthly": {
      // Shift base date to the next calendar month
      const targetMonth = addMonths(baseDate, 1);
      const targetDay = recurrence.monthly.day;
      
      // Determine the target due day: clamp to the last day of the month if invalid (e.g. 31 in Feb)
      const lastDayOfTargetMonth = endOfMonth(targetMonth).getDate();
      const finalDay = Math.min(targetDay, lastDayOfTargetMonth);
      
      return format(setDate(targetMonth, finalDay), "yyyy-MM-dd");
    }
    
    case "yearly": {
      // Set the target year to base_date.year + 1 and target month to the configured month
      const nextYear = baseDate.getFullYear() + 1;
      const targetMonth = recurrence.yearly.month - 1; // JS Date months are 0-indexed (Jan is 0)
      const targetDay = recurrence.yearly.day;
      
      let targetDate = new Date(nextYear, targetMonth, 1);
      const lastDayOfTargetMonth = endOfMonth(targetDate).getDate();
      const finalDay = Math.min(targetDay, lastDayOfTargetMonth);
      
      targetDate = setDate(targetDate, finalDay);
      return format(targetDate, "yyyy-MM-dd");
    }

    case "interval": {
      // If there are no paid payments, next due date is just the bill's start_date
      if (!latestPaidPayment) {
        return bill.start_date;
      }
      
      const { every, unit } = recurrence.interval;
      let nextDate = baseDate;
      
      if (unit === "days") {
        nextDate = addDays(baseDate, every);
      } else if (unit === "weeks") {
        nextDate = addDays(baseDate, every * 7);
      } else if (unit === "months") {
        nextDate = addMonths(baseDate, every);
      }
      
      return format(nextDate, "yyyy-MM-dd");
    }
  }
}

export type DerivedPaymentStatus = "paid" | "paid_late" | "overdue" | "unpaid";

export interface DerivedPaymentState {
  status: DerivedPaymentStatus;
  paidLate: boolean;
  paidLateByDays: number;
  unpaidOverdueByDays: number;
}

/**
 * Derives payment state and metrics relative to a specific "today" date.
 * 
 * @param payment The payment details
 * @param todayStr Target reference date string (defaults to today in local YYYY-MM-DD)
 */
export function getPaymentState(payment: Payment, todayStr: string = format(new Date(), "yyyy-MM-dd")): DerivedPaymentState {
  const isPaid = payment.paid_at !== null && payment.paid_at !== undefined;
  const isOverdue = !isPaid && payment.due_date < todayStr;
  
  let paidLate = false;
  let paidLateByDays = 0;
  let unpaidOverdueByDays = 0;

  if (isPaid && payment.paid_at) {
    const paidDateOnly = format(new Date(payment.paid_at * 1000), "yyyy-MM-dd");
    if (paidDateOnly > payment.due_date) {
      paidLate = true;
      paidLateByDays = differenceInDays(parseISO(paidDateOnly), parseISO(payment.due_date));
    }
  }

  if (isOverdue) {
    unpaidOverdueByDays = differenceInDays(parseISO(todayStr), parseISO(payment.due_date));
  }

  return {
    status: isPaid ? (paidLate ? "paid_late" : "paid") : (isOverdue ? "overdue" : "unpaid"),
    paidLate,
    paidLateByDays,
    unpaidOverdueByDays,
  };
}
