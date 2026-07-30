import "server-only";

export interface ShippoAddress {
  name: string;
  organization?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: "US";
  email: string;
  phone: string;
}

export async function validateShippoAddress(address: ShippoAddress) {
  const token = process.env.SHIPPO_API_TOKEN;
  if (!token) throw new Error("Shippo is not configured");
  const query = new URLSearchParams({
    name: address.name,
    address_line_1: address.addressLine1,
    city_locality: address.city,
    state_province: address.state,
    postal_code: address.postalCode,
    country_code: address.country,
    email: address.email,
    phone: address.phone,
  });
  if (address.organization) query.set("organization", address.organization);
  if (address.addressLine2) query.set("address_line_2", address.addressLine2);
  const response = await fetch(`https://api.goshippo.com/v2/addresses/validate?${query}`, {
    headers: { authorization: `ShippoToken ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Shippo validation failed (${response.status})`);
  return response.json() as Promise<Record<string, unknown>>;
}

function shippoHeaders() {
  const token = process.env.SHIPPO_API_TOKEN;
  if (!token) throw new Error("Shippo is not configured");
  return { authorization: `ShippoToken ${token}`, "content-type": "application/json", "SHIPPO-API-VERSION": "2018-02-08" };
}

export interface ShippoParcel { lengthInches: number; widthInches: number; heightInches: number; weightOunces: number }

export async function createShippoRateQuote(input: { to: ShippoAddress; parcel: ShippoParcel; metadata: string }) {
  const origin = {
    name: process.env.SHIPPO_ORIGIN_NAME, street1: process.env.SHIPPO_ORIGIN_STREET1,
    city: process.env.SHIPPO_ORIGIN_CITY, state: process.env.SHIPPO_ORIGIN_STATE,
    zip: process.env.SHIPPO_ORIGIN_POSTAL_CODE, country: "US",
  };
  if (Object.values(origin).some(value => !value)) throw new Error("Shippo origin is incomplete");
  const response = await fetch("https://api.goshippo.com/shipments", {
    method: "POST", headers: shippoHeaders(), cache: "no-store",
    body: JSON.stringify({
      address_from: origin,
      address_to: { name: input.to.name, street1: input.to.addressLine1, street2: input.to.addressLine2, city: input.to.city, state: input.to.state, zip: input.to.postalCode, country: input.to.country, email: input.to.email, phone: input.to.phone },
      parcels: [{ length: String(input.parcel.lengthInches), width: String(input.parcel.widthInches), height: String(input.parcel.heightInches), distance_unit: "in", weight: String(input.parcel.weightOunces), mass_unit: "oz" }],
      async: false, metadata: input.metadata,
    }),
  });
  if (!response.ok) throw new Error(`Shippo rate request failed (${response.status})`);
  return response.json() as Promise<{ object_id: string; status: string; rates: Array<{ object_id: string; amount: string; currency: string; provider: string; servicelevel: { name: string; token: string }; estimated_days?: number }> }>;
}

export async function purchaseShippoLabel(rateId: string, metadata: string) {
  const response = await fetch("https://api.goshippo.com/transactions", {
    method: "POST", headers: shippoHeaders(), cache: "no-store",
    body: JSON.stringify({ rate: rateId, async: false, label_file_type: "PDF_4x6", metadata }),
  });
  const body = await response.json() as Record<string, any>;
  if (!response.ok || body.status !== "SUCCESS") throw Object.assign(new Error(`Shippo label purchase failed (${response.status})`), { providerResponse: body });
  return body;
}

export async function retrieveShippoRate(rateId: string) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(rateId)) throw new Error("Invalid Shippo rate id");
  const response = await fetch(`https://api.goshippo.com/rates/${encodeURIComponent(rateId)}`, {
    headers: shippoHeaders(), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Shippo rate retrieval failed (${response.status})`);
  return response.json() as Promise<{ object_id:string;amount:string;currency:string;shipment:string;provider:string;servicelevel:{name:string;token:string};estimated_days?:number }>;
}
