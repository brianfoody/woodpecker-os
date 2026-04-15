import {
  HTMLContainer,
  ShapeUtil,
  TLBaseShape,
  TLDefaultSizeStyle,
  Rectangle2d,
} from 'tldraw';
import React, { useEffect, useMemo, useRef } from 'react';

/**
 * Lightweight markdown-to-JSX renderer.
 * Supports: fenced code blocks, inline code, bold, and unordered list items.
 */
function renderMarkdown(
  text: string,
  opts: { codeBg?: string; codeColor?: string; codeBlockBg?: string; codeBlockColor?: string; monoFont?: string }
): React.ReactNode[] {
  const { codeBg = 'rgba(0,0,0,0.06)', codeColor = 'inherit', codeBlockBg = 'rgba(0,0,0,0.04)', codeBlockColor = 'inherit', monoFont = "'SF Mono', 'Fira Code', Consolas, monospace" } = opts;

  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      result.push(
        <pre
          key={`code-${result.length}`}
          style={{
            background: codeBlockBg,
            color: codeBlockColor,
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: '13px',
            lineHeight: 1.5,
            fontFamily: monoFont,
            margin: '8px 0',
            overflowX: 'auto',
            whiteSpace: 'pre',
          }}
        >
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    // Regular line — parse inline markdown
    result.push(
      <React.Fragment key={`line-${result.length}`}>
        {i > 0 && result.length > 0 ? '\n' : null}
        {renderInlineMarkdown(line, codeBg, codeColor, monoFont)}
      </React.Fragment>
    );
    i++;
  }

  return result;
}

function renderInlineMarkdown(line: string, codeBg: string, codeColor: string, monoFont: string): React.ReactNode[] {
  // Check for list item prefix
  let prefix: React.ReactNode = null;
  let content = line;
  const listMatch = line.match(/^(\s*)[-*]\s+/);
  if (listMatch) {
    prefix = <span key="list-prefix">{listMatch[1]}{'  \u2022  '}</span>;
    content = line.slice(listMatch[0].length);
  }

  const nodes: React.ReactNode[] = prefix ? [prefix] : [];
  // Match **bold** and `inline code`
  const regex = /(\*\*(.+?)\*\*|`([^`]+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }
    if (match[2] !== undefined) {
      // Bold
      nodes.push(<strong key={`b-${match.index}`}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      // Inline code
      nodes.push(
        <code
          key={`c-${match.index}`}
          style={{
            background: codeBg,
            color: codeColor,
            fontFamily: monoFont,
            fontSize: '0.85em',
            borderRadius: 4,
            padding: '1px 5px',
          }}
        >
          {match[3]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes;
}

export type HandwrittenTextShape = TLBaseShape<
  'handwritten-text',
  {
    w: number;
    h: number;
    text: string;
    font: 'kalam' | 'caveat' | 'sans';
    size: TLDefaultSizeStyle;
    color: string;
    autoSize: boolean;
    claudeSessionId: string | null;
    cardBg: string | null;
    cardBorder: string | null;
    cardBorderWidth: number;
    cardRadius: number;
    cardShadow: string | null;
    cardLabel: string | null;
    cardLabelColor: string | null;
    cardFont: string | null;
    cardPadding: string | null;
    cardLabelOpacity: number;
    cardTextOpacity: number;
  }
>;

export class HandwrittenTextShapeUtil extends ShapeUtil<HandwrittenTextShape> {
  static override type = 'handwritten-text' as const;

  getDefaultProps(): HandwrittenTextShape['props'] {
    return {
      w: 200,
      h: 50,
      text: '',
      font: 'kalam',
      size: 'm',
      color: 'black',
      autoSize: true,
      claudeSessionId: null,
      cardBg: null,
      cardBorder: null,
      cardBorderWidth: 0,
      cardRadius: 0,
      cardShadow: null,
      cardLabel: null,
      cardLabelColor: null,
      cardFont: null,
      cardPadding: null,
      cardLabelOpacity: 1,
      cardTextOpacity: 1,
    };
  }

  getGeometry(shape: HandwrittenTextShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: false,
    });
  }

  component(shape: HandwrittenTextShape) {
    return <HandwrittenTextComponent shape={shape} editor={this.editor} />;
  }

  indicator(shape: HandwrittenTextShape) {
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

  override canResize = () => true;

  override onResize = (shape: HandwrittenTextShape, info: any) => {
    const { scaleX, scaleY } = info;
    
    return {
      props: {
        w: Math.max(50, shape.props.w * scaleX),
        h: Math.max(20, shape.props.h * scaleY),
      },
    };
  };

  // Allow editing by double-clicking
  override canEdit = () => true;

  override onEditEnd = () => {
    // For now, just return void as expected by TLDraw
    return;
  };
}

// Extracted React component so we can use hooks for auto-sizing
function HandwrittenTextComponent({
  shape,
  editor,
}: {
  shape: HandwrittenTextShape;
  editor: any;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { text, font, size, color, cardBg, cardBorder, cardBorderWidth, cardRadius, cardShadow, cardLabel, cardLabelColor, cardFont, cardPadding, cardLabelOpacity, cardTextOpacity } = shape.props;

  const sizeMap = {
    s: '16px',
    m: '20px',
    l: '24px',
    xl: '28px',
  };

  const fontSize = sizeMap[size] || '20px';
  const baseFontFamily = font === 'caveat'
    ? 'var(--font-caveat)'
    : font === 'sans'
    ? 'system-ui, -apple-system, sans-serif'
    : 'var(--font-kalam)';
  const fontFamily = cardFont || baseFontFamily;

  const isCard = cardBg !== null;

  const renderedContent = useMemo(() => {
    if (font === 'sans') {
      const monoFont = "'SF Mono', 'Fira Code', Consolas, monospace";
      if (isCard) {
        return renderMarkdown(text, {
          codeBg: 'rgba(90,110,72,0.1)',
          codeColor: '#4a5c3a',
          codeBlockBg: '#e8eae2',
          codeBlockColor: '#4a5a3e',
          monoFont,
        });
      }
      return renderMarkdown(text, { monoFont });
    }
    return null; // handwriting fonts render as plain text
  }, [text, font, isCard]);

  // Auto-measure bounds using ResizeObserver so geometry stays in sync
  // with the rendered card — even after snapshot restore, font loading,
  // or text changes.
  const currentH = useRef(shape.props.h);
  currentH.current = shape.props.h;
  const currentW = useRef(shape.props.w);
  currentW.current = shape.props.w;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !shape.props.autoSize) return;

    const sync = () => {
      const measuredH = Math.ceil(el.scrollHeight) + 4;
      const measuredW = el.offsetWidth;

      const updates: Record<string, number> = {};

      if (Math.abs(measuredH - currentH.current) > 1) {
        updates.h = Math.max(measuredH, 20);
      }
      if (measuredW > 0 && Math.abs(measuredW - currentW.current) > 1) {
        updates.w = measuredW;
      }

      if (Object.keys(updates).length > 0) {
        editor.updateShape({
          id: shape.id,
          type: 'handwritten-text',
          props: updates,
        });
      }
    };

    // Initial measurement after layout settles
    const raf = requestAnimationFrame(sync);

    // Re-measure whenever the element resizes (e.g. font load, text reflow)
    const observer = new ResizeObserver(sync);
    observer.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [text, shape.id, shape.props.autoSize, shape.props.w, editor]);

  if (isCard) {
    return (
      <HTMLContainer id={shape.id}>
        <div
          ref={containerRef}
          style={{
            width: shape.props.w,
            minWidth: 500,
            fontFamily,
            fontSize,
            color,
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'hidden',
            padding: cardPadding || '20px 24px',
            background: cardBg!,
            borderLeft: cardBorderWidth ? `${cardBorderWidth}px solid ${cardBorder}` : undefined,
            borderRadius: `${cardRadius}px`,
            boxShadow: cardShadow || undefined,
          }}
        >
          {cardLabel && (
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: cardLabelColor || cardBorder || color,
                opacity: cardLabelOpacity,
                marginBottom: '8px',
                fontFamily,
              }}
            >
              {cardLabel}
            </div>
          )}
          <div style={{ opacity: cardTextOpacity }}>
            {renderedContent ?? text}
          </div>
        </div>
      </HTMLContainer>
    );
  }

  return (
    <HTMLContainer id={shape.id}>
      <div
        ref={containerRef}
        style={{
          width: shape.props.w,
          fontFamily,
          fontSize,
          color,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflow: 'hidden',
          padding: '4px',
        }}
      >
        {renderedContent ?? text}
      </div>
    </HTMLContainer>
  );
}