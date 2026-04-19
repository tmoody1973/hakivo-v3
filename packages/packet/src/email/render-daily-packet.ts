import type { Doc } from "@hakivo/db";

/**
 * Render a packet to email-ready HTML + plain-text.
 *
 * Email constraints:
 *   - 600px max width (mobile-first, fits Gmail/Outlook)
 *   - Table-based layout (Outlook on Windows still doesn't honor flex)
 *   - All styles inline (gmail strips <style> in some clients)
 *   - System-stack font fallbacks (custom fonts unreliable in email)
 *   - Color palette respects political-neutrality rule (cream / ink / teal)
 *
 * Matches the approved email mockup (HAKIVO dark header → editorial serif
 * headline → numbered discussion questions → exit ticket preview → primary
 * sources → push-to-classroom CTA).
 */

const COLORS = {
  cream: "#FAF9F5",
  ink: "#1A1A1A",
  inkMuted: "#4A4A4A",
  rule: "#E8E5DB",
  accent: "#3B5B5C",
  accentText: "#FAF9F5",
} as const;

const SERIF =
  "Georgia, 'Times New Roman', 'Source Serif Pro', Charter, serif";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif";

type RenderInput = {
  readonly packet: Doc<"packets">;
  readonly teacherName: string;
  readonly classroomPushUrl?: string;
  readonly viewInBrowserUrl?: string;
  readonly unsubscribeUrl?: string;
};

export type RenderedEmail = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

function formatAudioDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return "audio";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function deriveSubject(packet: Doc<"packets">): string {
  const headline =
    packet.teacherBrief.split(/\n+/)[0]?.slice(0, 80).replace(/[\.\s]+$/, "") ??
    "Today's Hakivo packet";
  return `${headline} — ${formatLongDate(packet.packetDate)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderDailyPacketEmail(input: RenderInput): RenderedEmail {
  const { packet, teacherName, classroomPushUrl, viewInBrowserUrl, unsubscribeUrl } =
    input;
  const subject = deriveSubject(packet);

  const briefHtml = packet.teacherBrief
    .split(/\n\n+/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;color:${COLORS.ink};font-family:${SANS};font-size:15px;line-height:1.55;">${escapeHtml(p)}</p>`,
    )
    .join("");

  const questionsHtml = packet.discussionQuestions
    .map(
      (q, i) =>
        `<li style="margin:0 0 10px 0;color:${COLORS.ink};font-family:${SANS};font-size:14px;line-height:1.5;"><strong style="color:${COLORS.accent};">${i + 1}.</strong> ${escapeHtml(q)}</li>`,
    )
    .join("");

  const exitTicketHtml = packet.exitTicket.questions
    .slice(0, 3)
    .map((q, i) => {
      const label =
        q.kind === "multiple_choice" ? "MC" : "SHORT";
      return `<li style="margin:0 0 12px 0;color:${COLORS.ink};font-family:${SANS};font-size:13px;line-height:1.5;"><span style="display:inline-block;padding:1px 6px;margin-right:6px;background:${COLORS.rule};color:${COLORS.inkMuted};font-size:9px;letter-spacing:1px;text-transform:uppercase;">${label}</span>Q${i + 1}. ${escapeHtml(q.prompt)}</li>`;
    })
    .join("");
  const moreExit =
    packet.exitTicket.questions.length > 3
      ? `<p style="margin:6px 0 0 0;color:${COLORS.inkMuted};font-family:${SANS};font-size:12px;">+ ${packet.exitTicket.questions.length - 3} more in the full packet</p>`
      : "";

  const sourcesHtml = packet.primarySources
    .map(
      (s) =>
        `<li style="margin:0 0 10px 0;color:${COLORS.ink};font-family:${SANS};font-size:13px;line-height:1.5;"><a href="${s.url}" style="color:${COLORS.accent};text-decoration:underline;">${escapeHtml(s.label)}</a><br/><span style="color:${COLORS.inkMuted};font-size:12px;">&ldquo;${escapeHtml(s.excerpt.slice(0, 140))}&rdquo;</span></li>`,
    )
    .join("");

  const headline =
    packet.teacherBrief.split(/\n+/)[0]?.slice(0, 140) ?? "Today's Packet";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.cream};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.cream};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid ${COLORS.rule};">

        <tr>
          <td style="padding:18px 28px;background:${COLORS.ink};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:${SANS};font-size:11px;letter-spacing:5px;color:${COLORS.cream};font-weight:600;">HAKIVO PACKET</td>
                <td align="right" style="font-family:${SANS};font-size:11px;color:${COLORS.cream};opacity:0.7;">${formatLongDate(packet.packetDate)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 28px 8px 28px;">
            <h1 style="margin:0;font-family:${SERIF};font-size:24px;line-height:1.2;color:${COLORS.ink};font-weight:400;">${escapeHtml(headline)}</h1>
            <p style="margin:6px 0 0 0;font-family:${SANS};font-size:12px;color:${COLORS.inkMuted};">For ${escapeHtml(teacherName)}</p>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 28px 8px 28px;">
            ${briefHtml}
          </td>
        </tr>

        ${
          packet.audioUrl || packet.pdfUrl
            ? `<tr>
          <td style="padding:8px 28px 24px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.cream};border:1px solid ${COLORS.rule};">
              <tr>
                <td style="padding:14px 16px;">
                  <p style="margin:0 0 8px 0;font-family:${SANS};font-size:11px;letter-spacing:2px;color:${COLORS.inkMuted};text-transform:uppercase;">Today's Packet</p>
                  ${
                    packet.audioUrl
                      ? `<a href="${packet.audioUrl}" style="display:inline-block;padding:8px 16px;margin:0 8px 4px 0;background:${COLORS.accent};color:${COLORS.accentText};font-family:${SANS};font-size:13px;font-weight:500;text-decoration:none;border-radius:8px;">▸ Listen ${formatAudioDuration(packet.audioDurationSec)}</a>`
                      : ""
                  }
                  ${
                    packet.pdfUrl
                      ? `<a href="${packet.pdfUrl}" style="display:inline-block;padding:8px 16px;margin:0 0 4px 0;background:#FFFFFF;color:${COLORS.ink};border:1px solid ${COLORS.ink};font-family:${SANS};font-size:13px;font-weight:500;text-decoration:none;border-radius:8px;">⬇ Print handout</a>`
                      : ""
                  }
                  ${
                    packet.audioUrl
                      ? `<p style="margin:8px 0 0 0;font-family:${SANS};font-size:11px;color:${COLORS.inkMuted};">Two-host briefing for prep · printable handout for class.</p>`
                      : `<p style="margin:8px 0 0 0;font-family:${SANS};font-size:11px;color:${COLORS.inkMuted};">Print-ready handout with exit ticket.</p>`
                  }
                </td>
              </tr>
            </table>
          </td>
        </tr>`
            : ""
        }

        ${
          classroomPushUrl
            ? `<tr>
          <td style="padding:8px 28px 24px 28px;">
            <a href="${classroomPushUrl}" style="display:inline-block;padding:10px 20px;background:${COLORS.accent};color:${COLORS.accentText};font-family:${SANS};font-size:14px;font-weight:500;text-decoration:none;border-radius:8px;">Push to Google Classroom</a>
          </td>
        </tr>`
            : ""
        }

        <tr>
          <td style="padding:8px 28px;">
            <p style="margin:0 0 8px 0;font-family:${SANS};font-size:11px;letter-spacing:2px;color:${COLORS.inkMuted};text-transform:uppercase;">Discussion Questions</p>
            <ol style="margin:8px 0 0 0;padding-left:18px;list-style:none;">
              ${questionsHtml}
            </ol>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 28px 8px 28px;border-top:1px solid ${COLORS.rule};">
            <p style="margin:0 0 8px 0;font-family:${SANS};font-size:11px;letter-spacing:2px;color:${COLORS.inkMuted};text-transform:uppercase;">Exit Ticket Preview</p>
            <ol style="margin:8px 0 0 0;padding-left:0;list-style:none;">
              ${exitTicketHtml}
            </ol>
            ${moreExit}
          </td>
        </tr>

        <tr>
          <td style="padding:24px 28px 8px 28px;border-top:1px solid ${COLORS.rule};">
            <p style="margin:0 0 8px 0;font-family:${SANS};font-size:11px;letter-spacing:2px;color:${COLORS.inkMuted};text-transform:uppercase;">Primary Sources</p>
            <ul style="margin:8px 0 0 0;padding-left:18px;list-style:none;">
              ${sourcesHtml}
            </ul>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 28px;border-top:1px solid ${COLORS.rule};">
            <p style="margin:0 0 4px 0;font-family:${SANS};font-size:11px;color:${COLORS.inkMuted};">
              Standards alignment:
              ${packet.standardsAlignment.c3Dimensions.length} C3
              · ${packet.standardsAlignment.apCedUnits ? `${packet.standardsAlignment.apCedUnits.length} AP CED` : "no AP"}
              · ${packet.standardsAlignment.stateStandards.length} state
            </p>
            ${
              viewInBrowserUrl
                ? `<p style="margin:8px 0 0 0;font-family:${SANS};font-size:11px;"><a href="${viewInBrowserUrl}" style="color:${COLORS.accent};">View full packet in browser</a></p>`
                : ""
            }
          </td>
        </tr>

        <tr>
          <td style="padding:16px 28px;background:${COLORS.cream};">
            <p style="margin:0;font-family:${SANS};font-size:10px;color:${COLORS.inkMuted};line-height:1.5;">
              Hakivo · Civic intelligence delivered daily.
              ${unsubscribeUrl ? ` · <a href="${unsubscribeUrl}" style="color:${COLORS.inkMuted};">Unsubscribe</a>` : ""}
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  // Plain-text fallback
  const text = [
    `HAKIVO PACKET — ${formatLongDate(packet.packetDate)}`,
    `For ${teacherName}`,
    "",
    headline,
    "",
    packet.teacherBrief,
    "",
    packet.audioUrl
      ? `LISTEN (${formatAudioDuration(packet.audioDurationSec)}): ${packet.audioUrl}`
      : "",
    packet.pdfUrl ? `PRINT HANDOUT: ${packet.pdfUrl}` : "",
    packet.audioUrl || packet.pdfUrl ? "" : "",
    "DISCUSSION QUESTIONS",
    ...packet.discussionQuestions.map((q, i) => `${i + 1}. ${q}`),
    "",
    "EXIT TICKET PREVIEW",
    ...packet.exitTicket.questions
      .slice(0, 3)
      .map(
        (q, i) =>
          `Q${i + 1}. [${q.kind.replace("_", " ")}] ${q.prompt}`,
      ),
    packet.exitTicket.questions.length > 3
      ? `+ ${packet.exitTicket.questions.length - 3} more in the full packet`
      : "",
    "",
    "PRIMARY SOURCES",
    ...packet.primarySources.map(
      (s) => `- ${s.label}\n  ${s.url}\n  "${s.excerpt.slice(0, 140)}"`,
    ),
    "",
    viewInBrowserUrl ? `View full packet: ${viewInBrowserUrl}` : "",
    unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : "",
    "",
    "Hakivo · Civic intelligence delivered daily.",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
