import "server-only";

export async function sendTransactionalEmail(input: {
  to: { email: string; name?: string };
  templateId: number;
  params: Record<string, string | number>;
  idempotencyKey: string;
}) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) throw new Error("Brevo is not configured");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME ?? "Velle Research" },
      to: [input.to],
      templateId: input.templateId,
      params: input.params,
      headers: { "X-Velle-Idempotency-Key": input.idempotencyKey },
      tags: ["transactional"],
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Brevo request failed (${response.status})`);
  return response.json() as Promise<{ messageId: string }>;
}
