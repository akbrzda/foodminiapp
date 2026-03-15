import { describe, expect, it } from "vitest";
import { formatCurrency, normalizePhone, isValidPhone } from "../format";

describe("shared/utils/format", () => {
  it("formatCurrency: форматирует число в валюту", () => {
    expect(formatCurrency(12345)).toContain("12");
  });

  it("normalizePhone: оставляет только цифры", () => {
    expect(normalizePhone("+7 (999) 123-45-67")).toBe("+79991234567");
  });

  it("isValidPhone: валидирует номер длиной 11", () => {
    expect(isValidPhone("+7 (999) 123-45-67")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
  });
});
