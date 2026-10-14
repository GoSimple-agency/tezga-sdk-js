<p align="center">
  <a href="https://tezgafiskal.com"><picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/GoSimple-agency/.github/main/profile/assets/tezga-lockup-dark.svg">
    <img alt="Tezga" src="https://raw.githubusercontent.com/GoSimple-agency/.github/main/profile/assets/tezga-lockup.svg" width="240">
  </picture></a>
</p>

# Tezga Fiscal API — JavaScript / TypeScript SDK

Issue and fiscalize **legal fiscal receipts in Serbia (eKasa / SUF)** from Node.js, with
one `npm install` and an API key. No L-PFR hardware, no signing code on your side: you
send a plain order, and Tezga, a cloud ESIR, fiscalizes it through the Serbian Tax
Administration's virtual processor (V-PFR) and returns the **PFR number, QR payload, verification URL and a
public PDF link**.

Written against the official contract:
[tezgafiskal.com/api/openapi.json](https://tezgafiskal.com/api/openapi.json) (v1.6.0).
Full documentation: [Fiscalization API](https://tezgafiskal.com/en/fiscalization-api).

## Installation

```bash
npm install tezga-sdk
```

Requires Node.js 20 or newer.

## Quickstart

```ts
import { TezgaClient } from "tezga-sdk";

const tezga = new TezgaClient({ apiKey: process.env.TEZGA_API_KEY! });

// A production key issues a REAL receipt. Check first.
console.log(await tezga.getEnvironment()); // "production" | "sandbox" | "simulation"

const doc = await tezga.issueReceipt({
  externalId: "ORDER-1042",          // idempotency key: never issues twice
  nacinPlacanja: "Kartica",
  tok: "fiskalni",
  stavke: [
    { naziv: "Espresso", kolicina: 2, cenaSaPdv: 180, poreskaStopa: "20" },
    { naziv: "Croissant", kolicina: 1, cenaSaPdv: 220, poreskaStopa: "10" },
  ],
  kupac: { naziv: "ACME d.o.o.", pib: "123456789" }, // pib -> B2B receipt
  posaljiMejl: true,
});

console.log(doc.fiskalni?.pfrBroj, doc.javniPdfUrl);
```

### Why the field names are Serbian

Method names, types and docs are English, but **request fields use exactly the names the
API documents** (`stavke`, `kupac`, `nacinPlacanja`, …). No renaming layer sits between
you and the contract, so the SDK can never silently drift from
[the official spec](https://tezgafiskal.com/api/openapi.json) or the published docs. Every
field is documented in English in the TypeScript types.

## Methods

| Method | Endpoint | What it does |
| --- | --- | --- |
| `issueReceipt(body)` | `POST /order` | Issue and fiscalize a receipt or proforma. Idempotent on `externalId`. |
| `refund(body)` | `POST /refund` | Void (`vrsta: "storno"`) or refund (`vrsta: "refundacija"`), full or per item. |
| `copyReceipt(body, key?)` | `POST /copy` | Issue a copy (КОПИЈА); optional `Idempotency-Key`. |
| `openAdvance(body)` | `POST /advance` | Open an advance for the amount actually received. |
| `closeAdvance(body)` | `POST /advance` | Refund the advance, then issue the final receipt. |
| `createCosting(body)` | `POST /kalkulacija` | Goods receipt / costing. |
| `createPriceChange(body)` | `POST /nivelacija` | Price change. |
| `upsertProducts(items)` | `POST /products` | Create or update catalogue items (1–500). |
| `upsertCustomers(items)` | `POST /customers` | Create or update customers (1–500). |
| `getDocumentByExternalId(id)` | `GET /documents` | Read a document by **your** order number. |
| `getDocument(id)` | `GET /documents/{id}` | Read a document by Tezga document ID. |
| `getTaxLabels()` | `GET /tax-labels` | Tax rates, labels and `okruzenje`. |
| `getTransactions(query)` | `GET /transactions` | Bank transactions (`smer`, `since`, `limit`). |
| `getEnvironment()` | — | `getTaxLabels()` mapped to an English enum. |

## Authentication and environments

The key goes in the `X-Tezga-Api-Key` header (shape `tzg_` + 48 hex); the SDK sets it from
the `apiKey` you pass. **The environment is a property of the account, not the URL**:
test and production keys look identical, so read `okruzenje` from `getTaxLabels()` (or
call `getEnvironment()`) before issuing anything. A sandbox or simulation key never
creates a real receipt.

Use one key per project and never commit it to a public repository.

Set `provider` once to tag your integration; it is sent on `/order`, `/documents` and
friends:

```ts
const tezga = new TezgaClient({ apiKey, provider: "my-shop" });
```

Requests time out after **30 seconds** by default; set `timeoutMs` to change it. A network
failure or timeout throws `TezgaError` with `status: 0`. It is deliberately not marked
`retryable`: re-sending a POST is safe only when the call is idempotent (an `externalId`,
or an `Idempotency-Key` on `copyReceipt`).

## Async results

`POST /order` can answer **202**: the document was accepted and is still being processed.
Read `statusDokumenta`, or poll `getDocumentByExternalId(externalId)` until `fiskalni` is
filled in. `fiskalni` is `null` while a document is not fiscalized.

## Webhooks

Tezga POSTs to the URL from Settings → Integrations with `X-Tezga-Event`,
`X-Tezga-Delivery` and `X-Tezga-Signature` (sha256 HMAC of the body). Verify against the
**raw** body, never a re-serialized object:

```ts
import express from "express";
import { parseWebhook } from "tezga-sdk";

app.post("/tezga/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const payload = parseWebhook(
    req.body,                                   // raw Buffer
    req.header("X-Tezga-Signature"),
    process.env.TEZGA_WEBHOOK_SECRET!,
  );
  // payload.dogadjaj: "racun.fiskalizovan" | "racun.greska"
  //                 | "refundacija.izvrsena" | "storno.izvrsen"
  // payload.podaci:  the document, plus your externalId and provider when known
  res.sendStatus(200);
});
```

`parseWebhook` throws unless the signature matches, so an unverified payload never
reaches your handler. Use `verifyWebhookSignature()` if you want the boolean instead.

A failed delivery is retried after **1, 5, 15, 60 and 360 minutes**, so make the handler
idempotent: key it on `X-Tezga-Delivery` or on `podaci.externalId`.

## Error handling

```ts
import { TezgaError } from "tezga-sdk";

try {
  await tezga.issueReceipt({ externalId: "X", stavke: [] });
} catch (err) {
  if (err instanceof TezgaError) {
    console.error(err.status, err.message); // message is the API's `error`
    for (const f of err.fields) console.error(f.path, f.message);
    if (err.retryable) { /* 429 rate limit, or 409 still in flight */ }
  }
}
```

Statuses worth handling: **402** billing, **409** conflict, **413** too large, **422** the
Tax Administration rejected it, **429** rate limit.

## FAQ

**Do I need fiscal hardware (L-PFR)?** No. Tezga is a cloud ESIR that works with the Tax
Administration's virtual processor (V-PFR); you only call the REST API.

**How do I test without issuing real receipts?** Use a sandbox or simulation key and check
`getEnvironment()` first.

**How are retries kept safe?** Every receipt carries an `externalId`; re-sending the same
value returns the original receipt instead of issuing a second one.

**Can I issue B2B receipts?** Yes. Set `kupac.pib` and the receipt becomes B2B.

**Where do I get an API key?** In your Tezga account under Settings → Integrations.

## About

Tezga is a product of **GoSimple**.
Learn more at [gosimple.space](https://gosimple.space) and
[tezgafiskal.com](https://tezgafiskal.com).

Native apps: [iOS](https://apps.apple.com/rs/app/tezga-ekasa/id6815615096) ·
[Android](https://play.google.com/store/apps/details?id=rs.gosimple.tezga)

See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
