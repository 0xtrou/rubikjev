import { ImageResponse } from "next/og";

export const alt =
  "Jev Solves The Cube — scramble a Rubik's cube and watch Jev, the AI solver, judge and solve it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STICKERS = [
  "#f4f4f5", "#facc15", "#22c55e",
  "#3b82f6", "#ef4444", "#f4f4f5",
  "#f97316", "#22c55e", "#facc15",
];

function CubeMark({ size: s }: { size: number }) {
  const pad = s * 0.14;
  const cell = (s - pad * 2) / 3;
  const gap = cell * 0.18;
  return (
    <div
      style={{
        width: s,
        height: s,
        padding: pad - gap / 2,
        borderRadius: s * 0.22,
        background: "linear-gradient(135deg, #1d1d2b, #0c0c14)",
        border: "2px solid #2e2e42",
        display: "flex",
        flexWrap: "wrap",
      }}
    >
      {STICKERS.map((color, i) => (
        <div
          key={i}
          style={{
            width: cell - gap / 2,
            height: cell - gap / 2,
            margin: gap / 4,
            borderRadius: cell * 0.28,
            background: color,
            display: "flex",
          }}
        />
      ))}
    </div>
  );
}

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 56,
          background: "linear-gradient(135deg, #0d0d17 0%, #12122a 60%, #0a0a12 100%)",
          color: "#e4e4e7",
          fontFamily: "sans-serif",
        }}
      >
        {/* top row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <CubeMark size={96} />
            <div style={{ display: "flex", fontSize: 27, color: "#a1a1aa", letterSpacing: 1 }}>
              an AI-gamified twisty puzzle
            </div>
          </div>
          <div
            style={{
              display: "flex",
              whiteSpace: "nowrap",
              padding: "10px 20px",
              borderRadius: 999,
              border: "1px solid #3f3f52",
              color: "#a1a1aa",
              fontSize: 20,
              letterSpacing: 3,
            }}
          >
            EXPERIMENTAL · AI-GENERATED
          </div>
        </div>

        {/* title */}
        <div
          style={{
            display: "flex",
            whiteSpace: "nowrap",
            fontSize: 86,
            fontWeight: 900,
            letterSpacing: 1,
            lineHeight: 1,
          }}
        >
          <span style={{ color: "#34d399", display: "flex", paddingRight: 20 }}>JEV</span>
          <span style={{ color: "#e4e4e7", display: "flex", paddingRight: 20 }}>SOLVES THE</span>
          <span style={{ color: "#e879f9", display: "flex" }}>CUBE</span>
        </div>

        {/* subtitle */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", fontSize: 31, color: "#c8c8d2" }}>
            You scramble like a menace. Jev, the in-house AI solver, judges the chaos,
          </div>
          <div style={{ display: "flex", fontSize: 31, color: "#c8c8d2" }}>
            then cooks the solve live — meme tiers, XP, badges &amp; token stats included.
          </div>
        </div>

        {/* footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#71717a",
            fontSize: 25,
          }}
        >
          <div style={{ display: "flex", gap: 26 }}>
            <span style={{ display: "flex", color: "#facc15" }}>⭐ difficulty ratings</span>
            <span style={{ display: "flex", color: "#34d399" }}>⚡ live solve stream</span>
            <span style={{ display: "flex", color: "#e879f9" }}>🎫 token-metered runs</span>
          </div>
          <div style={{ display: "flex", color: "#a1a1aa" }}>rubikjev.solo.engineer</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
