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
