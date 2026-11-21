"use client";

import React from "react";
import type { OverlayVisibility, ViewfinderSpec } from "@/types/archive";

interface ViewfinderOverlayProps {
  viewfinder: ViewfinderSpec;
  visibility: OverlayVisibility;
  opacity: number;
  activeFocusCrop?: string | null;
  compact?: boolean;
}

function parseFocusCropToPoint(focusCrop: string): [number, number] | null {
  const parts = focusCrop.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const toPercent = (token: string): number => {
    if (token.endsWith("%")) return Number.parseFloat(token);
    if (token === "left" || token === "top") return 18;
    if (token === "right" || token === "bottom") return 82;
    if (token === "center") return 50;
    return 50;
  };
  const x = toPercent(parts[0]);
  const y = toPercent(parts[1]);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return [x, y];
}

/**
 * Smooth Catmull-Rom to Cubic Bezier SVG path through 3 eye-tracking points
 * so the optical trajectory feels fluid rather than jagged.
 */
function buildSmoothEyePath(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number]
): string {
  // Control points computed via centripetal tangent at p2
  const dx = (p3[0] - p1[0]) * 0.22;
  const dy = (p3[1] - p1[1]) * 0.22;
  const c1x = p1[0] + (p2[0] - p1[0]) * 0.45;
  const c1y = p1[1] + (p2[1] - p1[1]) * 0.45;
  const c2x = p2[0] - dx;
  const c2y = p2[1] - dy;
  const c3x = p2[0] + dx;
  const c3y = p2[1] + dy;
  const c4x = p3[0] - (p3[0] - p2[0]) * 0.45;
  const c4y = p3[1] - (p3[1] - p2[1]) * 0.45;

  return `M ${p1[0]} ${p1[1]} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0]} ${p2[1]} C ${c3x.toFixed(2)} ${c3y.toFixed(2)}, ${c4x.toFixed(2)} ${c4y.toFixed(2)}, ${p3[0]} ${p3[1]}`;
}

export function ViewfinderOverlay({
  viewfinder,
  visibility,
  opacity,
  activeFocusCrop,
  compact = false,
}: ViewfinderOverlayProps) {
  const [vx, vy] = viewfinder.vanishingPoint;
  const [p1, p2, p3] = viewfinder.eyePath;
  const focusPt = activeFocusCrop ? parseFocusCropToPoint(activeFocusCrop) : null;

  const hasAny =
    visibility.perspective ||
    visibility.thirds ||
    visibility.symmetry ||
    visibility.eyePath ||
    Boolean(focusPt);

  if (!hasAny) return null;

  const hairlineColor = "rgba(255, 255, 255, 0.42)";
  const crispIvory = "rgba(244, 241, 234, 0.85)";
  const curveColor = "rgba(244, 241, 234, 0.72)";
  const cornerColor = "rgba(255, 255, 255, 0.62)";

  return (
    <div
      className="pointer-events-none absolute inset-0 h-full w-full select-none overflow-hidden"
      style={{
        opacity,
        filter: "drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.8))",
      }}
      aria-hidden="true"
    >
      {/* Razor-Sharp 1px Non-Scaling Hairline Geometry Layer */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {/* Leica-style Minimal L Corner Registration Marks */}
        <g
          stroke={cornerColor}
          strokeWidth={1}
          fill="none"
          vectorEffect="non-scaling-stroke"
        >
          <path d="M 2.5 7.5 V 2.5 H 7.5" vectorEffect="non-scaling-stroke" />
          <path d="M 97.5 7.5 V 2.5 H 92.5" vectorEffect="non-scaling-stroke" />
          <path d="M 2.5 92.5 V 97.5 H 7.5" vectorEffect="non-scaling-stroke" />
          <path d="M 97.5 92.5 V 97.5 H 92.5" vectorEffect="non-scaling-stroke" />
        </g>

        {/* 1. Optical Rule of Thirds Hairlines */}
        {visibility.thirds && (
          <g stroke={hairlineColor} strokeWidth={1} fill="none">
            <line x1="33.33" y1="0" x2="33.33" y2="100" vectorEffect="non-scaling-stroke" />
            <line x1="66.67" y1="0" x2="66.67" y2="100" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="33.33" x2="100" y2="33.33" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="66.67" x2="100" y2="66.67" vectorEffect="non-scaling-stroke" />
            {[33.33, 66.67].map((x) =>
              [33.33, 66.67].map((y) => (
                <g key={`tp-${x}-${y}`} stroke={crispIvory} strokeWidth={1}>
                  <line
                    x1={x - 1.1}
                    y1={y}
                    x2={x + 1.1}
                    y2={y}
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={x}
                    y1={y - 1.4}
                    x2={x}
                    y2={y + 1.4}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ))
            )}
          </g>
        )}

        {/* 2. Optical Symmetry Hairlines */}
        {visibility.symmetry && (
          <g stroke={hairlineColor} strokeWidth={1} fill="none">
            <line
              x1="50"
              y1="0"
              x2="50"
              y2="100"
              strokeDasharray="4 6"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="0"
              y1="50"
              x2="100"
              y2="50"
              strokeDasharray="4 6"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="48.4"
              y1="50"
              x2="51.6"
              y2="50"
              stroke={crispIvory}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="50"
              y1="48"
              x2="50"
              y2="52"
              stroke={crispIvory}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}

        {/* 3. ARRI-Style Minimal Perspective Convergence Hairlines */}
        {visibility.perspective && (
          <g fill="none">
            {[
              [0, 0],
              [100, 0],
              [100, 100],
              [0, 100],
            ].map(([ex, ey], idx) => (
              <line
                key={`vp-ray-${idx}`}
                x1={vx}
                y1={vy}
                x2={ex}
                y2={ey}
                stroke={hairlineColor}
                strokeWidth={1}
                strokeDasharray="4 6"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <line
              x1="0"
              y1={vy}
              x2="100"
              y2={vy}
              stroke="rgba(255, 255, 255, 0.24)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}

        {/* 4. Fluid Optical Eye-Path Bezier Curve */}
        {visibility.eyePath && (
          <path
            d={buildSmoothEyePath(p1, p2, p3)}
            fill="none"
            stroke={curveColor}
            strokeWidth={1.25}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* 5. Optional Focus Crop Hairline Frame */}
        {focusPt && (
          <rect
            x={Math.max(2, Math.min(72, focusPt[0] - 13))}
            y={Math.max(2, Math.min(72, focusPt[1] - 13))}
            width="26"
            height="26"
            fill="none"
            stroke={crispIvory}
            strokeWidth={1}
            strokeDasharray="4 5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Aspect-Ratio-True Precision Optical Reticles & Micro Nodes (Zero Oval Distortion) */}
      {visibility.perspective && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${vx}%`, top: `${vy}%` }}
        >
          <svg
            width={compact ? 18 : 22}
            height={compact ? 18 : 22}
            viewBox="0 0 22 22"
            fill="none"
          >
            <circle
              cx="11"
              cy="11"
              r="5.5"
              stroke={crispIvory}
              strokeWidth="1"
            />
            <line x1="11" y1="1.5" x2="11" y2="6.5" stroke={crispIvory} strokeWidth="1" />
            <line x1="11" y1="15.5" x2="11" y2="20.5" stroke={crispIvory} strokeWidth="1" />
            <line x1="1.5" y1="11" x2="6.5" y2="11" stroke={crispIvory} strokeWidth="1" />
            <line x1="15.5" y1="11" x2="20.5" y2="11" stroke={crispIvory} strokeWidth="1" />
            <circle cx="11" cy="11" r="1" fill={crispIvory} />
          </svg>
        </div>
      )}

      {visibility.eyePath &&
        [p1, p2, p3].map((pt, idx) => (
          <div
            key={`eye-node-${idx}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pt[0]}%`, top: `${pt[1]}%` }}
          >
            <div className="relative flex items-center justify-center">
              <span className="h-[6px] w-[6px] rounded-full bg-[#F4F1EA] ring-1 ring-[#09090B]/70" />
              <span
                className={`absolute left-2.5 top-[-8px] font-mono tracking-wider text-[#F4F1EA]/90 ${
                  compact ? "text-[9px]" : "text-[10px]"
                }`}
              >
                0{idx + 1}
              </span>
            </div>
          </div>
        ))}
    </div>
  );
}
