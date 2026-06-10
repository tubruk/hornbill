# Hornbill Business Logic Documentation

This document describes the core business logic, domain models, payment scheduling strategies, and state rules of the Hornbill application.

---

## 1. Core Domain Models

### Account
An Account represents a primary workspace or client profile.
* **Warning Threshold**: The default warning window (in days) to classify future payments as "Due Soon" vs. "Upcoming" (defaults to `7` days).

### Bill
A recurring expense or service charge configuration registered under an Account.
* **Currency**: Supported currencies are `IDR` and `USD` (defaulting to `IDR`).
* **Amount**: Stored as an integer in cents (`amount_cents`) to prevent floating-point calculation errors.
* **Recurrence**: Defines how often the bill recurs (monthly, yearly, or custom interval).
* **Warning Threshold Override**: An optional field to override the Account's default warning window for this specific bill.

### Payment
An individual execution cycle of a Bill.
* **Due Date**: The calendar date (YYYY-MM-DD) by which the payment must be settled.
* **Paid Date**: Optional timestamp representing when the payment was settled. If present, the payment is considered completed/paid.

---

## 2. Payment Status & State Derivation

Unpaid payments are categorized dynamically relative to a target reference date (today) and the configured warning threshold.

| Status | Condition | Description | UI Representation |
| :--- | :--- | :--- | :--- |
| **Paid** | `paid_at` is set and `paid_date <= due_date` | The payment was settled on or before the due date. | Success (Green) + Strikethrough + Muted Opacity + Check Icon |
| **Paid Late** | `paid_at` is set and `paid_date > due_date` | The payment was settled after its due date. | Warning (Amber) + Strikethrough + Muted Opacity + Check Icon |
| **Overdue** | `paid_at` is null and `due_date < today` | The due date has passed but the payment remains unsettled. | Error (Red) + Bold Text + Alert Icon |
| **Due Soon** | `paid_at` is null, `due_date >= today`, and `days_until_due <= threshold` | The payment is due soon and needs near-term attention. | Warning (Amber) + Bold Text + Clock Icon |
| **Upcoming** | `paid_at` is null, `due_date >= today`, and `days_until_due > threshold` | The payment is due far in the future and does not require immediate action. | Primary (Terracotta) + Bold Text |
| **Projected** | Virtual future projection (does not exist in DB yet) | Computed upcoming cycles based on recurrence rules. | Neutral (Stone) + Dashed Border + Italic Text |

### Warning Threshold Resolution
To determine the warning window (`threshold`) for classifying a payment as **Due Soon** vs. **Upcoming**:
1. Check the parent **Bill's warning threshold override**.
2. If null, fall back to the parent **Account's warning threshold**.
3. If null or undefined, fall back to the system default of **7 days**.

---

## 3. Recurrence Scheduling (`calculateNextDueDate`)

Due dates for subsequent payment cycles are generated using the following strategies:

### Monthly Recurrence
* Billed on a specific day of the month (1–31).
* **Clamping Rule**: If the target day is invalid for the target calendar month (e.g., day 31 in April or February), it clamps to the last valid day of that month (April 30, February 28/29).

### Yearly Recurrence
* Billed on a specific month (1–12) and day (1–31) once a year.
* **Leap Year Rollover**: Handles leap years gracefully. For example, a bill starting on February 29, 2024 (leap year) clamps to February 28 in non-leap years (2025, 2026).

### Custom Interval Recurrence
* Billed every $N$ units of time (`days`, `weeks`, or `months`).
* **Anchor Strategy**:
  * **From Due Date**: The next due date is anchored to the previous payment cycle's `due_date` + interval.
  * **From Paid At**: The next due date is anchored to the previous payment cycle's actual `paid_at` timestamp + interval, allowing the billing cycle to shift dynamically based on when payment is executed.
