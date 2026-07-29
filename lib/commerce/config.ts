import "server-only";
import { z } from "zod";

const optionalBoolean = z.enum(["true", "false"]).default("false").transform((value) => value === "true");

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  SHIPPO_API_TOKEN: z.string().min(1).optional(),
  BREVO_API_KEY: z.string().min(1).optional(),
  BREVO_SENDER_EMAIL: z.email().optional(),
  BREVO_SENDER_NAME: z.string().default("Velle Research"),
  COMMERCE_ENABLED: optionalBoolean,
  ZELLE_ENABLED: optionalBoolean,
  CASH_APP_ENABLED: optionalBoolean,
});

export const commerceConfig = envSchema.parse(process.env);

export const commerceReadiness = {
  database: Boolean(commerceConfig.NEXT_PUBLIC_SUPABASE_URL && commerceConfig.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  tax: Boolean(commerceConfig.STRIPE_SECRET_KEY),
  shipping: Boolean(commerceConfig.SHIPPO_API_TOKEN),
  email: Boolean(commerceConfig.BREVO_API_KEY && commerceConfig.BREVO_SENDER_EMAIL),
  liveCheckout: commerceConfig.COMMERCE_ENABLED,
};
