import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Link,
} from "@react-pdf/renderer";
import * as React from "react";
import type { Doc } from "@hakivo/db";

/**
 * Print-first PDF handout for the Hakivo daily packet.
 *
 * Distinct from the email render: paper, not browser. Mostly black-on-
 * white to preserve printer ink, no background fills, generous margins,
 * 11-12pt body type. The exit-ticket section deliberately leaves
 * write-in space below each question — Marissa's class hands these out
 * and students fill them in by hand.
 *
 * Built-in fonts only (Helvetica, Times-Roman) — no external font
 * registration so the bundle stays small and Trigger.dev cold-starts
 * stay quick. Source Serif Pro / Inter swap is a future polish.
 */

const COLORS = {
  ink: "#1A1A1A",
  inkMuted: "#4A4A4A",
  rule: "#D9D6CB",
  accent: "#3B5B5C",
} as const;

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: COLORS.ink,
  },
  headerBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.ink,
  },
  brandText: {
    fontSize: 9,
    letterSpacing: 4,
    fontFamily: "Helvetica-Bold",
  },
  dateText: {
    fontSize: 9,
    color: COLORS.inkMuted,
  },
  forLine: {
    fontSize: 9,
    color: COLORS.inkMuted,
    marginBottom: 2,
  },
  headline: {
    fontFamily: "Times-Roman",
    fontSize: 19,
    lineHeight: 1.25,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 2,
    color: COLORS.inkMuted,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  briefPara: {
    fontSize: 11,
    lineHeight: 1.55,
    marginBottom: 8,
  },
  questionRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  questionNum: {
    width: 16,
    fontFamily: "Helvetica-Bold",
    color: COLORS.accent,
  },
  questionText: {
    flex: 1,
    lineHeight: 1.5,
  },
  exitTicketItem: {
    marginBottom: 18,
  },
  exitTicketKindBadge: {
    fontSize: 7,
    letterSpacing: 1.5,
    color: COLORS.inkMuted,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  exitTicketPrompt: {
    fontSize: 11,
    lineHeight: 1.5,
    marginBottom: 6,
  },
  mcChoice: {
    flexDirection: "row",
    marginBottom: 3,
    paddingLeft: 12,
  },
  mcLetter: {
    width: 18,
    fontFamily: "Helvetica-Bold",
  },
  mcText: {
    flex: 1,
    fontSize: 11,
  },
  writeInLine: {
    height: 14,
    borderBottomWidth: 0.6,
    borderBottomColor: COLORS.rule,
    marginBottom: 4,
  },
  sourceItem: {
    marginBottom: 8,
    fontSize: 10,
  },
  sourceLabel: {
    fontFamily: "Helvetica-Bold",
  },
  sourceUrl: {
    fontSize: 9,
    color: COLORS.accent,
  },
  sourceExcerpt: {
    fontSize: 9,
    color: COLORS.inkMuted,
    lineHeight: 1.4,
    marginTop: 2,
    fontStyle: "italic",
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: COLORS.inkMuted,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.rule,
  },
  pageNumber: {
    fontSize: 8,
    color: COLORS.inkMuted,
  },
});

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function deriveHeadline(packet: Doc<"packets">): string {
  return (
    packet.teacherBrief.split(/\n+/)[0]?.slice(0, 160) ?? "Today's Packet"
  );
}

function standardsLine(packet: Doc<"packets">): string {
  const c3 = packet.standardsAlignment.c3Dimensions.length;
  const ap = packet.standardsAlignment.apCedUnits?.length ?? 0;
  const st = packet.standardsAlignment.stateStandards.length;
  const parts: string[] = [];
  if (c3 > 0) parts.push(`${c3} C3`);
  if (ap > 0) parts.push(`${ap} AP CED`);
  if (st > 0) parts.push(`${st} state`);
  return parts.join(" · ") || "—";
}

type RenderArgs = {
  readonly packet: Doc<"packets">;
  readonly teacherName: string;
};

function HandoutDocument({ packet, teacherName }: RenderArgs) {
  const headline = deriveHeadline(packet);
  const briefParas = packet.teacherBrief
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Document
      title={`Hakivo Packet — ${packet.packetDate}`}
      author="Hakivo"
      subject="Daily civic packet"
    >
      {/* Page 1 — Brief + Discussion Questions */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerBand}>
          <Text style={styles.brandText}>HAKIVO PACKET</Text>
          <Text style={styles.dateText}>
            {formatLongDate(packet.packetDate)}
          </Text>
        </View>

        <Text style={styles.forLine}>For {teacherName}</Text>
        <Text style={styles.headline}>{headline}</Text>

        <Text style={styles.sectionLabel}>Brief</Text>
        {briefParas.map((p, i) => (
          <Text key={i} style={styles.briefPara}>
            {p}
          </Text>
        ))}

        <Text style={styles.sectionLabel}>Discussion Questions</Text>
        {packet.discussionQuestions.map((q, i) => (
          <View key={i} style={styles.questionRow}>
            <Text style={styles.questionNum}>{i + 1}.</Text>
            <Text style={styles.questionText}>{q}</Text>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>Hakivo · {standardsLine(packet)}</Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>

      {/* Page 2 — Exit Ticket + Sources */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerBand}>
          <Text style={styles.brandText}>EXIT TICKET</Text>
          <Text style={styles.dateText}>
            {formatLongDate(packet.packetDate)}
          </Text>
        </View>

        <Text style={styles.forLine}>Name __________________________</Text>

        {packet.exitTicket.questions.map((q, i) => (
          <View key={i} style={styles.exitTicketItem}>
            <Text style={styles.exitTicketKindBadge}>
              Q{i + 1} ·{" "}
              {q.kind === "multiple_choice" ? "MULTIPLE CHOICE" : "SHORT ANSWER"}
            </Text>
            <Text style={styles.exitTicketPrompt}>{q.prompt}</Text>

            {q.kind === "multiple_choice" && q.choices ? (
              q.choices.map((choice, j) => (
                <View key={j} style={styles.mcChoice}>
                  <Text style={styles.mcLetter}>
                    {LETTERS[j] ?? String(j + 1)}.
                  </Text>
                  <Text style={styles.mcText}>{choice}</Text>
                </View>
              ))
            ) : (
              <View>
                <View style={styles.writeInLine} />
                <View style={styles.writeInLine} />
                <View style={styles.writeInLine} />
              </View>
            )}
          </View>
        ))}

        <Text style={styles.sectionLabel}>Primary Sources</Text>
        {packet.primarySources.map((s, i) => (
          <View key={i} style={styles.sourceItem}>
            <Text style={styles.sourceLabel}>{s.label}</Text>
            <Link src={s.url} style={styles.sourceUrl}>
              {s.url}
            </Link>
            {s.excerpt && (
              <Text style={styles.sourceExcerpt}>
                &ldquo;{s.excerpt.slice(0, 220)}&rdquo;
              </Text>
            )}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>Hakivo · {standardsLine(packet)}</Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export type RenderHandoutResult = {
  readonly buffer: Uint8Array;
  readonly bytes: number;
};

export async function renderHandoutPdf(
  args: RenderArgs,
): Promise<RenderHandoutResult> {
  const blob = await pdf(<HandoutDocument {...args} />).toBlob();
  const buffer = new Uint8Array(await blob.arrayBuffer());
  return { buffer, bytes: buffer.byteLength };
}
