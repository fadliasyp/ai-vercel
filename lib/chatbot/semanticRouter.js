export const SEMANTIC_ROUTER_INTENTS = Object.freeze([
  "greeting",
  "product_discovery",
  "recommendation",
  "product_detail",
  "price_promo",
  "stock_availability",
  "shipping_transaction",
  "shipping_origin",
  "return_product",
  "compare",
  "transaction_status",
  "shipment_tracking",
  "general",
]);

export const SEMANTIC_ROUTER_GOALS = Object.freeze([
  "product_search",
  "recommendation",
  "material",
  "dimensions",
  "product_condition",
  "completeness",
  "price",
  "promo",
  "bulk_discount",
  "stock",
  "shipping_quote",
  "free_shipping",
  "insurance",
  "packing",
  "shipping_estimate",
  "same_day",
  "shipping_origin",
  "shipping_coverage",
  "store_location",
  "store_hours",
  "cod",
  "payment_methods",
  "return_policy",
  "refund",
  "how_to_buy",
  "transaction_status",
  "shipment_tracking",
  "order_processing",
  "admin_help",
]);

const INTENT_SET = new Set(SEMANTIC_ROUTER_INTENTS);
const GOAL_SET = new Set(SEMANTIC_ROUTER_GOALS);
const SCOPE_SET = new Set(["in_scope", "out_of_scope"]);
const CUSTOMER_STATE_SET = new Set([
  "neutral",
  "confused",
  "frustrated",
  "urgent",
  "hesitant",
  "excited",
]);
const TOPIC_RELATION_SET = new Set([
  "new_topic",
  "follow_up",
  "topic_switch",
  "clarification_answer",
]);

const ENTITY_FIELDS = Object.freeze([
  "product_names",
  "budget_min",
  "budget_max",
  "quantity",
  "cart_total",
  "currency",
  "location",
  "district",
  "order_id",
  "tracking_number",
]);

function cleanString(value, maxLength = 200) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function cleanProductNames(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => cleanString(item))
        .filter(Boolean)
        .slice(0, 4),
    ),
  ];
}

function cleanStringList(value, { allowed = null, maxItems = 8 } = {}) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => cleanString(item, 80))
        .filter((item) => item && (!allowed || allowed.has(item)))
        .slice(0, maxItems),
    ),
  ];
}

function extractJsonText(value = "") {
  const text = String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("Semantic router tidak mengembalikan JSON object");
  }

  return text.slice(firstBrace, lastBrace + 1);
}

export function parseSemanticRouterOutput(rawValue) {
  let parsed = rawValue;
  if (typeof rawValue === "string") {
    try {
      parsed = JSON.parse(extractJsonText(rawValue));
    } catch (error) {
      throw new Error(`JSON semantic router tidak valid: ${error.message}`);
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Output semantic router harus berupa object");
  }

  const scope = cleanString(parsed.scope, 30);
  const intent = cleanString(parsed.intent, 60);
  const confidence = Number(parsed.confidence);

  if (!SCOPE_SET.has(scope)) {
    throw new Error(`Scope semantic router tidak didukung: ${scope || "-"}`);
  }
  if (!INTENT_SET.has(intent)) {
    throw new Error(`Intent semantic router tidak didukung: ${intent || "-"}`);
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Confidence semantic router harus berada di antara 0 dan 1");
  }
  if (scope === "out_of_scope" && intent !== "general") {
    throw new Error("Pertanyaan out_of_scope wajib memakai intent general");
  }

  const sourceEntities =
    parsed.entities && typeof parsed.entities === "object"
      ? parsed.entities
      : {};
  const entities = {
    product_names: cleanProductNames(sourceEntities.product_names),
    budget_min: cleanNullableNumber(sourceEntities.budget_min),
    budget_max: cleanNullableNumber(sourceEntities.budget_max),
    quantity: cleanNullableNumber(sourceEntities.quantity),
    cart_total: cleanNullableNumber(sourceEntities.cart_total),
    currency: cleanString(sourceEntities.currency, 12),
    location: cleanString(sourceEntities.location),
    district: cleanString(sourceEntities.district),
    order_id: cleanString(sourceEntities.order_id, 100),
    tracking_number: cleanString(sourceEntities.tracking_number, 100),
  };
  const sourceIntents = Array.isArray(parsed.intents) ? parsed.intents : [];
  const intents = [
    intent,
    ...cleanStringList(sourceIntents, {
      allowed: INTENT_SET,
      maxItems: 5,
    }),
  ].filter((value, index, values) => values.indexOf(value) === index);
  const sourceGoals = Array.isArray(parsed.goals) ? parsed.goals : [];
  const goals = cleanStringList(sourceGoals, {
    allowed: GOAL_SET,
    maxItems: 12,
  });
  const customerState = cleanString(parsed.customer_state, 20);
  const topicRelation = cleanString(parsed.topic_relation, 30);
  const requiresProduct =
    typeof parsed.requires_product === "boolean"
      ? parsed.requires_product
      : entities.product_names.length > 0 ||
        ["product_detail", "stock_availability", "compare"].includes(intent);

  const unknownEntityFields = Object.keys(sourceEntities).filter(
    (field) => !ENTITY_FIELDS.includes(field),
  );
  const unknownIntents = sourceIntents.filter(
    (value) => !INTENT_SET.has(cleanString(value, 60)),
  );
  const unknownGoals = sourceGoals.filter(
    (value) => !GOAL_SET.has(cleanString(value, 80)),
  );

  return {
    scope,
    intent,
    intents,
    goals,
    confidence,
    entities,
    requires_product: requiresProduct,
    customer_state: CUSTOMER_STATE_SET.has(customerState)
      ? customerState
      : "neutral",
    interpretation: cleanString(parsed.interpretation, 400),
    topic_relation: TOPIC_RELATION_SET.has(topicRelation)
      ? topicRelation
      : "new_topic",
    address_term: cleanString(parsed.address_term, 40),
    ambiguity_reason: cleanString(parsed.ambiguity_reason, 240),
    missing_fields: cleanStringList(parsed.missing_fields, { maxItems: 8 }),
    needs_clarification: Boolean(parsed.needs_clarification),
    clarification_question: cleanString(parsed.clarification_question, 300),
    diagnostics: {
      unknown_entity_fields: unknownEntityFields,
      unknown_intents: unknownIntents,
      unknown_goals: unknownGoals,
    },
  };
}

function compactContext(context = {}) {
  const linguistic = context.linguistic || {};
  const understanding = context.understanding || {};
  const linguisticEntities = linguistic.entities || {};
  const morphologyStems = Array.isArray(linguistic.morphology_stems)
    ? linguistic.morphology_stems
        .map((value) => cleanString(value, 40))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const languageAnalysis = {
    ...(cleanString(linguistic.subject, 100)
      ? { subject: cleanString(linguistic.subject, 100) }
      : {}),
    ...(cleanString(linguistic.predicate, 80)
      ? { predicate: cleanString(linguistic.predicate, 80) }
      : {}),
    ...(cleanString(linguistic.object, 160)
      ? { object: cleanString(linguistic.object, 160) }
      : {}),
    negated: Boolean(linguistic.negated),
    ...(cleanString(linguistic.question_type, 30)
      ? { question_type: cleanString(linguistic.question_type, 30) }
      : {}),
    ...(cleanProductNames(linguisticEntities.product_terms).length
      ? {
          product_terms: cleanProductNames(
            linguisticEntities.product_terms,
          ),
        }
      : {}),
    ...(morphologyStems.length
      ? { morphology_stems: morphologyStems }
      : {}),
  };
  const requiredFacts = Array.isArray(understanding.required_facts)
    ? understanding.required_facts
        .map((value) => cleanString(value, 60))
        .filter(Boolean)
        .slice(0, 4)
    : [];
  const questionUnderstanding = {
    subject_type: cleanString(understanding.subject_type, 40) || "unknown",
    domain_question_type:
      cleanString(understanding.domain_question_type, 60) || "unknown",
    reference_scope:
      cleanString(understanding.reference_scope, 40) || "unspecified",
    required_facts: requiredFacts,
    confidence: Math.max(
      0,
      Math.min(1, Number(understanding.confidence || 0)),
    ),
    needs_clarification: Boolean(understanding.needs_clarification),
    ...(cleanString(understanding.clarification_kind, 60)
      ? {
          clarification_kind: cleanString(
            understanding.clarification_kind,
            60,
          ),
        }
      : {}),
  };
  const contextualTurn = context.contextualTurn || {};
  const conversationTurn = contextualTurn.intent
    ? {
        intent: cleanString(contextualTurn.intent, 60),
        is_follow_up: Boolean(contextualTurn.is_follow_up),
        expected_answer_type: cleanString(
          contextualTurn.expected_answer_type,
          60,
        ),
        confidence: Math.max(
          0,
          Math.min(1, Number(contextualTurn.confidence || 0)),
        ),
      }
    : null;
  const activeGoal = context.activeGoal || {};
  const compactActiveGoal = activeGoal.intent
    ? {
        intent: cleanString(activeGoal.intent, 60),
        category: cleanString(activeGoal.category, 100),
        focused_product: cleanString(activeGoal.focusedProductName, 200),
        products: cleanProductNames(activeGoal.productNames),
        budget_min: cleanNullableNumber(activeGoal.constraints?.budgetMin),
        budget_max: cleanNullableNumber(activeGoal.constraints?.budgetMax),
      }
    : null;
  const compound = context.compound || {};
  const compoundConstraints = compound.constraints || {};
  const compactCompound = context.compound
    ? {
        compound: Boolean(compound.compound),
        facets: Array.isArray(compound.facets)
          ? compound.facets
              .map((value) => cleanString(value, 40))
              .filter(Boolean)
              .slice(0, 8)
          : [],
        primary_intent: cleanString(compound.primary_intent, 60),
        confidence: Math.max(
          0,
          Math.min(1, Number(compound.confidence || 0)),
        ),
        needs_clarification: Boolean(compound.needs_clarification),
        constraints: {
          budget_min: cleanNullableNumber(compoundConstraints.budget_min),
          budget_max: cleanNullableNumber(compoundConstraints.budget_max),
          stock: cleanString(compoundConstraints.stock, 30),
          condition: cleanString(compoundConstraints.condition, 30),
          purposes: Array.isArray(compoundConstraints.purposes)
            ? compoundConstraints.purposes
                .map((value) => cleanString(value, 30))
                .filter(Boolean)
                .slice(0, 4)
            : [],
          promo_only: Boolean(compoundConstraints.promo_only),
        },
      }
    : null;

  return {
    last_intent: cleanString(context.lastIntent, 60),
    last_topic: cleanString(context.lastTopic, 160),
    has_pending_flow: Boolean(context.hasPending),
    recent_products: cleanProductNames(context.recentProducts),
    ...(Object.keys(languageAnalysis).length > 1 ||
    languageAnalysis.question_type
      ? { language_analysis: languageAnalysis }
      : {}),
    ...(context.understanding
      ? { question_understanding: questionUnderstanding }
      : {}),
    ...(conversationTurn ? { conversation_turn: conversationTurn } : {}),
    ...(compactActiveGoal ? { active_goal: compactActiveGoal } : {}),
    ...(compactCompound ? { compound_request: compactCompound } : {}),
  };
}

export function buildSemanticRouterMessages({
  question,
  context = {},
} = {}) {
  const cleanQuestion = cleanString(question, 1000);
  if (!cleanQuestion) {
    throw new Error("Question untuk semantic router tidak boleh kosong");
  }

  const system = `
Kamu adalah mesin pemahaman universal untuk chatbot ecommerce Robot Jadul.
Tugasmu memahami seluruh kebutuhan pelanggan, bukan menjawab pertanyaan user.

Pilih satu intent utama dan catat semua intent terkait dari daftar berikut:
${SEMANTIC_ROUTER_INTENTS.join(", ")}

Catat seluruh goals yang diminta dari daftar berikut:
${SEMANTIC_ROUTER_GOALS.join(", ")}

Aturan penting:
- Pahami bahasa Indonesia baku maupun percakapan, singkatan chat, imbuhan,
  pengulangan huruf, dan typo ringan berdasarkan konteks kalimat.
- out_of_scope wajib memakai intent general.
- Sapaan murni memakai greeting.
- Pertanyaan tentang kemampuan chatbot seperti "chatbot ini bisa apa saja?"
  memakai general/in_scope.
- Cari/list/kategori produk memakai product_discovery. Pertanyaan tentang cakupan
  barang toko seperti "cuma jual robot?", "jual yang lain juga?", atau
  "selain robot ada apa?" juga memakai product_discovery.
- Permintaan saran sesuai kebutuhan/tujuan memakai recommendation, termasuk
  "paling cocok", "bagusnya", "worth it", "value for money", hadiah,
  pajangan, pemula, atau kolektor baru.
- Spesifikasi, kondisi, material, ukuran, atau kelengkapan memakai product_detail.
- Harga, sale, promo, diskon, rentang/kisaran harga, selisih harga, atau batas
  budget memakai price_promo. Jika user hanya memberi budget lalu bertanya
  dapat produk apa, tetap price_promo, bukan recommendation/product_discovery.
- Pertanyaan umum apakah harga bisa ditawar/nego memakai price_promo dan tidak
  memerlukan product_names jika user tidak menyebut nama produk tertentu.
- Pembelian beberapa barang, total belanja, permintaan potongan tambahan, harga
  paket, borongan, atau gratis ongkir adalah kebijakan penawaran. Gunakan
  bulk_discount dan/atau free_shipping. Jangan meminta nama produk hanya karena
  ada kata barang, beli, harga, total, diskon, atau ongkir.
- Bedakan free_shipping dari shipping_quote. "Bisa gratis ongkir?" menanyakan
  kebijakan promo, sedangkan "ongkirnya berapa?" meminta tarif pengiriman.
- Stok, ready, preorder, atau restock memakai stock_availability.
- Pertanyaan apakah barang selalu ready atau ada yang PO adalah kebijakan stok
  umum; gunakan stock_availability tanpa mengarang nama produk.
- Cara membeli, pembayaran, checkout, COD, ongkir, kurir, asuransi paket, dan
  estimasi kirim memakai shipping_transaction.
- Alamat/lokasi fisik, asal kirim, gudang, atau ambil langsung memakai
  shipping_origin. Jam buka, cabang toko, dan kontak admin memakai general.
- Asal produksi, negara pembuat, dibuat sendiri, atau barang impor adalah
  product_detail, bukan shipping_origin. Jangan samakan asal produk dengan
  lokasi paket dikirim.
- Susunan seperti "buka jam berapa", "buka dari jam berapa", atau "tutup jam
  berapa" menanyakan jam operasional toko dan wajib memakai general, bukan
  shipping_transaction maupun shipping_origin.
- Retur, refund, kerusakan, salah kirim, atau komplain memakai return_product.
- Dua produk/kode yang ditanya "beda", "perbedaan", "bandingkan", "vs",
  atau "sama bagus mana" wajib memakai compare.
- Status/progres order atau pembayaran memakai transaction_status selama user
  tidak menanyakan resi, posisi paket, atau perjalanan kurir.
- Posisi paket, nomor resi, dan perjalanan kurir memakai shipment_tracking.
- Waktu, cuaca, politik, matematika, coding, teks acak, dan topik non-ecommerce memakai general/out_of_scope.
- Kata produk, robot, barang, item, mainan, figure, dan figur adalah sebutan
  yang setara untuk barang dagangan Robot Jadul.
- "Robot Jadul" adalah nama toko, bukan nama produk, kategori, seri, atau robot
  yang harus dicari. Jangan masukkan "Robot Jadul" ke product_names.
- Asal-usul, sejarah, pendiri, atau awal mula Robot Jadul membahas toko dan
  memakai general/in_scope, bukan product_detail.
- product_names berisi objek dagangan atau nama seri yang benar-benar ditanyakan,
  meskipun barang tersebut mungkin tidak ada di katalog. Abaikan subjek, predikat,
  keterangan tempat, kata sapaan, dan kata penyangkalan.
- Contoh: "di toko ini jual baju juga ga?" memakai product_discovery dengan
  product_names ["baju"]. "Robot Jadul jual apa saja?" memakai product_discovery
  dengan product_names [] karena Robot Jadul adalah toko dan tidak ada objek khusus.
- Kata barang, item, toko, kolektor, kode robot, pembayaran, pengiriman,
  asuransi, robot, atau produk membuat pertanyaan tetap in_scope.
- Gunakan konteks hanya untuk follow-up yang benar-benar merujuk percakapan sebelumnya.
- context.language_analysis adalah petunjuk parser lokal yang hemat token. Gunakan
  subject, predicate, object, negated, product_terms, dan morphology_stems untuk memahami struktur,
  tetapi pertanyaan asli tetap menjadi sumber utama jika petunjuknya tidak cocok.
- context.question_understanding merangkum subjek, jenis fakta, dan acuan percakapan
  dari aturan lokal. Hormati reference_scope previous_products dan current_page.
  Jika needs_clarification bernilai true, jangan menebak salah satu makna: kembalikan
  needs_clarification true dan pertanyaan klarifikasi yang singkat.
- context.conversation_turn menandai jawaban singkat yang sudah terhubung secara
  pasti dengan pertanyaan bot atau tujuan pelanggan sebelumnya. Pertahankan intent
  tersebut; jangan mengklasifikasikan potongan jawaban seolah pertanyaan baru.
- context.active_goal adalah tujuan belanja yang masih aktif, bukan perintah untuk
  memaksakan konteks lama. Gunakan hanya ketika pesan baru berupa lanjutan, koreksi,
  atau rujukan; pertanyaan baru yang eksplisit tetap boleh mengganti tujuan.
- context.compound_request berisi seluruh facet dan constraint dari pertanyaan
  majemuk. Pilih primary_intent sebagai intent utama, tetapi jangan mengabaikan
  budget, stok, kondisi, promo, atau tujuan penggunaan lainnya.
- intents wajib memuat intent utama dan seluruh intent tambahan yang benar-benar
  diminta. goals wajib memuat setiap kebutuhan, bukan hanya kebutuhan dari
  intent utama.
- requires_product hanya true jika jawaban memang membutuhkan identitas produk
  tertentu atau pencarian katalog. Pertanyaan kebijakan toko, pembayaran,
  pembelian paket, nego umum, dan kemungkinan gratis ongkir biasanya false.
- Jangan meminta klarifikasi jika informasi yang kurang belum diperlukan untuk
  menjawab kebijakan secara umum. Gunakan missing_fields hanya untuk data yang
  benar-benar dibutuhkan pada langkah berikutnya.
- customer_state menggambarkan nada pelanggan: neutral, confused, frustrated,
  urgent, hesitant, atau excited.
- interpretation merangkum maksud pelanggan dalam satu kalimat, termasuk semua
  kebutuhan majemuk, tanpa menjawab atau menambahkan fakta.
- topic_relation membedakan new_topic, follow_up, topic_switch, dan
  clarification_answer. Pesan yang menyebut objek baru secara eksplisit adalah
  topic_switch meskipun percakapan sebelumnya membahas produk lain.
- address_term mencatat panggilan seperti min, kak, gan, bro, atau null bila tidak
  ada. ambiguity_reason hanya diisi jika needs_clarification true.
- Confidence 0.90-0.99 hanya untuk intent yang sangat jelas; gunakan 0.65-0.85
  bila berada di batas dua intent dan <=0.60 bila perlu klarifikasi.

Kembalikan hanya JSON object dengan bentuk:
{
  "scope": "in_scope atau out_of_scope",
  "intent": "satu dari daftar intent",
  "intents": ["semua intent yang diminta; intent utama harus pertama"],
  "goals": ["semua kebutuhan dari daftar goals"],
  "confidence": 0.0,
  "entities": {
    "product_names": [],
    "budget_min": null,
    "budget_max": null,
    "quantity": null,
    "cart_total": null,
    "currency": null,
    "location": null,
    "district": null,
    "order_id": null,
    "tracking_number": null
  },
  "requires_product": false,
  "customer_state": "neutral",
  "interpretation": "ringkasan maksud pelanggan",
  "topic_relation": "new_topic",
  "address_term": null,
  "ambiguity_reason": null,
  "missing_fields": [],
  "needs_clarification": false,
  "clarification_question": null
}
`.trim();

  const user = JSON.stringify({
    question: cleanQuestion,
    context: compactContext(context),
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
