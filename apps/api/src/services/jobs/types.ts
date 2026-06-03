export interface JobOptions {
  delay?: number; // Delay in milliseconds before job becomes available
  attempts?: number; // Max retry attempts
  repeatPattern?: string; // Cron pattern for recurring jobs (e.g. "*/60 * * * *")
}

export type JobHandler<T = any> = (data: T) => Promise<void> | void;

export interface IQueueService {
  /**
   * Enqueue a job to be processed.
   */
  enqueue<T = any>(taskName: string, data: T, options?: JobOptions): Promise<void>;

  /**
   * Register a handler for a specific task.
   */
  registerWorker<T = any>(taskName: string, handler: JobHandler<T>): void;

  /**
   * Start the background processing (in-process/embedded).
   */
  start(): Promise<void>;

  /**
   * Gracefully shut down the queue and worker processes.
   */
  shutdown(): Promise<void>;
}
