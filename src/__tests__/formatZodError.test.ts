import { describe, it, expect } from "vitest";
import { ZodError, z } from "zod";
import { formatZodError } from "../utils/formatZodError";

function testErrorFactory(msg: string) {
  return { type: "TEST_ERROR", message: msg, name: "TestError" };
}

describe("formatZodError", () => {
  it("formats ZodError issues as semicolon-separated string", () => {
    const schema = z.object({ name: z.string().min(1), age: z.number() });
    try {
      schema.parse({ name: "", age: "notanumber" });
    } catch (error) {
      const result = formatZodError(error, testErrorFactory);
      expect(result.type).toBe("TEST_ERROR");
      expect(result.message).toContain("name:");
      expect(result.message).toContain("age:");
      expect(result.message).toContain(";");
    }
  });

  it("passes through non-Zod errors", () => {
    const error = new Error("something went wrong");
    const result = formatZodError(error, testErrorFactory);
    expect(result.message).toBe("something went wrong");
  });

  it("converts unknown errors to string", () => {
    const result = formatZodError("raw string error", testErrorFactory);
    expect(result.message).toBe("raw string error");
  });
});
