import type { Context, Next, Env } from "hono";
import type { RouteHandler, RouteConfig } from "@hono/zod-openapi";
import { verifyAccountAccess, getDb } from "../trailbase";

const getRequestBody = async (c: Context) => {
  if (typeof c.req.json === "function") {
    try {
      return await c.req.json();
    } catch {
      // Ignore parser issues and fall back to clone
    }
  }
  return await c.req.raw.clone().json();
};

export const checkAccountAccess = (source: "param" | "query" | "body", key = "id") => {
  return async (c: Context, next: Next) => {
    let accountId: string | undefined;
    if (source === "param") {
      accountId = c.req.param(key);
    } else if (source === "query") {
      accountId = c.req.query(key);
    } else if (source === "body") {
      try {
        const body = await getRequestBody(c);
        accountId = body?.[key];
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
    }

    if (!accountId) {
      return c.json({ error: `Missing account ID reference (${key})` }, 400);
    }

    const hasAccess = await verifyAccountAccess(c, accountId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden: No access to this account" }, 403);
    }

    const client = getDb(c);
    try {
      const account = await client.getAccount(accountId);
      if (!account) {
        return c.json({ error: "Account not found" }, 404);
      }
      c.set("account", account);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch account";
      return c.json({ error: message }, 500);
    }

    await next();
  };
};

export const checkBillAccess = (source: "param" | "query" | "body" = "param", key = "id") => {
  return async (c: Context, next: Next) => {
    let billId: string | undefined;
    if (source === "param") {
      billId = c.req.param(key);
    } else if (source === "query") {
      billId = c.req.query(key);
    } else if (source === "body") {
      try {
        const body = await getRequestBody(c);
        billId = body?.[key];
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
    }

    if (!billId) {
      return c.json({ error: `Missing bill ID reference (${key})` }, 400);
    }

    const client = getDb(c);
    try {
      const bill = await client.getBill(billId);
      if (!bill) {
        return c.json({ error: "Bill not found" }, 404);
      }

      const hasAccess = await verifyAccountAccess(c, bill.account_id);
      if (!hasAccess) {
        return c.json({ error: "Forbidden: No access to this bill" }, 403);
      }

      // Option 1: Store bill in Hono context
      c.set("bill", bill);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch bill";
      return c.json({ error: message }, 500);
    }

    await next();
  };
};

export const checkPaymentAccess = (source: "param" | "query" | "body" = "param", key = "id") => {
  return async (c: Context, next: Next) => {
    let paymentId: string | undefined;
    if (source === "param") {
      paymentId = c.req.param(key);
    } else if (source === "query") {
      paymentId = c.req.query(key);
    } else if (source === "body") {
      try {
        const body = await getRequestBody(c);
        paymentId = body?.[key];
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
    }

    if (!paymentId) {
      return c.json({ error: `Missing payment ID reference (${key})` }, 400);
    }

    const client = getDb(c);
    try {
      const payment = await client.getPayment(paymentId);
      if (!payment) {
        return c.json({ error: "Payment not found" }, 404);
      }

      const bill = await client.getBill(payment.bill_id);
      if (!bill) {
        return c.json({ error: "Associated bill not found" }, 404);
      }

      const hasAccess = await verifyAccountAccess(c, bill.account_id);
      if (!hasAccess) {
        return c.json({ error: "Forbidden: No access to this payment" }, 403);
      }

      // Option 1: Store payment and bill in Hono context
      c.set("payment", payment);
      c.set("bill", bill);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch payment";
      return c.json({ error: message }, 500);
    }

    await next();
  };
};

// Wrapper helpers to apply access-control middlewares directly to route handlers
export const withAccountAccess = (source: "param" | "query" | "body" = "param", key = "id") =>
  <R extends RouteConfig, E extends Env = Env>(handler: RouteHandler<R, E>): RouteHandler<R, E> =>
    (async (c: Context, next: Next) => {
      const mw = checkAccountAccess(source, key);
      const maybeResp = await mw(c, async () => {});
      if (maybeResp) return maybeResp;
      return handler(c, next);
    }) as unknown as RouteHandler<R, E>;

export const withBillAccess = (source: "param" | "query" | "body" = "param", key = "id") =>
  <R extends RouteConfig, E extends Env = Env>(handler: RouteHandler<R, E>): RouteHandler<R, E> =>
    (async (c: Context, next: Next) => {
      const mw = checkBillAccess(source, key);
      const maybeResp = await mw(c, async () => {});
      if (maybeResp) return maybeResp;
      return handler(c, next);
    }) as unknown as RouteHandler<R, E>;

export const withPaymentAccess = (source: "param" | "query" | "body" = "param", key = "id") =>
  <R extends RouteConfig, E extends Env = Env>(handler: RouteHandler<R, E>): RouteHandler<R, E> =>
    (async (c: Context, next: Next) => {
      const mw = checkPaymentAccess(source, key);
      const maybeResp = await mw(c, async () => {});
      if (maybeResp) return maybeResp;
      return handler(c, next);
    }) as unknown as RouteHandler<R, E>;
