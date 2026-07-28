/**
 * Vertex AI LLM wrapper — replaces Manus Forge invokeLLM
 * Uses Google Cloud Vertex AI (Gemini models) for chat completions
 */

import { VertexAI } from "@google-cloud/vertexai";
import { ENV } from "./env";

let _vertexAi: VertexAI | null = null;

function getVertexAi(): VertexAI {
  if (_vertexAi) return _vertexAi;

  const projectId = ENV.gcpProjectId;
  const location = ENV.gcpRegion || "us-central1";

  if (!projectId) {
    throw new Error("GCP_PROJECT_ID environment variable is not set");
  }

  _vertexAi = new VertexAI({ project: projectId, location });
  return _vertexAi;
}

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type Message = {
  role: Role;
  content: string | Array<ImageContent | TextContent | FileContent>;
};

export type InvokeParams = {
  messages: Message[];
  model?: string; // Defaults to "gemini-2.0-flash"
  temperature?: number;
  max_tokens?: number;
  response_format?: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict?: boolean;
      schema: Record<string, unknown>;
    };
  };
  tools?: unknown[];
  tool_choice?: "none" | "auto" | "required" | { type: string; function: { name: string } };
};

export type InvokeResult = {
  choices: Array<{
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

/**
 * Invoke Vertex AI LLM with chat completion
 * Compatible with Manus Forge invokeLLM interface
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const vertexAi = getVertexAi();
  const model = params.model || "gemini-2.0-flash";

  // Convert messages to Vertex AI format
  const contents = params.messages.map((msg) => {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    if (typeof msg.content === "string") {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === "text") {
          parts.push({ text: item.text });
        } else if (item.type === "image_url") {
          // For now, we'll skip image URLs in Vertex AI (requires different handling)
          console.warn("Image URLs not yet supported in Vertex AI wrapper");
        }
      }
    }

    return {
      role: msg.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  // Build system instruction from first system message if present
  let systemInstruction = "";
  if (params.messages[0]?.role === "system" && typeof params.messages[0].content === "string") {
    systemInstruction = params.messages[0].content;
  }

  try {
    const generativeModel = vertexAi.getGenerativeModel({
      model,
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    });

    const response = await generativeModel.generateContent({
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.max_tokens ?? 2048,
        responseMimeType: params.response_format?.type === "json_schema" ? "application/json" : "text/plain",
      },
    });

    const textContent = response.response.candidates?.[0]?.content?.parts?.[0];
    const text = textContent && "text" in textContent ? textContent.text : "";

    return {
      choices: [
        {
          message: {
            role: "assistant",
            content: text,
          },
          finish_reason: response.response.candidates?.[0]?.finishReason || "stop",
        },
      ],
      usage: {
        prompt_tokens: response.response.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.response.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: response.response.usageMetadata?.totalTokenCount || 0,
      },
    };
  } catch (error) {
    console.error("[Vertex AI] Error invoking LLM:", error);
    throw new Error(`Vertex AI LLM error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
