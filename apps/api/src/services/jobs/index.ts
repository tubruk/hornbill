import { BunqueueService } from "./bunqueue";
import { syncAllPayments } from "../../services";

export * from "./types";

export const queueService = new BunqueueService();

/**
 * Register all task workers/handlers for the background job queue.
 */
export function registerJobWorkers(): void {
  // Periodic payment sync (runs on all accounts)
  queueService.registerWorker("periodic-sync", async () => {
    console.log(`[Job Worker] Running periodic payment sync (all accounts)...`);
    const stats = await syncAllPayments();
    console.log(`[Job Worker] Sync complete. Processed: ${stats.processed}, Generated: ${stats.generated}`);
  });
}
