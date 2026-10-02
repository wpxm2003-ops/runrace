import { RoutePath, type PathPoint } from "@/lib/routePath";
import { CARD_W } from "@/lib/storyCard";

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const ROUTE_DESIGN = { width: 430, height: 260, padding: 16 } as const;

export type OverlayLayout = "vertical" | "horizontal";
export type OverlayStat = { label: string; value: string };

export function PhotoStatsOverlay({ base, cx, cy, scale, layout, stats, routePath }: {
  base: number; cx: number; cy: number; scale: number; layout: OverlayLayout;
  stats: OverlayStat[]; routePath: PathPoint[] | null;
}) {
  const u = (base / CARD_W) * scale;
  const horizontal = layout === "horizontal";
  const labelSize = (horizontal ? 30 : 34) * u;
  const valueSize = (horizontal ? 68 : 88) * u;
  return (
    <div style={{ position: "absolute", left: `${cx * 100}%`, top: `${cy * 100}%`,
      transform: "translate(-50%, -50%)", color: "#FFFFFF", fontFamily: FONT,
      textShadow: `0 ${2 * u}px ${16 * u}px rgba(0,0,0,0.65)`, whiteSpace: "nowrap",
      pointerEvents: "none", display: horizontal ? "flex" : "block", flexDirection: "column",
      alignItems: horizontal ? "center" : undefined }}>
      <div style={horizontal ? { display: "flex", gap: 52 * u, alignItems: "flex-start" } : undefined}>
        {stats.map(({ label, value }, index) => (
          <div key={label} style={{ marginTop: horizontal || index === 0 ? 0 : 34 * u }}>
            <div style={{ fontSize: labelSize, fontWeight: 500, opacity: 0.92, letterSpacing: 1 * u }}>{label}</div>
            <div style={{ fontSize: valueSize, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 * u }}>{value}</div>
          </div>
        ))}
      </div>
      {routePath && routePath.length > 1 ? (
        <div style={{ width: ROUTE_DESIGN.width * u, height: ROUTE_DESIGN.height * u,
          marginTop: 36 * u, marginLeft: horizontal ? 0 : -ROUTE_DESIGN.padding * u,
          filter: `drop-shadow(0 ${2 * u}px ${10 * u}px rgba(0,0,0,0.5))` }}>
          <RoutePath path={routePath} width={ROUTE_DESIGN.width} height={ROUTE_DESIGN.height}
            padding={ROUTE_DESIGN.padding} strokeWidths={[20, 10, 4.5]} startRadius={7}
            endRadius={8} endStrokeWidth={4}
            svgProps={{ width: "100%", height: "100%", "aria-hidden": true }} />
        </div>
      ) : null}
      <div style={{ marginTop: 40 * u, display: "flex", alignItems: "center", gap: 12 * u }}>
        <div style={{ width: 14 * u, height: 14 * u, borderRadius: "50%", background: "#34D399" }} />
        <div style={{ fontSize: 34 * u, fontWeight: 700, opacity: 0.95 }}>runrace.co.kr</div>
      </div>
    </div>
  );
}
