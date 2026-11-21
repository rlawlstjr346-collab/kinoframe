import React from "react";

interface IconProps {
  className?: string;
}

export function KinoframeLogo({ className = "h-7 w-7" }: IconProps) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* 35mm film gate outer frame */}
      <rect
        x="2.25"
        y="4.25"
        width="31.5"
        height="27.5"
        rx="2.5"
        stroke="#F4F1EA"
        strokeWidth="1.5"
        strokeOpacity="0.9"
      />
      {/* Left & right 35mm sprocket perforations */}
      <rect x="4.5" y="7.5" width="2.2" height="3.2" rx="0.5" fill="#BEB9AE" fillOpacity="0.8" />
      <rect x="4.5" y="16.4" width="2.2" height="3.2" rx="0.5" fill="#D99B26" />
      <rect x="4.5" y="25.3" width="2.2" height="3.2" rx="0.5" fill="#BEB9AE" fillOpacity="0.8" />
      <rect x="29.3" y="7.5" width="2.2" height="3.2" rx="0.5" fill="#BEB9AE" fillOpacity="0.8" />
      <rect x="29.3" y="16.4" width="2.2" height="3.2" rx="0.5" fill="#D99B26" />
      <rect x="29.3" y="25.3" width="2.2" height="3.2" rx="0.5" fill="#BEB9AE" fillOpacity="0.8" />
      {/* Inner aperture gate */}
      <rect
        x="9.25"
        y="8.25"
        width="17.5"
        height="19.5"
        rx="1"
        stroke="#F4F1EA"
        strokeWidth="1.1"
        strokeOpacity="0.45"
      />
      {/* Viewfinder corner brackets */}
      <path d="M11.5 13V10.5H14" stroke="#D99B26" strokeWidth="1.4" strokeLinecap="square" />
      <path d="M24.5 13V10.5H22" stroke="#D99B26" strokeWidth="1.4" strokeLinecap="square" />
      <path d="M11.5 23V25.5H14" stroke="#D99B26" strokeWidth="1.4" strokeLinecap="square" />
      <path d="M24.5 23V25.5H22" stroke="#D99B26" strokeWidth="1.4" strokeLinecap="square" />
      {/* Optical center reticle */}
      <circle cx="18" cy="18" r="2.6" stroke="#D99B26" strokeWidth="1.4" />
      <path d="M18 13.5V15.4M18 20.6V22.5M13.5 18H15.4M20.6 18H22.5" stroke="#F4F1EA" strokeWidth="1.2" />
    </svg>
  );
}

export function SearchIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="8.75" cy="8.75" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

export function CloseIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

export function ResetIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4.5 8A5.75 5.75 0 1 1 5.6 13.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 4.25V8.25H8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

export function ViewfinderIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3 6.5V3H6.5M17 6.5V3H13.5M3 13.5V17H6.5M17 13.5V17H13.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function PerspectiveIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 3.5L10 10L17.5 3.5M2.5 16.5L10 10L17.5 16.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10" cy="10" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function ThirdsGridIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.5 3.5V16.5M12.5 3.5V16.5M2.5 7.83H17.5M2.5 12.17H17.5" stroke="currentColor" strokeWidth="1.15" />
    </svg>
  );
}

export function SymmetryIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 3.5V16.5M2.5 10H17.5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.8" />
    </svg>
  );
}

export function EyePathIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4.5 14L9.5 6.5L15.5 11.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4.5" cy="14" r="2" fill="currentColor" />
      <circle cx="9.5" cy="6.5" r="2" fill="currentColor" />
      <circle cx="15.5" cy="11.5" r="2" fill="currentColor" />
    </svg>
  );
}

export function CompareIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="3.5" width="6.25" height="13" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11.25" y="3.5" width="6.25" height="13" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 2V18" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.8 1.8" />
    </svg>
  );
}

export function BoardBookmarkIcon({
  className = "h-4 w-4",
  filled = false,
}: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 3.5H15V16.8L10 13.4L5 16.8V3.5Z"
        stroke="currentColor"
        strokeWidth="1.45"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

export function CopyIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="7" y="7" width="9.5" height="9.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M13 7V3.5H3.5V13H7" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function CheckIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4.5 10.5L8.2 14.2L15.8 6.2" stroke="currentColor" strokeWidth="1.65" strokeLinecap="square" />
    </svg>
  );
}

export function ShareLinkIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M8.2 11.8L11.8 8.2M7.2 8.2L5.3 10.1a2.7 2.7 0 0 0 3.8 3.8l1.9-1.9M12.8 11.8l1.9-1.9a2.7 2.7 0 0 0-3.8-3.8L9 8"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function ExternalLinkIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M11 3.5H16.5V9M16.2 3.8L9.5 10.5" stroke="currentColor" strokeWidth="1.45" strokeLinecap="square" />
      <path d="M14.5 12V16.5H3.5V5.5H8" stroke="currentColor" strokeWidth="1.45" />
    </svg>
  );
}

export function PlayIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M6.2 4.5L15.8 10L6.2 15.5V4.5Z" fill="currentColor" />
    </svg>
  );
}

export function FilmStripIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="4" width="15" height="12" stroke="currentColor" strokeWidth="1.35" />
      <path d="M6 4V16M14 4V16M2.5 8H6M2.5 12H6M14 8H17.5M14 12H17.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M12.5 4.5L7 10L12.5 15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M7.5 4.5L13 10L7.5 15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

export function MarkdownDocIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4.5 2.75H12.5L15.5 5.75V17.25H4.5V2.75Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.5 9.5H12.5M7.5 12.75H11" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  );
}
