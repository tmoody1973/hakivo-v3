import { Resend } from "resend";

/**
 * Thin Resend wrapper. Returns a plain object so calling code can mock it
 * easily in tests. Uses sandbox sender (`onboarding@resend.dev`) until the
 * caller supplies a verified `from` (set RESEND_FROM_ADDRESS in env once
 * hakivo.com DNS is verified).
 */

export type EmailSender = {
  readonly send: (args: {
    readonly to: string;
    readonly subject: string;
    readonly html: string;
    readonly text: string;
    readonly tags?: ReadonlyArray<{
      readonly name: string;
      readonly value: string;
    }>;
    readonly headers?: Readonly<Record<string, string>>;
    readonly replyTo?: string;
  }) => Promise<{ readonly id: string }>;
  readonly fromAddress: string;
};

const SANDBOX_FROM = "Hakivo <onboarding@resend.dev>";

export function createEmailSender(args: {
  readonly apiKey: string;
  readonly fromAddress?: string;
}): EmailSender {
  if (!args.apiKey) throw new Error("RESEND_API_KEY is required");
  const fromAddress = args.fromAddress ?? SANDBOX_FROM;
  const client = new Resend(args.apiKey);

  return {
    fromAddress,
    async send({ to, subject, html, text, tags, headers, replyTo }) {
      const result = await client.emails.send({
        from: fromAddress,
        to,
        subject,
        html,
        text,
        ...(tags && {
          tags: tags.map((t) => ({ name: t.name, value: t.value })),
        }),
        ...(headers && { headers: { ...headers } }),
        ...(replyTo && { replyTo }),
      });
      if (result.error) {
        throw new Error(
          `Resend send failed: ${result.error.name} — ${result.error.message}`,
        );
      }
      const id = result.data?.id;
      if (!id) throw new Error("Resend returned no email id");
      return { id };
    },
  };
}
