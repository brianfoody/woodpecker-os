import {
  ShapeUtil,
  HTMLContainer,
  Rectangle2d,
  toDomPrecision,
} from 'tldraw'
import { AIBubbleShape } from './ai-bubble-shape'

export class AIBubbleShapeUtil extends ShapeUtil<AIBubbleShape> {
  static override type = 'ai-bubble' as const

  getDefaultProps(): AIBubbleShape['props'] {
    console.log('🔧 AIBubbleShapeUtil: getDefaultProps called');
    return {
      w: 300,
      h: 200,
      content: '',
      isLoading: false,
    }
  }

  getMinDimensions() {
    return { width: 150, height: 100 }
  }

  getMaxDimensions() {
    return { width: 10000, height: 10000 }
  }

  getGeometry(shape: AIBubbleShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  component(shape: AIBubbleShape) {
    console.log('🔧 AIBubbleShapeUtil: component called for shape:', shape.id);
    const bounds = this.editor.getShapeGeometry(shape).bounds
    const isDarkMode = this.editor.user.getIsDarkMode()

    // Calculate responsive font size based on container size
    const baseFontSize = 14
    const fontScale = Math.max(0.7, Math.min(1.2, bounds.width / 300))
    const fontSize = Math.round(baseFontSize * fontScale)

    return (
      <HTMLContainer
        style={{
          width: toDomPrecision(bounds.width),
          height: toDomPrecision(bounds.height),
          overflow: 'visible',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: isDarkMode ? '#1f1f1f' : '#ffffff',
            border: `3px solid ${isDarkMode ? '#666666' : '#999999'}`,
            borderRadius: '12px',
            padding: `${Math.max(8, Math.min(16, bounds.height * 0.08))}px`,
            fontSize: `${fontSize}px`,
            fontFamily: 'var(--tl-font-mono)',
            color: isDarkMode ? '#ffffff' : '#000000',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center', // Vertical centering
            boxSizing: 'border-box',
            minHeight: '0',
          }}
        >
          {shape.props.isLoading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                gap: '8px',
                color: isDarkMode ? '#cccccc' : '#666666',
              }}
            >
              <div
                className="ai-bubble-spinner"
                style={{
                  width: `${Math.max(12, fontSize)}px`,
                  height: `${Math.max(12, fontSize)}px`,
                  border: `2px solid ${isDarkMode ? '#666666' : '#cccccc'}`,
                  borderTop: `2px solid ${isDarkMode ? '#ffffff' : '#000000'}`,
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: `${fontSize}px` }}>Asking AI...</span>
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                lineHeight: '1.4',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                minHeight: '0',
                fontSize: `${fontSize}px`,
              }}
            >
              {shape.props.content || 'AI response will appear here...'}
            </div>
          )}
        </div>
        <style>{`
          .ai-bubble-spinner {
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </HTMLContainer>
    )
  }

  indicator(shape: AIBubbleShape) {
    return (
      <rect
        width={toDomPrecision(shape.props.w)}
        height={toDomPrecision(shape.props.h)}
        rx={12}
        ry={12}
      />
    )
  }

  override canResize() {
    return true
  }

  override canBind() {
    return false
  }

  override canEdit() {
    return false
  }

  override onResize(shape: AIBubbleShape, info: any) {
    const { scaleX, scaleY } = info
    const bounds = this.getMinDimensions()
    const maxBounds = this.getMaxDimensions()
    
    return {
      props: {
        w: Math.max(bounds.width, Math.min(maxBounds.width, shape.props.w * scaleX)),
        h: Math.max(bounds.height, Math.min(maxBounds.height, shape.props.h * scaleY)),
      },
    }
  }
}