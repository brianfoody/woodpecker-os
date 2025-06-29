import { ShapeUtil, HTMLContainer, Rectangle2d, toDomPrecision } from "tldraw";
import { MessageBubbleShape } from "./message-bubble-shape";
import MessageBubble from "@/components/message-bubble";

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
    const defaultProps = this.getDefaultProps();

    // Calculate scale factors based on current size vs default size
    const scaleX = bounds.width / defaultProps.w;
    const scaleY = bounds.height / defaultProps.h;
    const scale = Math.min(scaleX, scaleY); // Use uniform scaling to maintain aspect ratio

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
            width: toDomPrecision(defaultProps.w),
            height: toDomPrecision(defaultProps.h),
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              // Override the mx-auto centering to fill the available space
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
            }}
            onPointerDown={(e) => {
              // Only stop propagation if clicking on interactive elements
              const target = e.target as HTMLElement;
              const isInteractive =
                target.closest("button") ||
                target.closest('[role="button"]') ||
                target.tagName === "BUTTON" ||
                target.classList.contains("cursor-pointer");

              if (isInteractive) {
                e.stopPropagation();
              }
            }}
            onClick={(e) => {
              // Only stop propagation if clicking on interactive elements
              const target = e.target as HTMLElement;
              const isInteractive =
                target.closest("button") ||
                target.closest('[role="button"]') ||
                target.tagName === "BUTTON" ||
                target.classList.contains("cursor-pointer");

              if (isInteractive) {
                e.stopPropagation();
              }
            }}
          >
            <div
              style={{
                // Remove mx-auto by wrapping in a container that fits the bounds better
                width: "fit-content",
                minWidth: "320px",
                maxWidth: "800px",
              }}
            >
              <MessageBubble
                personName={shape.props.personName}
                text={shape.props.text}
                phoneNumber={shape.props.phoneNumber}
                replyText={shape.props.replyText}
                state={shape.props.state}
                priority={shape.props.priority}
                onClose={() => {
                  // Remove the shape when close button is clicked
                  this.editor.deleteShape(shape.id);
                }}
                onViewReply={() => {
                  // Update the shape state to show reply
                  this.editor.updateShape({
                    id: shape.id,
                    type: "message-bubble",
                    props: {
                      ...shape.props,
                      state: "reply",
                    },
                  });
                }}
              />
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
