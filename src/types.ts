// Types mirror the official Tezga contract: https://tezgafiskal.com/api/openapi.json (v1.6.0).
// Field names are exactly the ones the API accepts, so the SDK can never drift from the
// published documentation. Everything a developer reads (methods, docs) is English.

/** "Kartica" | "Gotovina" | "Instant" | "Prenos na račun" | "Ček" | "Vaučer" */
export type NacinPlacanja = string;

/** Document flow: "fiskalni" | "fiskalni_i_sef" | "sef" | "avans" | "predracun". */
export type Tok = string;

/** Tax rate label, e.g. "20", "10", "0", "pdv20", "oslobodjeno". Empty = 20%. */
export type PoreskaStopa = string | number;

/** A receipt line item. */
export interface Stavka {
  naziv: string;
  kolicina: number;
  /** Unit price INCLUDING VAT, in RSD. */
  cenaSaPdv: number;
  /** Product code from the Tezga catalogue. */
  sifra?: string;
  jedinicaMere?: string;
  poreskaStopa?: PoreskaStopa;
  popustProcenat?: number;
  popustRsd?: number;
}

/** Buyer. Supplying `pib` turns the receipt into a B2B document. */
export interface Kupac {
  naziv?: string;
  /** Serbian tax ID (PIB). */
  pib?: string;
  email?: string;
  adresa?: string;
  mesto?: string;
  postanskiBroj?: string;
  maticniBroj?: string;
}

/** POST /order — issue a receipt (or proforma). */
export interface OrderBody {
  /** Your unique order number. Idempotency key: the same value never issues twice. */
  externalId: string;
  stavke: Stavka[];
  tipDokumenta?: string;
  tok?: Tok;
  datumUplate?: string;
  /** Also file an e-invoice to SEF. */
  posaljiNaSef?: boolean;
  fiskalizujPredracun?: boolean;
  /** Email the receipt to kupac.email. */
  posaljiMejl?: boolean;
  /** Payment reference model (IPS). */
  model?: string;
  /** Payment reference number (IPS). */
  pozivNaBroj?: string;
  nacinPlacanja?: NacinPlacanja;
  popustProcenat?: number;
  popustRsd?: number;
  /** Trust the price in this request instead of the catalogue price. */
  cenaIzZahteva?: boolean;
  kupac?: Kupac;
}

/** POST /refund — void ("storno") or refund ("refundacija"). */
export interface RefundBody {
  vrsta: "storno" | "refundacija";
  /** Reference the original by documentId or externalId. */
  documentId?: string;
  externalId?: string;
  provider?: string;
  razlog?: string;
  /** Buyer identification, required when returning cash. */
  kupacIdTip?: string;
  kupacIdBroj?: string;
  /** Provide for a partial refund. */
  stavke?: Stavka[];
}

/** POST /advance — open an advance (avans) receipt. */
export interface AdvanceOpenBody {
  /** Your unique number, max 200 chars; prevents a duplicate advance. */
  externalId: string;
  /** The amount ACTUALLY received; the fiscal receipt is issued on this. */
  placeniAvans: number;
  /** Date the payment landed, YYYY-MM-DD. Required by law. */
  datumUplate: string;
  /** Total value of the job; defaults to placeniAvans. */
  ugovoreniIznos?: number;
  kupac?: Kupac;
  poreskaStopa?: PoreskaStopa;
  nacinPlacanja?: NacinPlacanja;
  posaljiMejl?: boolean;
  napomena?: string;
}

/** POST /advance — close an advance: refunds it, then issues the final receipt. */
export interface AdvanceCloseBody {
  zatvori: true;
  externalId?: string;
  avansId?: string;
  punIznos?: number;
  stavke?: Stavka[];
  nacinPlacanja?: NacinPlacanja;
  provider?: string;
}

/** POST /kalkulacija — goods receipt / costing line. */
export interface KalkulacijaStavka {
  sifra?: string;
  kolicina?: number;
  nabavnaCena?: number;
  zavisniTrosak?: number;
  marzaProcenat?: number;
  prodajnaCenaBezPdv?: number;
  prodajnaCenaSaPdv?: number;
}

export interface KalkulacijaBody {
  externalId: string;
  stavke: KalkulacijaStavka[];
  datum?: string;
  dobavljac?: Record<string, unknown>;
  dokumentBroj?: string;
  dokumentDatum?: string;
  napomena?: string;
}

/** POST /nivelacija — price change line. */
export interface NivelacijaStavka {
  sifra?: string;
  cenaNovaSaPdv?: number;
}

export interface NivelacijaBody {
  externalId: string;
  stavke: NivelacijaStavka[];
  datum?: string;
  povod?: string;
  razlog?: string;
}

/** POST /copy — issue a copy ("КОПИЈА") of a receipt. */
export interface CopyBody {
  documentId?: string;
  externalId?: string;
  provider?: string;
}

/** POST /products — catalogue item (1 to 500 per call). */
export interface Proizvod {
  sifra?: string;
  naziv?: string;
  cenaSaPdv?: number;
  poreskaStopa?: PoreskaStopa;
  jedinicaMere?: string;
  gtin?: string;
  aktivan?: boolean;
}

/** POST /customers — customer record (1 to 500 per call). */
export interface KupacZapis {
  naziv?: string;
  pib?: string;
  maticniBroj?: string;
  jbkjs?: string;
  email?: string;
  telefon?: string;
  adresa?: string;
  mesto?: string;
  postanskiBroj?: string;
}

/** GET /transactions filters. */
export interface TransactionsQuery {
  smer?: string;
  since?: string;
  limit?: number;
}

/** Mandatory fiscal elements. `null` means the document was not fiscalized. */
export interface Fiskalni {
  pfrBroj: string;
  pfrVreme: string;
  brojacRacuna: string;
  esirBroj: string;
  verifikacioniUrl: string;
  qrPayload: string;
  referentniBroj?: string | null;
  referentnoVreme?: string | null;
}

/** The document the API returns. */
export interface Dokument {
  documentId: string;
  broj?: string;
  tip?: string;
  statusDokumenta?: "nacrt" | "izdat" | "storniran";
  ukupnoSa?: number;
  nacinPlacanja?: string;
  referentniDokumentId?: string | null;
  fiskalni: Fiskalni | null;
  javniUrl?: string;
  javniPdfUrl?: string;
  pdfUrl?: string;
  verifikacioniUrl?: string;
  [key: string]: unknown;
}

/** Error body: { error, fields[] }. */
export interface GreskaPolje {
  path?: string;
  message?: string;
}

export type Environment = "production" | "sandbox" | "simulation" | "unknown";

/** Responses that are not a single Dokument are returned as the API sends them. */
export type TezgaResponse = Record<string, unknown>;
