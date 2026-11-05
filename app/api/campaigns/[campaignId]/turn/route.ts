import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireUser } from "@/lib/api/http";
import { getMongoStores } from "@/lib/save/mongoStore";
import { loadCampaign } from "@/lib/save/service";
import { acquireCampaignLock, campaignLockKey, getClient } from "@/lib/storyteller/client";
import { runTurn } from "@/lib/storyteller/engine";
import type { TableEvent, TurnInput } from "@/lib/storyteller/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A turn plus the compaction that may follow it (and up to 30 s waiting for the lock).
export const maxDuration = 140;

const Input = z.discriminatedUnion("type", [
  z.object({ type: z.literal("begin") }),
  z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("choice"), text: z.string().trim().min(1).max(200) }),
  z.object({
    type: z.literal("roll"),
    notation: z.string().max(20),
    label: z.string().trim().min(1).max(80),
    dc: z.number().int().min(1).max(40).optional(),
    advantage: z.enum(["none", "advantage", "disadvantage"]).optional(),
  }),
]);


export const POST = handle("turn_POST", async (req: NextRequest, { params }: { params: { campaignId: string } }) => {
  const userId = requireUser();
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "That action couldn't be read.");
  const input = parsed.data as TurnInput;

  const stores = await getMongoStores();
  await loadCampaign(stores, userId, params.campaignId); // 404 before opening a stream

  // One turn per campaign at a time, across all server instances.
  const key = campaignLockKey(userId, params.campaignId);
  const lock = await acquireCampaignLock(stores.locks, key);
  if (!lock) throw new HttpError(409, "The storyteller is still answering your last move.");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: TableEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          open = false; // client went away; keep running so the turn is saved
        }
      };
      try {
        await runTurn(userId, params.campaignId, input, { stores, client: getClient(), emit });
      } catch (err) {
        console.error("[turn_POST]", err);
        emit({ type: "error", code: "upstream", message: "Something went wrong. Your progress up to this point is saved." });
      } finally {
        await stores.locks.release(key, lock);
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
