import { extractBudgetRange } from "./priceIntent.js";
import { extractRequestedCatalogTerm } from "./productSearch.js";
import { extractTrackingNumber } from "./tracking.js";
import { extractOrderId } from "./transactionStatus.js";
import { mentionsRobotJadulStore } from "./utils.js";
import { normalizeIndonesianCommerceText } from "./textNormalization.js";
import {
  extractIndonesianMorphologyHints,
  stemIndonesianWord,
} from "./indonesianMorphology.js";

const ADPOSITIONS = new Set([
  "di",
  "ke",
  "dari",
  "untuk",
  "buat",
  "dengan",
  "pada",
  "sampai",
]);
const PRONOUNS = new Set([
  "aku",
  "saya",
  "kami",
  "kita",
  "kamu",
  "anda",
  "gue",
  "lu",
  "dia",
  "mereka",
]);
const DETERMINERS = new Set([
  "ini",
  "itu",
  "tersebut",
  "semua",
  "setiap",
]);
const CONJUNCTIONS = new Set(["dan", "atau", "tapi", "tetapi"]);
const ADVERBS = new Set([
  "juga",
  "masih",
  "sudah",
  "lagi",
  "sekarang",
  "cuma",
  "hanya",
  "paling",
]);
const NEGATIONS = new Set([
  "tidak",
  "tak",
  "bukan",
  "belum",
  "ga",
  "gak",
  "ngga",
  "nggak",
  "engga",
]);
const QUESTION_WORDS = new Set([
  "apa",
  "siapa",
  "mana",
  "berapa",
  "kapan",
  "kenapa",
  "mengapa",
  "bagaimana",
  "gimana",
]);
const PARTICLES = new Set(["kah", "sih", "dong", "deh", "lah", "ya"]);
const GREETINGS = new Set([
  "hai",
  "halo",
  "hallo",
  "hello",
  "hi",
  "permisi",
]);
const VERB_PATTERN =
  /^(?:jual|jualan|dijual|menjual|menyediakan|sedia|tersedia|punya|ada|cari|carikan|nyari|beli|membeli|pilih|pilihkan|bandingkan|cek|lacak|kirim|bayar|retur|refund|rekomendasikan)$/;
const ADJECTIVE_PATTERN =
  /^(?:ready|murah|mahal|bagus|terbaik|rusak|cacat|lengkap|original|baru|bekas|premium|populer)$/;
const VERB_STEMS = new Set([
  "ada",
  "banding",
  "bayar",
  "beli",
  "cari",
  "cek",
  "jual",
  "kembali",
  "kirim",
  "lacak",
  "pilih",
  "pesan",
  "rekomendasi",
  "retur",
  "sedia",
  "tawar",
  "tersedia",
]);
const PRODUCT_CONTEXT_PATTERN =
  /\b(?:jual+|jualan|dijual|menjual|menyediakan|tersedia|sedia|punya|ada|cari(?:kan)?|nyari|produk|robot|barang|item|figure|figur|mainan|chogokin|gundam|mazinger|grendizer|voltes|voltron|getter|harga|stok|stock|ready|detail|bandingkan|compare|\bvs\b)\b/i;
const SHIPPING_CONTEXT_PATTERN =
  /\b(?:ongkir|ongkos\s+kirim|biaya\s+kirim|pengiriman|kirim\s+ke|tujuan)\b/i;
const ORDER_CONTEXT_PATTERN =
  /\b(?:order|pesanan|transaksi|pembayaran)\b/i;
const CATEGORY_LEXICON = [
  ["chogokin", /\bchogokin\b/i],
  ["action figure", /\baction\s+figure\b/i],
  ["model kit", /\bmodel\s+kit\b/i],
  ["vintage", /\bvintage\b/i],
  ["vinyl", /\bvinyl\b/i],
  ["transformers", /\btransformers?\b/i],
];
const BRAND_LEXICON = [
  ["Bandai", /\bbandai\b/i],
  ["Popy", /\bpopy\b/i],
  ["Takara", /\btakara\b/i],
  ["Medicom", /\bmedicom\b/i],
  ["Action Toys", /\baction\s+toys\b/i],
];
const CONDITION_LEXICON = [
  ["JUNK", /\bjunk\b/i],
  ["MISB", /\bmisb\b|mint\s+in\s+sealed\s+box/i],
  ["MIB", /\bmib\b|mint\s+in\s+box/i],
  ["BIB", /\bbib\b|back\s+in\s+box/i],
  ["loose", /\bloose\b|tanpa\s+box/i],
  ["sealed", /\bsealed\b|segel/i],
];

function normalizeCasualToken(value = "") {
  const token = String(value || "").toLowerCase();
  if (/^jua+l$/.test(token)) return "jual";
  if (/^eng+a+$/.test(token)) return "engga";
  if (/^ng+a+k?$/.test(token)) return "nggak";
  if (/^ga+k+$/.test(token)) return "gak";
  if (/^apa+$/.test(token)) return "apa";
  return token;
}

function prepareText(value = "") {
  return String(value || "")
    .replace(/\bdi(?=toko(?:nya)?\b)/gi, "di ")
    .replace(/\bdi(?=sini\b)/gi, "di ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value = "") {
  const prepared = prepareText(value);
  const matches = prepared.match(/[A-Za-z0-9]+(?:[-/.][A-Za-z0-9]+)*|[^\sA-Za-z0-9]/g) || [];

  return matches.map((text, index) => ({
    id: index + 1,
    text,
    lemma: normalizeCasualToken(text),
    stem: stemIndonesianWord(normalizeCasualToken(text)),
  }));
}

function inferPos(token) {
  const lemma = token.lemma;
  if (/^[^a-z0-9]+$/i.test(token.text)) return "PUNCT";
  if (/^(?:rp)?\d+(?:[.,]\d+)*$/i.test(token.text)) return "NUM";
  if (ADPOSITIONS.has(lemma)) return "ADP";
  if (PRONOUNS.has(lemma)) return "PRON";
  if (DETERMINERS.has(lemma)) return "DET";
  if (CONJUNCTIONS.has(lemma)) return "CCONJ";
  if (GREETINGS.has(lemma)) return "PART";
  if (NEGATIONS.has(lemma) || PARTICLES.has(lemma)) return "PART";
  if (QUESTION_WORDS.has(lemma)) return lemma === "apa" ? "PRON" : "ADV";
  if (ADVERBS.has(lemma)) return "ADV";
  if (
    VERB_PATTERN.test(lemma) ||
    VERB_STEMS.has(token.stem) ||
    /^(?:me|di|ter|ber)[a-z]{4,}$/.test(lemma)
  ) {
    return "VERB";
  }
  if (ADJECTIVE_PATTERN.test(lemma)) return "ADJ";
  if (/^[A-Z]{2,}[0-9-]*$/.test(token.text) || /\d/.test(token.text)) {
    return "PROPN";
  }
  return "NOUN";
}

function nearestNoun(tokens, index, direction = -1) {
  for (
    let cursor = index + direction;
    cursor >= 0 && cursor < tokens.length;
    cursor += direction
  ) {
    if (["NOUN", "PROPN"].includes(tokens[cursor].pos)) return tokens[cursor];
    if (tokens[cursor].pos === "VERB") break;
  }
  return null;
}

function assignDependencies(sourceTokens) {
  const tokens = sourceTokens.map((token) => ({
    ...token,
    pos: inferPos(token),
    head: 0,
    dep: "dep",
  }));
  const preferredRoot = tokens.find(
    (token) =>
      token.pos === "VERB" &&
      (VERB_PATTERN.test(token.lemma) || VERB_STEMS.has(token.stem)),
  );
  const root = preferredRoot || tokens.find((token) => token.pos === "VERB");
  if (!root) return { tokens, root: null };

  root.dep = "root";
  let objectHead = null;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.id === root.id) continue;
    token.head = root.id;

    if (token.pos === "PUNCT") {
      token.dep = "punct";
    } else if (token.pos === "ADP") {
      const noun = nearestNoun(tokens, index, 1);
      token.head = noun?.id || root.id;
      token.dep = "case";
    } else if (token.pos === "DET") {
      const noun = nearestNoun(tokens, index, -1) || nearestNoun(tokens, index, 1);
      token.head = noun?.id || root.id;
      token.dep = "det";
    } else if (token.pos === "CCONJ") {
      token.dep = "cc";
    } else if (token.pos === "PART") {
      token.dep = NEGATIONS.has(token.lemma) ? "neg" : "discourse";
    } else if (token.pos === "ADV") {
      token.dep = "advmod";
    } else if (token.pos === "NUM") {
      const noun = nearestNoun(tokens, index, -1) || nearestNoun(tokens, index, 1);
      token.head = noun?.id || root.id;
      token.dep = noun ? "nummod" : "obl";
    } else if (["NOUN", "PROPN", "PRON"].includes(token.pos)) {
      const previous = tokens[index - 1];
      if (previous?.pos === "ADP") {
        token.dep = "obl";
      } else if (token.id < root.id) {
        token.dep = "nsubj";
      } else if (!objectHead) {
        token.dep = "obj";
        objectHead = token;
      } else {
        token.head = objectHead.id;
        token.dep = token.pos === "PROPN" ? "flat" : "compound";
      }
    } else if (token.pos === "ADJ") {
      token.dep = objectHead ? "amod" : "xcomp";
      token.head = objectHead?.id || root.id;
    }
  }

  return { tokens, root };
}

function extractLocation(question = "") {
  if (!SHIPPING_CONTEXT_PATTERN.test(question)) return "";
  const match = String(question).match(
    /\b(?:ke|tujuan(?:nya)?|kota|kabupaten|kecamatan)\s+([a-z][a-z\s,-]{1,80})/i,
  );
  return String(match?.[1] || "")
    .replace(/[?!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectLexiconMatches(question, lexicon) {
  return lexicon
    .filter(([, pattern]) => pattern.test(question))
    .map(([label]) => label);
}

function cleanComparedProduct(value = "") {
  return extractRequestedCatalogTerm(
    String(value || "").replace(
      /\b(?:tolong|coba|bandingkan|compare|versus|vs|beda(?:nya)?)\b/gi,
      " ",
    ),
  );
}

function extractProductTerms(question = "") {
  if (!PRODUCT_CONTEXT_PATTERN.test(question)) return [];

  const compareMatch =
    String(question).match(
      /\b(?:bandingkan|compare)\s+(.+?)\s+(?:dengan|versus|vs)\s+(.+?)(?:[?!.]|$)/i,
    ) ||
    String(question).match(/(.+?)\s+(?:versus|vs)\s+(.+?)(?:[?!.]|$)/i) ||
    String(question).match(/(.+?)\s+sama\s+(.+?)\s+beda(?:nya)?\b/i);

  if (compareMatch) {
    return [...new Set(compareMatch.slice(1, 3).map(cleanComparedProduct).filter(Boolean))];
  }

  const product = extractRequestedCatalogTerm(question);
  return product ? [product] : [];
}

function buildEntities(question, productTerms, originalQuestion = question) {
  const budget = extractBudgetRange(question);
  const trackingNumber = extractTrackingNumber(question) || "";
  const orderId = ORDER_CONTEXT_PATTERN.test(question)
    ? extractOrderId(question) || ""
    : "";
  const storeMention =
    mentionsRobotJadulStore(question) || /\b(?:di\s*)?toko(?:nya)?\b/i.test(question);
  const categories = collectLexiconMatches(question, CATEGORY_LEXICON);
  const brands = collectLexiconMatches(question, BRAND_LEXICON);
  const conditions = collectLexiconMatches(question, CONDITION_LEXICON);
  const stockState = /\b(?:ready|tersedia|in\s*stock)\b/i.test(question)
    ? "ready"
    : /\b(?:pre\s*order|preorder|po)\b/i.test(question)
      ? "preorder"
      : /\brestock\b/i.test(question)
        ? "restock"
        : "";

  return {
    store_name: storeMention ? "Robot Jadul" : "",
    product_terms: productTerms,
    categories,
    brands,
    conditions,
    stock_state: stockState,
    budget_min: budget.detected ? budget.min : null,
    budget_max: budget.detected ? budget.max : null,
    location: extractLocation(originalQuestion),
    order_id: orderId,
    tracking_number: trackingNumber,
  };
}

function inferQuestionType(question, tokens, root) {
  const lemmas = new Set(tokens.map((token) => token.lemma));
  if ([...QUESTION_WORDS].some((word) => lemmas.has(word))) return "wh";
  if ([...NEGATIONS].some((word) => lemmas.has(word)) || /\?$/.test(question.trim())) {
    return "yes_no";
  }
  if (/\b(?:tolong|coba|mohon)\b/i.test(question) || root?.lemma === "carikan") {
    return "command";
  }
  return "statement";
}

export function analyzeIndonesianQuestion(question = "") {
  const originalQuestion = String(question || "").trim();
  const cleanQuestion = normalizeIndonesianCommerceText(originalQuestion);
  const parsed = assignDependencies(tokenize(cleanQuestion));
  const predicate = parsed.root?.stem || parsed.root?.lemma || "";
  const productTerms = extractProductTerms(cleanQuestion);
  const object = productTerms.join(" vs ");
  const storeContext =
    mentionsRobotJadulStore(cleanQuestion) ||
    /\b(?:di\s*)?toko(?:nya)?\b/i.test(cleanQuestion);
  const explicitSubject = parsed.tokens.find((token) => token.dep === "nsubj");
  const subject = storeContext
    ? "Robot Jadul"
    : explicitSubject?.text || "";
  const entities = buildEntities(cleanQuestion, productTerms, originalQuestion);
  const negated = parsed.tokens.some((token) => token.dep === "neg");
  const questionType = inferQuestionType(cleanQuestion, parsed.tokens, parsed.root);
  const morphologyStems = extractIndonesianMorphologyHints(cleanQuestion);

  const confidence = predicate && object ? 0.92 : predicate || object ? 0.75 : 0.45;

  return {
    text: originalQuestion,
    normalized_text: cleanQuestion,
    tokens: parsed.tokens,
    syntax: {
      subject,
      subject_source: explicitSubject ? "explicit" : subject ? "store_context" : "",
      predicate,
      object,
      negated,
      question_type: questionType,
      root_token_id: parsed.root?.id || null,
      confidence,
    },
    entities,
    morphology: {
      stems: morphologyStems,
    },
  };
}

export function compactLinguisticAnalysis(analysis = {}) {
  const syntax = analysis.syntax || {};
  const entities = analysis.entities || {};
  const morphologyStems = Array.isArray(analysis.morphology?.stems)
    ? analysis.morphology.stems.slice(0, 8)
    : [];
  const compactEntities = {};

  for (const [key, value] of Object.entries(entities)) {
    const hasValue = Array.isArray(value)
      ? value.length > 0
      : value !== "" && value !== null && value !== undefined;
    if (hasValue) compactEntities[key] = value;
  }

  return {
    ...(syntax.subject ? { subject: syntax.subject } : {}),
    ...(syntax.predicate ? { predicate: syntax.predicate } : {}),
    ...(syntax.object ? { object: syntax.object } : {}),
    negated: Boolean(syntax.negated),
    question_type: syntax.question_type || "statement",
    ...(morphologyStems.length ? { morphology_stems: morphologyStems } : {}),
    ...(Object.keys(compactEntities).length
      ? { entities: compactEntities }
      : {}),
  };
}
