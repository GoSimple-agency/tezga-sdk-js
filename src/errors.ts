import type { GreskaPolje } from "./types.js";

/**
 * Thrown on any non-2xx response.
 *
 * The API returns `{ error, fields[] }`, so `message` is the API's `error` string and
 * `fields` carries per-field validation problems. Notable statuses: 402 (subscription
 * inactive or credit spent), 403 (read-only key, POS terminal key, or an IP outside the
 * key's allowlist), 409 (conflict, e.g. the externalId is in flight), 413 (body over
 * 512 KB), 422 (missing/empty array, over 500 items, or the Tax Administration rejected
 * it), 429 (rate limit).
 */
export class TezgaError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly fields: GreskaPolje[];

  constructor(message: string, status: number, body: unknown, fields: GreskaPolje[] = []) {
    super(message);
    this.name = "TezgaError";
    this.status = status;
    this.body = body;
    this.fields = fields;
  }

  /** True when retrying later can succeed (rate limit, or a conflict still in flight). */
  get retryable(): boolean {
    return this.status === 429 || this.status === 409;
  }
}
