import { sendToAI } from "../ai-processing";

// Mock the fetch function to avoid actual API calls
global.fetch = jest.fn();

describe("Text Extraction from Shapes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should extract text content from text shapes correctly", async () => {
    // Mock text shapes with different text content structures
    const textShapes = [
      {
        id: "text1",
        type: "text",
        x: 100,
        y: 100,
        props: {
          text: "Hello World",
        },
      },
      {
        id: "text2", 
        type: "text",
        x: 200,
        y: 200,
        props: {
          text: "This is a test",
        },
      },
    ];

    const mockImageBlob = new Blob(["test"], { type: "image/png" });
    const mockBounds = { x: 0, y: 0, w: 300, h: 300 };

    // Mock the API response
    const mockResponse = {
      actions: [
        {
          action: "test_action",
          text: "Test action",
          confidence_score: 0.9,
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Call the function
    const result = await sendToAI(mockImageBlob, textShapes, mockBounds);

    // Verify the fetch was called with the correct context
    const call = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(call[1].body);
    
    expect(body.task).toContain('"Hello World" at position (100, 100), "This is a test" at position (200, 200)');
    expect(call[0]).toBe("/api/confirm-task");
    expect(call[1].method).toBe("POST");

    // Verify the result
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({
      id: "ai-suggestion-0",
      action: "test_action",
      text: "Test action",
      confidence_score: 0.9,
      type: "suggestion",
    });
    expect(result.sceneDescription).toContain('"Hello World" at position (100, 100), "This is a test" at position (200, 200)');
  });

  it("should handle empty text content correctly and filter out empty text", async () => {
    // Mock text shapes with empty or undefined text content
    const textShapes = [
      {
        id: "text1",
        type: "text",
        x: 100,
        y: 100,
        props: {
          text: "",
        },
      },
      {
        id: "text2",
        type: "text", 
        x: 200,
        y: 200,
        props: {
          // Missing text property
        },
      },
      {
        id: "text3",
        type: "text",
        x: 300,
        y: 300,
        props: {
          text: undefined,
        },
      },
    ];

    const mockImageBlob = new Blob(["test"], { type: "image/png" });
    const mockBounds = { x: 0, y: 0, w: 400, h: 400 };

    // Mock the API response
    const mockResponse = {
      actions: [
        {
          action: "test_action",
          text: "Test action",
          confidence_score: 0.9,
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Call the function
    const result = await sendToAI(mockImageBlob, textShapes, mockBounds);

    // Verify the fetch was called with filtered text content (empty strings should be removed)
    const call = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(call[1].body);
    
    // Should not contain empty text entries
    expect(body.task).not.toContain('"" at position');
    
    // Should indicate no meaningful text content was found
    expect(body.task).toContain('Text content: [No meaningful text found]');
    
    // Verify the scene description is also correct
    expect(result.sceneDescription).toContain('[No meaningful text found]');
  });

  it("should handle mixed text shapes with various text content", async () => {
    const textShapes = [
      {
        id: "text1",
        type: "text",
        x: 100,
        y: 100,
        props: {
          text: "Valid text",
        },
      },
      {
        id: "text2",
        type: "text",
        x: 200,
        y: 200,
        props: {
          text: "",
        },
      },
      {
        id: "text3",
        type: "text", 
        x: 300,
        y: 300,
        props: {
          text: "Another valid text",
        },
      },
    ];

    const mockImageBlob = new Blob(["test"], { type: "image/png" });
    const mockBounds = { x: 0, y: 0, w: 400, h: 400 };

    // Mock the API response
    const mockResponse = {
      actions: [
        {
          action: "test_action",
          text: "Test action",
          confidence_score: 0.9,
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Call the function
    const result = await sendToAI(mockImageBlob, textShapes, mockBounds);

    // Verify the context includes only non-empty text
    const call = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(call[1].body);
    
    expect(body.task).toContain('"Valid text" at position (100, 100)');
    expect(body.task).toContain('"Another valid text" at position (300, 300)');
    
    // Should not include empty text entries
    expect(body.task).not.toContain('"" at position (200, 200)');
    
    expect(call[0]).toBe("/api/confirm-task");
    expect(call[1].method).toBe("POST");
    
    // Verify the scene description is also correct
    expect(result.sceneDescription).toContain('"Valid text" at position (100, 100)');
    expect(result.sceneDescription).toContain('"Another valid text" at position (300, 300)');
  });

  it("should filter actions to max 3 and drop low confidence ones", async () => {
    const textShapes = [
      {
        id: "text1",
        type: "text",
        x: 100,
        y: 100,
        props: {
          text: "Test action filtering",
        },
      },
    ];

    const mockImageBlob = new Blob(["test"], { type: "image/png" });
    const mockBounds = { x: 0, y: 0, w: 200, h: 200 };

    // Mock the API response with many actions, some below 0.5 confidence
    const mockResponse = {
      actions: [
        {
          action: "high_confidence_1",
          text: "High confidence action 1",
          confidence_score: 0.9,
        },
        {
          action: "low_confidence_1",
          text: "Low confidence action 1",
          confidence_score: 0.3,
        },
        {
          action: "high_confidence_2",
          text: "High confidence action 2",
          confidence_score: 0.8,
        },
        {
          action: "low_confidence_2",
          text: "Low confidence action 2",
          confidence_score: 0.2,
        },
        {
          action: "high_confidence_3",
          text: "High confidence action 3",
          confidence_score: 0.7,
        },
        {
          action: "high_confidence_4",
          text: "High confidence action 4",
          confidence_score: 0.6,
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Call the function
    const result = await sendToAI(mockImageBlob, textShapes, mockBounds);

    // Should filter to max 3 actions, only keeping high confidence ones
    expect(result.actions).toHaveLength(3);
    
    // Should be sorted by confidence (highest first)
    expect(result.actions[0].confidence_score).toBe(0.9);
    expect(result.actions[1].confidence_score).toBe(0.8);
    expect(result.actions[2].confidence_score).toBe(0.7);
    
    // Should not include low confidence actions
    expect(result.actions.some(action => action.confidence_score < 0.5)).toBe(false);
    
    // Verify action content
    expect(result.actions[0].action).toBe("high_confidence_1");
    expect(result.actions[1].action).toBe("high_confidence_2");
    expect(result.actions[2].action).toBe("high_confidence_3");
  });

  it("should keep all actions when all are below 0.5 confidence", async () => {
    const textShapes = [
      {
        id: "text1",
        type: "text",
        x: 100,
        y: 100,
        props: {
          text: "Low confidence test",
        },
      },
    ];

    const mockImageBlob = new Blob(["test"], { type: "image/png" });
    const mockBounds = { x: 0, y: 0, w: 200, h: 200 };

    // Mock the API response with only low confidence actions
    const mockResponse = {
      actions: [
        {
          action: "low_1",
          text: "Low confidence action 1",
          confidence_score: 0.4,
        },
        {
          action: "low_2",
          text: "Low confidence action 2",
          confidence_score: 0.3,
        },
        {
          action: "low_3",
          text: "Low confidence action 3",
          confidence_score: 0.2,
        },
        {
          action: "low_4",
          text: "Low confidence action 4",
          confidence_score: 0.1,
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Call the function
    const result = await sendToAI(mockImageBlob, textShapes, mockBounds);

    // Should keep max 3 actions even though all are below 0.5
    expect(result.actions).toHaveLength(3);
    
    // Should be sorted by confidence (highest first)
    expect(result.actions[0].confidence_score).toBe(0.4);
    expect(result.actions[1].confidence_score).toBe(0.3);
    expect(result.actions[2].confidence_score).toBe(0.2);
    
    // Should not include the lowest confidence action
    expect(result.actions.some(action => action.confidence_score === 0.1)).toBe(false);
  });
});