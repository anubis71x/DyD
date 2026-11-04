import { describe, expect, it } from "vitest";
import { formatUsd, LEGACY_COIN_MICROS, SIGNUP_CREDIT_MICROS } from "@/lib/billing/money";
import { holdMicros, responseCost, typicalTurnMicros, withMarkup } from "@/lib/billing/pricing";
import { createMemoryStores } from "@/lib/save/memoryStore";

const sum = (lines: { micros: number }[]) => lines.reduce((a, l) => a + l.micros, 0);

describe("pricing", () => {
  it("prices each token type at the model's rates", () => {
    // Sonnet 5.5: $2 in, $2.50 5m write, $4 1h write, $0.10 read, $10 out per MTok.
    const lines = responseCost("claude-sonnet-5-5", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 10_000,
      cache_creation_input_tokens: 3000,
      cache_creation: { ephemeral_5m_input_tokens: 2000, ephemeral_1h_input_tokens: 1000 },
    });
    expect(sum(lines)).toBeCloseTo(1000 * 2 + 2000 * 2.5 + 1000 * 4 + 10_000 * 0.1 + 500 * 10);
  });

  it("uses Haiku's higher rates when the whole prompt is over 100K tokens", () => {
    const short = sum(responseCost("claude-haiku-5-5", { input_tokens: 1000, cache_read_input_tokens: 98_000, output_tokens: 100 }));
    const long = sum(responseCost("claude-haiku-5-5", { input_tokens: 1000, cache_read_input_tokens: 100_000, output_tokens: 100 }));
    expect(short).toBeCloseTo(1000 * 0.1 + 98_000 * 0.01 + 100 * 0.5);
    expect(long).toBeCloseTo(1000 * 0.5 + 100_000 * 0.05 + 100 * 2.5);
  });

  it("prices fallback iterations at the fallback model's rates", () => {
    const lines = responseCost("claude-opus-5-5", {
      input_tokens: 0,
      output_tokens: 0,
      iterations: [
        { type: "message", model: "claude-opus-5-5", input_tokens: 100, output_tokens: 10 },
        { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 100, output_tokens: 10 },
      ],
    });
    expect(lines.map((l) => l.micros)).toEqual([100 * 4 + 10 * 20, 100 * 5 + 10 * 25]);
  });

  it("flags unknown models and applies the US-only multiplier", () => {
    const [line] = responseCost("claude-future-9", { input_tokens: 1000, output_tokens: 0 });
    expect(line.unknownModel).toBe(true);
    expect(sum(responseCost("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 0, inference_geo: "us" }))).toBeCloseTo(2200);
  });

  it("adds 30% and rounds up to a whole micro-dollar", () => {
    expect(withMarkup(100)).toBe(130);
    expect(withMarkup(58)).toBe(76);
    expect(withMarkup(0)).toBe(0);
  });

  it("holds more for bigger models and longer prompts, never below a cent", () => {
    expect(holdMicros("claude-haiku-5-5", 1000)).toBe(10_000);
    expect(holdMicros("claude-opus-5-5", 20_000)).toBeGreaterThan(holdMicros("claude-sonnet-5-5", 20_000));
    expect(holdMicros("claude-opus-5-5", 40_000)).toBeGreaterThan(holdMicros("claude-opus-5-5", 20_000));
  });

  it("estimates a typical turn well under a cent on Haiku", () => {
    expect(typicalTurnMicros("claude-haiku-5-5")).toBeLessThan(10_000);
    expect(typicalTurnMicros("claude-opus-5-5")).toBeGreaterThan(typicalTurnMicros("claude-sonnet-5-5"));
  });
});

describe("money", () => {
  it("formats small and normal amounts", () => {
    expect(formatUsd(2_500_000)).toBe("$2.50");
    expect(formatUsd(760)).toBe("$0.0008");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(-1_250_000)).toBe("-$1.25");
  });

  it("matches the agreed signup credit and coin conversion", () => {
    expect(SIGNUP_CREDIT_MICROS).toBe(2_500_000);
    expect(Math.abs(15 * LEGACY_COIN_MICROS - 2_500_000)).toBeLessThan(10); // $10 / 60 per coin; rounding is a few micro-dollars
  });
});

describe("ledger", () => {
  it("applies each refId once", async () => {
    const { stores, _debug } = createMemoryStores();
    const entry = { refId: "topup:pi_1", userId: "u", amountMicros: 5_000_000, kind: "topup" as const };
    expect(await stores.wallet.post(entry)).toBe("ok");
    expect(await stores.wallet.post(entry)).toBe("duplicate");
    expect(await stores.wallet.balance("u")).toBe(5_000_000);
    expect(_debug.ledger.size).toBe(1);
  });

  it("refuses debits that need funds the user doesn't have, without recording them", async () => {
    const { stores, _debug } = createMemoryStores({ u: 100 });
    expect(await stores.wallet.post({ refId: "h", userId: "u", amountMicros: -101, kind: "hold", requireFunds: true })).toBe("insufficient");
    expect(await stores.wallet.balance("u")).toBe(100);
    expect(_debug.ledger.size).toBe(0);
    expect(await stores.wallet.post({ refId: "c", userId: "u", amountMicros: -150, kind: "charge" })).toBe("ok");
    expect(await stores.wallet.balance("u")).toBe(-50);
  });
});
