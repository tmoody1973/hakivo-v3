export { FACTS_ONLY_SYSTEM_PROMPT } from "./prompts/facts-only";
export {
  createGeminiClient,
  type GeminiClient,
  type EmbedMode,
} from "./gemini";
export {
  checkPacketBias,
  type BiasCheckInput,
  type BiasCheckResult,
} from "./bias-check";
export {
  synthesizeSpeech,
  synthesizeSpeechChunked,
  splitScriptIntoChunks,
  TTS_VOICES,
  DEFAULT_HAKIVO_SPEAKERS,
  type TtsVoice,
  type SpeakerConfig,
  type SynthesizeArgs,
  type SynthesizeResult,
} from "./gemini-tts";
