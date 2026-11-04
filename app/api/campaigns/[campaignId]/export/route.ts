import { handle, requireUser } from "@/lib/api/http";
import { getMongoStores } from "@/lib/save/mongoStore";
import { exportSave } from "@/lib/save/portable";
import { slugify } from "@/lib/save/reducer";
import { loadCampaign } from "@/lib/save/service";

export const dynamic = "force-dynamic";

export const GET = handle("export_GET", async (_req: Request, { params }: { params: { campaignId: string } }) => {
  const userId = requireUser();
  const save = await loadCampaign(await getMongoStores(), userId, params.campaignId);
  const body = exportSave(save, new Date().toISOString());
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${slugify(save.title)}.dydsave"`,
      "Cache-Control": "no-store",
    },
  });
});
