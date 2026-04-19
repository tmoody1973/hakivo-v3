/**
 * Gemini 3.1 Flash TTS — multi-speaker briefings via the generative
 * language API (uses GEMINI_API_KEY, no service account needed).
 *
 * Output is raw 16-bit PCM at the rate the model picks (typically
 * 24kHz mono). The audio task downstream encodes this to MP3 with
 * @breezystack/lamejs to keep R2 file sizes ~8x smaller than WAV.
 *
 * Why this path vs. Cloud TTS: Cloud TTS multi-speaker actually routes
 * through Vertex AI which needs a service account + extra API enables.
 * The generative API does multi-speaker natively with just an API key.
 */

import { GoogleGenAI } from "@google/genai";

export const TTS_VOICES = [
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

export type SpeakerConfig = {
  readonly speaker: string;
  readonly voice: TtsVoice;
};

export type SynthesizeArgs = {
  readonly text: string;
  readonly speakers?: ReadonlyArray<SpeakerConfig>;
  readonly temperature?: number;
};

export type SynthesizeResult = {
  /** WAV-wrapped audio (PCM payload + 44-byte RIFF header). */
  readonly wav: Uint8Array;
  /** Raw 16-bit signed LE PCM samples (kept available for future encoders). */
  readonly pcm: Uint8Array;
  readonly sampleRate: number;
  readonly bitsPerSample: number;
  readonly channels: number;
  readonly durationSec: number;
};

export const DEFAULT_HAKIVO_SPEAKERS: ReadonlyArray<SpeakerConfig> = [
  { speaker: "Maya", voice: "Callirrhoe" },
  { speaker: "Jordan", voice: "Algenib" },
];

const TTS_MODEL = "gemini-3.1-flash-tts-preview";

/**
 * Generate audio in chunks and concatenate the PCM, working around
 * Gemini 3.1 Flash TTS's documented quality drift on outputs longer
 * than ~2 minutes. Splits the script at speaker-turn boundaries so
 * each chunk is ≤ `maxCharsPerChunk` characters but never breaks mid-
 * dialogue. Calls run sequentially (avoids rate limits + audio splices
 * are deterministic in order).
 *
 * Same SynthesizeResult shape as the single-call version — caller
 * code is identical.
 */
export async function synthesizeSpeechChunked(
  apiKey: string,
  args: SynthesizeArgs & { readonly maxCharsPerChunk?: number },
): Promise<SynthesizeResult> {
  // Aim for ~60s per chunk: well under Gemini TTS's documented "few
  // minutes" drift threshold and gives the splice between chunks less
  // chance to be noticeable. 1200 chars ≈ 60 sec at 150 wpm narration.
  const maxChars = args.maxCharsPerChunk ?? 1200;
  const chunks = splitScriptIntoChunks(args.text, maxChars);
  if (chunks.length <= 1) {
    return synthesizeSpeech(apiKey, args);
  }

  // Belt-and-suspenders: append a throwaway closer to the FINAL chunk.
  // Gemini 3.1 TTS occasionally clips the last 1-3s of its output; the
  // throwaway absorbs the clip so the real handoff stays intact. Use
  // the FIRST speaker's name so the tail sounds natural either way.
  const tailSpeaker = (args.speakers ?? DEFAULT_HAKIVO_SPEAKERS)[0]?.speaker ?? "Maya";
  const TAIL = `\n${tailSpeaker}: Thanks for tuning in. Have a great one.`;

  const results: SynthesizeResult[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const text = isLast ? `${chunks[i]}${TAIL}` : chunks[i]!;
    const r = await synthesizeSpeech(apiKey, { ...args, text });
    results.push(r);
  }

  const sampleRate = results[0]!.sampleRate;
  const bitsPerSample = results[0]!.bitsPerSample;
  const channels = results[0]!.channels;

  const pcm = Buffer.concat(results.map((r) => Buffer.from(r.pcm)));
  const fmt: AudioFormat = { sampleRate, bitsPerSample, channels };
  const wav = wrapPcmAsWav(pcm, fmt);
  const bytesPerSample = bitsPerSample / 8;
  const durationSec = pcm.length / (sampleRate * bytesPerSample * channels);

  return {
    wav: new Uint8Array(wav),
    pcm: new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength),
    sampleRate,
    bitsPerSample,
    channels,
    durationSec,
  };
}

/**
 * Split a "Maya: …\nJordan: …" dialogue script into chunks of at most
 * `maxChars` characters each, ALWAYS breaking at speaker-turn boundaries
 * (never mid-sentence within a turn). Keeps a turn intact even when it
 * exceeds the limit (better to ship a too-long chunk than splice an
 * actor mid-line).
 */
export function splitScriptIntoChunks(
  script: string,
  maxChars: number,
): ReadonlyArray<string> {
  // A "turn" is a non-empty line that starts with `Name:` (e.g., "Maya:").
  // Some scripts may have multi-paragraph turns; we treat any line that
  // doesn't start with `Name:` as a continuation of the previous turn.
  const lines = script.split(/\n/);
  const turns: string[] = [];
  let current = "";
  for (const line of lines) {
    if (/^[A-Z][a-zA-Z0-9_ ]*:/.test(line) && current) {
      turns.push(current.trim());
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current.trim()) turns.push(current.trim());

  const chunks: string[] = [];
  let buf = "";
  for (const turn of turns) {
    if (buf && buf.length + turn.length + 1 > maxChars) {
      chunks.push(buf);
      buf = turn;
    } else {
      buf = buf ? `${buf}\n${turn}` : turn;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export async function synthesizeSpeech(
  apiKey: string,
  args: SynthesizeArgs,
): Promise<SynthesizeResult> {
  if (!apiKey) throw new Error("GEMINI_API_KEY required for TTS");
  if (!args.text.trim()) throw new Error("TTS text is empty");
  const speakers = args.speakers ?? DEFAULT_HAKIVO_SPEAKERS;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ role: "user", parts: [{ text: args.text }] }],
    config: {
      temperature: args.temperature ?? 1,
      responseModalities: ["AUDIO" as const],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: speakers.map((s) => ({
            speaker: s.speaker,
            voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } },
          })),
        },
      },
    },
  });

  const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) {
    throw new Error("Gemini TTS returned no inlineData.data");
  }

  const pcm = Buffer.from(inline.data, "base64");
  const fmt = parseAudioMimeType(inline.mimeType ?? "audio/L16;rate=24000");
  const wav = wrapPcmAsWav(pcm, fmt);
  const bytesPerSample = fmt.bitsPerSample / 8;
  const durationSec =
    pcm.length / (fmt.sampleRate * bytesPerSample * fmt.channels);

  return {
    wav: new Uint8Array(wav),
    pcm: new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength),
    sampleRate: fmt.sampleRate,
    bitsPerSample: fmt.bitsPerSample,
    channels: fmt.channels,
    durationSec,
  };
}

/**
 * Build canonical 44-byte RIFF/WAVE header + raw PCM payload.
 * Spec: http://soundfile.sapp.org/doc/WaveFormat/
 */
function wrapPcmAsWav(pcm: Buffer, fmt: AudioFormat): Buffer {
  const byteRate = (fmt.sampleRate * fmt.channels * fmt.bitsPerSample) / 8;
  const blockAlign = (fmt.channels * fmt.bitsPerSample) / 8;
  const dataLength = pcm.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(fmt.channels, 22);
  header.writeUInt32LE(fmt.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(fmt.bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return Buffer.concat([header, pcm]);
}

type AudioFormat = {
  readonly sampleRate: number;
  readonly bitsPerSample: number;
  readonly channels: number;
};

function parseAudioMimeType(mimeType: string): AudioFormat {
  // e.g. "audio/L16;rate=24000" → 24kHz, 16-bit, mono
  const [fileType, ...params] = mimeType.split(";").map((s) => s.trim());
  const format = fileType?.split("/")[1] ?? "L16";

  let bitsPerSample = 16;
  if (format.startsWith("L")) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) bitsPerSample = bits;
  }

  let sampleRate = 24_000;
  for (const p of params) {
    const [key, value] = p.split("=").map((s) => s.trim());
    if (key === "rate" && value) {
      const r = parseInt(value, 10);
      if (!isNaN(r)) sampleRate = r;
    }
  }

  return { sampleRate, bitsPerSample, channels: 1 };
}
