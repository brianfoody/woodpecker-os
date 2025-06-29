import { ShapeUtil, HTMLContainer, Rectangle2d, toDomPrecision } from "tldraw";
import { MessageBubbleShape } from "./message-bubble-shape";

export class MessageBubbleShapeUtil extends ShapeUtil<MessageBubbleShape> {
  static override type = "message-bubble" as const;

  getDefaultProps(): MessageBubbleShape["props"] {
    return {
      w: 350, // Better match to actual rendered size
      h: 150,
      personName: "Alex",
      text: "Hey, are we still on for lunch today?",
      replyText: "Yes! See you at 12:30 at the usual place 😊",
      state: "sending",
      priority: "normal",
    };
  }

  getMinDimensions() {
    return { width: 320, height: 140 }; // min-w-80 = 320px
  }

  getMaxDimensions() {
    return { width: 800, height: 400 }; // Generous max to accommodate scaled bubbles
  }

  getGeometry(shape: MessageBubbleShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  component(shape: MessageBubbleShape) {
    const bounds = this.editor.getShapeGeometry(shape).bounds;
    const isDarkMode = this.editor.user.getIsDarkMode();
    
    const getBackgroundColor = () => {
      if (shape.props.state === "reply-available") {
        switch (shape.props.priority) {
          case "important":
            return isDarkMode ? "#1e3a8a" : "#dbeafe";
          case "urgent":
            return isDarkMode ? "#991b1b" : "#fecaca";
          default:
            return isDarkMode ? "#374151" : "#f9fafb";
        }
      }
      return isDarkMode ? "#374151" : "#f9fafb";
    };

    const getBorderColor = () => {
      if (shape.props.state === "reply-available") {
        switch (shape.props.priority) {
          case "important":
            return isDarkMode ? "#3b82f6" : "#3b82f6";
          case "urgent":
            return isDarkMode ? "#ef4444" : "#ef4444";
          default:
            return isDarkMode ? "#6b7280" : "#d1d5db";
        }
      }
      return isDarkMode ? "#6b7280" : "#d1d5db";
    };

    const getStateIcon = () => {
      const color = isDarkMode ? "#ffffff" : "#000000";
      switch (shape.props.state) {
        case "sending":
          return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" class="animate-pulse"><path d="m22 2-7 20-4-9-9-4Z"/></svg>`;
        case "sent":
          return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e"><path d="M20 6 9 17l-5-5"/></svg>`;
        case "failed":
          return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
        case "reply-available":
          return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
        default:
          return "";
      }
    };

    const getStateText = () => {
      switch (shape.props.state) {
        case "sending":
          return "Sending...";
        case "sent":
          return "Sent";
        case "failed":
          return "Failed to send";
        case "reply-available":
          return "Reply available";
        case "reply":
          return "Reply";
        default:
          return "";
      }
    };

    const getDisplayText = () => {
      switch (shape.props.state) {
        case "reply-available":
          return "view";
        case "failed":
          return "retry";
        case "reply":
          return shape.props.replyText || "No reply text";
        default:
          return shape.props.text;
      }
    };

    return (
      <HTMLContainer
        style={{
          width: toDomPrecision(bounds.width),
          height: toDomPrecision(bounds.height),
          overflow: "visible",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            minWidth: "320px",
            maxWidth: "400px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: isDarkMode ? "#ffffff" : "#000000",
          }}
        >
          <div
            style={{
              position: "relative",
              borderRadius: "16px",
              border: `2px solid ${getBorderColor()}`,
              padding: "16px",
              backgroundColor: getBackgroundColor(),
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              transition: "all 0.3s ease",
              transform: shape.props.state === "reply-available" ? "scale(1.02)" : "scale(1)",
            }}
          >
            {/* Close button */}
            <button
              style={{
                position: "absolute",
                top: "-8px",
                right: "-8px",
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                backgroundColor: "#ffffff",
                border: "1px solid #d1d5db",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                color: "#6b7280",
              }}
              onClick={() => {
                this.editor.deleteShape(shape.id);
              }}
            >
              ✕
            </button>

            {/* Person name */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontWeight: "500",
                  fontSize: "14px",
                }}
              >
                {shape.props.personName.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontWeight: "500" }}>{shape.props.personName}</span>
            </div>

            {/* State indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <div dangerouslySetInnerHTML={{ __html: getStateIcon() }} />
              <span style={{ fontSize: "12px", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.8 }}>
                {getStateText()}
              </span>
            </div>

            {/* Message content */}
            <div>
              {shape.props.state === "reply-available" ? (
                <button
                  style={{
                    color: "#3b82f6",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontSize: "14px",
                    lineHeight: "1.4",
                  }}
                  onClick={() => {
                    this.editor.updateShape({
                      id: shape.id,
                      type: "message-bubble",
                      props: {
                        ...shape.props,
                        state: "reply",
                      },
                    });
                  }}
                >
                  {getDisplayText()}
                </button>
              ) : shape.props.state === "failed" ? (
                <button
                  style={{
                    color: "#ef4444",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontSize: "14px",
                    lineHeight: "1.4",
                  }}
                  onClick={() => {
                    // Trigger retry logic
                    console.log("Retrying message send");
                  }}
                >
                  {getDisplayText()}
                </button>
              ) : (
                <p style={{ fontSize: "14px", lineHeight: "1.4", margin: "0", wordWrap: "break-word" }}>
                  {getDisplayText()}
                </p>
              )}
            </div>
          </div>
        </div>
      </HTMLContainer>
    );
  }

  indicator() {
    return null;
  }

  override canResize() {
    return true;
  }

  override canBind() {
    return false;
  }

  override canEdit() {
    return false;
  }

  override onResize(shape: MessageBubbleShape, info: any) {
    const { scaleX, scaleY } = info;
    const bounds = this.getMinDimensions();
    const maxBounds = this.getMaxDimensions();

    return {
      props: {
        w: Math.max(
          bounds.width,
          Math.min(maxBounds.width, shape.props.w * scaleX)
        ),
        h: Math.max(
          bounds.height,
          Math.min(maxBounds.height, shape.props.h * scaleY)
        ),
      },
    };
  }
}
