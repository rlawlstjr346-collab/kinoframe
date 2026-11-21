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
  const toPercent = (token: string, axis: "x" | "y"): number => {
    if (token.endsWith("%")) return Number.parseFloat(token);
    if (token === "left" || token === "top") return 18;
    if (token === "right" || token === "bottom") return 82;
    if (token === "center") return 50;
    return axis === "x" ? 50 : 50;
  };
  const x = toPercent(parts[0], "x");
  const y = toPercent(parts[1], "y");
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return [x, y];
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

  const strokeThin = compact ? 0.45 : 0.35;
  const strokeMed = compact ? 0.65 : 0.5;
  const nodeR = compact ? 2.5 : 2.1;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full select-none"
      style={{ opacity }}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="kf-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="4.5"
          markerHeight="4.5"
          orient="auto-start-reverse"
        >
          <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="#D99B26" />
        </marker>
      </defs>

      {/* Optical viewfinder frame corner registration marks */}
      <g stroke="#F4F1EA" strokeOpacity="0.45" strokeWidth={strokeThin}>
        <path d="M3 8V3H8" fill="none" />
        <path d="M97 8V3H92" fill="none" />
        <path d="M3 92V97H8" fill="none" />
        <path d="M97 92V97H92" fill="none" />
      </g>

      {/* 1. Rule of Thirds Grid */}
      {visibility.thirds && (
        <g>
          <line x1="33.33" y1="0" x2="33.33" y2="100" stroke="#F4F1EA" strokeOpacity="0.65" strokeWidth={strokeThin} />
          <line x1="66.67" y1="0" x2="66.67" y2="100" stroke="#F4F1EA" strokeOpacity="0.65" strokeWidth={strokeThin} />
          <line x1="0" y1="33.33" x2="100" y2="33.33" stroke="#F4F1EA" strokeOpacity="0.65" strokeWidth={strokeThin} />
          <line x1="0" y1="66.67" x2="100" y2="66.67" stroke="#F4F1EA" strokeOpacity="0.65" strokeWidth={strokeThin} />
          {[33.33, 66.67].map((x) =>
            [33.33, 66.67].map((y) => (
              <g key={`t-${x}-${y}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={compact ? 1.3 : 1.05}
                  fill="none"
                  stroke="#D99B26"
                  strokeWidth={strokeMed}
                />
              </g>
            ))
          )}
        </g>
      )}

      {/* 2. Horizontal & Vertical Symmetry Axes */}
      {visibility.symmetry && (
        <g>
          <line
            x1="50"
            y1="0"
            x2="50"
            y2="100"
            stroke="#F4F1EA"
            strokeOpacity="0.82"
            strokeWidth={strokeMed}
            strokeDasharray="2 1.6"
          />
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke="#F4F1EA"
            strokeOpacity="0.82"
            strokeWidth={strokeMed}
            strokeDasharray="2 1.6"
          />
          <rect
            x="47.2"
            y="47.2"
            width="5.6"
            height="5.6"
            fill="none"
            stroke="#D99B26"
            strokeWidth={strokeMed}
          />
        </g>
      )}

      {/* 3. One-Point Perspective Vanishing Point & Rays */}
      {visibility.perspective && (
        <g>
          {[
            [0, 0],
            [50, 0],
            [100, 0],
            [100, 50],
            [100, 100],
            [50, 100],
            [0, 100],
            [0, 50],
          ].map(([ex, ey], idx) => (
            <line
              key={`ray-${idx}`}
              x1={vx}
              y1={vy}
              x2={ex}
              y2={ey}
              stroke="#D99B26"
              strokeOpacity={idx % 2 === 0 ? "0.75" : "0.35"}
              strokeWidth={idx % 2 === 0 ? strokeMed : strokeThin}
              strokeDasharray={idx % 2 === 0 ? undefined : "1.5 1.5"}
            />
          ))}
          {/* Concentric vanishing point reticle */}
          <circle cx={vx} cy={vy} r={compact ? 4.2 : 3.4} fill="rgba(9, 9, 11, 0.45)" stroke="#D99B26" strokeWidth={strokeMed} />
          <circle cx={vx} cy={vy} r={compact ? 1.1 : 0.9} fill="#D99B26" />
          <line x1={vx - 5.5} y1={vy} x2={vx + 5.5} y2={vy} stroke="#F4F1EA" strokeWidth={strokeThin} />
          <line x1={vx} y1={vy - 5.5} x2={vx} y2={vy + 5.5} stroke="#F4F1EA" strokeWidth={strokeThin} />
        </g>
      )}

      {/* 4. 1 -> 2 -> 3 Eye-Tracking Vector Path */}
      {visibility.eyePath && (
        <g>
          <path
            d={`M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]}`}
            fill="none"
            stroke="#09090B"
            strokeOpacity="0.65"
            strokeWidth={strokeMed * 2.4}
          />
          <path
            d={`M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]}`}
            fill="none"
            stroke="#D99B26"
            strokeWidth={strokeMed * 1.3}
            markerEnd="url(#kf-arrow)"
          />
          <path
            d={`M ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]}`}
            fill="none"
            stroke="#D99B26"
            strokeWidth={strokeMed * 1.3}
            strokeDasharray="2.2 1.2"
            markerEnd="url(#kf-arrow)"
          />
          {[p1, p2, p3].map((pt, idx) => (
            <g key={`eye-${idx}`}>
              <circle
                cx={pt[0]}
                cy={pt[1]}
                r={nodeR}
                fill="#09090B"
                stroke="#D99B26"
                strokeWidth={strokeMed * 1.2}
              />
              <text
                x={pt[0]}
                y={pt[1] + 0.9}
                textAnchor="middle"
                fill="#F4F1EA"
                fontSize={compact ? "3.1" : "2.6"}
                fontFamily="monospace"
                fontWeight="700"
              >
                {idx + 1}
              </text>
            </g>
          ))}
        </g>
      )}

      {/* 5. Active Contact Sheet Focus Crop Reticle */}
      {focusPt && (
        <g>
          <rect
            x={Math.max(2, Math.min(72, focusPt[0] - 13))}
            y={Math.max(2, Math.min(72, focusPt[1] - 13))}
            width="26"
            height="26"
            fill="rgba(217, 155, 38, 0.08)"
            stroke="#D99B26"
            strokeWidth={strokeMed * 1.2}
            strokeDasharray="2 1.2"
          />
          <circle cx={focusPt[0]} cy={focusPt[1]} r="1.2" fill="#F4F1EA" />
        </g>
      )}
    </svg>
  );
}
