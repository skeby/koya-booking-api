import dotenv from "dotenv";

dotenv.config();

/** Read an env var, throwing a clear error if it is missing/empty. */
export function require_env(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** Read an env var with a fallback when unset. */
export function optional_env(key: string, fallback: string): string {
  const value = process.env[key];
  return value && value.length > 0 ? value : fallback;
}
