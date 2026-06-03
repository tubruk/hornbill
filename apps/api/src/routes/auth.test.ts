import { mock, expect, test, describe, spyOn, afterEach, beforeEach } from "bun:test";

let mockDbGetResult: any = { id: new Uint8Array(16) };
let mockDbCheckMappingResult: any = null; // null means mapping does not exist
let getCallCount = 0;
const mockDbRun = mock(() => {});
const mockDbGet = mock(() => {
  getCallCount++;
  if (mockDbGetResult instanceof Error) {
    throw mockDbGetResult;
  }
  if (getCallCount === 1) {
    return mockDbGetResult;
  }
  return mockDbCheckMappingResult;
});
const mockDbClose = mock(() => {});

mock.module("bun:sqlite", () => {
  return {
    Database: class {
      constructor(path: string) {}
      prepare(sql: string) {
        return {
          run: mockDbRun,
          get: mockDbGet,
        };
      }
      close() {
        mockDbClose();
      }
    }
  };
});

import authApp from "./auth";
import { TrailbaseClient } from "../trailbase";
import * as fs from "fs";

describe("Auth Routes", () => {
  let fetchSpy: any;
  let existsSpy: any;
  let createAccountSpy: any;
  let associateUserSpy: any;

  beforeEach(() => {
    getCallCount = 0;
    mockDbGetResult = { id: new Uint8Array(16) };
    mockDbCheckMappingResult = null;
    existsSpy = spyOn(fs, "existsSync").mockImplementation(() => true);
    createAccountSpy = spyOn(TrailbaseClient.prototype, "createAccount").mockResolvedValue({} as any);
    associateUserSpy = spyOn(TrailbaseClient.prototype, "associateUserToAccount").mockResolvedValue({} as any);
  });

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
    existsSpy.mockRestore();
    createAccountSpy.mockRestore();
    associateUserSpy.mockRestore();
    process.env.REGISTRATION_ENABLED = "true";
  });

  /* ---------- POST /refresh ---------- */

  test("POST /refresh - fails with 400 when refresh_token is missing", async () => {
    const res = await authApp.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Refresh token is required");
  });

  test("POST /refresh - succeeds and returns credentials when valid", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          auth_token: "new-auth-token",
          csrf_token: "new-csrf-token",
        }),
        { status: 200 }
      )
    );

    const res = await authApp.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "valid-refresh-token" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.auth_token).toBe("new-auth-token");
    expect(json.csrf_token).toBe("new-csrf-token");
    expect(fetchSpy).toHaveBeenCalled();
  });

  test("POST /refresh - proxies Trailbase error responses", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Invalid refresh token",
        }),
        { status: 401 }
      )
    );

    const res = await authApp.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "invalid-refresh-token" }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Invalid refresh token");
    expect(fetchSpy).toHaveBeenCalled();
  });

  test("POST /refresh - handles Trailbase error that is not JSON", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Bad Gateway", { status: 502 })
    );

    const res = await authApp.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "invalid-refresh-token" }),
    });

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("Bad Gateway");
  });

  test("POST /refresh - handles exceptions with 500", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network Error"));

    const res = await authApp.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "valid-refresh-token" }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Network Error");
  });

  /* ---------- POST /register ---------- */

  test("POST /register - fails with 403 when registration is disabled", async () => {
    process.env.REGISTRATION_ENABLED = "false";
    const res = await authApp.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pwd", password_repeat: "pwd" }),
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Registration is currently disabled");
  });

  test("POST /register - fails with 400 when fields are missing", async () => {
    const res = await authApp.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Email, password, and password_repeat are required");
  });

  test("POST /register - succeeds and triggers verification & mapping", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const res = await authApp.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pwd", password_repeat: "pwd" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("registered");
    expect(createAccountSpy).toHaveBeenCalled();
    expect(associateUserSpy).toHaveBeenCalled();
  });

  test("POST /register - handles missing main.db", async () => {
    existsSpy.mockImplementation(() => false);
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const res = await authApp.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pwd", password_repeat: "pwd" }),
    });

    expect(res.status).toBe(200);
    expect(createAccountSpy).not.toHaveBeenCalled();
  });

  test("POST /register - handles missing user row in main.db", async () => {
    mockDbGetResult = undefined; // user not found
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const res = await authApp.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pwd", password_repeat: "pwd" }),
    });

    expect(res.status).toBe(200);
    expect(createAccountSpy).not.toHaveBeenCalled();
  });

  test("POST /register - skips mapping when user mapping already exists", async () => {
    mockDbCheckMappingResult = { 1: 1 }; // mapping exists
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const res = await authApp.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pwd", password_repeat: "pwd" }),
    });

    expect(res.status).toBe(200);
    expect(createAccountSpy).not.toHaveBeenCalled();
  });

  test("POST /register - handles SQLite query error gracefully", async () => {
    mockDbGetResult = new Error("Disk read error");
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const res = await authApp.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pwd", password_repeat: "pwd" }),
    });

    expect(res.status).toBe(200); // the error inside verifyAndCreateAccountInDb is caught and logged, not rethrown
  });

  test("POST /register - fails when Trailbase returns error", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Password too weak" }), { status: 400 })
    );

    const res = await authApp.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pwd", password_repeat: "pwd" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Password too weak");
  });

  test("POST /register - handles registration exceptions with 500", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network Timeout"));

    const res = await authApp.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pwd", password_repeat: "pwd" }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Network Timeout");
  });

  /* ---------- POST /login ---------- */

  test("POST /login - fails with 400 when fields are missing", async () => {
    const res = await authApp.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Email and password are required");
  });

  test("POST /login - succeeds and returns credentials", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          auth_token: "login-auth-token",
          csrf_token: "login-csrf-token",
        }),
        { status: 200 }
      )
    );

    const res = await authApp.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pwd" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.auth_token).toBe("login-auth-token");
    expect(json.csrf_token).toBe("login-csrf-token");
  });

  test("POST /login - fails when Trailbase returns error", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 })
    );

    const res = await authApp.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pwd" }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Invalid credentials");
  });

  test("POST /login - handles non-JSON response from Trailbase", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Text login payload", { status: 200 })
    );

    const res = await authApp.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pwd" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("Text login payload");
  });

  test("POST /login - handles login exceptions with 500", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Login Database Error"));

    const res = await authApp.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pwd" }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Login Database Error");
  });
});
