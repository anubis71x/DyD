import { randomInt } from "crypto";

export type Advantage = "none" | "advantage" | "disadvantage";

export interface DiceRoll {
  notation: string; // normalized, e.g. "1d20+5"
  count: number;
  sides: number;
  modifier: number;
  advantage: Advantage;
  rolls: number[]; // every die rolled (both d20s for adv/dis)
  kept: number[]; // dice that count toward the total
  total: number;
  natural?: number; // the kept d20 face, when rolling a single d20
}

const NOTATION = /^\s*(\d{0,2})\s*d\s*(\d{1,4})\s*(?:([+-])\s*(\d{1,3}))?\s*$/i;

export class DiceError extends Error {}

export function parseNotation(input: string): { count: number; sides: number; modifier: number } {
  const m = NOTATION.exec(input);
  if (!m) throw new DiceError(`Can't read dice notation "${input}". Use forms like d20, 2d6+3 or d100.`);
  const count = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  const modifier = m[3] ? (m[3] === "-" ? -1 : 1) * Number(m[4]) : 0;
  if (count < 1 || count > 20) throw new DiceError("Roll between 1 and 20 dice at a time.");
  if (sides < 2 || sides > 1000) throw new DiceError("Dice need between 2 and 1000 sides.");
  return { count, sides, modifier };
}

/** `rng(sides)` returns an integer in [1, sides]. Defaults to a CSPRNG. */
export function roll(
  notation: string,
  advantage: Advantage = "none",
  rng: (sides: number) => number = (sides) => randomInt(1, sides + 1),
): DiceRoll {
  const { count, sides, modifier } = parseNotation(notation);
  const singleD20 = count === 1 && sides === 20;
  const adv = singleD20 ? advantage : "none";
  const rolls: number[] = [];
  for (let i = 0; i < (adv === "none" ? count : 2); i++) rolls.push(rng(sides));
  const kept = adv === "advantage" ? [Math.max(...rolls)] : adv === "disadvantage" ? [Math.min(...rolls)] : rolls;
  const total = kept.reduce((a, b) => a + b, 0) + modifier;
  const sign = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : "";
  return {
    notation: `${count}d${sides}${sign}`,
    count,
    sides,
    modifier,
    advantage: adv,
    rolls,
    kept,
    total,
    ...(singleD20 ? { natural: kept[0] } : {}),
  };
}

export function checkOutcome(r: DiceRoll, dc: number | undefined): "success" | "failure" | undefined {
  if (dc === undefined) return undefined;
  if (r.natural === 20) return "success";
  if (r.natural === 1) return "failure";
  return r.total >= dc ? "success" : "failure";
}

export function describeRoll(r: DiceRoll, label: string, dc?: number): string {
  const parts = r.advantage !== "none" ? `${r.rolls.join(" and ")}, kept ${r.kept[0]} (${r.advantage})` : r.rolls.join(" + ");
  const mod = r.modifier ? ` ${r.modifier > 0 ? "+" : "-"} ${Math.abs(r.modifier)}` : "";
  const outcome = checkOutcome(r, dc);
  const vs = dc !== undefined ? ` vs DC ${dc}: ${outcome}${r.natural === 20 ? " (natural 20)" : r.natural === 1 ? " (natural 1)" : ""}` : "";
  return `${label}: ${r.notation} → [${parts}]${mod} = ${r.total}${vs}`;
}
