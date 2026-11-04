import { MICROS_PER_USD } from "./pricing";

/** Format micro-dollars for people. Amounts under a cent keep enough digits to be meaningful. */
export function formatUsd(micros: number): string {
  const usd = micros / MICROS_PER_USD;
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  if (abs > 0 && abs < 0.01) return `${sign}$${abs.toFixed(4).replace(/0+$/, "")}`;
  return `${sign}$${abs.toFixed(2)}`;
}

export const usdToMicros = (usd: number) => Math.round(usd * MICROS_PER_USD);
export const centsToMicros = (cents: number) => Math.round(cents * 10_000);

/** Free credit for new players. */
export const SIGNUP_CREDIT_MICROS = usdToMicros(2.5);

/** Top-up limits, in cents. */
export const MIN_TOPUP_CENTS = 500;
export const MAX_TOPUP_CENTS = 50_000;
export const TOPUP_PRESETS_CENTS = [500, 1000, 2000, 5000];

/** Old coins converted at the $10 pack's price: $10 / 60 coins. */
export const LEGACY_COIN_MICROS = Math.round((10 / 60) * 1_000_000);
