import { createHash } from "crypto";
import { gunzipSync, gzipSync } from "zlib";
import { SaveFileSchema, type SaveFile } from "./schema";

/**
 * `.dydsave` portable format: gzip-compressed JSON
 *   { format: "dydsave", version: 1, exportedAt, sha256, save }
 * where sha256 is the hex digest of JSON.stringify(save). Ownership is not
 * trusted on import: the importer's id replaces `ownerId`.
 */

export const DYDSAVE_FORMAT = "dydsave" as const;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const digest = (save: SaveFile) => createHash("sha256").update(JSON.stringify(save)).digest("hex");

export function exportSave(save: SaveFile, now: string): Buffer {
  // Normalize through the schema so key order matches what parseImport hashes.
  const normalized = SaveFileSchema.parse(save);
  const envelope = { format: DYDSAVE_FORMAT, version: 1, exportedAt: now, sha256: digest(normalized), save: normalized };
  return gzipSync(Buffer.from(JSON.stringify(envelope), "utf8"));
}

export class ImportError extends Error {}

export function parseImport(data: Buffer): SaveFile {
  if (data.length > MAX_IMPORT_BYTES) throw new ImportError("File is too large to be a save file.");
  let json: string;
  try {
    // Accept both gzipped and plain JSON (handy for hand-edited saves).
    json = data[0] === 0x1f && data[1] === 0x8b
      ? gunzipSync(data, { maxOutputLength: MAX_IMPORT_BYTES * 10 }).toString("utf8")
      : data.toString("utf8");
  } catch {
    throw new ImportError("File is not a valid .dydsave archive.");
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(json);
  } catch {
    throw new ImportError("File does not contain valid JSON.");
  }
  const e = envelope as { format?: unknown; save?: unknown; sha256?: unknown };
  if (e?.format !== DYDSAVE_FORMAT) throw new ImportError("This is not a Dreampool save file.");
  const parsed = SaveFileSchema.safeParse(e.save);
  if (!parsed.success) throw new ImportError(`Save file failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  if (typeof e.sha256 === "string" && e.sha256 !== digest(parsed.data)) {
    throw new ImportError("Save file checksum does not match. It may be corrupted or edited.");
  }
  return parsed.data;
}
