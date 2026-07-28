/**
 * Google Cloud Speech-to-Text wrapper — replaces Manus Forge transcribeAudio
 * Converts audio files to text using Google Cloud Speech-to-Text API
 */

import { SpeechClient } from "@google-cloud/speech";
import axios from "axios";
import { ENV } from "./env";

let _speechClient: SpeechClient | null = null;

function getSpeechClient(): SpeechClient {
  if (_speechClient) return _speechClient;
  _speechClient = new SpeechClient();
  return _speechClient;
}

export type TranscriptionParams = {
  audioUrl: string; // URL to pre-uploaded audio file
  language?: string; // ISO-639-1 language code, e.g., "en"
  prompt?: string; // Optional context hint for accuracy
};

export type TranscriptionResult = {
  text: string;
  language: string;
  segments?: Array<{
    id: number;
    seek: number;
    start: number;
    end: number;
    text: string;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
  }>;
};

/**
 * Transcribe audio from URL using Google Cloud Speech-to-Text
 * Compatible with Manus Forge transcribeAudio interface
 */
export async function transcribeAudio(params: TranscriptionParams): Promise<TranscriptionResult> {
  const speechClient = getSpeechClient();

  try {
    // Download audio from URL
    const audioResponse = await axios.get(params.audioUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });

    const audioContent = audioResponse.data;
    const encoding = detectAudioEncoding(params.audioUrl);

    // Prepare recognition config
    const request = {
      audio: {
        content: Buffer.from(audioContent).toString("base64"),
      },
      config: {
        encoding,
        sampleRateHertz: 16000,
        languageCode: params.language || "en-US",
        enableAutomaticPunctuation: true,
        model: "latest_long", // Use the latest long-form model
        useEnhanced: true, // Use enhanced model for better accuracy
      },
    };

    // Call Speech-to-Text API
    const [response] = await speechClient.recognize(request as any);

    // Extract transcription
    const transcription = response.results
      ?.map((result) => result.alternatives?.[0]?.transcript || "")
      .join(" ") || "";

    return {
      text: transcription,
      language: params.language || "en",
      segments: [], // Cloud Speech-to-Text doesn't return segments by default
    };
  } catch (error) {
    console.error("[Cloud Speech] Error transcribing audio:", error);
    throw new Error(`Cloud Speech-to-Text error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Detect audio encoding from file extension or MIME type
 */
function detectAudioEncoding(
  audioUrl: string
): "LINEAR16" | "FLAC" | "MULAW" | "AMR" | "AMR_WB" | "OGG_OPUS" | "MP3" | "WEBM_OPUS" {
  const url = audioUrl.toLowerCase();

  if (url.includes(".wav")) return "LINEAR16";
  if (url.includes(".flac")) return "FLAC";
  if (url.includes(".ulaw")) return "MULAW";
  if (url.includes(".amr")) return "AMR";
  if (url.includes(".awb")) return "AMR_WB";
  if (url.includes(".opus") || url.includes(".ogg")) return "OGG_OPUS";
  if (url.includes(".mp3")) return "MP3";
  if (url.includes(".webm")) return "WEBM_OPUS";

  // Default to LINEAR16 (WAV)
  return "LINEAR16";
}
