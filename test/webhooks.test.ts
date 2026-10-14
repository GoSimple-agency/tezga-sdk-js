// Signature verification is security code, so it gets its own suite.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseWebhook, verifyWebhookSignature, WEBHOOK_EVENTS } from "../dist/index.js";

const SECRET = "whsec_test";
const BODY = JSON.stringify({
  dogadjaj: "racun.fiskalizovan",
  vreme: "2026-10-14T10:00:00Z",
  tenantId: "11111111-2222-3333-4444-555555555555",
  podaci: { documentId: "d1", externalId: "ORDER-1042", fiskalni: { pfrBroj: "ABC-DEF-1" } },
});
const hex = createHmac("sha256", SECRET).update(BODY).digest("hex");
const b64 = createHmac("sha256", SECRET).update(BODY).digest("base64");

test("accepts a correct hex signature", () => {
  assert.equal(verifyWebhookSignature(BODY, hex, SECRET), true);
});

test("accepts base64, an uppercase hex and a sha256= prefix", () => {
  assert.equal(verifyWebhookSignature(BODY, b64, SECRET), true);
  assert.equal(verifyWebhookSignature(BODY, hex.toUpperCase(), SECRET), true);
  assert.equal(verifyWebhookSignature(BODY, `sha256=${hex}`, SECRET), true);
  assert.equal(verifyWebhookSignature(BODY, ` ${hex} `, SECRET), true);
});

test("works on a Buffer body exactly as received", () => {
  assert.equal(verifyWebhookSignature(Buffer.from(BODY, "utf8"), hex, SECRET), true);
});

test("rejects a tampered body", () => {
  const tampered = BODY.replace("ORDER-1042", "ORDER-9999");
  assert.equal(verifyWebhookSignature(tampered, hex, SECRET), false);
});

test("rejects a wrong secret, a wrong signature and empty input", () => {
  assert.equal(verifyWebhookSignature(BODY, hex, "whsec_other"), false);
  assert.equal(verifyWebhookSignature(BODY, "deadbeef", SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, "", SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, undefined, SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, hex, ""), false);
});

test("a length mismatch returns false instead of throwing", () => {
  assert.equal(verifyWebhookSignature(BODY, hex.slice(0, 10), SECRET), false);
});

test("parseWebhook verifies before it parses", () => {
  const payload = parseWebhook(BODY, hex, SECRET);
  assert.equal(payload.dogadjaj, "racun.fiskalizovan");
  assert.equal(payload.podaci.externalId, "ORDER-1042");
  assert.throws(() => parseWebhook(BODY, "deadbeef", SECRET), /Invalid X-Tezga-Signature/);
});

test("the documented event list is complete", () => {
  assert.deepEqual([...WEBHOOK_EVENTS], [
    "racun.fiskalizovan",
    "racun.greska",
    "refundacija.izvrsena",
    "storno.izvrsen",
  ]);
});
