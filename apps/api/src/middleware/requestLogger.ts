import type { MiddlewareHandler } from "hono";
import { logger } from "../services/logger";

export const requestLogger = (): MiddlewareHandler => {
  return async (c, next) => {
    const { method, path } = c.req;
    const startTime = Date.now();

    logger.debug({ method, path }, `--> ${method} ${path}`);

    await next();

    const duration = Date.now() - startTime;
    const status = c.res.status;

    const logPayload = {
      method,
      path,
      status,
      durationMs: duration,
    };

    const logMsg = `<-- ${method} ${path} ${status} (${duration}ms)`;

    if (status >= 500) {
      logger.error(logPayload, logMsg);
    } else if (status >= 400) {
      logger.warn(logPayload, logMsg);
    } else {
      logger.info(logPayload, logMsg);
    }
  };
};
