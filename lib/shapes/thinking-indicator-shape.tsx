import {
  HTMLContainer,
  ShapeUtil,
  TLBaseShape,
  Rectangle2d,
} from 'tldraw';
import React from 'react';

export type ThinkingIndicatorShape = TLBaseShape<
  'thinking-indicator',
  {
    w: number;
    h: number;
    label: string;
    cardBg: string;
    cardBorder: string;
    cardBorderWidth: number;
    cardRadius: number;
    cardShadow: string;
    cardLabelText: string;
    cardLabelColor: string;
    cardFont: string;
    thinkingColor: string;
  }
>;

const DOT_COLORS = ['#6b4f3a', '#6a5c42', '#9a8e7e', '#6a6e52', '#5a6e48'];

export class ThinkingIndicatorShapeUtil extends ShapeUtil<ThinkingIndicatorShape> {
  static override type = 'thinking-indicator' as const;

  getDefaultProps(): ThinkingIndicatorShape['props'] {
    return {
      w: 500,
      h: 90,
      label: 'thinking...',
      cardBg: '#f3f0eb',
      cardBorder: '#6b4f3a',
      cardBorderWidth: 5,
      cardRadius: 16,
      cardShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
      cardLabelText: 'WOODPECKER',
      cardLabelColor: '#6b4f3a',
      cardFont: "'DM Sans', sans-serif",
      thinkingColor: '#6b4f3a',
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
      w, label,
      cardBg, cardBorder, cardBorderWidth, cardRadius, cardShadow,
      cardLabelText, cardLabelColor, cardFont, thinkingColor,
    } = shape.props;

    return (
      <HTMLContainer id={shape.id}>
        <div
          style={{
            width: w,
            minWidth: 500,
            fontFamily: cardFont,
            padding: '20px 24px',
            background: cardBg,
            borderLeft: cardBorderWidth ? `${cardBorderWidth}px solid ${cardBorder}` : undefined,
            borderRadius: `${cardRadius}px`,
            boxShadow: cardShadow || undefined,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              color: cardLabelColor,
              marginBottom: '14px',
              fontFamily: cardFont,
            }}
          >
            {cardLabelText}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '24px',
            }}
          >
            {DOT_COLORS.map((color, i) => (
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
        </div>
        <style>{`
          @keyframes thinking-dot-wave {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
        `}</style>
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
