import { describe, it, expect } from "vitest";
import { clamp, formatDate } from "./utils.js";

describe("shared/utils", () => {
  it("clamps", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
  it("formats a date", () => {
    expect(typeof formatDate(0)).toBe("string");
  });
});
