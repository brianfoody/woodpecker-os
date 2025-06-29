"use client";

import { Spinner } from "@/components/spinner";

interface PointSpinnerProps {
  position: { x: number; y: number };
}

export function PointSpinner({ position }: PointSpinnerProps) {
  return (
    <div
      className="fixed pointer-events-none z-50 flex items-center justify-center"
      style={{
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="bg-white rounded-full p-2 shadow-lg border">
        <Spinner size="md" />
      </div>
    </div>
  );
}