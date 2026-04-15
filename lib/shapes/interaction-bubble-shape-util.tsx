import { ShapeUtil, HTMLContainer, Rectangle2d, toDomPrecision } from "tldraw";
import { InteractionBubbleShape } from "./interaction-bubble-shape";
import InteractionBubble from "@/components/interaction-bubble";

export class InteractionBubbleShapeUtil extends ShapeUtil<InteractionBubbleShape> {
  static override type = "interaction-bubble" as const;

  getDefaultProps(): InteractionBubbleShape["props"] {
    return {
      w: 300,
      h: 200,
      question: "",
      options: [],
      status: "pending",
    };
  }

  getMinDimensions() {
    return { width: 200, height: 100 };
  }

  getMaxDimensions() {
    return { width: 500, height: 400 };
  }

  getGeometry(shape: InteractionBubbleShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  component(shape: InteractionBubbleShape) {
    const bounds = this.editor.getShapeGeometry(shape).bounds;
    const defaultProps = this.getDefaultProps();

    const scaleX = bounds.width / defaultProps.w;
    const scaleY = bounds.height / defaultProps.h;
    const scale = Math.min(scaleX, scaleY);

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
            onPointerDown={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest("button")) {
                e.stopPropagation();
              }
            }}
          >
            <InteractionBubble
              question={shape.props.question}
              options={shape.props.options}
              selectedOption={shape.props.selectedOption}
              status={shape.props.status}
              onSelect={(option) => {
                this.editor.updateShape<InteractionBubbleShape>({
                  id: shape.id,
                  type: "interaction-bubble",
                  props: {
                    ...shape.props,
                    selectedOption: option,
                    status: "answered",
                  },
                });
              }}
            />
          </div>
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: InteractionBubbleShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx={8}
        ry={8}
      />
    );
  }
}
