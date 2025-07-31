import {
  HTMLContainer,
  ShapeUtil,
  TLBaseShape,
  TLDefaultSizeStyle,
  Rectangle2d,
} from 'tldraw';

export type HandwrittenTextShape = TLBaseShape<
  'handwritten-text',
  {
    w: number;
    h: number;
    text: string;
    font: 'kalam' | 'caveat';
    size: TLDefaultSizeStyle;
    color: string;
    autoSize: boolean;
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
    const { text, font, size, color } = shape.props;

    // Map size to font size
    const sizeMap = {
      s: '16px',
      m: '20px',
      l: '24px',
      xl: '28px',
    };

    const fontSize = sizeMap[size] || '20px';

    // Select font family based on prop
    const fontFamily = font === 'caveat' 
      ? 'var(--font-caveat)' 
      : 'var(--font-kalam)';

    const style = {
      width: shape.props.w,
      height: shape.props.h,
      fontFamily,
      fontSize,
      color,
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap' as const,
      wordBreak: 'break-word' as const,
      overflow: 'visible',
      padding: '4px',
    };

    return (
      <HTMLContainer id={shape.id}>
        <div style={style}>
          {text}
        </div>
      </HTMLContainer>
    );
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
    return {
      props: {
        w: Math.max(info.bounds.width, 50),
        h: Math.max(info.bounds.height, 20),
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