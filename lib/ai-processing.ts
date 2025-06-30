import type { AIAction } from "@/lib/models";
import { filterActions } from "./action-filtering";

// Keep mock actions for fallback
const mockAIActions: AIAction[] = [
  {
    id: "1",
    action: "send_message",
    text: "Send this content as a message",
    confidence_score: 0.9,
    type: "suggestion",
  },
  {
    id: "2",
    action: "ask_ai",
    text: "Set up a reminder for this task",
    confidence_score: 0.8,
    type: "suggestion",
  },
];

export async function sendToAI(
  imageBlob: Blob,
  shapes: any[],
  bounds: { x: number; y: number; w: number; h: number }
): Promise<{ actions: AIAction[]; sceneDescription: string }> {
  try {
    // Check if we only have text shapes
    const onlyTextShapes = shapes.every((shape) => shape.type === "text");
    let sceneDescription = "";

    if (onlyTextShapes) {
      console.log("📝 Only text shapes detected, skipping image analysis");

      // Extract text content and positions, filtering out empty text
      const meaningfulTextEntries = shapes
        .map((shape) => {
          console.log(
            "🔍 DEBUG: Text shape structure:",
            JSON.stringify(shape, null, 2)
          );

          // Extract text from richText format (tldraw v3) or fallback to plain text
          const richText = (shape.props as any)?.richText;
          const plainText = (shape.props as any)?.text || "";

          let text = "";

          // Handle tldraw v3 richText structure: richText.content[0].content[0].text
          if (
            richText &&
            richText.type === "doc" &&
            richText.content &&
            Array.isArray(richText.content)
          ) {
            // Extract text from all paragraphs and text nodes
            const textParts: string[] = [];
            richText.content.forEach((paragraph: any) => {
              if (paragraph.content && Array.isArray(paragraph.content)) {
                paragraph.content.forEach((textNode: any) => {
                  if (textNode.type === "text" && textNode.text) {
                    textParts.push(textNode.text);
                  }
                });
              }
            });
            text = textParts.join(" ");
          } else if (typeof richText === "string") {
            text = richText;
          } else {
            text = plainText;
          }

          console.log("🔍 DEBUG: extracted text:", text);

          const x = Math.round(shape.x);
          const y = Math.round(shape.y);
          return { text: text.trim(), x, y };
        })
        .filter(({ text }) => text.length > 0)
        .map(({ text, x, y }) => text);

      const textContent =
        meaningfulTextEntries.length > 0
          ? meaningfulTextEntries.join(", ")
          : "[No meaningful text found]";

      sceneDescription = `${textContent}`;
    } else {
      console.log("🖼️ Shapes/drawings detected, analyzing image...");

      // Convert image blob to base64 for AI analysis
      const imageBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
        reader.readAsDataURL(imageBlob);
      });

      // Get scene description from AI via API
      const imageResponse = await fetch("/api/summarise-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ base64PngImage: imageBase64 }),
      });

      if (!imageResponse.ok) {
        throw new Error("Failed to analyze image");
      }

      const imageResult = await imageResponse.json();
      console.log("🔍 Raw image API response:", imageResult);
      sceneDescription = imageResult.description;
      console.log("🔍 Scene description:", sceneDescription);
    }

    // Prepare context for task execution
    const context = `User has circled the following content on their e-ink display: ${sceneDescription}. 
Bounds: ${bounds.w}x${bounds.h} area at position (${bounds.x}, ${bounds.y}). 
Shapes detected: ${shapes.length} (${shapes.map((s) => s.type).join(", ")}). 
Please suggest actionable tasks the user might want to execute based on this content.`;

    console.log("🎯 Sending context to AI for task suggestions...");

    // Get task suggestions from AI via API
    const taskResponse = await fetch("/api/confirm-task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ task: context }),
    });

    if (!taskResponse.ok) {
      throw new Error("Failed to execute task");
    }

    const taskResult = await taskResponse.json();
    const { actions } = taskResult;
    console.log("🤖 AI Response:", actions);

    // Parse AI response into actions (simplified - you may want more sophisticated parsing)
    const generatedActions: AIAction[] = actions.map((t: any, i: number) => ({
      id: `ai-suggestion-${i}`,
      ...t,
      type: "suggestion" as const,
    }));

    // Filter actions: max 3, drop <0.5 confidence if higher confidence actions exist
    const filteredActions = filterActions(generatedActions);

    console.log(
      `✅ AI processing complete! Filtered ${generatedActions.length} actions to ${filteredActions.length}`
    );
    console.log("🔍 Final sceneDescription being returned:", sceneDescription);
    return { actions: filteredActions, sceneDescription };
  } catch (error) {
    console.error("❌ Error in AI processing:", error);
    // Fallback to mock data on error
    return {
      actions: mockAIActions.slice(0, 1),
      sceneDescription: "Error processing image",
    };
  }
}
