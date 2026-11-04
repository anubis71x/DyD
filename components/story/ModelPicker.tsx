"use client";

import { formatUsd } from "@/lib/billing/money";
import { typicalTurnMicros } from "@/lib/billing/pricing";
import { getModel, MODELS, type ModelId } from "@/lib/storyteller/models";

/** e.g. "about $0.0008 per turn" */
export const perTurn = (id: ModelId | undefined) => `about ${formatUsd(typicalTurnMicros(getModel(id).apiModel))} per turn`;

/** Radio cards for choosing the storyteller's model when starting a campaign. */
export function ModelCards({ value, onChange }: { value: ModelId; onChange: (id: ModelId) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm text-zinc-400">Storyteller model. You can switch at any time during play. You pay what each turn actually costs; these are typical amounts.</legend>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {MODELS.map((m) => {
          const selected = m.id === value;
          return (
            <label
              key={m.id}
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition ${
                selected ? "border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-white/10 bg-[#151a22] hover:border-white/25"
              }`}
            >
              <span className="flex items-center gap-2">
                <input type="radio" name="model" value={m.id} checked={selected} onChange={() => onChange(m.id)} className="accent-[color:var(--accent)]" />
                <span className="font-semibold">{m.name}</span>
                {m.id === "haiku" && <span className="ml-auto text-[11px] text-zinc-500">Default</span>}
              </span>
              <span className="text-sm text-zinc-400">{m.tagline}</span>
              <span className="font-mono text-xs text-zinc-500">{perTurn(m.id)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Compact switcher for the play screen header. */
export function ModelSelect({ value, onChange, disabled }: { value: ModelId; onChange: (id: ModelId) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
      <span className="sr-only sm:not-sr-only">Model</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ModelId)}
        className="rounded-full border border-white/10 bg-[#1c222d] px-3 py-1 text-xs text-zinc-200 focus:border-[color:var(--accent)] focus:outline-none disabled:opacity-50"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name.replace("Claude ", "")} · {perTurn(m.id)}
          </option>
        ))}
      </select>
    </label>
  );
}
