import type { Job } from "bunqueue/client";
import type { BunqueueMiddleware } from "bunqueue/client";

export const jobLoggingMiddleware: BunqueueMiddleware = async (job, next) => {
  const startTime = Date.now();
  console.log(`[Job Queue] 🚀 Starting job "${job.name}" (ID: ${job.id}, Attempt: ${job.attemptsMade + 1})`);
  try {
    const result = await next();
    const duration = Date.now() - startTime;
    console.log(`[Job Queue] ✅ Completed job "${job.name}" (ID: ${job.id}) in ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Job Queue] ❌ Failed job "${job.name}" (ID: ${job.id}) after ${duration}ms. Error:`, error);
    throw error;
  }
};
