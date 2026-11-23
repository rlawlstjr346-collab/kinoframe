import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "KINOFRAME. — Cinema & TVCF Moving Reference Archive";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 84px",
          backgroundColor: "#0A0B0E",
          color: "#F2EFE9",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              fontSize: "20px",
              letterSpacing: "0.18em",
              color: "#C89E52",
              fontWeight: 700,
            }}
          >
            <span>ANODIZED DARKROOM REFERENCE WALL</span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "8px 20px",
              borderRadius: "9999px",
              border: "1px solid rgba(200, 158, 82, 0.45)",
              color: "#C89E52",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            CINEMA · TVCF · 60FPS LOOPS
          </div>
        </div>

        {/* Center Anodized Champagne Brass KINOFRAME. Brand Mark */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "96px",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            <span style={{ color: "#F2EFE9" }}>KIN</span>
            <div
              style={{
                display: "flex",
                width: "106px",
                height: "78px",
                borderRadius: "16px",
                border: "14px solid #C89E52",
                marginLeft: "4px",
                marginRight: "4px",
              }}
            />
            <span style={{ color: "#F2EFE9" }}>FRAME</span>
            <div
              style={{
                display: "flex",
                width: "22px",
                height: "22px",
                borderRadius: "9999px",
                backgroundColor: "#C89E52",
                alignSelf: "flex-end",
                marginBottom: "8px",
                marginLeft: "4px",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              fontSize: "30px",
              color: "#C8C4BC",
              fontWeight: 500,
            }}
          >
            광고 · 영화 영상 연출 구도 · 원테이크 샷 · 시네마틱 색감 아카이브
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            paddingTop: "24px",
            fontSize: "20px",
            color: "#7E7B74",
          }}
        >
          <span>Film &amp; Commercial Visual Reference Archive</span>
          <span style={{ color: "#C89E52", fontWeight: 600 }}>
            kinoframe.vercel.app
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
