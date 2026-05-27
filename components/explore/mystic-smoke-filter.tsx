"use client";

/**
 * Injects the Mystic Smoke SVG filter into the DOM and generates CSS
 * rules that apply the filter + glow to specific tldraw draw shapes.
 *
 * Two visual states:
 *   1. **Drawing** — static mystic smoke haze + purple glow
 *   2. **Reviewing** — a single brief shimmer (< 1s) when a closed loop
 *      is detected on pen lift, then settles to the base drawing style.
 */

interface ReviewingShape {
  id: string;
  bounds: { x: number; y: number; w: number; h: number };
}

interface MysticSmokeFilterProps {
  shapeIds: string[];
  reviewingShapes?: ReviewingShape[];
  neonColor?: string;
}

export function MysticSmokeFilter({
  shapeIds,
  reviewingShapes = [],
  neonColor,
}: MysticSmokeFilterProps) {
  const reviewingIds = new Set(reviewingShapes.map((s) => s.id));
  const drawingOnly = shapeIds.filter((id) => !reviewingIds.has(id));

  const hasAny = shapeIds.length > 0 || reviewingShapes.length > 0;
  if (!hasAny) return null;

  // Lightweight mode: just tint strokes with a neon color + subtle glow
  if (neonColor) {
    const allSelectors = [...drawingOnly, ...reviewingShapes.map((s) => s.id)]
      .map((id) => `[data-shape-id="${id}"] .tl-svg-container`)
      .join(",\n");

    if (!allSelectors) return null;

    return (
      <style>{`
        ${allSelectors} {
          filter: drop-shadow(0 0 4px ${neonColor});
        }
        ${allSelectors} path,
        ${allSelectors} line,
        ${allSelectors} polyline {
          stroke: ${neonColor} !important;
        }
      `}</style>
    );
  }

  const baseFilter = `url(#mystic-smoke-haze)
            drop-shadow(0 0 6px rgba(102, 68, 204, 0.6))
            drop-shadow(0 0 12px rgba(68, 136, 255, 0.4))
            drop-shadow(0 0 24px rgba(170, 68, 255, 0.25))`;

  const drawingSelectors = drawingOnly
    .map((id) => `[data-shape-id="${id}"]`)
    .join(",\n");

  const reviewingSelectors = reviewingShapes
    .map((s) => `[data-shape-id="${s.id}"]`)
    .join(",\n");

  return (
    <>
      {/* Hidden SVG with filter definitions */}
      <svg
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        <defs>
          <filter
            id="mystic-smoke-haze"
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.025"
              numOctaves={4}
              seed={42}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={8}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation={3} result="haze" />
            <feColorMatrix
              in="haze"
              type="matrix"
              values="0.5 0 0.3 0 0.15
                      0 0.3 0.5 0 0.1
                      0.3 0 0.7 0 0.25
                      0 0 0 1 0"
              result="colored"
            />
            <feMerge>
              <feMergeNode in="colored" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      <style>{`
        @keyframes mystic-shimmer {
          0% {
            filter: ${baseFilter};
          }
          40% {
            filter: url(#mystic-smoke-haze)
                    drop-shadow(0 0 14px rgba(102, 68, 204, 0.9))
                    drop-shadow(0 0 28px rgba(68, 136, 255, 0.7))
                    drop-shadow(0 0 44px rgba(170, 68, 255, 0.45));
          }
          100% {
            filter: ${baseFilter};
          }
        }

        ${
          drawingSelectors
            ? `${drawingSelectors} {
          filter: ${baseFilter};
        }`
            : ""
        }

        ${
          reviewingSelectors
            ? `${reviewingSelectors} {
          animation: mystic-shimmer 0.6s ease-out 1 forwards;
          filter: ${baseFilter};
        }`
            : ""
        }
      `}</style>
    </>
  );
}
