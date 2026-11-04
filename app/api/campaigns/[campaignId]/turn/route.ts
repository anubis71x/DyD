import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireUser } from "@/lib/api/http";
import { getMongoStores } from "@/lib/save/mongoStore";
import { loadCampaign } from "@/lib/save/service";
import { runTurn } from "@/lib/storyteller/engine";
import type { TableEvent, TurnInput } from "@/lib/storyteller/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

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

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

/**
 * One turn per campaign at a time. In-process only: when the app runs on
 * more than one instance, move this to a lock in the database.
 */
const inFlight = new Set<string>();

export const POST = handle("turn_POST", async (req: NextRequest, { params }: { params: { campaignId: string } }) => {
  const userId = requireUser();
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "That action couldn't be read.");
  const input = parsed.data as TurnInput;

  const stores = await getMongoStores();
  await loadCampaign(stores, userId, params.campaignId); // 404 before opening a stream

  const key = `${userId}:${params.campaignId}`;
  if (inFlight.has(key)) throw new HttpError(409, "The storyteller is still answering your last move.");
  inFlight.add(key);

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
        inFlight.delete(key);
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
