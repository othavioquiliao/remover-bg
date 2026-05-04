import { describe, expect, test } from "bun:test";
import { readRemoveBgError } from "./removeBg";

describe("remove.bg helpers", () => {
  test("reads structured API errors", async () => {
    const response = Response.json(
      {
        errors: [{ title: "Invalid API key", code: "auth_failed" }]
      },
      { status: 403, statusText: "Forbidden" }
    );

    await expect(readRemoveBgError(response)).resolves.toEqual({
      error: "Invalid API key",
      status: 403,
      details: "auth_failed"
    });
  });

  test("reads plain text API errors", async () => {
    const response = new Response("rate limited", { status: 429, statusText: "Too Many Requests" });

    await expect(readRemoveBgError(response)).resolves.toEqual({
      error: "Too Many Requests",
      status: 429,
      details: "rate limited"
    });
  });
});
