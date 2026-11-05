import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Dreampool: solo adventures, told by a storyteller who remembers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Cormorant Garamond Bold as TrueType (what the image renderer reads), via the
 * Google Fonts CSS API. Falls back to a plain serif if it can't be fetched.
 */
async function loadDisplayFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700")).text();
    const url = /src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** The preview card shown when someone shares a Dreampool link. */
export default async function OpengraphImage() {
  const display = await loadDisplayFont();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#0d1015",
          backgroundImage: "radial-gradient(circle at 85% 0%, rgba(211,139,76,0.35), rgba(13,16,21,0) 55%)",
          color: "#ebe6da",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 52, backgroundColor: "#0d1015", backgroundImage: "radial-gradient(circle at 40% 35%, #f3d3b0, #d38b4c 45%, #0d1015 80%)" }} />
          <div style={{ fontSize: 40, fontFamily: display ? "Cormorant" : "serif", fontWeight: 700 }}>Dreampool</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, lineHeight: 1.02, fontFamily: display ? "Cormorant" : "serif", fontWeight: 700, maxWidth: 900 }}>
            Solo adventures, told by a storyteller who remembers.
          </div>
          <div style={{ fontSize: 30, color: "#9ba3b1" }}>Pick a storyteller. Make a character by talking. Play.</div>
        </div>
      </div>
    ),
    { ...size, ...(display ? { fonts: [{ name: "Cormorant", data: display, weight: 700 as const, style: "normal" as const }] } : {}) },
  );
}
