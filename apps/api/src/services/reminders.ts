import { getDb } from "../trailbase";
import { logger } from "./logger";
import type { Account } from "@hornbill/core";

export async function processPaymentReminders(): Promise<void> {
  const client = getDb();
  
  let accounts: Account[] = [];
  try {
    accounts = await client.listAccounts();
  } catch (err) {
    logger.error(err, "[Reminders] Failed to retrieve accounts from database.");
    return;
  }

  for (const account of accounts) {
    const provider = account.notification_provider;
    const reminder = account.notification_reminder;

    // 1. Check if reminders are enabled and provider is configured
    if (!reminder || !reminder.enabled || !provider) {
      continue;
    }

    try {
      // 2. Resolve current date & time in account's configured timezone
      let formatter: Intl.DateTimeFormat;
      try {
        formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: reminder.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      } catch (timezoneErr) {
        logger.error(timezoneErr, `[Reminders] Invalid timezone "${reminder.timezone}" configured for account "${account.name}" (${account.id}).`);
        continue;
      }

      const now = new Date();
      const parts = formatter.formatToParts(now);
      const getPart = (type: string) => parts.find(p => p.type === type)?.value || "";
      
      const year = getPart("year");
      const month = getPart("month");
      const day = getPart("day");
      const hour = getPart("hour");
      const minute = getPart("minute");

      const todayStr = `${year}-${month}-${day}`; // YYYY-MM-DD
      const currentTimeStr = `${hour}:${minute}`; // HH:MM

      // 3. Prevent duplicate notifications on the same day
      if (reminder.last_reminded_date === todayStr) {
        continue;
      }

      // 4. Wait until the scheduled reminder time has arrived
      if (currentTimeStr < reminder.time) {
        continue;
      }

      // 5. Fetch all bills and filter unpaid payments
      const bills = await client.listBills(account.id);
      const activeBills = bills.filter((b) => b.active);
      if (activeBills.length === 0) {
        // No active bills to remind; mark today as done
        await updateAccountReminderDate(account, todayStr);
        continue;
      }

      const activeBillIds = new Set(activeBills.map((b) => b.id));
      const allPayments = await client.listPayments();
      const unpaidPayments = allPayments.filter((p) => {
        return activeBillIds.has(p.bill_id) && (p.paid_at === null || p.paid_at === undefined);
      });

      // 6. Find payments within the reminder window (or overdue)
      const eligiblePayments = unpaidPayments.filter((payment) => {
        const pDueDate = new Date(`${payment.due_date}T00:00:00`);
        const todayDate = new Date(`${todayStr}T00:00:00`);
        const diffTime = pDueDate.getTime() - todayDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Days until due

        // Remind if payment is due soon (within threshold days) OR overdue (diffDays < 0)
        return diffDays <= reminder.days_before_due;
      });

      if (eligiblePayments.length === 0) {
        // No payments are due/overdue today; mark today as done to prevent checking again
        await updateAccountReminderDate(account, todayStr);
        continue;
      }

      // 7. Aggregate payments by bill details
      const enrichedPayments = eligiblePayments.map((p) => {
        const bill = activeBills.find((b) => b.id === p.bill_id)!;
        return {
          id: p.id,
          due_date: p.due_date,
          amount_cents: p.amount_cents,
          bill_name: bill.name,
          currency: bill.currency,
        };
      });

      // 8. Dispatch notification via configured channel
      await sendAggregatedNotification(provider, account.name, todayStr, enrichedPayments);

      // 9. Update last reminded date to prevent duplicate triggers today
      await updateAccountReminderDate(account, todayStr);
      logger.info(`[Reminders] Successfully sent aggregated reminder notification for account "${account.name}" (${account.id}).`);
    } catch (err) {
      logger.error(err, `[Reminders] Failed to process reminders for account "${account.name}" (${account.id}).`);
    }
  }
}

async function updateAccountReminderDate(account: Account, todayStr: string): Promise<void> {
  const client = getDb();
  await client.updateAccount(account.id, {
    notification_reminder: {
      ...account.notification_reminder,
      last_reminded_date: todayStr,
    },
  });
}

interface ReminderPayment {
  id: string;
  due_date: string;
  amount_cents: number;
  bill_name: string;
  currency: string;
}

export async function sendAggregatedNotification(
  provider: Account["notification_provider"],
  accountName: string,
  todayStr: string,
  payments: ReminderPayment[]
): Promise<void> {
  const config = provider.config;

  const isOverdue = (dueDate: string) => dueDate < todayStr;
  const formatAmount = (cents: number, currency: string) => {
    const amount = (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${amount} ${currency}`;
  };

  const getRelativeDateStr = (dueDate: string): string => {
    const t1 = Date.parse(dueDate + "T00:00:00Z");
    const t2 = Date.parse(todayStr + "T00:00:00Z");
    const diffTime = t1 - t2;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      return absDays === 1 ? "1 day Overdue" : `${absDays} days Overdue`;
    } else if (diffDays === 0) {
      return "due today";
    } else {
      return diffDays === 1 ? "due tomorrow" : `due in ${diffDays} days`;
    }
  };

  const sortedPayments = [...payments].sort((a, b) => a.due_date.localeCompare(b.due_date));

  switch (provider.type) {
    case "discord": {
      if (!config.webhookUrl) {
        throw new Error("Missing Discord Webhook URL configuration.");
      }
      
      const embeds = sortedPayments.map((p) => {
        const overdue = isOverdue(p.due_date);
        const relStr = getRelativeDateStr(p.due_date);
        return {
          title: p.bill_name,
          color: overdue ? 0xDC2626 : 0xD97706, // Error Red or Warning Amber
          fields: [
            { name: "Amount", value: formatAmount(p.amount_cents, p.currency), inline: true },
            { name: "Due Date", value: overdue ? `⚠️ **${p.due_date} (${relStr})**` : `${p.due_date} (${relStr})`, inline: true },
          ],
        };
      });

      const response = await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `🔔 **Hornbill Payment Reminders**: Unpaid bill summary for account **${accountName}**`,
          embeds: embeds.slice(0, 10), // Limit to Discord embed limit
        }),
      });

      if (!response.ok) {
        throw new Error(`Discord Webhook API returned status ${response.status}: ${await response.text()}`);
      }
      break;
    }

    case "slack": {
      if (!config.webhookUrl) {
        throw new Error("Missing Slack Webhook URL configuration.");
      }

      const blocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🔔 Hornbill Payment Reminders",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Unpaid bill summary for account:* \`${accountName}\``,
          },
        },
        {
          type: "divider",
        },
      ];

      for (const p of sortedPayments) {
        const overdue = isOverdue(p.due_date);
        const relStr = getRelativeDateStr(p.due_date);
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${p.bill_name}*\n• *Amount:* ${formatAmount(p.amount_cents, p.currency)}\n• *Due Date:* ${overdue ? `⚠️ *${p.due_date} (${relStr})*` : `${p.due_date} (${relStr})`}`,
          },
        });
      }

      const response = await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });

      if (!response.ok) {
        throw new Error(`Slack Webhook API returned status ${response.status}: ${await response.text()}`);
      }
      break;
    }

    case "telegram": {
      if (!config.botToken || !config.chatId) {
        throw new Error("Missing Telegram Bot Token or Chat ID configuration.");
      }

      let text = `🔔 *Hornbill Payment Reminders*\nUnpaid bill summary for *${accountName}*:\n\n`;
      for (const p of sortedPayments) {
        const overdue = isOverdue(p.due_date);
        const relStr = getRelativeDateStr(p.due_date);
        const dateStr = overdue ? `⚠️ *${p.due_date} (${relStr})*` : `\`${p.due_date}\` (${relStr})`;
        text += `• *${p.bill_name}*\n  Amount: \`${formatAmount(p.amount_cents, p.currency)}\`\n  Due: ${dateStr}\n\n`;
      }

      const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: text,
          parse_mode: "Markdown",
        }),
      });

      if (!response.ok) {
        throw new Error(`Telegram API returned status ${response.status}: ${await response.text()}`);
      }
      break;
    }

    case "webhook": {
      if (!config.webhookUrl) {
        throw new Error("Missing Generic Webhook URL configuration.");
      }

      // Webhook Payload Format:
      // {
      //   "event": "payment.reminders",
      //   "account": "Personal Expenses",
      //   "timestamp": 1717142400,
      //   "payments": [
      //     {
      //       "id": "pay-123",
      //       "bill_name": "Spotify Premium",
      //       "amount_cents": 1099,
      //       "currency": "USD",
      //       "due_date": "2026-06-05",
      //       "relative_due": "5 days overdue",
      //       "is_overdue": false
      //     }
      //   ]
      // }
      const response = await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "payment.reminders",
          account: accountName,
          timestamp: Math.floor(Date.now() / 1000),
          payments: sortedPayments.map((p) => ({
            id: p.id,
            bill_name: p.bill_name,
            amount_cents: p.amount_cents,
            currency: p.currency,
            due_date: p.due_date,
            relative_due: getRelativeDateStr(p.due_date),
            is_overdue: isOverdue(p.due_date),
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Generic Webhook returned status ${response.status}: ${await response.text()}`);
      }
      break;
    }

    case "gotify": {
      if (!config.gotifyUrl || !config.gotifyToken) {
        throw new Error("Missing Gotify URL or App Token configuration.");
      }

      let message = `Unpaid bill summary for account ${accountName}:\n\n`;
      for (const p of sortedPayments) {
        const overdue = isOverdue(p.due_date);
        const relStr = getRelativeDateStr(p.due_date);
        message += `• ${p.bill_name}\n  Amount: ${formatAmount(p.amount_cents, p.currency)}\n  Due: ${p.due_date} (${relStr})${overdue ? " ⚠️" : ""}\n\n`;
      }

      const url = config.gotifyUrl.endsWith("/message") ? config.gotifyUrl : `${config.gotifyUrl}/message`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gotify-Key": config.gotifyToken,
        },
        body: JSON.stringify({
          title: "Hornbill Payment Reminders",
          message: message.trim(),
          priority: 5,
        }),
      });

      if (!response.ok) {
        throw new Error(`Gotify API returned status ${response.status}: ${await response.text()}`);
      }
      break;
    }

    case "ntfy": {
      if (!config.ntfyUrl) {
        throw new Error("Missing ntfy URL configuration.");
      }

      let message = `Unpaid bill summary for account ${accountName}:\n\n`;
      for (const p of sortedPayments) {
        const overdue = isOverdue(p.due_date);
        const relStr = getRelativeDateStr(p.due_date);
        message += `• ${p.bill_name}\n  Amount: ${formatAmount(p.amount_cents, p.currency)}\n  Due: ${p.due_date} (${relStr})${overdue ? " ⚠️" : ""}\n\n`;
      }

      const headers: Record<string, string> = {
        "Title": "Hornbill Payment Reminders",
        "Tags": "bell",
      };
      if (config.ntfyToken) {
        headers["Authorization"] = `Bearer ${config.ntfyToken}`;
      }

      const response = await fetch(config.ntfyUrl, {
        method: "POST",
        headers,
        body: message.trim(),
      });

      if (!response.ok) {
        throw new Error(`ntfy API returned status ${response.status}: ${await response.text()}`);
      }
      break;
    }

    case "console": {
      logger.info(
        {
          event: "payment.reminders.console",
          account: accountName,
          payments: sortedPayments.map((p) => ({
            id: p.id,
            bill_name: p.bill_name,
            amount: formatAmount(p.amount_cents, p.currency),
            due_date: p.due_date,
            relative_due: getRelativeDateStr(p.due_date),
            is_overdue: isOverdue(p.due_date),
          })),
        },
        `[Reminders Console] Aggregated payment reminder for account: ${accountName}`
      );
      break;
    }

    default:
      throw new Error(`Unsupported notification channel type: "${provider.type}".`);
  }
}
