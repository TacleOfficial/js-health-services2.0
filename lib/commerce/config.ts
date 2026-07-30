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
  STAGING_TEST_INBOX: z.email().optional(),
  PRODUCTION_INTERNAL_INBOX: z.email().optional(),
  SHIPPO_WEBHOOK_SECRET: z.string().min(16).optional(),
  SHIPPO_ORIGIN_NAME: z.string().min(1).optional(),
  SHIPPO_ORIGIN_STREET1: z.string().min(1).optional(),
  SHIPPO_ORIGIN_CITY: z.string().min(1).optional(),
  SHIPPO_ORIGIN_STATE: z.string().length(2).optional(),
  SHIPPO_ORIGIN_POSTAL_CODE: z.string().min(5).optional(),
  STRIPE_DEFAULT_TAX_CODE: z.string().regex(/^txcd_\d+$/).optional(),
  COMMERCE_ENABLED: optionalBoolean,
  STAGING_ORDER_TEST_MODE: optionalBoolean,
  TRANSACTIONAL_EMAIL_ENABLED: optionalBoolean,
  SHIPPO_LABEL_PURCHASE_ENABLED: optionalBoolean,
  ZELLE_ENABLED: optionalBoolean,
  CASH_APP_ENABLED: optionalBoolean,
});

export const commerceConfig = envSchema.parse(process.env);

export const commerceReadiness = {
  database: Boolean(commerceConfig.NEXT_PUBLIC_SUPABASE_URL && commerceConfig.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  tax: commerceConfig.STAGING_ORDER_TEST_MODE || Boolean(commerceConfig.STRIPE_SECRET_KEY),
  shipping: Boolean(commerceConfig.SHIPPO_API_TOKEN),
  email: Boolean(commerceConfig.BREVO_API_KEY && commerceConfig.BREVO_SENDER_EMAIL && commerceConfig.STAGING_TEST_INBOX),
  liveCheckout: commerceConfig.COMMERCE_ENABLED,
};

export function assertStagingCheckoutEnabled() {
  if (!commerceConfig.COMMERCE_ENABLED || !commerceConfig.STAGING_ORDER_TEST_MODE) {
    throw new Error("The guest staging checkout is disabled.");
  }
  if (!commerceConfig.STAGING_TEST_INBOX) throw new Error("The staging test inbox is not configured.");
}
