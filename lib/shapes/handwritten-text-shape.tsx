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
  let lastWasBlock = false;

  while (i < lines.length) {
    const line = lines[i];

    // Markdown table — collect consecutive lines starting with |
    if (line.trimStart().startsWith('|') && line.trimEnd().endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|') && lines[i].trimEnd().endsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        // Parse header row
        const parseRow = (row: string) =>
          row.split('|').slice(1, -1).map((cell) => cell.trim());
        const headerCells = parseRow(tableLines[0]);

        // Check if second line is separator (|---|---|)
        const isSeparator = /^\|[\s:-]+\|/.test(tableLines[1]) && tableLines[1].replace(/[\s|:-]/g, '') === '';
        const bodyStart = isSeparator ? 2 : 1;
        const bodyRows = tableLines.slice(bodyStart).map(parseRow);

        result.push(
          <table
            key={`table-${result.length}`}
            style={{
              borderCollapse: 'collapse',
              margin: '8px 0',
              fontSize: '0.9em',
              width: '100%',
            }}
          >
            {isSeparator && (
              <thead>
                <tr>
                  {headerCells.map((cell, ci) => (
                    <th
                      key={ci}
                      style={{
                        border: '1px solid rgba(128,128,128,0.3)',
                        padding: '6px 10px',
                        textAlign: 'left',
                        fontWeight: 600,
                        background: 'rgba(128,128,128,0.06)',
                      }}
                    >
                      {renderInlineMarkdown(cell, codeBg, codeColor, monoFont)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {(!isSeparator ? [headerCells, ...bodyRows] : bodyRows).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        border: '1px solid rgba(128,128,128,0.3)',
                        padding: '6px 10px',
                      }}
                    >
                      {renderInlineMarkdown(cell, codeBg, codeColor, monoFont)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
        lastWasBlock = true;
        continue;
      }
      // If only 1 line with pipes, fall through to regular rendering
      i -= tableLines.length;
    }

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
      lastWasBlock = true;
      continue;
    }

    // Headings (# through ####)
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const sizes: Record<number, string> = { 1: '1.5em', 2: '1.3em', 3: '1.1em', 4: '1em' };
      const weights: Record<number, number> = { 1: 700, 2: 700, 3: 600, 4: 600 };
      const margins: Record<number, string> = { 1: '16px 0 6px', 2: '14px 0 5px', 3: '10px 0 4px', 4: '8px 0 4px' };
      result.push(
        <div
          key={`h-${result.length}`}
          style={{
            fontSize: sizes[level],
            fontWeight: weights[level],
            lineHeight: 1.3,
            margin: i === 0 ? '0 0 6px' : margins[level],
          }}
        >
          {renderInlineMarkdown(headingText, codeBg, codeColor, monoFont)}
        </div>
      );
      lastWasBlock = true;
      i++;
      continue;
    }

    // Regular line — parse inline markdown
    // Skip the \n after block elements (headings/code blocks) since they already
    // create their own line break, and pre-wrap would double the spacing
    result.push(
      <React.Fragment key={`line-${result.length}`}>
        {i > 0 && result.length > 0 && !lastWasBlock ? '\n' : null}
        {renderInlineMarkdown(line, codeBg, codeColor, monoFont)}
      </React.Fragment>
    );
    lastWasBlock = false;
    i++;
  }

  return result;
}

/** Returns true if a CSS color string is perceptually dark (low luminance). */
function isDarkColor(c: string): boolean {
  if (!c) return false;
  const s = c.toLowerCase().trim();
  if (s === 'black' || s === '#000' || s === '#000000') return true;
  if (s.startsWith('#')) {
    const hex = s.replace('#', '');
    const full = hex.length === 3
      ? hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2]
      : hex;
    const r = parseInt(full.slice(0, 2), 16) || 0;
    const g = parseInt(full.slice(2, 4), 16) || 0;
    const b = parseInt(full.slice(4, 6), 16) || 0;
    return (r * 0.299 + g * 0.587 + b * 0.114) < 100;
  }
  const rgbMatch = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return (+rgbMatch[1] * 0.299 + +rgbMatch[2] * 0.587 + +rgbMatch[3] * 0.114) < 100;
  }
  return false;
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
    forkSessionId: string | null;
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
    labelFont: string | null;
    labelFontSize: number | null;
    labelFontWeight: number | null;
    labelLetterSpacing: string | null;
    labelUppercase: boolean | null;
    labelMarginBottom: number | null;
    cardLineHeight: number | null;
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
      forkSessionId: null,
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
      labelFont: null,
      labelFontSize: null,
      labelFontWeight: null,
      labelLetterSpacing: null,
      labelUppercase: null,
      labelMarginBottom: null,
      cardLineHeight: null,
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
  const { text, font, size, color, cardBg, cardBorder, cardBorderWidth, cardRadius, cardShadow, cardLabel, cardLabelColor, cardFont, cardPadding, cardLabelOpacity, cardTextOpacity, labelFont, labelFontSize, labelFontWeight, labelLetterSpacing, labelUppercase, labelMarginBottom, cardLineHeight } = shape.props;

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

  // Detect if the stored text color is dark (needs override on dark cards)
  // or light (needs override on light cards). Used to fix cards whose text
  // color was baked in from a different theme mode.
  const textIsDark = isDarkColor(color);
  const textIsLight = !textIsDark && color !== 'black';

  const renderedContent = useMemo(() => {
    if (font === 'sans') {
      const monoFont = "'SF Mono', 'Fira Code', Consolas, monospace";
      if (isCard) {
        // Use text color to infer whether we're on a dark or light canvas
        return renderMarkdown(text, textIsLight ? {
          codeBg: 'rgba(0,255,170,0.1)',
          codeColor: '#00ffaa',
          codeBlockBg: 'rgba(0,0,0,0.3)',
          codeBlockColor: '#00ffaa',
          monoFont,
        } : {
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
  }, [text, font, isCard, textIsLight]);

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
      // IMPORTANT: When tldraw culls a shape (display:none on the parent container),
      // child elements report zero dimensions. If we update h/w to zero here, the
      // geometry bounds collapse and the shape stays culled permanently — even when
      // the user pans back. Guard against this by skipping updates when the element
      // has no layout (offsetHeight === 0 means the parent is display:none).
      if (el.offsetHeight === 0 && el.offsetWidth === 0) return;

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

  // Use the stored color directly — it comes from the theme at creation time
  const effectiveColor = color;

  if (isCard) {
    return (
      <HTMLContainer id={shape.id}>
        <div
          ref={containerRef}
          style={{
            width: shape.props.w,
            minWidth: 665,
            fontFamily,
            fontSize,
            color: effectiveColor,
            lineHeight: cardLineHeight ?? 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'hidden',
            padding: cardPadding || '20px 24px',
            background: cardBg!,
            border: cardBorderWidth ? `1px solid ${cardBorder}` : undefined,
            borderLeft: cardBorderWidth ? `${cardBorderWidth}px solid ${cardBorder}` : undefined,
            borderRadius: `${cardRadius}px`,
            boxShadow: cardShadow || undefined,
          }}
        >
          {cardLabel && (
            <div
              style={{
                fontSize: labelFontSize ? `${labelFontSize}px` : '11px',
                fontWeight: labelFontWeight ?? 600,
                letterSpacing: labelLetterSpacing ?? '0.08em',
                textTransform: (labelUppercase !== false ? 'uppercase' : 'none') as React.CSSProperties['textTransform'],
                color: cardLabelColor || cardBorder || color,
                opacity: cardLabelOpacity,
                marginBottom: labelMarginBottom != null ? `${labelMarginBottom}px` : '8px',
                fontFamily: labelFont ?? fontFamily,
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