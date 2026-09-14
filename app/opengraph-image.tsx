import { ImageResponse } from "next/og";
import { PRODUCT_NAME } from "@/lib/brand";

export const alt = `${PRODUCT_NAME}: know if a job is worth applying to`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The share card shows the product doing its one job: a verdict with reasons.
export default function OpengraphImage() {
  // Icons are drawn, not typed: the default image font has no check mark glyph.
  const row = (kind: "met" | "partial", text: string, sub: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, color: "#18181b", whiteSpace: "nowrap" }}>
      <svg width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="15" fill={kind === "met" ? "#15803d" : "#b45309"} />
        {kind === "met" ? (
          <path d="M9 15.5l4 4 8-8.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M9.5 15h11" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        )}
      </svg>
      <div style={{ display: "flex" }}>{text}</div>
      <div style={{ display: "flex", color: "#71717a", marginLeft: 4 }}>{sub}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#fafafa", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", width: 56, height: 56, borderRadius: 14, background: "#18181b", alignItems: "center", justifyContent: "center" }}>
              <svg width="36" height="36" viewBox="0 0 32 32">
                <path d="M9.5 16.5l4.25 4.25L22.5 12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#18181b", letterSpacing: -1 }}>{PRODUCT_NAME}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", fontSize: 60, lineHeight: 1.08, fontWeight: 700, color: "#18181b", letterSpacing: -2 }}>Is this job worth applying to?</div>
            <div style={{ display: "flex", fontSize: 28, lineHeight: 1.35, color: "#52525b" }}>Paste a job link. Get apply, borderline or skip, with the reasons, checked against your real resume.</div>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#71717a" }}>Free and open source</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginLeft: "auto", width: 460, background: "#fff", border: "2px solid #e4e4e7", borderRadius: 24, padding: 36, gap: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#18181b" }}>Full-Stack Engineer</div>
            <div style={{ display: "flex", fontSize: 22, color: "#71717a" }}>Bengaluru · Full-time</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", width: 104, height: 104, borderRadius: 52, border: "9px solid #15803d", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 700, color: "#18181b" }}>
              84
            </div>
            <div style={{ display: "flex", background: "#f0fdf4", border: "2px solid #bbf7d0", color: "#15803d", borderRadius: 12, padding: "8px 18px", fontSize: 30, fontWeight: 700 }}>
              Apply
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {row("met", "React, TypeScript", "3 projects")}
            {row("met", "PostgreSQL", "shipped")}
            {row("partial", "Video processing", "partial")}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
