import {
  BaseBoxShapeUtil,
  DefaultColorStyle,
  ShapeUtil,
  T,
  TLBaseShape,
  TLDefaultColorStyle,
  getDefaultColorTheme,
  resizeBox,
  structuredClone,
} from 'tldraw';

// AI Bubble shape type definition
export type AIBubbleShape = TLBaseShape<
  'ai-bubble',
  {
    w: number;
    h: number;
    text: string;
    timestamp: number;
    actionType: 'ask_ai' | 'send_message' | 'add_contact';
    isError?: boolean;
    color: TLDefaultColorStyle;
  }
>;

// Props validation schema
const aiBubbleProps = {
  w: T.nonZeroNumber,
  h: T.nonZeroNumber,
  text: T.string,
  timestamp: T.number,
  actionType: T.literalEnum('ask_ai', 'send_message', 'add_contact'),
  isError: T.optional(T.boolean),
  color: DefaultColorStyle,
};

export class AIBubbleShapeUtil extends BaseBoxShapeUtil<AIBubbleShape> {
  static override type = 'ai-bubble' as const;
  static override props = aiBubbleProps;

  getDefaultProps(): AIBubbleShape['props'] {
    return {
      w: 300,
      h: 120,
      text: '',
      timestamp: Date.now(),
      actionType: 'ask_ai',
      isError: false,
      color: 'blue',
    };
  }

  getGeometry(shape: AIBubbleShape) {
    return this.getBoxGeometry(shape);
  }

  component(shape: AIBubbleShape) {
    const { w, h, text, timestamp, actionType, isError, color } = shape.props;
    const theme = getDefaultColorTheme({ isDarkMode: false });
    const colorTheme = theme[color];

    const formatTimestamp = (ts: number) => {
      const date = new Date(ts);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getActionIcon = (action: string) => {
      switch (action) {
        case 'ask_ai':
          return '🧠';
        case 'send_message':
          return '💬';
        case 'add_contact':
          return '👤';
        default:
          return '🤖';
      }
    };

    return (
      <div
        className={`ai-bubble ai-bubble-enter ${isError ? 'error' : ''}`}
        style={{
          width: w,
          height: h,
          backgroundColor: isError ? '#fee2e2' : colorTheme.semi,
          border: `2px solid ${isError ? '#dc2626' : colorTheme.solid}`,
          borderRadius: '12px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: isError ? '#991b1b' : colorTheme.solid,
            fontWeight: '500',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>{getActionIcon(actionType)}</span>
            <span>AI Assistant</span>
          </div>
          <span style={{ opacity: 0.7 }}>
            {formatTimestamp(timestamp)}
          </span>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            fontSize: '14px',
            lineHeight: '1.4',
            color: isError ? '#991b1b' : '#374151',
            overflow: 'auto',
            wordWrap: 'break-word',
          }}
        >
          {text || 'Processing...'}
        </div>

        {/* Decorative elements */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: `linear-gradient(90deg, ${colorTheme.solid}, ${colorTheme.light})`,
          }}
        />
        
        {!isError && (
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              right: '8px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: colorTheme.solid,
              opacity: 0.6,
            }}
          />
        )}
      </div>
    );
  }

  indicator(shape: AIBubbleShape) {
    const { w, h } = shape.props;
    return (
      <rect
        width={w}
        height={h}
        rx={12}
        ry={12}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray="4 4"
      />
    );
  }

  onResize(shape: AIBubbleShape, info: any) {
    return resizeBox(shape, info);
  }

  override canEdit = () => false;
  override canResize = () => true;
  override canBind = () => false;
}