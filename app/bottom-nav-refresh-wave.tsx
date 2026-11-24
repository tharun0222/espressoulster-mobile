"use client";

import { useId } from "react";

export default function BottomNavRefreshWave({ outline, onEnd }: {
  outline: string;
  onEnd: () => void;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <>
      <defs>
        <clipPath id={id + "-clip"}><use href={"#" + outline} /></clipPath>
        <path id={id + "-left"} d="M190 43C172 43 165 39 155 33S138 28 128 29C98 32 77 33 48 31" pathLength="100" />
        <path id={id + "-right"} d="M190 43C208 43 215 39 225 33S242 28 252 29C282 32 303 33 332 31" pathLength="100" />
        <linearGradient id={id + "-coffee"} x1="0" x2="0" y1="0" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#e8b57e" />
          <stop offset=".48" stopColor="#be784a" stopOpacity=".8" />
          <stop offset="1" stopColor="#a46e55" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id + "-light"}>
          <stop stopColor="#fff4d9" />
          <stop offset=".42" stopColor="#f3b674" stopOpacity=".68" />
          <stop offset="1" stopColor="#f3b674" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <ellipse className="bottom-nav-entry-light" cx="190" cy="43" rx="19" ry="7" fill={`url(#${id}-light)`} stroke="none"
          onAnimationEnd={(event) => { if (event.animationName === "bottom-nav-refresh-glow") onEnd(); }} />
        <use href={"#" + id + "-left"} className="bottom-nav-refresh-wave" stroke={`url(#${id}-coffee)`} />
        <use href={"#" + id + "-right"} className="bottom-nav-refresh-wave" stroke={`url(#${id}-coffee)`} />
        <use href={"#" + id + "-left"} className="bottom-nav-wave-crest" onAnimationEnd={onEnd} />
        <use href={"#" + id + "-right"} className="bottom-nav-wave-crest" />
      </g>
    </>
  );
}
