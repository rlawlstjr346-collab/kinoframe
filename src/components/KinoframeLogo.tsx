"use client";

import React, { useId } from "react";

interface KinoframeLogoProps {
  className?: string;
}

/**
 * KINOFRAME. — Single-coordinate pure-vector Eurostile/Braun geometric wordmark.
 * - Cap-height: 24u (y: 4..28), unified stroke thickness: 4.8u, tight tracking: 3.0~3.4u
 * - Letter "O" replaced with a 1.35:1 (32.5 x 24u, rx=4.6, strokeWidth=4.8) cinema screen frame
 * - Vertical Anodized Champagne Brass gradient (#E5C883 -> #C89E52 -> #8A6529) applied to
 *   both the "O" frame and the trailing baseline period "."
 */
export function KinoframeLogo({
  className = "h-[clamp(19px,1.2vw,27px)] w-auto",
}: KinoframeLogoProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `kf-brass-${uid}`;

  return (
    <svg
      viewBox="0 0 232 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="KINOFRAME."
      className={className}
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="0"
          y1="4"
          x2="0"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#E5C883" />
          <stop offset="52%" stopColor="#C89E52" />
          <stop offset="100%" stopColor="#8A6529" />
        </linearGradient>
      </defs>

      {/* K (x: 2.0..23.2, y: 4..28, stem: 4.8) */}
      <path
        d="M2 4H6.8V13.8L16.6 4H23L12.6 14.8L23.4 28H17.2L8.8 17.8L6.8 19.7V28H2V4Z"
        fill="#F2EFE9"
      />

      {/* I (x: 26.2..31.0, y: 4..28, stem: 4.8) */}
      <rect x="26.2" y="4" width="4.8" height="24" fill="#F2EFE9" />

      {/* N (x: 34.2..56.6, y: 4..28, stem: 4.8) */}
      <path
        d="M34.2 4H39.6L51.8 20.6V4H56.6V28H51.2L39 11.4V28H34.2V4Z"
        fill="#F2EFE9"
      />

      {/* O — 1.35:1 Rounded Screen Frame (outer 32.5 x 24.0 at x:60.0..92.5 y:4.0..28.0, rx:4.6, strokeWidth:4.8) */}
      <rect
        x="62.4"
        y="6.4"
        width="27.7"
        height="19.2"
        rx="4.6"
        stroke={`url(#${gradId})`}
        strokeWidth="4.8"
      />

      {/* F (x: 95.9..115.4, y: 4..28, stem: 4.8) */}
      <path
        d="M95.9 4H115.4V8.8H100.7V13.8H113.2V18.4H100.7V28H95.9V4Z"
        fill="#F2EFE9"
      />

      {/* R (x: 118.6..141.0, y: 4..28, stem: 4.8) */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M118.6 4H134.2C138.4 4 140.4 6.2 140.4 10.6V12C140.4 15.6 138.9 17.6 135.8 18.3L141 28H135.5L130.7 18.8H123.4V28H118.6V4ZM123.4 8.6V14.2H133.4C134.9 14.2 135.6 13.4 135.6 11.9V10.9C135.6 9.4 134.9 8.6 133.4 8.6H123.4Z"
        fill="#F2EFE9"
      />

      {/* A (x: 144.0..167.0, y: 4..28, stem: 4.8) */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M152.5 4H158.5L167 28H161.8L159.9 22.8H151.1L149.2 28H144L152.5 4ZM155.5 9.8L152.6 18.2H158.4L155.5 9.8Z"
        fill="#F2EFE9"
      />

      {/* M (x: 170.2..197.0, y: 4..28, stem: 4.8) */}
      <path
        d="M170.2 4H176L183.6 17.6L191.2 4H197V28H192.2V12.2L185.5 24H181.7L175 12.2V28H170.2V4Z"
        fill="#F2EFE9"
      />

      {/* E (x: 200.2..220.2, y: 4..28, stem: 4.8) */}
      <path
        d="M200.2 4H220.2V8.8H205V13.7H218V18.3H205V23.2H220.2V28H200.2V4Z"
        fill="#F2EFE9"
      />

      {/* Trailing Baseline Period "." — Matching Anodized Champagne Brass Gradient */}
      <circle cx="226.4" cy="25.1" r="2.9" fill={`url(#${gradId})`} />
    </svg>
  );
}
