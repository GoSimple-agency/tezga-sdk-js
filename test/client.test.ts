// Exercises the real client against an injected fetch: URL building, headers, body
// forwarding and error parsing. No network. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { TezgaClient } from "../dist/index.js";
import { TezgaError } from "../dist/index.js";

type Call = { url: string; init: RequestInit };

/** Fake fetch that records the call and replays a canned response. */
function stub(status = 200, payload: unknown = {}, calls: Call[] = []) {
  const fetchImpl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(payload),
    };
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function client(status = 200, payload: unknown = {}, provider?: string) {
  const { fetchImpl, calls } = stub(status, payload);
  return { c: new TezgaClient({ apiKey: "tzg_test", fetch: fetchImpl, provider }), calls };
}

const headers = (c: Call) => c.init.headers as Record<string, string>;
const body = (c: Call) => JSON.parse(String(c.init.body));

test("issueReceipt hits /order with provider and forwards the body untouched", async () => {
  const { c, calls } = client();
  await c.issueReceipt({
    externalId: "ORDER-1042",
    nacinPlacanja: "Kartica",
    tok: "fiskalni",
    stavke: [{ naziv: "Espresso", kolicina: 2, cenaSaPdv: 180, poreskaStopa: "20" }],
    kupac: { naziv: "ACME", pib: "123456789" },
  });
  assert.equal(calls[0].url, "https://pos.narbiz.com/api/integrations/order?provider=custom");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(headers(calls[0])["X-Tezga-Api-Key"], "tzg_test");
  assert.equal(headers(calls[0])["Content-Type"], "application/json");
  // Field names must reach the API exactly as the official spec defines them.
  assert.deepEqual(body(calls[0]), {
    externalId: "ORDER-1042",
    nacinPlacanja: "Kartica",
    tok: "fiskalni",
    stavke: [{ naziv: "Espresso", kolicina: 2, cenaSaPdv: 180, poreskaStopa: "20" }],
    kupac: { naziv: "ACME", pib: "123456789" },
  });
});

test("provider option overrides the default tag", async () => {
  const { c, calls } = client(200, {}, "woocommerce");
  await c.issueReceipt({ externalId: "X", stavke: [] });
  assert.match(calls[0].url, /\?provider=woocommerce$/);
});

test("closeAdvance sets zatvori: true", async () => {
  const { c, calls } = client();
  await c.closeAdvance({ externalId: "ADV-5", stavke: [{ naziv: "Usluga", kolicina: 1, cenaSaPdv: 1000 }] });
  assert.equal(calls[0].url, "https://pos.narbiz.com/api/integrations/advance");
  assert.deepEqual(body(calls[0]), {
    externalId: "ADV-5",
    stavke: [{ naziv: "Usluga", kolicina: 1, cenaSaPdv: 1000 }],
    zatvori: true,
  });
});

test("openAdvance forwards placeniAvans and datumUplate", async () => {
  const { c, calls } = client();
  await c.openAdvance({ externalId: "ADV-5", placeniAvans: 10000, datumUplate: "2026-10-14" });
  assert.deepEqual(body(calls[0]), { externalId: "ADV-5", placeniAvans: 10000, datumUplate: "2026-10-14" });
});

test("getDocumentByExternalId uses the required query param", async () => {
  const { c, calls } = client();
  await c.getDocumentByExternalId("ORDER-1042");
  assert.equal(
    calls[0].url,
    "https://pos.narbiz.com/api/integrations/documents?externalId=ORDER-1042&provider=custom",
  );
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.body, undefined);
});

test("getDocument encodes the id in the path", async () => {
  const { c, calls } = client();
  await c.getDocument("d/01 HX");
  assert.equal(calls[0].url, "https://pos.narbiz.com/api/integrations/documents/d%2F01%20HX");
});

test("getTransactions drops empty filters", async () => {
  const { c, calls } = client();
  await c.getTransactions({ smer: "in", limit: 50 });
  assert.equal(calls[0].url, "https://pos.narbiz.com/api/integrations/transactions?smer=in&limit=50");
  await c.getTransactions();
  assert.equal(calls[1].url, "https://pos.narbiz.com/api/integrations/transactions");
});

test("copyReceipt sends the Idempotency-Key header", async () => {
  const { c, calls } = client();
  await c.copyReceipt({ documentId: "D1" }, "key-1");
  assert.equal(headers(calls[0])["Idempotency-Key"], "key-1");
});

test("upsertProducts and upsertCustomers wrap the arrays", async () => {
  const { c, calls } = client();
  await c.upsertProducts([{ sifra: "K1", naziv: "Kafa" }]);
  await c.upsertCustomers([{ naziv: "ACME", pib: "123456789" }]);
  assert.deepEqual(body(calls[0]), { stavke: [{ sifra: "K1", naziv: "Kafa" }] });
  assert.deepEqual(body(calls[1]), { kupci: [{ naziv: "ACME", pib: "123456789" }] });
});

test("errors carry the API's error string and field problems", async () => {
  const { c } = client(422, { error: "Poreska uprava je odbila račun", fields: [{ path: "stavke.0.cenaSaPdv", message: "mora biti > 0" }] });
  await assert.rejects(
    () => c.issueReceipt({ externalId: "X", stavke: [] }),
    (err: unknown) => {
      assert.ok(err instanceof TezgaError);
      assert.equal(err.status, 422);
      assert.equal(err.message, "Poreska uprava je odbila račun");
      assert.equal(err.fields[0].path, "stavke.0.cenaSaPdv");
      assert.equal(err.retryable, false);
      return true;
    },
  );
});

test("429 and 409 are flagged retryable", async () => {
  for (const [status, expected] of [[429, true], [409, true], [402, false]] as const) {
    const { c } = client(status, { error: "x" });
    await assert.rejects(
      () => c.getTaxLabels(),
      (err: unknown) => (err as TezgaError).retryable === expected,
    );
  }
});

test("getEnvironment maps okruzenje to English", async () => {
  for (const [sr, en] of [["produkcija", "production"], ["sandbox", "sandbox"], ["simulacija", "simulation"], [undefined, "unknown"]] as const) {
    const { c } = client(200, { okruzenje: sr });
    assert.equal(await c.getEnvironment(), en);
  }
});

test("refund without a reference rejects before any request", async () => {
  const { c, calls } = client();
  await assert.rejects(() => c.refund({ vrsta: "storno" }), TezgaError);
  assert.equal(calls.length, 0);
});

test("a network failure becomes a non-retryable TezgaError with status 0", async () => {
  const failing = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  const c = new TezgaClient({ apiKey: "tzg_test", fetch: failing });
  await assert.rejects(
    () => c.getTaxLabels(),
    (err: unknown) => {
      assert.ok(err instanceof TezgaError);
      assert.equal(err.status, 0);
      assert.equal(err.retryable, false);
      assert.match(err.message, /fetch failed/);
      return true;
    },
  );
});

test("a real refused connection surfaces as status 0, not a crash", async () => {
  const c = new TezgaClient({ apiKey: "tzg_test", baseUrl: "http://127.0.0.1:9", timeoutMs: 3000 });
  await assert.rejects(
    () => c.getTaxLabels(),
    (err: unknown) => err instanceof TezgaError && err.status === 0,
  );
});

test("every request carries an abort signal for the timeout", async () => {
  const { c, calls } = client();
  await c.getTaxLabels();
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("a missing api key fails fast", async () => {
  const { fetchImpl } = stub();
  const c = new TezgaClient({ apiKey: "", fetch: fetchImpl });
  await assert.rejects(() => c.getTaxLabels(), TezgaError);
});
