import type { Currency } from "./types";

const LOCALES: Readonly<Record<Currency, string>> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  AUD: "en-AU",
  CAD: "en-CA",
};

const formatters = new Map<Currency, Intl.NumberFormat>();

/** Whole-unit currency formatting with locale-appropriate grouping (for example ₹12,00,000). */
export function formatMoney(amount: number, currency: Currency): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALES[currency], { style: "currency", currency, maximumFractionDigits: 0 });
    formatters.set(currency, formatter);
  }
  return formatter.format(amount);
}
