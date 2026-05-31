import { db } from "./trailbase";
import { calculateNextDueDate } from "@hornbill/core";
import type { Payment, Bill } from "@hornbill/core";

/**
 * Handles the generation of the next payment cycle for a specific bill.
 * Ensures idempotency and enforces core business invariants.
 */
export async function generateNextPaymentForBill(billId: string): Promise<Payment | null> {
  const bill = await db.getBill(billId);

  // Invariant 1: Bill must be active to generate payments
  if (!bill.active) {
    throw new Error("Cannot create payment for inactive bill");
  }

  // Invariant 2: Idempotency check. Check if an unpaid payment already exists.
  const payments = await db.listPayments(billId);
  const unpaidPayment = payments.find((p) => p.paid_at === null || p.paid_at === undefined);
  if (unpaidPayment) {
    // If an unpaid payment already exists, we do not create a new one.
    return null;
  }

  // Determine latest paid payment
  const paidPayments = payments
    .filter((p) => p.paid_at !== null && p.paid_at !== undefined)
    .sort((a, b) => b.due_date.localeCompare(a.due_date)); // Sort descending to get latest

  const latestPaid = paidPayments[0];

  // If there are absolutely NO payments at all (first cycle), the target due date is the bill's start_date.
  // Otherwise, use the recurrence strategy to calculate it.
  let newDueDate: string;
  if (payments.length === 0) {
    newDueDate = bill.start_date;
  } else {
    newDueDate = calculateNextDueDate(bill, latestPaid);
  }

  // Create the new unpaid payment
  const newPayment = await db.createPayment({
    id: crypto.randomUUID(),
    bill_id: bill.id,
    due_date: newDueDate,
    amount_cents: bill.amount_cents,
    paid_at: null,
    notes: null,
  });

  return newPayment;
}

/**
 * Settles an outstanding payment, marking it as paid and automatically
 * generating the next payment cycle.
 */
export async function settlePayment(paymentId: string, paidAtVal?: number): Promise<Payment> {
  const payment = await db.getPayment(paymentId);
  if (payment.paid_at) {
    throw new Error("Payment is already settled");
  }

  const paidAt = paidAtVal !== undefined ? paidAtVal : Math.floor(Date.now() / 1000);
  
  // 1. Mark current payment as settled
  const updatedPayment = await db.updatePayment(paymentId, {
    paid_at: paidAt,
  });

  // 2. Generate the next payment cycle automatically
  try {
    await generateNextPaymentForBill(payment.bill_id);
  } catch (err) {
    // Log error but don't fail the settlement of the current payment
    console.error(`Failed to generate next payment cycle for bill ${payment.bill_id}:`, err);
  }

  return updatedPayment;
}

/**
 * Scanning daemon to check all active bills. If a bill is missing an unpaid payment,
 * it generates the next payment in the cycle.
 */
export async function syncAllPayments(): Promise<{ processed: number; generated: number }> {
  const bills = await db.listBills();
  const activeBills = bills.filter((b) => b.active);

  let processed = 0;
  let generated = 0;

  for (const bill of activeBills) {
    try {
      processed++;
      const created = await generateNextPaymentForBill(bill.id);
      if (created) {
        generated++;
      }
    } catch (err) {
      console.error(`Failed syncing payment for bill ${bill.name} (${bill.id}):`, err);
    }
  }

  return { processed, generated };
}
