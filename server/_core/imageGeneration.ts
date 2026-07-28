/**
 * imageGeneration.ts — GCP migration shim
 * Re-exports from vertexAiImage.ts with legacy type aliases preserved.
 */
export type { ImageGenerationParams as GenerateImageOptions, ImageGenerationResult as GenerateImageResponse } from "./vertexAiImage";
export { generateImage, editImage } from "./vertexAiImage";
/** Stub for listImageModels — not available in Vertex AI wrapper */
export type ImageModelInfo = { id: string; name: string };
export type ListImageModelsResponse = { models: ImageModelInfo[] };
export async function listImageModels(): Promise<ListImageModelsResponse> {
  return { models: [{ id: "imagen-3.0-generate-001", name: "Imagen 3" }] };
}
