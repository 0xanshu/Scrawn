import { describe, it, expect } from "vitest";
import { encrypt, decrypt, isEncrypted } from "../utils/encryptMetadata";

describe("encryptMetadata", () => {
  it("encrypt/decrypt round-trip", () => {
    const plaintext = "hello world";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (random IV)", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
  });

  it("decrypt fails with tampered ciphertext", () => {
    const encrypted = encrypt("secret");
    const tampered = encrypted.replace(/[A-Za-z0-9+/=]/g, "A");
    expect(() => decrypt(tampered)).toThrow();
  });

  describe("isEncrypted", () => {
    it("detects encrypted format", () => {
      expect(isEncrypted(encrypt("data"))).toBe(true);
    });

    it("rejects plain strings", () => {
      expect(isEncrypted("hello")).toBe(false);
    });

    it("rejects malformed formats", () => {
      expect(isEncrypted("only:one:")).toBe(false);
    });
  });
});
