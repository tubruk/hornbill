import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import apiKeysApp from "./apiKeys";
import * as trailbase from "../trailbase";
import type { ApiKey } from "@hornbill/core";

describe("API Keys Routes", () => {
  let listApiKeysSpy: any;
  let createApiKeySpy: any;
  let deleteApiKeySpy: any;
  let getApiKeySpy: any;
  let verifyTokenSpy: any;
  let getDbSpy: any;

  const mockApiKeys: ApiKey[] = [
    {
      id: "key-1",
      user_id: "user-123",
      name: "Home Assistant Key",
      token_hash: "hash-123",
      created_at: 1000,
      last_used_at: null,
    },
    {
      id: "key-2",
      user_id: "user-456",
      name: "Other User Key",
      token_hash: "hash-456",
      created_at: 1000,
      last_used_at: 2000,
    },
  ];

  beforeEach(() => {
    // Redirect getDb to the shared instance
    getDbSpy = spyOn(trailbase, "getDb").mockImplementation(() => trailbase.db as any);

    // Mock verifyToken to authenticate "Bearer token-123" or "Bearer token-456"
    verifyTokenSpy = spyOn(trailbase, "verifyToken").mockImplementation(async (token) => {
      if (token === "Bearer token-123") {
        return { sub: "user-123" };
      }
      if (token === "Bearer token-456") {
        return { sub: "user-456" };
      }
      throw new Error("Invalid token");
    });

    listApiKeysSpy = spyOn(trailbase.db, "listApiKeys").mockImplementation(async (userId) => {
      if (!userId) return mockApiKeys;
      return mockApiKeys.filter((k) => k.user_id === userId);
    });

    createApiKeySpy = spyOn(trailbase.db, "createApiKey").mockImplementation(async (payload) => {
      return {
        ...payload,
        created_at: 12345,
        last_used_at: null,
      } as ApiKey;
    });

    getApiKeySpy = spyOn(trailbase.db, "getApiKey").mockImplementation(async (id) => {
      const key = mockApiKeys.find((k) => k.id === id);
      if (!key) throw new Error("Not found");
      return key;
    });

    deleteApiKeySpy = spyOn(trailbase.db, "deleteApiKey").mockImplementation(async () => {});
  });

  afterEach(() => {
    listApiKeysSpy.mockRestore();
    createApiKeySpy.mockRestore();
    getApiKeySpy.mockRestore();
    deleteApiKeySpy.mockRestore();
    verifyTokenSpy.mockRestore();
    getDbSpy.mockRestore();
  });

  describe("GET /", () => {
    test("fails with 401 when Authorization header is missing", async () => {
      const res = await apiKeysApp.request("/", {
        method: "GET",
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Missing Authorization header");
    });

    test("succeeds and lists keys only for current user", async () => {
      const res = await apiKeysApp.request("/", {
        method: "GET",
        headers: { Authorization: "Bearer token-123" },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(1);
      expect(json[0].id).toBe("key-1");
      expect(json[0].name).toBe("Home Assistant Key");
      expect(listApiKeysSpy).toHaveBeenCalledWith("user-123");
    });
  });

  describe("POST /", () => {
    test("fails with 400 when name is missing or empty", async () => {
      const res = await apiKeysApp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer token-123",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid input: expected string, received undefined");
    });

    test("succeeds, creates the key, and returns the raw token exactly once", async () => {
      const res = await apiKeysApp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer token-123",
        },
        body: JSON.stringify({ name: "CI Pipeline" }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBeDefined();
      expect(json.name).toBe("CI Pipeline");
      expect(json.user_id).toBe("user-123");
      expect(json.token).toBeDefined();
      expect(json.token.startsWith("hb_pat_")).toBe(true);
      expect(json.token_hash).toBeDefined();
      expect(json.token_hash).not.toBe(json.token);
      expect(createApiKeySpy).toHaveBeenCalled();
    });
  });

  describe("DELETE /:id", () => {
    test("fails with 404 when key does not exist", async () => {
      const res = await apiKeysApp.request("/non-existent", {
        method: "DELETE",
        headers: { Authorization: "Bearer token-123" },
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("API key not found");
    });

    test("fails with 403 when trying to revoke another user's key", async () => {
      const res = await apiKeysApp.request("/key-2", {
        method: "DELETE",
        headers: { Authorization: "Bearer token-123" }, // key-2 belongs to user-456
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("Forbidden: No access to this API key");
      expect(deleteApiKeySpy).not.toHaveBeenCalled();
    });

    test("succeeds when revoking own key", async () => {
      const res = await apiKeysApp.request("/key-1", {
        method: "DELETE",
        headers: { Authorization: "Bearer token-123" }, // key-1 belongs to user-123
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(deleteApiKeySpy).toHaveBeenCalledWith("key-1");
    });
  });

  describe("Error branches", () => {
    test("fails middleware with 401 when verifyToken throws string or non-Error", async () => {
      verifyTokenSpy.mockRejectedValue("Unexpected error object" as never);
      const res = await apiKeysApp.request("/", {
        method: "GET",
        headers: { Authorization: "Bearer bad-token" },
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized: Invalid token");
    });

    test("fails GET / with 500 when listApiKeys throws Error", async () => {
      listApiKeysSpy.mockRejectedValue(new Error("Db read error"));
      const res = await apiKeysApp.request("/", {
        method: "GET",
        headers: { Authorization: "Bearer token-123" },
      });
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Db read error");
    });

    test("fails POST / with 500 when createApiKey throws Error", async () => {
      createApiKeySpy.mockRejectedValue(new Error("Db write error"));
      const res = await apiKeysApp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer token-123",
        },
        body: JSON.stringify({ name: "CI Pipeline" }),
      });
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Db write error");
    });

    test("fails DELETE /:id with 500 when deleteApiKey throws Error", async () => {
      deleteApiKeySpy.mockRejectedValue(new Error("Db delete error"));
      const res = await apiKeysApp.request("/key-1", {
        method: "DELETE",
        headers: { Authorization: "Bearer token-123" },
      });
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Db delete error");
    });
  });
});
