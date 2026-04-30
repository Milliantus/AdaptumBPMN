import crypto from "crypto";

// Prints 48 bytes base64url string (safe for env vars)
process.stdout.write(crypto.randomBytes(48).toString("base64url"));

