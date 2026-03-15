import { describe, expect, it } from "vitest";
import { formatPrice } from "../format";
import { normalizePhone, isValidPhone } from "../phone";

describe("shared/utils форматирование", () => {
  it("formatPrice: форматирует цену с валютой", () => {
    expect(formatPrice(15000)).toContain("15");
  });

  it("normalizePhone: оставляет только цифры", () => {
    expect(normalizePhone("+7 (999) 555-44-33")).toBe("+79995554433");
  });

  it("isValidPhone: проверяет корректность номера", () => {
    expect(isValidPhone("+7 (999) 555-44-33")).toBe(true);
    expect(isValidPhone("+1 23")).toBe(false);
  });
});
