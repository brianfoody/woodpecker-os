import { NextRequest, NextResponse } from "next/server";
import * as Tavily from "@tavily/core";

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { success: false, error: "Query is required and must be a string" },
        { status: 400 }
      );
    }

    const tavilyApiKey = process.env.TAVILY_KEY;
    if (!tavilyApiKey) {
      console.error("❌ TAVILY_KEY not found in environment variables");
      return NextResponse.json(
        { success: false, error: "Search service not configured" },
        { status: 500 }
      );
    }

    console.log(`🔍 Searching for: "${query}"`);

    // Initialize Tavily client
    const tavily = Tavily.tavily({ apiKey: process.env.TAVILY_KEY! });

    // Perform search
    const response = await tavily.search(query, {
      searchDepth: "advanced",
      includeAnswer: true,
      includeImages: false,
      // includeRawContent: false,
      maxResults: 2,
    });

    console.log(`✅ Search completed for: "${query}"`);
    console.log(`📄 Answer: ${response.answer?.substring(0, 200)}...`);

    return NextResponse.json({
      success: true,
      answer: response.answer,
      results: response.results,
      query: query,
    });
  } catch (error) {
    console.error("❌ Search API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Search failed",
      },
      { status: 500 }
    );
  }
}
