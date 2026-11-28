export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};
export type EmailAdapter = { send(message: EmailMessage): Promise<void> };

export class EmailConfigurationError extends Error {
  constructor() {
    super("Email is not configured. Set EMAIL_PROVIDER=resend, RESEND_API_KEY, and EMAIL_FROM.");
    this.name = "EmailConfigurationError";
  }
}

function configuredEmailAdapter(env: NodeJS.ProcessEnv = process.env): EmailAdapter {
  const provider = env["EMAIL_PROVIDER"];
  const apiKey = env["RESEND_API_KEY"];
  const from = env["EMAIL_FROM"];
  if (provider !== "resend" || !apiKey || !from) throw new EmailConfigurationError();

  return {
    async send(message) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`email_provider_http_${response.status}`);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function renderIncidentEmail(input: {
  event: "new_incident" | "overdue" | "completed";
  id: string;
  idempotencyKey: string;
  title: string;
  location: string;
  createdAt: string;
  resolutionNote?: string | null;
}): Omit<EmailMessage, "to"> {
  const protocol = input.id.slice(0, 8).toUpperCase();
  const labels = {
    new_incident: "Nova ocorrência",
    overdue: "Ocorrência em atraso",
    completed: "Ocorrência concluída",
  } as const;
  const subject = `${labels[input.event]} · #${protocol}`;
  const text = [
    labels[input.event],
    `Protocolo: #${protocol}`,
    `Título: ${input.title}`,
    `Local: ${input.location}`,
    `Abertura: ${input.createdAt}`,
    ...(input.resolutionNote ? [`Nota da equipe: ${input.resolutionNote}`] : []),
  ].join("\n");
  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
    );
  const html = `<h1>${escapeHtml(labels[input.event])}</h1><p>Protocolo: #${escapeHtml(protocol)}</p><p><strong>${escapeHtml(input.title)}</strong></p><p>${escapeHtml(input.location)}</p><p>Abertura: ${escapeHtml(input.createdAt)}</p>${input.resolutionNote ? `<p>Nota da equipe: ${escapeHtml(input.resolutionNote)}</p>` : ""}`;
  return { subject, text, html, idempotencyKey: input.idempotencyKey };
}

export async function sendIncidentEmail(message: EmailMessage): Promise<void> {
  await configuredEmailAdapter().send(message);
}
