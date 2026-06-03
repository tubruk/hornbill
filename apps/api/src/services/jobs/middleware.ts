import type { BunqueueMiddleware } from "bunqueue/client";
import { logger } from "../logger";

export const jobLoggingMiddleware: BunqueueMiddleware = async (job, next) => {
  const startTime = Date.now();
  logger.info(
    { jobId: job.id, jobName: job.name, attempt: job.attemptsMade + 1 },
    `[Job Queue] 🚀 Starting job "${job.name}"`
  );
  try {
    const result = await next();
    const duration = Date.now() - startTime;
    logger.info(
      { jobId: job.id, jobName: job.name, durationMs: duration },
      `[Job Queue] ✅ Completed job "${job.name}" in ${duration}ms`
    );
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      { jobId: job.id, jobName: job.name, durationMs: duration, err: error },
      `[Job Queue] ❌ Failed job "${job.name}" after ${duration}ms`
    );
    throw error;
  }
};
