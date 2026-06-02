import { expect, test, describe, spyOn, afterEach } from "bun:test";
import authApp from "./auth";

describe("Auth Routes", () => {
  let fetchSpy: any;

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
  });

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
    fetchSpy = spyOn(global, "fetch").mockResolvedValue(
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
    fetchSpy = spyOn(global, "fetch").mockResolvedValue(
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
});
