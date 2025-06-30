import { ShapeUtil, HTMLContainer, Rectangle2d, toDomPrecision } from "tldraw";
import { WebsiteBubbleShape } from "./website-bubble-shape";
import WebsiteBubble from "@/components/website-bubble";

export class WebsiteBubbleShapeUtil extends ShapeUtil<WebsiteBubbleShape> {
  static override type = "website-bubble" as const;

  getDefaultProps(): WebsiteBubbleShape["props"] {
    return {
      w: 400,
      h: 200,
      sketchDescription: "Website sketch",
      status: "creating",
      progress: 0,
      jobId: "",
    };
  }

  getMinDimensions() {
    return { width: 350, height: 180 };
  }

  getMaxDimensions() {
    return { width: 600, height: 400 };
  }

  getGeometry(shape: WebsiteBubbleShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  component(shape: WebsiteBubbleShape) {
    const bounds = this.editor.getShapeGeometry(shape).bounds;
    const defaultProps = this.getDefaultProps();

    // Calculate scale factors based on current size vs default size
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
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
            }}
            onPointerDown={(e) => {
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
                width: "fit-content",
                minWidth: "350px",
                maxWidth: "600px",
              }}
            >
              <WebsiteBubble
                sketchDescription={shape.props.sketchDescription}
                status={shape.props.status}
                progress={shape.props.progress}
                netlifyUrl={shape.props.netlifyUrl}
                boltUrl={shape.props.boltUrl}
                errorMessage={shape.props.errorMessage}
                onClose={() => {
                  // Remove the shape when close button is clicked
                  this.editor.deleteShape(shape.id);
                }}
                onRetry={() => {
                  // Reset to creating state for retry
                  this.editor.updateShape({
                    id: shape.id,
                    type: "website-bubble",
                    props: {
                      ...shape.props,
                      status: "creating",
                      progress: 0,
                      errorMessage: undefined,
                      netlifyUrl: undefined,
                      boltUrl: undefined,
                    },
                  });
                  
                  // Note: The polling system should detect this status change
                  // and restart the website creation process
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

  override onResize(shape: WebsiteBubbleShape, info: any) {
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