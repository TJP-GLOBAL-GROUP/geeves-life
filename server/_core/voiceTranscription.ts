/**
 * voiceTranscription.ts — GCP migration shim
 * Re-exports from cloudSpeech.ts with legacy type aliases preserved.
 */
export type { TranscriptionParams as TranscribeOptions, TranscriptionResult as TranscriptionResponse } from "./cloudSpeech";
export { transcribeAudio } from "./cloudSpeech";
/** Legacy type stubs for callers that imported these types */
export type WhisperSegment = { start: number; end: number; text: string };
export type WhisperResponse = { text: string; language?: string; segments?: WhisperSegment[] };
export type TranscriptionError = { code: string; message: string };
