import { db, TrailbaseClient } from "./trailbase";
import { calculateNextDueDate } from "@hornbill/core";
import type { Payment, Bill } from "@hornbill/core";

/**
 * Handles the generation of the next payment cycle for a specific bill.
 * Ensures idempotency and enforces core business invariants.
 */
export async function generateNextPaymentForBill(billId: string, client: TrailbaseClient = db): Promise<Payment | null> {
  const bill = await client.getBill(billId);

  // Invariant 1: Bill must be active to generate payments
  if (!bill.active) {
    throw new Error("Cannot create payment for inactive bill");
  }

  const payments = await client.listPayments(billId);
  
  // Sort payments descending by due_date to find the latest payment overall
  const sortedPayments = [...payments].sort((a, b) => b.due_date.localeCompare(a.due_date));
  const latestPayment = sortedPayments[0];

  // Invariant 2: Idempotency check. If the latest payment overall is unpaid, do a no-op.
  if (latestPayment && (latestPayment.paid_at === null || latestPayment.paid_at === undefined)) {
    return null;
  }

  // If there are absolutely NO payments at all (first cycle), the target due date is the bill's start_date.
  // Otherwise, use the recurrence strategy to calculate it from the latest payment (which is paid).
  let newDueDate: string;
  if (!latestPayment) {
    newDueDate = bill.start_date;
  } else {
    newDueDate = calculateNextDueDate(bill, latestPayment);
  }

  // Check if a payment for this due date already exists to prevent duplicate generation
  const duplicatePayment = payments.find((p) => p.due_date === newDueDate);
  if (duplicatePayment) {
    return null;
  }

  // Create the new unpaid payment
  const newPayment = await client.createPayment({
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
export async function settlePayment(
  paymentId: string,
  paidAtVal?: number,
  amountCentsVal?: number,
  notesVal?: string | null,
  client: TrailbaseClient = db
): Promise<Payment> {
  const payment = await client.getPayment(paymentId);
  if (payment.paid_at) {
    throw new Error("Payment is already settled");
  }

  const paidAt = paidAtVal !== undefined ? paidAtVal : Math.floor(Date.now() / 1000);
  
  // 1. Mark current payment as settled
  const updates: Partial<Omit<Payment, "id" | "created_at" | "updated_at">> = {
    paid_at: paidAt,
  };
  if (amountCentsVal !== undefined) {
    updates.amount_cents = amountCentsVal;
  }
  if (notesVal !== undefined) {
    updates.notes = notesVal;
  }

  const updatedPayment = await client.updatePayment(paymentId, updates);

  // 2. Generate the next payment cycle automatically
  try {
    await generateNextPaymentForBill(payment.bill_id, client);
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
export async function syncAllPayments(accountId?: string, client: TrailbaseClient = db): Promise<{ processed: number; generated: number }> {
  // Retrieve all bills, then optionally filter by accountId
  const allBills = await client.listBills();
  const filteredBills = accountId ? allBills.filter((b) => b.account_id === accountId) : allBills;
  const activeBills = filteredBills.filter((b) => b.active);

  let processed = 0;
  let generated = 0;

  for (const bill of activeBills) {
    try {
      processed++;
      const created = await generateNextPaymentForBill(bill.id, client);
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
  updatedBill: Bill,
  client: TrailbaseClient = db
): Promise<void> {
  const payments = await client.listPayments(billId);
  const unpaidPayments = payments
    .filter((p) => p.paid_at === null || p.paid_at === undefined)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  // 1. If deactivated: delete all outstanding unpaid payments
  if (oldBill.active && !updatedBill.active) {
    for (const p of unpaidPayments) {
      await client.deletePayment(p.id);
    }
    return;
  }

  // 2. If active and there are outstanding unpaid payments, sync their amount or due date sequentially
  if (updatedBill.active && unpaidPayments.length > 0) {
    const oldRecurStr = JSON.stringify(oldBill.recurrence);
    const newRecurStr = JSON.stringify(updatedBill.recurrence);
    const recurrenceChanged = oldRecurStr !== newRecurStr;
    const amountChanged = oldBill.amount_cents !== updatedBill.amount_cents;

    if (amountChanged || recurrenceChanged) {
      const paidPayments = payments
        .filter((p) => p.paid_at !== null && p.paid_at !== undefined)
        .sort((a, b) => b.due_date.localeCompare(a.due_date));

      let currentReferencePayment = paidPayments[0];

      for (const unpaid of unpaidPayments) {
        const updates: Partial<Omit<Payment, "id" | "created_at" | "updated_at">> = {};
        
        if (amountChanged) {
          updates.amount_cents = updatedBill.amount_cents;
        }

        if (recurrenceChanged) {
          let newDueDate: string;
          if (!currentReferencePayment) {
            newDueDate = updatedBill.start_date;
          } else {
            newDueDate = calculateNextDueDate(updatedBill, currentReferencePayment);
          }
          updates.due_date = newDueDate;
          
          // For the next unpaid payment in the loop, this payment becomes the new reference
          currentReferencePayment = {
            ...unpaid,
            due_date: newDueDate,
          };
        }

        await client.updatePayment(unpaid.id, updates);
      }
    }
  }

  // 3. If reactivated, check/generate initial/next cycle payment
  if (!oldBill.active && updatedBill.active) {
    await generateNextPaymentForBill(billId, client);
  }
}

/**
 * Handles payment-related side effects when a payment is created.
 * Specifically, if a paid payment is created and its due date is newer than the previous latest
 * paid payment, it updates the next upcoming unpaid payment's due date.
 * If no unpaid payment exists, it generates a new unpaid upcoming payment.
 */
export async function handlePaymentCreationSideEffects(payment: Payment, client: TrailbaseClient = db): Promise<void> {
  if (payment.paid_at === null || payment.paid_at === undefined) {
    return;
  }
  const billId = payment.bill_id;
  const bill = await client.getBill(billId);
  if (!bill.active) {
    return;
  }
  const payments = await client.listPayments(billId);
  const unpaidPayment = payments.find((p) => p.paid_at === null || p.paid_at === undefined);

  // Sort paid payments descending by due_date to find the latest
  const paidPayments = payments
    .filter((p) => p.paid_at !== null && p.paid_at !== undefined)
    .sort((a, b) => b.due_date.localeCompare(a.due_date));

  const latestPaid = paidPayments[0];

  if (unpaidPayment) {
    // Recalculate due date of existing unpaid payment based on new latestPaid
    if (latestPaid && latestPaid.id === payment.id) {
      const newDueDate = calculateNextDueDate(bill, latestPaid);
      await client.updatePayment(unpaidPayment.id, { due_date: newDueDate });
    }
  } else {
    // No unpaid payment exists, generate the next one
    await generateNextPaymentForBill(billId, client);
  }
}

/**
 * Recalculates or schedules the next upcoming payment cycle when any payment
 * on a bill is updated or deleted.
 */
export async function handlePaymentUpdateOrDeleteSideEffects(billId: string, ignoreRecalculationForPaymentId?: string, client: TrailbaseClient = db): Promise<void> {
  const bill = await client.getBill(billId);
  if (!bill.active) {
    return;
  }
  const payments = await client.listPayments(billId);
  const unpaidPayment = payments.find((p) => p.paid_at === null || p.paid_at === undefined);

  // Sort paid payments descending by due_date to find the latest
  const paidPayments = payments
    .filter((p) => p.paid_at !== null && p.paid_at !== undefined)
    .sort((a, b) => b.due_date.localeCompare(a.due_date));

  const latestPaid = paidPayments[0];

  if (unpaidPayment && unpaidPayment.id !== ignoreRecalculationForPaymentId) {
    if (latestPaid) {
      const newDueDate = calculateNextDueDate(bill, latestPaid);
      if (unpaidPayment.due_date !== newDueDate) {
        await client.updatePayment(unpaidPayment.id, { due_date: newDueDate });
      }
    } else {
      // Fallback to start_date if all paid payments are removed/unmarked
      if (unpaidPayment.due_date !== bill.start_date) {
        await client.updatePayment(unpaidPayment.id, { due_date: bill.start_date });
      }
    }
  } else if (!unpaidPayment) {
    // No unpaid payment exists, generate the next one
    await generateNextPaymentForBill(billId, client);
  }
}
