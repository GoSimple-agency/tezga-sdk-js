// Webhooks. Tezga POSTs to the URL from Settings → Integrations with the headers
// X-Tezga-Event, X-Tezga-Delivery and X-Tezga-Signature (sha256 HMAC of the body).
// A failed delivery is retried after 1, 5, 15, 60 and 360 minutes, so your handler
// must be idempotent: key it on X-Tezga-Delivery or on podaci.externalId.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Dokument } from "./types.js";

export const WEBHOOK_EVENTS = [
  "racun.fiskalizovan",
  "racun.greska",
  "refundacija.izvrsena",
  "storno.izvrsen",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Header names Tezga sends with every delivery. */
export const WEBHOOK_HEADERS = {
  event: "x-tezga-event",
  delivery: "x-tezga-delivery",
  signature: "x-tezga-signature",
} as const;

/** Minutes after which a failed delivery is retried. */
export const WEBHOOK_RETRY_MINUTES = [1, 5, 15, 60, 360] as const;

export interface WebhookPayload {
  dogadjaj: WebhookEvent;
  vreme: string;
  tenantId: string;
  /**
   * For `racun.*` the document. For `storno.izvrsen` and `refundacija.izvrsena`
   * the refund response. Carries your `externalId` and `provider` when known
   * (for a void or refund: those of the original order).
   */
  podaci: Dokument & { externalId?: string; provider?: string };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify the `X-Tezga-Signature` header against the RAW request body.
 *
 * Pass the body exactly as received (the raw string or Buffer, never a re-serialized
 * object) or the HMAC will not match. `secret` is the webhook secret from
 * Settings → Integrations.
 *
 * shortcut: the contract documents "sha256 HMAC of the body" without fixing the
 * encoding, so both hex and base64 of the same digest are accepted (an optional
 * `sha256=` prefix is stripped). Both are full HMAC checks, so this does not weaken
 * verification; pin it to the one real encoding once a live delivery confirms it.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined | null,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const sig = signature.trim().replace(/^sha256=/i, "");
  const digest = createHmac("sha256", secret).update(rawBody).digest();
  return safeEqual(sig.toLowerCase(), digest.toString("hex")) || safeEqual(sig, digest.toString("base64"));
}

/**
 * Verify and parse a delivery in one step. Throws when the signature does not
 * match, so an unverified payload can never reach your handler.
 */
export function parseWebhook(
  rawBody: string | Buffer,
  signature: string | undefined | null,
  secret: string,
): WebhookPayload {
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    throw new Error("Invalid X-Tezga-Signature: the webhook could not be verified.");
  }
  return JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")) as WebhookPayload;
}
