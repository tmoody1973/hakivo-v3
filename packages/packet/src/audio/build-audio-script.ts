import type { Doc } from "@hakivo/db";
import { GoogleGenAI } from "@google/genai";

/**
 * Convert a packet's teacher brief into a 2-host dialogue script for
 * Gemini 3.1 Flash TTS multi-speaker mode.
 *
 * Format: "Maya:" and "Jordan:" alternating. Maya = warmer host who sets
 * up topics; Jordan = analytical co-host who elaborates. Marissa's
 * interview was clear that her audio mental model is NPR Up First — two
 * voices, not a narrator.
 *
 * Strict rules baked into the prompt:
 *   - No new facts beyond the brief (anti-hallucination)
 *   - No partisan editorialization (politically neutral)
 *   - Bill citations spelled out for TTS clarity ("House Resolution 53-34"
 *     not "H.R. 5334" — the model would otherwise read the period)
 *   - Open with greeting, close with handoff to the email packet
 */

const SCRIPT_MODEL = "gemini-2.5-flash";

/**
 * Audience-specific framing for Maya/Jordan. Same shared rules below;
 * only the audience line + closing handoff change.
 */
const AUDIENCE_FRAMINGS = {
  teacher: {
    audienceLine:
      "deliver a 3-4 minute briefing on this week's congressional activity for high school civics teachers.",
    closingHandoff:
      'Jordan hands off to "the full packet in your inbox — exit ticket, primary sources, standards alignment."',
  },
  personal: {
    audienceLine:
      "deliver a 3-4 minute civic briefing for an engaged adult listener — someone who wants to stay current on policy without partisan filter. Not a classroom audience; no AP curriculum framing, no 'students,' no 'lessons.'",
    closingHandoff:
      'Jordan hands off to "the full brief in your inbox — sources, reflective questions, the works."',
  },
} as const;

function buildSystemPrompt(audience: "teacher" | "personal"): string {
  const framing = AUDIENCE_FRAMINGS[audience];
  return `You are scripting a short morning radio segment in the NPR "Up First" / "The Daily" style. Two co-hosts, MAYA and JORDAN, ${framing.audienceLine}

CRITICAL RULES:
1. Use ONLY facts present in the source material. Never invent details, dates, vote counts, sponsors, or quotes.
2. Politically neutral. No loaded adjectives. If a bill is bipartisan, say so. If a bill is single-party, say so without judgment.
3. Spell out bill citations for TTS clarity. "H.R. 5334" should be read as "House Resolution 5334" or "House Resolution 53-34" (digit groups). Same for "S. 1234" → "Senate bill 1234". Never include periods or abbreviations the TTS will mispronounce.
4. Conversational not stiff. Use natural radio language: "yeah", "right", "interesting", "so", brief acknowledgments. Hosts can finish each other's thoughts.
5. Maya opens, Jordan closes. They trade off topics naturally.
6. Audio tags allowed sparingly to add warmth — [thoughtful], [pause], [warm]. Use no more than 4 in the entire script.
7. Format strictly as alternating speaker lines:
   Maya: ...
   Jordan: ...
8. Open with: Maya greeting + framing the date and the central theme. Close with: ${framing.closingHandoff}
9. After Jordan's important closing line, ALWAYS add ONE more short throwaway line from Maya (e.g., "Maya: Have a great rest of your week.") — this acts as a TTS tail buffer; if the model clips its audio output near the end (a known Gemini TTS quirk), the throwaway gets clipped instead of the real handoff.
10. Total spoken length target: 550-700 words.

Output ONLY the script. No preamble, no markdown, no scene direction beyond audio tags.`;
}

export type BuildScriptArgs = {
  readonly packet: Doc<"packets">;
  readonly geminiApiKey: string;
};

export async function buildAudioScript(args: BuildScriptArgs): Promise<string> {
  const { packet, geminiApiKey } = args;
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY required for audio script generation");
  }

  const audience: "teacher" | "personal" = packet.audience ?? "teacher";
  const systemPrompt = buildSystemPrompt(audience);
  const sourceMaterial = formatSourceMaterial(packet);
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  const response = await ai.models.generateContent({
    model: SCRIPT_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${systemPrompt}\n\n---\nSOURCE MATERIAL:\n${sourceMaterial}\n---\nWrite the dialogue now.`,
          },
        ],
      },
    ],
    config: {
      temperature: 0.7,
      // 2.5 Flash uses thinking tokens that count against maxOutputTokens.
      // 2048 was getting eaten by thinking, leaving no room for the actual
      // 550-700-word script (output cut off mid-sentence at ~55 words).
      // 8192 leaves comfortable room for both. thinkingBudget: 0 disables
      // thinking entirely — fine here, the task is simple text rewriting.
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const script = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!script) {
    throw new Error("Gemini script-builder returned no text");
  }
  return script;
}

function formatSourceMaterial(packet: Doc<"packets">): string {
  const lines: string[] = [
    `PACKET DATE: ${packet.packetDate}`,
    "",
    "TEACHER BRIEF:",
    packet.teacherBrief,
    "",
    "DISCUSSION QUESTIONS (top 3 may be referenced if there's room):",
    ...packet.discussionQuestions
      .slice(0, 3)
      .map((q, i) => `${i + 1}. ${q}`),
    "",
    "PRIMARY SOURCES (cite these implicitly, do not read URLs aloud):",
    ...packet.primarySources.map((s) => `- ${s.label}`),
  ];
  return lines.join("\n");
}
