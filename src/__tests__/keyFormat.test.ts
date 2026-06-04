import { describe, it, expect } from "vitest";
import {
  parseRoleFromApiKey,
  isValidApiKeyFormat,
  getRolePrefix,
  getModeForRole,
} from "../utils/keyFormat";
import { hashAPIKey } from "../utils/hashAPIKey";
import { generateAPIKey } from "../utils/generateAPIKey";

describe("keyFormat", () => {
  describe("parseRoleFromApiKey", () => {
    it("returns 'dashboard' for scrn_dash_ prefix", () => {
      expect(
        parseRoleFromApiKey("scrn_dash_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
      ).toBe("dashboard");
    });

    it("returns 'production' for scrn_live_ prefix", () => {
      expect(
        parseRoleFromApiKey("scrn_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
      ).toBe("production");
    });

    it("returns 'test' for scrn_test_ prefix", () => {
      expect(
        parseRoleFromApiKey("scrn_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
      ).toBe("test");
    });

    it("returns null for unknown prefix", () => {
      expect(parseRoleFromApiKey("unknown_prefix_xxx")).toBeNull();
    });
  });

  describe("isValidApiKeyFormat", () => {
    it("accepts valid test key", () => {
      const key = `scrn_test_${"a".repeat(32)}`;
      expect(isValidApiKeyFormat(key, "test")).toBe(true);
    });

    it("rejects wrong prefix", () => {
      expect(
        isValidApiKeyFormat(
          "scrn_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "test"
        )
      ).toBe(false);
    });

    it("rejects wrong length", () => {
      expect(isValidApiKeyFormat("scrn_test_tooshort", "test")).toBe(false);
    });

    it("rejects invalid characters in random part", () => {
      expect(isValidApiKeyFormat(`scrn_test_${"a".repeat(31)}+`, "test")).toBe(
        false
      );
    });
  });

  describe("getRolePrefix", () => {
    it("returns correct prefix per role", () => {
      expect(getRolePrefix("dashboard")).toBe("scrn_dash_");
      expect(getRolePrefix("production")).toBe("scrn_live_");
      expect(getRolePrefix("test")).toBe("scrn_test_");
    });
  });

  describe("getModeForRole", () => {
    it("returns null for dashboard, 'production'/'test' otherwise", () => {
      expect(getModeForRole("dashboard")).toBeNull();
      expect(getModeForRole("production")).toBe("production");
      expect(getModeForRole("test")).toBe("test");
    });
  });
});

describe("hashAPIKey", () => {
  it("returns a deterministic hex string", () => {
    const a = hashAPIKey("scrn_test_abc123");
    const b = hashAPIKey("scrn_test_abc123");
    expect(a).toBe(b);
  });

  it("returns different hashes for different keys", () => {
    const a = hashAPIKey("scrn_test_abc");
    const b = hashAPIKey("scrn_test_def");
    expect(a).not.toBe(b);
  });

  it("returns a 64-char hex string (sha256)", () => {
    const result = hashAPIKey("scrn_test_xyz");
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("generateAPIKey", () => {
  it("generates key with correct prefix per role", () => {
    expect(generateAPIKey("dashboard")).toMatch(/^scrn_dash_/);
    expect(generateAPIKey("production")).toMatch(/^scrn_live_/);
    expect(generateAPIKey("test")).toMatch(/^scrn_test_/);
  });

  it("generates key that passes isValidApiKeyFormat", () => {
    const key = generateAPIKey("test");
    expect(isValidApiKeyFormat(key, "test")).toBe(true);
  });
});
