"use client";

import React from "react";

interface InteractionBubbleProps {
  question: string;
  options: string[];
  selectedOption?: string;
  status: "pending" | "answered";
  onSelect?: (option: string) => void;
}

export default function InteractionBubble({
  question,
  options,
  selectedOption,
  status,
  onSelect,
}: InteractionBubbleProps) {
  return (
    <div
      style={{
        fontFamily: "var(--font-kalam)",
        padding: "16px",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        backgroundColor: "#fefce8",
        borderRadius: "8px",
        border: "2px solid #d4a574",
        boxShadow: "2px 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <div
        style={{
          fontSize: "16px",
          color: "#374151",
          lineHeight: 1.4,
        }}
      >
        {question}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {options.map((option, index) => {
          const isSelected = selectedOption === option;
          return (
            <button
              key={index}
              onClick={() => {
                if (status === "pending" && onSelect) {
                  onSelect(option);
                }
              }}
              style={{
                fontFamily: "var(--font-kalam)",
                fontSize: "14px",
                padding: "8px 12px",
                borderRadius: "6px",
                border: isSelected ? "2px solid #8b5e3c" : "1px solid #d4a574",
                backgroundColor: isSelected ? "#fde68a" : "transparent",
                color: "#374151",
                cursor: status === "pending" ? "pointer" : "default",
                textAlign: "left",
                opacity: status === "answered" && !isSelected ? 0.5 : 1,
                transition: "all 0.15s ease",
              }}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
