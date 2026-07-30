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

export async function sendStagingOrderAccessEmail(input: {
  to: string;
  orderNumber: string;
  accessUrl: string;
  total: string;
}) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) throw new Error("Brevo is not configured");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME ?? "Velle Research" },
      to: [{ email: input.to, name: "Staging tester" }],
      subject: `Staging order ${input.orderNumber}`,
      textContent: `STAGING TEST ONLY — DO NOT SEND FUNDS.\n\nOrder: ${input.orderNumber}\nTotal: ${input.total}\nAccess this fictional order for 24 hours: ${input.accessUrl}`,
      htmlContent: `<p><strong>STAGING TEST ONLY — DO NOT SEND FUNDS.</strong></p><p>Order: ${input.orderNumber}<br>Total: ${input.total}</p><p><a href="${input.accessUrl}">Access this fictional order</a>. The link expires in 24 hours.</p>`,
      headers: { "X-Velle-Idempotency-Key": `staging-order:${input.orderNumber}` },
      tags: ["staging-order"],
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Brevo request failed (${response.status})`);
  return response.json() as Promise<{ messageId: string }>;
}

export async function sendOrderLifecycleEmail(input: {
  buyerEmail: string; buyerName?: string; orderNumber: string; event: string;
  accessUrl?: string; detail: string; idempotencyKey: string; commerceMode: "production"|"staging";
}) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const internal = input.commerceMode === "staging" ? process.env.STAGING_TEST_INBOX : process.env.PRODUCTION_INTERNAL_INBOX;
  if (!apiKey || !senderEmail || !internal) throw new Error("Transactional email is not configured");
  const recipients = input.commerceMode === "production"
    ? [{ email: input.buyerEmail, name: input.buyerName }, { email: internal, name: "Commerce operations" }]
    : [{ email: internal, name: "Staging tester" }];
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME ?? "Velle Research" },
      to: recipients, subject: `${input.orderNumber}: ${input.event}`,
      textContent: `${input.detail}${input.accessUrl ? `\n\nSecure order access: ${input.accessUrl}` : ""}`,
      htmlContent: `<p>${input.detail}</p>${input.accessUrl ? `<p><a href="${input.accessUrl}">Secure order access</a></p>` : ""}`,
      headers: { "X-Velle-Idempotency-Key": input.idempotencyKey },
      tags: [input.commerceMode, "order-lifecycle", input.event.toLowerCase().replaceAll(" ", "-")],
    }), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Brevo request failed (${response.status})`);
  return response.json() as Promise<{ messageId: string }>;
}
