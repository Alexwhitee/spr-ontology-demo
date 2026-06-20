import { describe, expect, it } from "vitest";
import { AUTH_STORAGE_KEY, isValidLogin, readStoredAuth, writeStoredAuth } from "../frontend/src/app/authState";

describe("auth state", () => {
  it("accepts only the configured administrator credentials", () => {
    expect(isValidLogin("admin", "xi147258")).toBe(true);
    expect(isValidLogin(" admin ", "xi147258")).toBe(true);
    expect(isValidLogin("admin", "wrong-password")).toBe(false);
    expect(isValidLogin("xi", "xi147258")).toBe(false);
  });

  it("stores and reads whether the user has passed the login gate", () => {
    const storage = new Map<string, string>();

    expect(readStoredAuth(storage)).toBe(false);

    writeStoredAuth(storage, true);
    expect(storage.get(AUTH_STORAGE_KEY)).toBe("authenticated");
    expect(readStoredAuth(storage)).toBe(true);

    writeStoredAuth(storage, false);
    expect(storage.has(AUTH_STORAGE_KEY)).toBe(false);
    expect(readStoredAuth(storage)).toBe(false);
  });
});
