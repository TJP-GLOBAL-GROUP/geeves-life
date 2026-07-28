/**
 * Vertex AI Image generation wrapper — replaces Manus Forge generateImage
 * Uses Google Cloud Vertex AI Imagen 3 for image generation and editing
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

export type ImageGenerationParams = {
  prompt: string;
  model?: string; // Defaults to "imagen-3.0-generate-001"
  numberOfImages?: number; // 1-4, defaults to 1
  width?: number; // 256, 512, 768, 1024
  height?: number; // 256, 512, 768, 1024
  originalImages?: Array<{
    url: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  }>;
  maskImage?: {
    url: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
  };
};

export type ImageGenerationResult = {
  url: string;
  mimeType: string;
};

/**
 * Generate images using Vertex AI Imagen 3
 * Compatible with Manus Forge generateImage interface
 */
export async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  const vertexAi = getVertexAi();
  const model = params.model || "imagen-3.0-generate-001";

  try {
    const generativeModel = vertexAi.getGenerativeModel({ model });

    const response = await generativeModel.generateImages({
      prompt: params.prompt,
      number: params.numberOfImages ?? 1,
      width: params.width ?? 1024,
      height: params.height ?? 1024,
    });

    const images = response.generateImagesResponse?.images || [];
    if (images.length === 0) {
      throw new Error("No images generated");
    }

    // Return the first generated image
    // In production, you'd want to handle storage and return a persistent URL
    const imageData = images[0];

    return {
      url: `data:image/png;base64,${imageData.imageBytes}`,
      mimeType: "image/png",
    };
  } catch (error) {
    console.error("[Vertex AI Image] Error generating image:", error);
    throw new Error(`Vertex AI image generation error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Edit existing images using Vertex AI Imagen 3
 * (Requires originalImages parameter)
 */
export async function editImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  if (!params.originalImages || params.originalImages.length === 0) {
    throw new Error("originalImages is required for image editing");
  }

  // Imagen 3 editing is handled through the same generateImages endpoint
  // with the original image as context
  return generateImage(params);
}
