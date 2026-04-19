/**
 * Gemini 3.1 Flash TTS — multi-speaker briefings for Hakivo.
 *
 * We use multi-speaker dialogue (two co-hosts) because Marissa's interview
 * said the format that works for her is "NPR Up First" — two voices
 * trading off, conversational, easy to fold-laundry-to. A single robotic
 * narrator was an explicit deal-breaker.
 *
 * Defaults: Maya (Callirrhoe, warmer host) + Jordan (Algenib, analyst).
 * Speaker names in the script must match the SpeakerConfig.speaker field
 * — Gemini routes by name, not by order.
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
  readonly wav: Uint8Array;
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
    sampleRate: fmt.sampleRate,
    bitsPerSample: fmt.bitsPerSample,
    channels: fmt.channels,
    durationSec,
  };
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
