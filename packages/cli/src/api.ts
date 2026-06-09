import type { Bill, Payment } from "@hornbill/core";

export interface StatusResponse {
  status: string;
  registration_enabled: boolean;
  data_dir?: string;
  trailbase_url?: string;
}

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "APIError";
  }
}

async function request<T>(
  url: string,
  key: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const normalizedUrl = url.endsWith("/") ? url.slice(0, -1) : url;
  const headers = new Headers(options.headers || {});
  
  if (key) {
    if (key.startsWith("Bearer ") || key.startsWith("ApiKey ")) {
      headers.set("Authorization", key);
    } else {
      headers.set("Authorization", `ApiKey ${key}`);
    }
  }
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${normalizedUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
    try {
      const body = await response.json() as { error?: string };
      if (body && body.error) {
        errorMessage = body.error;
      }
    } catch {
      // ignore JSON parse error for non-JSON error pages
    }
    throw new APIError(response.status, errorMessage);
  }

  return response.json() as Promise<T>;
}

export async function checkStatus(url: string): Promise<StatusResponse> {
  return request<StatusResponse>(url, "", "/api/v1/status");
}

export async function checkAuth(url: string, key: string): Promise<boolean> {
  try {
    // Attempt to list keys or bills as a test of authorization
    await request<unknown[]>(url, key, "/api/v1/bills");
    return true;
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      return false;
    }
    throw err;
  }
}

export async function listBills(url: string, key: string): Promise<Bill[]> {
  return request<Bill[]>(url, key, "/api/v1/bills");
}

export async function listPayments(
  url: string,
  key: string,
  options: { billId?: string } = {}
): Promise<Payment[]> {
  let path = "/api/v1/payments";
  if (options.billId) {
    path += `?billId=${encodeURIComponent(options.billId)}`;
  }
  return request<Payment[]>(url, key, path);
}

export async function payPayment(
  url: string,
  key: string,
  paymentId: string,
  options: { paidAt?: string | number; amountCents?: number } = {}
): Promise<Payment> {
  const body: Record<string, unknown> = {};
  if (options.paidAt !== undefined) {
    body.paid_at = options.paidAt;
  }
  if (options.amountCents !== undefined) {
    body.amount_cents = options.amountCents;
  }

  return request<Payment>(url, key, `/api/v1/payments/${paymentId}/pay`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function login(
  url: string,
  email: string,
  password: string
): Promise<{ auth_token: string; csrf_token: string }> {
  return request<{ auth_token: string; csrf_token: string }>(url, "", "/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function createApiKey(
  url: string,
  token: string,
  name: string
): Promise<{ id: string; user_id: string; name: string; token: string }> {
  const authHeader = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  return request<{ id: string; user_id: string; name: string; token: string }>(
    url,
    authHeader,
    "/api/v1/api-keys",
    {
      method: "POST",
      body: JSON.stringify({ name }),
    }
  );
}
