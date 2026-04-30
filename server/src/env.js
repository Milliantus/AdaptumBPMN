import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8787),
  PUBLIC_BASE_URL: z.string().min(1),
  AMO_CLIENT_ID: z.string().min(1),
  AMO_CLIENT_SECRET: z.string().min(1),
  AMO_REDIRECT_PATH: z.string().default("/oauth/callback"),
  TOKENS_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().default("*"),
});

export const env = EnvSchema.parse(process.env);

export const redirectUri = new URL(env.AMO_REDIRECT_PATH, env.PUBLIC_BASE_URL).toString();

