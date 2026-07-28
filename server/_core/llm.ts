/**
 * llm.ts — GCP migration shim
 * Re-exports from vertexAi.ts with legacy type aliases preserved.
 */
export type { Role, TextContent, ImageContent, FileContent, Message, InvokeParams, InvokeResult } from "./vertexAi";
export { invokeLLM } from "./vertexAi";

/** Legacy types not in vertexAi.ts — preserved for callers */
export type MessageContent = string | TextContent | ImageContent | FileContent;
export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = { type: "function"; function: { name: string } };
export type ToolChoice = ToolChoicePrimitive | ToolChoiceByName | ToolChoiceExplicit;
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type Tool = { type: "function"; function: { name: string; description?: string; parameters?: Record<string, unknown> } };
export type JsonSchema = { type: string; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
export type OutputSchema = JsonSchema;
export type ResponseFormat = { type: "json_schema"; json_schema: { name: string; strict?: boolean; schema: JsonSchema } } | { type: "text" };
export type ModelInfo = { id: string; name: string };
export type ModelsResponse = { models: ModelInfo[] };
export async function listLLMModels(): Promise<ModelsResponse> {
  return { models: [{ id: "gemini-2.0-flash-001", name: "Gemini 2.0 Flash" }] };
}
