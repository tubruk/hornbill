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
export async function settlePayment(paymentId: string, paidAtVal?: number, amountCentsVal?: number): Promise<Payment> {
  const payment = await db.getPayment(paymentId);
  if (payment.paid_at) {
    throw new Error("Payment is already settled");
  }

  const paidAt = paidAtVal !== undefined ? paidAtVal : Math.floor(Date.now() / 1000);
  
  // Validation: payment date must never be before the latest paid payment of the same bill
  // or before the bill's start date if there are no past payments.
  const bill = await db.getBill(payment.bill_id);
  const payments = await db.listPayments(payment.bill_id);
  const paidPayments = payments
    .filter((p) => p.id !== paymentId && p.paid_at !== null && p.paid_at !== undefined)
    .sort((a, b) => b.due_date.localeCompare(a.due_date));

  const latestPaid = paidPayments[0];
  if (latestPaid && latestPaid.paid_at) {
    if (paidAt < latestPaid.paid_at) {
      const formattedLatestPaid = new Date(latestPaid.paid_at * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      throw new Error(`Payment date cannot be before the latest payment date (${formattedLatestPaid})`);
    }
  } else {
    const billStartEpoch = Math.floor(new Date(bill.start_date + "T00:00:00").getTime() / 1000);
    if (paidAt < billStartEpoch) {
      const formattedStartDate = new Date(bill.start_date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      throw new Error(`Payment date cannot be before the bill start date (${formattedStartDate})`);
    }
  }
  
  // 1. Mark current payment as settled
  const updates: Partial<Omit<Payment, "id" | "created_at" | "updated_at">> = {
    paid_at: paidAt,
  };
  if (amountCentsVal !== undefined) {
    updates.amount_cents = amountCentsVal;
  }

  const updatedPayment = await db.updatePayment(paymentId, updates);

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

/**
 * Handles all payment-related side effects when a bill is updated.
 */
export async function handleBillUpdateSideEffects(
  billId: string,
  oldBill: Bill,
  updatedBill: Bill
): Promise<void> {
  const payments = await db.listPayments(billId);
  const unpaidPayment = payments.find((p) => p.paid_at === null || p.paid_at === undefined);

  // 1. If deactivated: delete any outstanding unpaid payment
  if (oldBill.active && !updatedBill.active) {
    if (unpaidPayment) {
      await db.deletePayment(unpaidPayment.id);
    }
    return;
  }

  // 2. If active and there is an outstanding unpaid payment, sync its amount or due date
  if (updatedBill.active && unpaidPayment) {
    let needsUpdate = false;
    const updates: Partial<Omit<Payment, "id" | "created_at" | "updated_at">> = {};

    // Sync amount if changed
    if (oldBill.amount_cents !== updatedBill.amount_cents) {
      updates.amount_cents = updatedBill.amount_cents;
      needsUpdate = true;
    }

    // Sync due date if recurrence changed
    const oldRecurStr = JSON.stringify(oldBill.recurrence);
    const newRecurStr = JSON.stringify(updatedBill.recurrence);
    if (oldRecurStr !== newRecurStr) {
      const paidPayments = payments
        .filter((p) => p.paid_at !== null && p.paid_at !== undefined)
        .sort((a, b) => b.due_date.localeCompare(a.due_date));
      
      let newDueDate: string;
      if (paidPayments.length === 0) {
        newDueDate = updatedBill.start_date;
      } else {
        newDueDate = calculateNextDueDate(updatedBill, paidPayments[0]);
      }
      
      updates.due_date = newDueDate;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await db.updatePayment(unpaidPayment.id, updates);
    }
  }

  // 3. If reactivated, check/generate initial/next cycle payment
  if (!oldBill.active && updatedBill.active) {
    await generateNextPaymentForBill(billId);
  }
}
