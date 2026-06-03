import { Bunqueue } from "bunqueue/client";
import type { IQueueService, JobHandler, JobOptions } from "./types";
import { CONFIG } from "../../config";
import path from "path";
import fs from "fs";
import { jobLoggingMiddleware } from "./middleware";

export class BunqueueService implements IQueueService {
  private queue: Bunqueue | null = null;
  private handlers = new Map<string, JobHandler>();

  registerWorker<T = unknown>(taskName: string, handler: JobHandler<T>): void {
    if (this.handlers.has(taskName)) {
      throw new Error(`Handler for task "${taskName}" is already registered.`);
    }
    this.handlers.set(taskName, handler as JobHandler);
  }

  async enqueue<T = unknown>(taskName: string, data: T, options?: JobOptions): Promise<void> {
    if (!this.queue) {
      throw new Error("Queue service is not started. Call start() first.");
    }

    const jobOpts: { delay?: number; attempts?: number } = {};
    if (options?.delay) {
      jobOpts.delay = options.delay;
    }
    if (options?.attempts) {
      jobOpts.attempts = options.attempts;
    }

    if (options?.repeatPattern) {
      // Bunqueue scheduler adds a cron job
      await this.queue.cron(taskName, options.repeatPattern, data, { jobOpts });
    } else {
      await this.queue.add(taskName, data, jobOpts);
    }
  }

  async start(): Promise<void> {
    if (this.queue) return;

    // Ensure the data directory exists
    if (!fs.existsSync(CONFIG.TRAILBASE_DATA_DIR)) {
      fs.mkdirSync(CONFIG.TRAILBASE_DATA_DIR, { recursive: true });
    }

    const dbPath = path.join(CONFIG.TRAILBASE_DATA_DIR, "bunqueue.db");

    // Initialize Bunqueue in embedded (in-process) mode
    this.queue = new Bunqueue("hornbill-jobs", {
      embedded: true,
      dataPath: dbPath,
      autorun: true,
      processor: async (job) => {
        const handler = this.handlers.get(job.name);
        if (!handler) {
          throw new Error(`No worker registered for task "${job.name}"`);
        }
        return await handler(job.data);
      }
    });

    // Register logging middleware
    this.queue.use(jobLoggingMiddleware);
  }

  async shutdown(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }
}
