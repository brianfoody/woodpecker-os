import {
  HTMLContainer,
  ShapeUtil,
  TLBaseShape,
  Rectangle2d,
} from 'tldraw';
import React from 'react';
import type { ThinkingAnimation } from '@/lib/woodpecker-theme';

// Module-level ref for cancel callback — set by tldraw-canvas.tsx
export const cancelClaudeCodeRef: { current: (() => void) | null } = { current: null };

// Module-level ref for retry callback — set by tldraw-canvas.tsx
export const retryClaudeCodeRef: { current: (() => void) | null } = { current: null };

// Module-level ref for dismiss callback — set by tldraw-canvas.tsx
export const dismissCancelledRef: { current: (() => void) | null } = { current: null };

// ── Peach cancel palette ────────────────────────────────────────────────────
const PEACH = {
  accent: '#ff9966',
  borderColor: '#ff996650',
  cardBg: 'rgba(255,153,102,0.025)',
  labelColor: '#ff996660',
  dotColor: '#ff9966',
  dotOpacity: 0.4,
  statusColor: '#ff9966cc',
  hintColor: '#ff996650',
};

export type ThinkingIndicatorShape = TLBaseShape<
  'thinking-indicator',
  {
    w: number;
    h: number;
    label: string;
    cancelled: boolean;
    cardBg: string;
    cardBorder: string;
    cardBorderWidth: number;
    cardRadius: number;
    cardShadow: string;
    cardLabelText: string;
    cardLabelColor: string;
    cardFont: string;
    thinkingColor: string;
    thinkingAnimation: ThinkingAnimation;
    labelFont?: string;
    labelFontSize?: number;
    labelFontWeight?: number;
    labelLetterSpacing?: string;
    labelUppercase?: boolean;
    dotColors?: string[];
  }
>;

const DOT_COLORS = ['#6b4f3a', '#6a5c42', '#9a8e7e', '#6a6e52', '#5a6e48'];

function DotWaveAnimation({ thinkingColor, label, cardFont, dotColors }: {
  thinkingColor: string;
  label: string;
  cardFont: string;
  dotColors?: string[];
}) {
  const colors = dotColors ?? DOT_COLORS;
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          height: '24px',
        }}
      >
        {colors.map((color, i) => (
          <div
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: color,
              animation: `thinking-dot-wave 1.4s ease-in-out ${i * 0.12}s infinite`,
            }}
          />
        ))}
        <span
          style={{
            marginLeft: 8,
            fontSize: '14px',
            color: thinkingColor,
            opacity: 0.7,
            fontFamily: cardFont,
          }}
        >
          {label}
        </span>
      </div>
      <style>{`
        @keyframes thinking-dot-wave {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </>
  );
}

function CyanRippleAnimation({ thinkingColor, label, cardFont }: {
  thinkingColor: string;
  label: string;
  cardFont: string;
  dotColors?: string[];
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '40px' }}>
        <div
          style={{
            width: 40,
            height: 40,
            position: 'relative',
            flexShrink: 0,
          }}
        >
          {[0, 0.6, 1.2].map((delay, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: `2px solid ${thinkingColor}`,
                borderRadius: '50%',
                animation: `thinking-ripple-expand 2.4s ease-out ${delay}s infinite`,
              }}
            />
          ))}
        </div>
        <span
          style={{
            fontSize: '12px',
            color: thinkingColor,
            opacity: 0.7,
            fontFamily: cardFont,
            letterSpacing: '0.06em',
          }}
        >
          {label}
        </span>
      </div>
      <style>{`
        @keyframes thinking-ripple-expand {
          0% {
            transform: scale(0.3);
            opacity: 0.8;
          }
          100% {
            transform: scale(1.2);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}

function CancelledState({ cardFont, label }: {
  cardFont: string;
  label: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        height: '24px',
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: PEACH.dotColor,
            opacity: PEACH.dotOpacity,
          }}
        />
      ))}
      <span
        style={{
          marginLeft: 8,
          fontSize: '14px',
          color: PEACH.statusColor,
          opacity: 0.6,
          fontFamily: cardFont,
        }}
      >
        {label}
      </span>
    </div>
  );
}

export class ThinkingIndicatorShapeUtil extends ShapeUtil<ThinkingIndicatorShape> {
  static override type = 'thinking-indicator' as const;

  getDefaultProps(): ThinkingIndicatorShape['props'] {
    return {
      w: 500,
      h: 90,
      label: 'thinking...',
      cancelled: false,
      cardBg: '#f3f0eb',
      cardBorder: '#6b4f3a',
      cardBorderWidth: 5,
      cardRadius: 16,
      cardShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
      cardLabelText: 'WOODPECKER',
      cardLabelColor: '#6b4f3a',
      cardFont: "'DM Sans', sans-serif",
      thinkingColor: '#6b4f3a',
      thinkingAnimation: 'dot-wave',
    };
  }

  getGeometry(shape: ThinkingIndicatorShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: false,
    });
  }

  component(shape: ThinkingIndicatorShape) {
    const {
      w, label, cancelled,
      cardBg, cardBorder, cardBorderWidth, cardRadius, cardShadow,
      cardLabelText, cardLabelColor, cardFont, thinkingColor,
      thinkingAnimation, dotColors,
      labelFont, labelFontSize, labelFontWeight, labelLetterSpacing, labelUppercase,
    } = shape.props;

    const AnimationComponent = thinkingAnimation === 'cyan-ripple'
      ? CyanRippleAnimation
      : DotWaveAnimation;

    return (
      <HTMLContainer id={shape.id}>
        <div
          style={{
            width: w,
            minWidth: 665,
            fontFamily: cardFont,
            padding: '20px 24px',
            background: cancelled ? PEACH.cardBg : cardBg,
            border: cancelled
              ? `1px solid ${PEACH.borderColor}`
              : cardBorderWidth ? `1px solid ${cardBorder}` : undefined,
            borderLeft: cancelled
              ? `${cardBorderWidth || 2}px solid ${PEACH.borderColor}`
              : cardBorderWidth ? `${cardBorderWidth}px solid ${cardBorder}` : undefined,
            borderRadius: `${cardRadius}px`,
            boxShadow: cancelled ? 'none' : (cardShadow || undefined),
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontSize: labelFontSize ? `${labelFontSize}px` : '11px',
              fontWeight: labelFontWeight ?? 600,
              letterSpacing: labelLetterSpacing ?? '0.08em',
              textTransform: (labelUppercase !== false ? 'uppercase' : 'none') as React.CSSProperties['textTransform'],
              color: cancelled ? PEACH.labelColor : cardLabelColor,
              marginBottom: '14px',
              fontFamily: labelFont ?? cardFont,
            }}
          >
            {cardLabelText}
          </div>

          {cancelled ? (
            <CancelledState cardFont={cardFont} label={label} />
          ) : (
            <AnimationComponent
              thinkingColor={thinkingColor}
              label={label}
              cardFont={cardFont}
              dotColors={dotColors}
            />
          )}

          <div
            style={{
              fontSize: '12px',
              color: cancelled ? PEACH.hintColor : thinkingColor,
              opacity: cancelled ? 1 : 0.5,
              fontFamily: cardFont,
              marginTop: '8px',
            }}
          >
            {cancelled ? 'tap to retry · scratch to dismiss' : 'tap to cancel'}
          </div>
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: ThinkingIndicatorShape) {
    return (
      <rect
        x={0}
        y={0}
        width={shape.props.w}
        height={shape.props.h}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
      />
    );
  }
}
