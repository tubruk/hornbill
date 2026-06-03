import { BunqueueService } from "./bunqueue";
import { syncAllPayments } from "../../services";
import { processPaymentReminders } from "../reminders";
import { logger } from "../logger";

export * from "./types";

export const queueService = new BunqueueService();

/**
 * Register all task workers/handlers for the background job queue.
 */
export function registerJobWorkers(): void {
  // Periodic payment sync (runs on all accounts)
  queueService.registerWorker("periodic-sync", async () => {
    logger.info(`[Job Worker] Running periodic payment sync (all accounts)...`);
    const stats = await syncAllPayments();
    logger.info(`[Job Worker] Sync complete. Processed: ${stats.processed}, Generated: ${stats.generated}`);
  });

  // Daily payment reminders
  queueService.registerWorker("daily-reminders", async () => {
    logger.info(`[Job Worker] Running daily payment reminder processing...`);
    await processPaymentReminders();
    logger.info(`[Job Worker] Daily payment reminder processing complete.`);
  });
}
