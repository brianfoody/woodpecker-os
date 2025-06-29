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

// Message Bubble shape type definition
export type MessageBubbleShape = TLBaseShape<
  'message-bubble',
  {
    w: number;
    h: number;
    text: string;
    recipient: string;
    timestamp: number;
    status: 'sending' | 'sent' | 'delivered' | 'failed';
    color: TLDefaultColorStyle;
  }
>;

// Props validation schema
const messageBubbleProps = {
  w: T.nonZeroNumber,
  h: T.nonZeroNumber,
  text: T.string,
  recipient: T.string,
  timestamp: T.number,
  status: T.literalEnum('sending', 'sent', 'delivered', 'failed'),
  color: DefaultColorStyle,
};

export class MessageBubbleShapeUtil extends BaseBoxShapeUtil<MessageBubbleShape> {
  static override type = 'message-bubble' as const;
  static override props = messageBubbleProps;

  getDefaultProps(): MessageBubbleShape['props'] {
    return {
      w: 280,
      h: 100,
      text: '',
      recipient: '',
      timestamp: Date.now(),
      status: 'sending',
      color: 'green',
    };
  }

  getGeometry(shape: MessageBubbleShape) {
    return this.getBoxGeometry(shape);
  }

  component(shape: MessageBubbleShape) {
    const { w, h, text, recipient, timestamp, status, color } = shape.props;
    const theme = getDefaultColorTheme({ isDarkMode: false });
    const colorTheme = theme[color];

    const formatTimestamp = (ts: number) => {
      const date = new Date(ts);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getStatusIcon = (status: string) => {
      switch (status) {
        case 'sending':
          return '⏳';
        case 'sent':
          return '✓';
        case 'delivered':
          return '✓✓';
        case 'failed':
          return '❌';
        default:
          return '💬';
      }
    };

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'sending':
          return '#f59e0b';
        case 'sent':
          return '#6b7280';
        case 'delivered':
          return '#10b981';
        case 'failed':
          return '#ef4444';
        default:
          return colorTheme.solid;
      }
    };

    return (
      <div
        className="message-bubble"
        style={{
          width: w,
          height: h,
          backgroundColor: colorTheme.semi,
          border: `2px solid ${colorTheme.solid}`,
          borderRadius: '16px 16px 4px 16px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
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
            fontSize: '11px',
            color: colorTheme.solid,
            fontWeight: '600',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>📱</span>
            <span>To: {recipient || 'Contact'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: getStatusColor(status) }}>
              {getStatusIcon(status)}
            </span>
            <span style={{ opacity: 0.7 }}>
              {formatTimestamp(timestamp)}
            </span>
          </div>
        </div>

        {/* Message Content */}
        <div
          style={{
            flex: 1,
            fontSize: '14px',
            lineHeight: '1.4',
            color: '#1f2937',
            overflow: 'auto',
            wordWrap: 'break-word',
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
            padding: '8px',
            borderRadius: '8px',
            border: '1px solid rgba(0, 0, 0, 0.1)',
          }}
        >
          {text || 'Enter your message...'}
        </div>

        {/* Status indicator */}
        <div
          style={{
            fontSize: '10px',
            color: getStatusColor(status),
            textAlign: 'right',
            textTransform: 'uppercase',
            fontWeight: '500',
            letterSpacing: '0.5px',
          }}
        >
          {status}
        </div>

        {/* Decorative tail */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '-6px',
            width: 0,
            height: 0,
            borderLeft: '12px solid ' + colorTheme.solid,
            borderTop: '6px solid transparent',
            borderBottom: '6px solid transparent',
          }}
        />
      </div>
    );
  }

  indicator(shape: MessageBubbleShape) {
    const { w, h } = shape.props;
    return (
      <rect
        width={w}
        height={h}
        rx={16}
        ry={16}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray="4 4"
      />
    );
  }

  onResize(shape: MessageBubbleShape, info: any) {
    return resizeBox(shape, info);
  }

  override canEdit = () => false;
  override canResize = () => true;
  override canBind = () => false;
}