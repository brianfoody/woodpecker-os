import { ImageResponse } from "next/og";

export const alt = "Woodpecker: a notebook that reads along";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#f7f3ea",
          position: "relative",
          color: "#1d1b18",
        }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            style={{ position: "absolute", left: 0, right: 0, top: 70 + i * 64, height: 1, background: "#e4dccb" }}
          />
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 36, fontWeight: 600 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: "#7c5cff" }} />
          Woodpecker
        </div>
        <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, marginTop: 36, letterSpacing: -2 }}>
          A notebook that reads along.
        </div>
        <div style={{ fontSize: 34, marginTop: 28, color: "#5b554b", maxWidth: 900, lineHeight: 1.35 }}>
          Write or speak your day. A mark in the margin gets things ready. Nothing happens until you tick.
        </div>
      </div>
    ),
    size
  );
}
