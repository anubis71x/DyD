import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireUser } from "@/lib/api/http";
import { getMongoStores } from "@/lib/save/mongoStore";
import { createCampaign } from "@/lib/save/service";
import { STORYTELLERS } from "@/lib/storyteller/storytellers";

export const dynamic = "force-dynamic";

const MAX_CAMPAIGNS = 20;

export const GET = handle("campaigns_GET", async () => {
  const userId = requireUser();
  const stores = await getMongoStores();
  const [campaigns, coins] = await Promise.all([stores.campaigns.list(userId), stores.wallet.balance(userId)]);
  return NextResponse.json({ campaigns, coins });
});

const CreateBody = z.object({
  storytellerId: z.enum(STORYTELLERS.map((s) => s.id) as [string, ...string[]]),
  title: z.string().trim().min(1).max(80).optional(),
  language: z.string().min(2).max(40).optional(),
});

export const POST = handle("campaigns_POST", async (req: NextRequest) => {
  const userId = requireUser();
  const body = CreateBody.safeParse(await req.json().catch(() => null));
  if (!body.success) throw new HttpError(400, "Choose a storyteller to start a campaign.");
  const stores = await getMongoStores();
  if ((await stores.campaigns.list(userId)).length >= MAX_CAMPAIGNS) {
    throw new HttpError(400, `You can keep up to ${MAX_CAMPAIGNS} campaigns. Delete one to start another.`);
  }
  const save = await createCampaign(stores, userId, {
    title: body.data.title ?? "A new tale",
    storytellerId: body.data.storytellerId,
    ...(body.data.language ? { language: body.data.language } : {}),
  });
  return NextResponse.json({ campaignId: save.campaignId }, { status: 201 });
});
