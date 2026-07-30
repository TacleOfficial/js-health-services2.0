import "server-only";

export interface TaxQuoteInput {
  currency: "usd";
  customerAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: "US";
  };
  lines: Array<{ reference: string; amountCents: number; quantity: number; taxCode?: string }>;
  shippingCents: number;
}

export async function createStripeTaxQuote(input: TaxQuoteInput) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe Tax is not configured");
  const params = new URLSearchParams({ currency: input.currency });
  const address = input.customerAddress;
  params.set("customer_details[address][line1]", address.line1);
  if (address.line2) params.set("customer_details[address][line2]", address.line2);
  params.set("customer_details[address][city]", address.city);
  params.set("customer_details[address][state]", address.state);
  params.set("customer_details[address][postal_code]", address.postalCode);
  params.set("customer_details[address][country]", address.country);
  params.set("shipping_cost[amount]", String(input.shippingCents));
  input.lines.forEach((line, index) => {
    params.set(`line_items[${index}][reference]`, line.reference);
    params.set(`line_items[${index}][amount]`, String(line.amountCents));
    params.set(`line_items[${index}][quantity]`, String(line.quantity));
    if (line.taxCode) params.set(`line_items[${index}][tax_code]`, line.taxCode);
  });
  const response = await fetch("https://api.stripe.com/v1/tax/calculations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = "";
    try { detail = JSON.stringify(await response.json()); } catch {}
    throw new StripeTaxError(`Stripe Tax request failed (${response.status})`, response.status >= 500 || response.status === 429, response.status, detail);
  }
  return response.json() as Promise<{ id: string; amount_total: number; tax_amount_exclusive: number }>;
}

export class StripeTaxError extends Error {
  constructor(message: string, public readonly technical: boolean, public readonly status?: number, public readonly detail?: string) {
    super(message);
    this.name = "StripeTaxError";
  }
}
