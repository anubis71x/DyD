import { NextRequest, NextResponse } from "next/server";
import { handle, HttpError, requireUser } from "@/lib/api/http";
import { getMongoStores } from "@/lib/save/mongoStore";
import { MAX_IMPORT_BYTES, parseImport } from "@/lib/save/portable";
import { adoptSave } from "@/lib/save/service";

export const dynamic = "force-dynamic";

/** Upload a .dydsave file as the raw request body. */
export const POST = handle("import_POST", async (req: NextRequest) => {
  const userId = requireUser();
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_IMPORT_BYTES) throw new HttpError(413, "File is too large to be a save file.");
  const data = Buffer.from(await req.arrayBuffer());
  const save = parseImport(data);
  const adopted = await adoptSave(await getMongoStores(), userId, save);
  return NextResponse.json({ campaignId: adopted.campaignId }, { status: 201 });
});
