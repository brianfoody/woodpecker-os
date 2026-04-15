"use client";

import { Spinner } from "@/components/spinner";
import type { WoodpeckerCanvasTheme } from "@/lib/woodpecker-theme";

interface PointSpinnerProps {
  position: { x: number; y: number };
  theme?: WoodpeckerCanvasTheme;
}

export function PointSpinner({ position, theme }: PointSpinnerProps) {
  return (
    <div
      className="fixed pointer-events-none z-50 flex items-center justify-center"
      style={{
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div
        className="rounded-full p-2 shadow-lg border"
        style={{ backgroundColor: theme?.canvasBg ?? "white" }}
      >
        <Spinner size="md" />
      </div>
    </div>
  );
}