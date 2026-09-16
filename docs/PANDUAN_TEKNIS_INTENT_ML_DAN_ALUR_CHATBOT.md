# Panduan Teknis Intent ML dan Alur End-to-End Chatbot Robot Jadul

Dokumen ini adalah panduan teknis untuk memahami, menjelaskan, dan mendemonstrasikan alur chatbot Robot Jadul pada ujian akhir atau live coding. Fokus utamanya adalah perjalanan pertanyaan pelanggan dari browser, klasifikasi intent menggunakan TF-IDF dan Logistic Regression, penggabungan hasil ML dengan rule dan semantic LLM, pengambilan fakta commerce, sampai respons ditampilkan kembali kepada pelanggan.

## 1. Status dan batas bukti

Dokumen ini disusun dari source code aktif pada dua repository:

- `ai-vercel`: frontend WordPress, Vercel Functions, orkestrasi chatbot, rule, LLM, katalog, transaksi, dan renderer.
- `intent-ml-api`: FastAPI untuk inference model intent TF-IDF + Logistic Regression.

Ada tiga tingkat kepastian yang dipakai:

| Penanda | Arti |
| --- | --- |
| **Source aktif** | Perilaku terlihat langsung pada file yang dipakai HEAD saat ini. |
| **Riwayat Git** | Kode pernah ada dan dapat dibuktikan melalui commit, tetapi tidak tersedia sebagai file aktif. |
| **Konsep** | Penjelasan teori untuk membantu sidang; bukan tambahan perilaku baru pada aplikasi. |

Catatan penting tentang reproducibility model:

- Source aktif memuat `intent_model_tfidf_logreg_training_3.joblib`.
- Source training yang dapat ditemukan berada pada commit awal `181d6a8` dengan nama `train_model.py`.
- Script dan dataset persis yang menghasilkan model `training_3.joblib` tidak tersedia di HEAD.
- Karena itu, pipeline TF-IDF + Logistic Regression dapat dibuktikan dari source historis dan interface model aktif, tetapi hyperparameter serta dataset persis model training ketiga belum dapat direproduksi dari repository saat ini.

Jangan menyampaikan model training ketiga sebagai sepenuhnya reproducible sebelum script, dataset, label mapping, versi library, dan metadata training-nya disimpan kembali.

## 2. Ringkasan satu menit untuk penguji

Robot Jadul adalah chatbot commerce berbahasa Indonesia. Ketika pelanggan mengirim pertanyaan, frontend meneruskan teks, riwayat singkat, session ID, dan konteks halaman produk ke endpoint `/api/ask`. Backend menormalisasi bahasa pelanggan dan menjalankan dua jalur pemahaman secara paralel: klasifikasi lokal/hybrid yang dapat memanggil model TF-IDF + Logistic Regression, serta semantic router berbasis LLM bila provider dikonfigurasi. Hasilnya digabungkan dengan confidence threshold dan aturan deterministik.

Intent hanya menentukan jenis kebutuhan pelanggan. Harga, stok, promo, ongkir, order, dan tracking tidak dibuat oleh model. Fakta tersebut diambil dari WooCommerce atau API terkait. Setelah fakta tersedia, sistem memeriksa apakah semua bagian pertanyaan sudah terjawab, menjaga structured payload agar tidak diubah LLM, lalu mengirim JSON ke frontend untuk dirender dan disanitasi.

Kalimat kunci untuk sidang:

> TF-IDF dan Logistic Regression berperan sebagai supervised intent classifier, bukan sebagai generator jawaban dan bukan sebagai sumber fakta bisnis.

## 3. Arsitektur sistem

```mermaid
flowchart TD
    A[Pelanggan mengetik di WordPress] --> B[frontend.html]
    B -->|POST question, history, pageContext| C[api/ask.js]
    C --> D[Normalisasi dan linguistic analysis]
    C --> E[Session, pending, dan conversation context]
    D --> F[classifyIntentHybrid]
    F --> G[classifyIntentML.js]
    G -->|HTTP POST| H[intent-ml-api/app.py]
    H --> I[TF-IDF transform]
    I --> J[Logistic Regression predict_proba]
    J --> K[intent, confidence, top3]
    K --> F
    F --> L[chooseHybridIntent]
    D --> M[Local rules dan dataset similarity]
    M --> L
    C --> N[Groq/Gemini/Mistral semantic router]
    L --> O[chooseSemanticIntent]
    N --> O
    O --> P[Handler intent deterministik]
    P --> Q[WooCommerce/Shipping/Order/Tracking/Policy]
    Q --> R[Answer coverage dan safety validator]
    R --> S[Optional LLM naturalizer/composer]
    S --> T[JSON response terstruktur]
    T --> U[Frontend render + DOMPurify]
```

Pembagian tanggung jawabnya:

| Lapisan | Tanggung jawab | File utama |
| --- | --- | --- |
| Browser | Mengambil input, session, history, konteks halaman, mengirim request, merender response | `wordpress-frontend-chatbot/frontend.html` |
| API chat | Orkestrasi seluruh turn percakapan | `api/ask.js` |
| NLU lokal | Normalisasi, stemming, rule, dataset similarity | `textNormalization.js`, `indonesianMorphology.js`, `linguisticAnalysis.js`, `askLanguage.js` |
| Intent ML client | Memanggil service Python | `lib/classifyIntentML.js` |
| Intent ML server | Memuat model dan melakukan inference | `intent-ml-api/app.py` |
| Decision/fusion | Memvalidasi label/confidence dan menggabungkan ML, rule, dan semantic LLM | `intentDecision.js`, `intentFusion.js` |
| Commerce tools | Mengambil fakta produk, ongkir, order, tracking, dan policy | `wooCatalog.js`, `shippingApi.js`, `transactionStatus.js`, `tracking.js`, `storePolicy.js` |
| Response safety | Coverage, humanizer, structured action, composer validation | `answerCoverage.js`, `responseNaturalizer.js`, `llmAssistant.js` |

## 4. Kontrak request dari frontend

### 4.1 Pertanyaan dibuat oleh pelanggan

**Source aktif:** `ai-vercel/wordpress-frontend-chatbot/frontend.html`, sekitar baris 1500-1570.

```javascript
window.sendQuestion = async function (forcedQuestion = null, options = {}) {
  if (requestInFlight) return;

  const hasImage = !!selectedImage?.dataUrl;
  const question =
    (forcedQuestion || input?.value || "").trim() ||
    (hasImage ? "Tolong carikan produk yang mirip dengan foto ini" : "");
  if (!question && !hasImage) return;

  const imageToSend = hasImage ? selectedImage : null;
  const pageContext = getCurrentProductPageContext();

  const response = await fetch(
    imageToSend
      ? "https://ai-vercel-ten-sigma.vercel.app/api/ask-image"
      : "https://ai-vercel-ten-sigma.vercel.app/api/ask",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
      },
      body: JSON.stringify({
        question,
        history: recentApiHistory(),
        isSuggestionClick,
        isBootstrap,
        suggestedAction: options.suggestedAction || null,
        pageContext,
      }),
    },
  );
}
```

Yang dikirim bukan hanya teks:

- `question`: pertanyaan pelanggan.
- `history`: maksimum 20 item history terbaru untuk request.
- `X-Session-Id`: identitas percakapan, bukan autentikasi.
- `isSuggestionClick`: membedakan teks biasa dari tombol saran.
- `suggestedAction`: metadata pilihan yang divalidasi backend.
- `pageContext`: ID, nama, dan URL produk WooCommerce yang sedang dibuka.

Contoh request konseptual:

```http
POST /api/ask
Content-Type: application/json
X-Session-Id: session-demo-sidang

{
  "question": "Getter Robo Black Version masih ready dan harganya berapa?",
  "history": [],
  "isSuggestionClick": false,
  "isBootstrap": false,
  "suggestedAction": null,
  "pageContext": null
}
```

## 5. Validasi dan normalisasi di API utama

**Source aktif:** `ai-vercel/api/ask.js`, handler mulai sekitar baris 478.

```javascript
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  let rawQuestion = String(body.question || "").trim();
  if (!rawQuestion) {
    return res.status(400).json({ type: "text", message: "Pertanyaan kosong" });
  }
}
```

Backend mempertahankan dua bentuk pertanyaan:

- `rawQuestion`: bentuk asli untuk memahami konteks dan maksud pelanggan.
- `effectiveQuestion`: bentuk yang telah dinormalisasi untuk routing dan pencocokan.

Normalisasi di `ask.js` memanggil normalisasi bahasa pelanggan, typo map, dan fuzzy correction:

```javascript
function normalizeQuestion(rawQuestion = "") {
  const q = normalizeCustomerQuestion(rawQuestion);
  const words = q.split(/\s+/);

  const fixed = words.map((w) => {
    if (TYPO_MAP[w]) return TYPO_MAP[w];
    return fuzzyCorrectWord(w, CORRECTION_WORDS);
  });

  return fixed.join(" ");
}
```

Contoh normalisasi yang diharapkan:

| Input pelanggan | Bentuk yang membantu classifier |
| --- | --- |
| `stokk getter msh adaa?` | `stok getter masih ada` |
| `brapa ongkiir ke bandung` | `berapa ongkir ke bandung` |
| `pembayarannya gimana` | mendapat morphology hint `bayar` |
| `dibandingkan voltes sama getter` | mendapat morphology hint `banding` |

### 5.1 Stemming bahasa Indonesia

**Source aktif:** `ai-vercel/lib/chatbot/indonesianMorphology.js`.

```javascript
import nlpLangId from "@nlpjs/lang-id";

const { StemmerId } = nlpLangId;
const stemmer = new StemmerId();

export function stemIndonesianWord(value = "") {
  const normalized = normalizeIndonesianCommerceText(value).toLowerCase();
  if (!/^[a-z]{3,}$/.test(normalized)) return normalized;
  if (PROTECTED_TERMS.has(normalized)) return normalized;

  const overridden = overrideStem(normalized);
  if (overridden) return overridden;

  try {
    const stem = String(stemmer.stemWord(normalized) || "").toLowerCase();
    return /^[a-z]{3,}$/.test(stem) ? stem : normalized;
  } catch {
    return normalized;
  }
}
```

Nama merek, seri, kode, harga, dan resi dilindungi agar stemming tidak merusak identitas seperti `Bandai`, `Chogokin`, `GX-47T`, `500rb`, atau `JP123`.

## 6. Dua jalur pemahaman berjalan paralel

**Source aktif:** `ai-vercel/api/ask.js`, sekitar baris 812-913.

```javascript
const localIntentTask =
  localScopeDecision === "out_of_scope"
    ? Promise.resolve({
        intent: "general",
        method: "out_of_scope_guard",
        score: 1,
      })
    : classifyIntentHybrid(effectiveQuestion);

const groqRouteTask = /* Groq -> Gemini -> Mistral -> null */;

const [localIntentResult, groqRoute] = await Promise.all([
  localIntentTask,
  groqRouteTask,
]);
```

Maknanya:

1. Jalur lokal/hybrid menjalankan ML intent dan rule lokal.
2. Jalur semantic menjalankan LLM bila dikonfigurasi dan memang diperlukan.
3. Keduanya dimulai sebelum backend memilih hasil akhir.
4. `Promise.all` menunggu kedua task selesai.

Konsekuensi performa: jika `INTENT_API_URL` dikonfigurasi tetapi service tidak merespons, request chat dapat ikut menunggu sampai timeout client ML, yaitu 12 detik, walaupun semantic router sudah selesai lebih dahulu.

## 7. Alur TF-IDF dan Logistic Regression

Bagian ini membedakan fase **training** dan **inference**.

### 7.1 Fase training

Training dilakukan sebelum aplikasi menerima request pelanggan. Tujuannya adalah mempelajari hubungan antara pola kata pada pertanyaan dan label intent.

**Bukti riwayat Git:** `intent-ml-api`, commit `181d6a8`, file `train_model.py`.

Untuk melihat sumber historis tanpa mengubah working tree:

```powershell
git -C C:\kumpulan-codingan-fadli\intent-ml-api show 181d6a8:train_model.py
```

Kutipan pipeline training historis:

```python
df = pd.read_csv("dataset_intent_1800_realistic_robotjadul.csv")

X = df["text"].astype(str)
y = df["label"].astype(str)

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

model = Pipeline([
    ("tfidf", TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2)
    )),
    ("clf", LogisticRegression(
        max_iter=500
    ))
])

model.fit(X_train, y_train)
```

Penjelasan setiap bagian:

| Kode | Fungsi |
| --- | --- |
| `df["text"]` | Fitur masukan berupa kalimat pelanggan. |
| `df["label"]` | Target supervised learning berupa nama intent. |
| `test_size=0.2` | 20% data dipisahkan untuk evaluasi. |
| `random_state=42` | Membuat pembagian data konsisten saat diulang. |
| `stratify=y` | Menjaga proporsi masing-masing intent pada train dan test. |
| `lowercase=True` | Mengubah token menjadi huruf kecil. |
| `ngram_range=(1, 2)` | Memakai unigram dan bigram. |
| `max_iter=500` | Memberi optimizer hingga 500 iterasi untuk konvergen. |
| `model.fit(...)` | TF-IDF mempelajari vocabulary/IDF dan classifier mempelajari bobot kelas. |

Pipeline kemudian dievaluasi dan disimpan:

```python
pred = model.predict(X_test)

print("Accuracy:", accuracy_score(y_test, pred))
print(classification_report(y_test, pred, digits=3))

joblib.dump(model, "intent_tfidf_logreg.joblib")
```

Karena TF-IDF dan classifier berada dalam satu `Pipeline`, artefak Joblib menyimpan kedua tahap. Saat `model.predict([question])` dipanggil, teks otomatis melewati transformasi TF-IDF sebelum masuk ke Logistic Regression.

### 7.2 Apa yang dilakukan TF-IDF?

TF-IDF mengubah kalimat menjadi vektor angka. Ia menaikkan nilai kata yang penting pada sebuah dokumen, tetapi menurunkan nilai kata yang muncul di banyak dokumen.

Secara konseptual:

```text
TF-IDF(t, d) = TF(t, d) × IDF(t)
```

Dengan smoothing default scikit-learn, IDF secara konseptual berbentuk:

```text
IDF(t) = log((1 + jumlah_dokumen) / (1 + dokumen_yang_memuat_t)) + 1
```

Contoh tiga kalimat:

```text
D1: "berapa harga getter"
D2: "ada promo getter"
D3: "stok getter masih ada"
```

Kata `getter` muncul di semua dokumen sehingga kurang diskriminatif. Kata `harga`, `promo`, dan `stok` lebih jarang dan lebih membantu membedakan intent. Bigram juga memungkinkan fitur seperti:

```text
"berapa harga"
"ada promo"
"stok getter"
"masih ada"
```

Jadi TF-IDF tidak memahami makna layaknya manusia. Ia mengukur pola statistik token yang dipelajari dari dataset.

### 7.3 Mengapa memakai unigram dan bigram?

- Unigram menangkap satu kata penting: `harga`, `stok`, `ongkir`, `retur`.
- Bigram menangkap konteks dua kata: `berapa harga`, `status pesanan`, `nomor resi`, `ready stok`.
- Kombinasi keduanya lebih kuat daripada hanya keyword tunggal, tetapi masih ringan untuk inference API.

Keterbatasannya:

- Frasa yang jauh berbeda dari data training dapat salah diklasifikasikan.
- Typo dan slang harus dinormalisasi atau dicontohkan dalam dataset.
- TF-IDF tidak mempunyai memory percakapan.
- TF-IDF tidak mengetahui data WooCommerce.
- TF-IDF tidak menghasilkan jawaban.

### 7.4 Apa yang dilakukan Logistic Regression?

Walaupun namanya regression, Logistic Regression di sini digunakan untuk klasifikasi. Untuk setiap kelas intent, model menghitung skor linear dari vektor TF-IDF:

```text
z_k = w_k · x + b_k
```

Keterangan:

- `x`: vektor TF-IDF pertanyaan.
- `w_k`: bobot fitur untuk intent ke-`k`.
- `b_k`: bias kelas.
- `z_k`: skor kelas sebelum dikonversi menjadi probabilitas.

Probabilitas kemudian dipakai oleh `predict_proba`. Detail strategi multiclass mengikuti versi dan default scikit-learn yang digunakan ketika model dilatih. Source historis tidak menetapkan `solver` atau `multi_class` secara eksplisit, dan dependency aktif belum dipin; karena itu jangan mengklaim konfigurasi solver/model multiclass yang lebih spesifik tanpa membuka metadata artefak di environment Python yang kompatibel.

Kelas dengan probabilitas tertinggi menjadi prediksi. Confidence di project ini adalah probabilitas tertinggi dari `predict_proba`, bukan jaminan bahwa prediksi pasti benar.

### 7.5 Fase inference pada FastAPI

**Source aktif:** `intent-ml-api/app.py`, baris 1-48.

Model dimuat satu kali saat proses API dimulai:

```python
app = FastAPI()

model = joblib.load("intent_model_tfidf_logreg_training_3.joblib")
```

Ini lebih efisien daripada memuat file Joblib untuk setiap request.

Normalisasi Python:

```python
def normalize_text(text: str) -> str:
    return " ".join(text.lower().strip().split())
```

Normalisasi ini melakukan lowercase, trim, dan merapikan spasi. Normalisasi bahasa Indonesia yang lebih kaya sudah dilakukan lebih awal di `ai-vercel`.

Inference:

```python
pred = model.predict([question])[0]
probs = model.predict_proba([question])[0]

classes = model.named_steps["clf"].classes_
best_idx = int(np.argmax(probs))
confidence = float(probs[best_idx])
```

Urutannya secara implisit:

```text
question
  → Pipeline.tfidf.transform(question)
  → sparse TF-IDF vector
  → Pipeline.clf.predict / predict_proba
  → label dan probabilitas
```

Top-3 dibentuk dengan memasangkan nama kelas dan probabilitas:

```python
top3 = sorted(
    [{"intent": str(c), "prob": float(p)} for c, p in zip(classes, probs)],
    key=lambda x: x["prob"],
    reverse=True
)[:3]
```

Threshold confidence di service Python:

```python
threshold = 0.6

return {
    "intent": str(pred),
    "confidence": confidence,
    "top3": top3,
    "method": "tfidf_logreg",
    "is_low_confidence": confidence < threshold,
    "model_name": "TF-IDF + Logistic Regression"
}
```

Contoh response, dengan angka hanya sebagai ilustrasi format:

```json
{
  "intent": "stock_availability",
  "confidence": 0.87,
  "top3": [
    { "intent": "stock_availability", "prob": 0.87 },
    { "intent": "product_discovery", "prob": 0.08 },
    { "intent": "product_detail", "prob": 0.03 }
  ],
  "method": "tfidf_logreg",
  "is_low_confidence": false,
  "model_name": "TF-IDF + Logistic Regression"
}
```

## 8. Pemanggilan ML dari Node.js

Bagian ini menjawab tiga pertanyaan yang sering tertukar:

1. Apa sebenarnya `INTENT_API_URL`?
2. Ke mana request tersebut dikirim?
3. Di proses mana TF-IDF dan Logistic Regression dijalankan?

### 8.1 `INTENT_API_URL` bukan model ML

`INTENT_API_URL` adalah environment variable pada aplikasi `ai-vercel` yang menyimpan **alamat HTTP lengkap endpoint prediksi** milik aplikasi Python `intent-ml-api`. Variabel ini hanya menjadi penunjuk lokasi service; variabel tersebut tidak berisi TF-IDF, Logistic Regression, dataset, atau file model.

Pemetaan komponennya:

| Komponen | Lokasi proses | Tugas |
| --- | --- | --- |
| `api/ask.js` | Node.js/Vercel Function | Menerima pertanyaan chatbot dan memulai klasifikasi hybrid. |
| `lib/classifyIntentML.js` | Node.js/Vercel Function | Membaca `INTENT_API_URL` dan mengirim pertanyaan melalui HTTP POST. |
| `intent-ml-api/app.py` | Proses Python/FastAPI terpisah | Menerima JSON, menjalankan inference scikit-learn, dan mengembalikan prediksi. |
| `intent_model_tfidf_logreg_training_3.joblib` | File di server Python | Menyimpan pipeline TF-IDF dan Logistic Regression yang sudah dilatih. |

Saat development lokal, nilainya dapat berupa:

```text
http://127.0.0.1:8000/predict_intent
```

Artinya Node.js mengirim request ke FastAPI yang berjalan pada komputer yang sama di port `8000`.

Saat production, bentuknya harus berupa URL deployment project `intent-ml-api`, misalnya:

```text
https://<host-intent-ml-api>/predict_intent
```

Nama host production aktual **tidak ditetapkan di source code**. Host ditentukan oleh nilai environment variable `INTENT_API_URL` pada deployment `ai-vercel`. Karena repository `intent-ml-api` tidak memiliki manifest deployment yang membuktikan provider hosting tertentu, jangan menyatakan service ini pasti berjalan di Vercel, Render, Railway, atau provider lain tanpa memeriksa konfigurasi deployment yang sebenarnya.

Yang wajib adalah bagian akhir URL:

```text
/predict_intent
```

Client Node tidak menambahkan path tersebut secara otomatis.

### 8.2 Gambaran alur lintas dua project

```mermaid
sequenceDiagram
    participant User as Pelanggan
    participant Ask as ai-vercel/api/ask.js
    participant Hybrid as classifyIntentHybrid()
    participant Client as classifyIntentML.js
    participant API as intent-ml-api/app.py
    participant Model as Pipeline .joblib

    User->>Ask: pertanyaan pelanggan
    Ask->>Hybrid: classifyIntentHybrid(effectiveQuestion)
    Hybrid->>Client: classifyIntentML(question)
    Client->>API: POST INTENT_API_URL<br/>{ question: "..." }
    API->>API: validasi Pydantic + normalize_text()
    API->>Model: predict([question])
    Model->>Model: TF-IDF transform -> Logistic Regression
    API->>Model: predict_proba([question])
    Model-->>API: label + probabilitas setiap kelas
    API-->>Client: intent, confidence, top3, low confidence
    Client-->>Hybrid: object JSON hasil ML
    Hybrid->>Hybrid: bandingkan dengan rule + validasi threshold
    Hybrid-->>Ask: intent hybrid
```

Poin terpenting untuk sidang:

> JavaScript tidak menjalankan TF-IDF atau Logistic Regression secara langsung. JavaScript hanya menjadi HTTP client. Inference ML yang sebenarnya berlangsung di proses Python ketika `model.predict()` dan `model.predict_proba()` dipanggil.

Pemisahan service ini diperlukan karena artefak `.joblib` dibuat oleh scikit-learn/Python dan tidak dapat dimuat langsung sebagai model scikit-learn oleh runtime Node.js.

### 8.3 Sisi pengirim: `ai-vercel/lib/classifyIntentML.js`

**Source aktif:** `ai-vercel/lib/classifyIntentML.js`, baris 1-29.

```javascript
export async function classifyIntentML(question) {
  const url = process.env.INTENT_API_URL;

  if (!url) {
    throw new Error("INTENT_API_URL belum diset");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`INTENT_API_ERROR_${resp.status}: ${txt}`);
    }

    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

Kode tersebut melakukan langkah berikut:

1. Membaca alamat endpoint dari `process.env.INTENT_API_URL`.
2. Menghentikan proses lebih awal jika URL belum dikonfigurasi.
3. Membuat `AbortController` dengan timeout 12 detik.
4. Mengirim request HTTP `POST` dengan content type JSON.
5. Mengirim hanya satu field request, yaitu `question`.
6. Menolak response HTTP non-2xx sebagai error.
7. Mengubah response JSON FastAPI menjadi object JavaScript.
8. Membersihkan timer pada blok `finally`, baik request berhasil maupun gagal.

Contoh data yang keluar dari Node.js:

```http
POST /predict_intent HTTP/1.1
Content-Type: application/json

{
  "question": "stok getter masih ada"
}
```

Tidak ada proses `fit`, `transform`, `predict`, atau `predict_proba` di file JavaScript ini. Karena itu, jika penguji bertanya "di mana ML diproses?", jawabannya bukan `classifyIntentML.js`, melainkan fungsi route Python yang dipanggil oleh URL tersebut.

### 8.4 Sisi penerima: `intent-ml-api/app.py`

**Source aktif:** `intent-ml-api/app.py`, baris 7-48.

Ketika process FastAPI dimulai, file model dimuat:

```python
app = FastAPI()

model = joblib.load("intent_model_tfidf_logreg_training_3.joblib")
```

`joblib.load(...)` menghasilkan object pipeline scikit-learn yang sudah terlatih. Model dimuat sekali saat startup process, bukan dilatih ulang dan bukan dibaca ulang pada setiap pertanyaan.

Path file `.joblib` bersifat relatif terhadap working directory process Python. Untuk development lokal, perintah `uvicorn` sebaiknya dijalankan dari root folder `intent-ml-api`, tempat file berikut berada:

```text
intent-ml-api/
|-- app.py
|-- intent_model_tfidf_logreg_training_3.joblib
|-- requirements.txt
```

Jika file `.joblib` tidak ikut deployment atau process dimulai dari working directory yang salah, `joblib.load(...)` gagal saat startup dan endpoint tidak dapat melakukan prediksi.

Kontrak request ditentukan oleh Pydantic:

```python
class PredictRequest(BaseModel):
    question: str
```

Route yang harus dituju `INTENT_API_URL` adalah:

```python
@app.post("/predict_intent")
def predict_intent(payload: PredictRequest):
```

Karena schema mewajibkan `question` bertipe string, JSON tanpa field tersebut atau dengan tipe yang tidak sesuai akan ditolak FastAPI sebelum inference, biasanya dengan HTTP `422`.

Di dalam route, teks dinormalisasi terlebih dahulu:

```python
question = normalize_text(payload.question)

if not question:
    raise HTTPException(status_code=400, detail="Question is empty")
```

Setelah itu barulah inference ML benar-benar terjadi:

```python
pred = model.predict([question])[0]
probs = model.predict_proba([question])[0]
```

Karena `model` adalah pipeline, pemanggilan tersebut secara internal menjalankan:

```text
string pertanyaan
  --> tahap TF-IDF di dalam pipeline
  --> sparse vector berisi bobot fitur
  --> Logistic Regression
  --> label intent dan probabilitas kelas
```

Tidak ada training pada tahap ini. Training sudah selesai sebelumnya dan hasilnya disimpan di dalam `.joblib`.

#### 8.4.1 Di mana bagian TF-IDF dan Logistic Regression?

Di `app.py` tidak ada deklarasi baru seperti berikut:

```python
TfidfVectorizer(...)
LogisticRegression(...)
```

Hal itu bukan berarti kedua algoritma tidak dijalankan. Keduanya sudah dibentuk, dilatih, dan dibungkus menjadi satu `Pipeline` sebelum aplikasi FastAPI dijalankan. Pipeline yang sudah terlatih kemudian disimpan ke file `.joblib`.

Struktur konseptual object yang dimuat adalah:

```text
model: Pipeline
|-- named_steps["tfidf"] -> TfidfVectorizer yang sudah di-fit
`-- named_steps["clf"]   -> LogisticRegression yang sudah di-fit
```

Kode training historis membentuk pola berikut:

```python
model = Pipeline([
    ("tfidf", TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2)
    )),
    ("clf", LogisticRegression(
        max_iter=500
    ))
])

model.fit(X_train, y_train)
joblib.dump(model, "intent_tfidf_logreg.joblib")
```

Nama langkah penting:

| Nama step | Object | Tugas |
| --- | --- | --- |
| `tfidf` | `TfidfVectorizer` | Mengubah teks pertanyaan menjadi sparse vector numerik. |
| `clf` | `LogisticRegression` | Mengubah vector TF-IDF menjadi skor, probabilitas, dan label intent. |

Nama file pada contoh historis berbeda dari artefak runtime aktif. Source aktif memuat `intent_model_tfidf_logreg_training_3.joblib`; script dan dataset persis yang menghasilkan artefak training ketiga belum tersedia di HEAD. Karena itu, contoh training menjelaskan struktur pipeline yang dapat dibuktikan dari riwayat, tetapi jangan mengklaim seluruh parameter artefak training ketiga identik tanpa metadata model yang kompatibel.

#### 8.4.2 Bagaimana `joblib.load()` mengaktifkan kedua algoritma?

```python
model = joblib.load("intent_model_tfidf_logreg_training_3.joblib")
```

`joblib.load()` melakukan deserialisasi terhadap object pipeline yang sebelumnya disimpan. File tersebut tidak hanya menyimpan nama algoritma, tetapi juga state hasil training, antara lain:

- vocabulary fitur yang sudah dipelajari TF-IDF;
- nilai IDF untuk fitur yang dikenal;
- konfigurasi vectorizer yang tersimpan;
- bobot atau coefficient Logistic Regression;
- bias atau intercept classifier;
- urutan kelas pada `classes_`.

Alurnya:

```text
Fase training, dilakukan sebelumnya
Pipeline belum terlatih
  --> model.fit(X_train, y_train)
  --> TF-IDF mempelajari vocabulary dan IDF
  --> Logistic Regression mempelajari bobot dan bias
  --> joblib.dump(...)
  --> file .joblib

Fase inference, dilakukan oleh app.py
file .joblib
  --> joblib.load(...)
  --> Pipeline terlatih tersedia di memory
  --> siap menjalankan predict dan predict_proba
```

Package `scikit-learn` tetap harus tersedia di environment server Python agar Joblib dapat membangun kembali class `Pipeline`, `TfidfVectorizer`, dan `LogisticRegression` ketika file dimuat.

#### 8.4.3 Apa yang sebenarnya terjadi saat `model.predict()`?

Kode production cukup menulis:

```python
pred = model.predict([question])[0]
```

Scikit-learn `Pipeline` otomatis menjalankan seluruh transformer sebelum estimator terakhir. Dengan struktur pipeline tersebut, satu baris di atas secara konseptual setara dengan:

```python
tfidf = model.named_steps["tfidf"]
classifier = model.named_steps["clf"]

features = tfidf.transform([question])
pred = classifier.predict(features)[0]
```

Urutannya:

1. `[question]` diterima sebagai kumpulan berisi satu dokumen.
2. Step `tfidf` memanggil `transform([question])`.
3. Hasilnya adalah sparse matrix dengan satu baris dan kolom sebanyak fitur vocabulary.
4. Sparse matrix diberikan kepada step `clf`.
5. Logistic Regression menghitung skor setiap kelas.
6. `predict()` mengembalikan label intent terpilih.
7. `[0]` mengambil hasil untuk dokumen pertama.

Tanda kurung siku pada `[question]` diperlukan karena API scikit-learn menerima kumpulan dokumen. Perbedaannya:

```python
# Satu dokumen
model.predict(["stok getter masih ada"])

# Tiga dokumen dalam satu batch
model.predict([
    "stok getter masih ada",
    "berapa harga mazinger",
    "barang bisa diretur"
])
```

#### 8.4.4 Apa yang sebenarnya terjadi saat `model.predict_proba()`?

Kode berikut menjalankan pipeline yang sama, tetapi meminta probabilitas seluruh kelas:

```python
probs = model.predict_proba([question])[0]
```

Secara konseptual setara dengan:

```python
tfidf = model.named_steps["tfidf"]
classifier = model.named_steps["clf"]

features = tfidf.transform([question])
probs = classifier.predict_proba(features)[0]
```

Perbedaannya:

| Method | Hasil |
| --- | --- |
| `predict()` | Satu label intent terbaik, misalnya `stock_availability`. |
| `predict_proba()` | Probabilitas untuk seluruh kelas sesuai urutan `classes_`. |

Contoh ilustrasi:

```python
classes = [
    "price_promo",
    "product_detail",
    "stock_availability"
]

probs = [0.08, 0.12, 0.80]
```

Pasangannya:

```text
price_promo        -> 0.08
product_detail     -> 0.12
stock_availability -> 0.80
```

Angka tersebut hanya ilustrasi. Nilai sebenarnya ditentukan oleh fitur pertanyaan dan parameter model hasil training.

#### 8.4.5 Mengapa `classes_` diambil dari step `clf`?

```python
classes = model.named_steps["clf"].classes_
```

`predict_proba()` mengembalikan array angka tanpa nama label di dalam setiap posisi. `classes_` memberikan urutan label yang digunakan classifier. Karena urutannya sama, kode dapat memasangkan keduanya:

```python
zip(classes, probs)
```

Setelah dipasangkan dan diurutkan, aplikasi memperoleh top-3 intent:

```python
top3 = sorted(
    [{"intent": str(c), "prob": float(p)} for c, p in zip(classes, probs)],
    key=lambda x: x["prob"],
    reverse=True
)[:3]
```

#### 8.4.6 Bagaimana confidence dipilih?

```python
best_idx = int(np.argmax(probs))
confidence = float(probs[best_idx])
```

`np.argmax(probs)` mencari posisi probabilitas terbesar. Misalnya:

```python
probs = [0.08, 0.12, 0.80]
best_idx = 2
confidence = 0.80
```

Label pada posisi yang sama adalah:

```python
classes[best_idx] == "stock_availability"
```

Confidence ini adalah probabilitas keluaran model untuk kelas teratas, bukan jaminan prediksi selalu benar. Karena itu hasil masih diperiksa menggunakan threshold dan validasi hybrid di Node.js.

#### 8.4.7 Ringkasan eksekusi satu pertanyaan

```text
Input JSON
{ "question": "stok getter masih ada" }

        |
        v
normalize_text()

        |
        v
model.predict([question])
        |
        +--> named_steps["tfidf"].transform(...)
        |       menghasilkan sparse TF-IDF vector
        |
        `--> named_steps["clf"].predict(...)
                menghasilkan label intent

model.predict_proba([question])
        |
        +--> TF-IDF transform
        |
        `--> LogisticRegression.predict_proba(...)
                menghasilkan probabilitas seluruh kelas

        |
        v
classes_ + np.argmax + top3

        |
        v
Response JSON untuk ai-vercel
```

Jawaban ringkas yang dapat digunakan saat sidang:

> TF-IDF dan Logistic Regression tidak dideklarasikan ulang di `app.py` karena keduanya sudah berada di dalam Pipeline scikit-learn yang disimpan sebagai Joblib. `joblib.load()` memuat pipeline beserta vocabulary TF-IDF dan bobot classifier. Saat `model.predict()` atau `model.predict_proba()` dipanggil, Pipeline otomatis menjalankan transformasi TF-IDF terlebih dahulu, lalu memberikan sparse vector kepada Logistic Regression untuk menentukan intent dan confidence.

### 8.5 Response kembali ke Node.js

FastAPI mengembalikan object berikut:

```python
return {
    "intent": str(pred),
    "confidence": confidence,
    "top3": top3,
    "method": "tfidf_logreg",
    "is_low_confidence": confidence < threshold,
    "model_name": "TF-IDF + Logistic Regression"
}
```

Contoh perjalanan data lengkap:

```text
Node mengirim:
{ "question": "stok getter masih ada" }

Python memproses:
normalize_text
  --> pipeline TF-IDF
  --> Logistic Regression
  --> predict + predict_proba

Python mengembalikan:
{
  "intent": "stock_availability",
  "confidence": 0.87,
  "top3": [...],
  "method": "tfidf_logreg",
  "is_low_confidence": false,
  "model_name": "TF-IDF + Logistic Regression"
}

Node menerima:
return await resp.json()
```

Angka `0.87` hanya contoh format, bukan hasil pengukuran untuk kalimat tersebut.

### 8.6 Setelah response ML diterima: hasil belum otomatis menjadi intent akhir

**Source aktif:** `ai-vercel/lib/chatbot/askLanguage.js`, baris 335-357.

```javascript
const ml = await classifyIntentML(rawQuestion);
const rule = classifyIntentFromDataset(rawQuestion);

return chooseHybridIntent({
  ml,
  rule,
  minConfidence: resolveIntentMlMinConfidence(
    process.env.INTENT_ML_MIN_CONFIDENCE,
  ),
});
```

Jadi response Python hanya menjadi **kandidat intent dari ML**. Node masih:

1. menghitung rule lokal sebagai pembanding;
2. memastikan label termasuk kontrak intent chatbot;
3. memeriksa `is_low_confidence` dari Python;
4. membandingkan `confidence` dengan `INTENT_ML_MIN_CONFIDENCE`;
5. menggunakan rule lokal jika hasil ML tidak aman diterima.

Threshold Python saat ini tetap `0.6`. Node juga mempunyai default `0.6`, tetapi dapat diberi nilai lebih tinggi melalui `INTENT_ML_MIN_CONFIDENCE`. Karena Node menolak hasil yang sudah ditandai `is_low_confidence=true` oleh Python, menurunkan threshold Node ke bawah `0.6` tidak membuat prediksi di bawah threshold Python otomatis diterima.

### 8.7 Apa yang terjadi jika API ML mati?

**Source aktif:** `ai-vercel/lib/chatbot/askLanguage.js`, baris 348-356.

```javascript
} catch (err) {
  console.error("ML INTENT ERROR:", err?.message || err);

  const rule = classifyIntentFromDataset(rawQuestion);
  return {
    intent: rule.intent,
    method: "fallback_rule_low_confidence",
    score: rule.score ?? 0,
  };
}
```

Fallback tersebut aktif ketika:

- `INTENT_API_URL` belum diset;
- DNS atau koneksi ke server Python gagal;
- request melewati timeout 12 detik;
- FastAPI mengembalikan HTTP 400, 422, 500, atau error lain;
- model gagal dimuat sehingga service tidak dapat berjalan;
- response tidak dapat diproses sebagai JSON.

Akibatnya chatbot tidak langsung berhenti. Klasifikasi kembali ke rule/dataset lokal. Sesudah itu sistem masih memiliki lapisan semantic LLM dan intent fusion yang dijelaskan pada bagian berikutnya.

### 8.8 Cara membuktikan arah URL saat live coding

Jalankan FastAPI dari folder `intent-ml-api`:

```powershell
python -m uvicorn app:app --reload --port 8000
```

Set URL pada terminal aplikasi Node.js:

```powershell
$env:INTENT_API_URL = "http://127.0.0.1:8000/predict_intent"
$env:INTENT_ML_MIN_CONFIDENCE = "0.6"
```

Kemudian request ke endpoint Python dapat diuji langsung:

```powershell
$body = @{ question = "stok getter masih ada" } | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri $env:INTENT_API_URL `
  -ContentType "application/json" `
  -Body $body
```

Urutan penjelasan kepada penguji:

1. Tunjukkan `INTENT_API_URL` mengarah ke `/predict_intent`.
2. Tunjukkan decorator `@app.post("/predict_intent")` pada `app.py`.
3. Tunjukkan `joblib.load(...)` sebagai proses memuat artefak.
4. Tunjukkan `model.predict(...)` dan `model.predict_proba(...)` sebagai lokasi inference.
5. Tunjukkan response JSON kembali ke Node.
6. Tunjukkan `chooseHybridIntent(...)` untuk membuktikan bahwa prediksi masih divalidasi.

Hal penting saat konfigurasi:

- `INTENT_API_URL` harus berisi endpoint prediction lengkap, misalnya `http://127.0.0.1:8000/predict_intent`.
- Client tidak menambahkan `/predict_intent` secara otomatis.
- Timeout adalah 12.000 ms.
- Error HTTP dan timeout dilempar ke pemanggil agar fallback lokal dapat aktif.
- Nilai URL dan credential tidak perlu dicetak atau dimasukkan ke dokumentasi.
- `intent-ml-api/app.py` saat ini tidak memvalidasi API key atau token. Jika endpoint dibuka ke internet, access control, rate limiting, dan monitoring perlu disediakan oleh deployment/platform atau ditambahkan sebagai hardening terpisah.

## 9. Rule lokal yang mendampingi ML

Model ML bukan satu-satunya classifier. `classifyIntentHybrid` juga menghitung hasil rule lokal.

**Source aktif:** `ai-vercel/lib/chatbot/askLanguage.js`, sekitar baris 41-247 dan 335-360.

Tokenisasi dan Jaccard similarity:

```javascript
function tokenize(s = "") {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !INTENT_STOPWORDS.has(t));
}

function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}
```

Rule lokal melakukan:

1. Normalisasi dan morphology hints.
2. Keyword scoring dari `INTENT_KEYWORDS`.
3. Pencarian contoh terdekat dalam `INTENT_DATASET` menggunakan Jaccard.
4. Phrase rule eksplisit untuk compare, popularity, discovery, dan recommendation.
5. Default ke `product_discovery` bila tidak ada bukti kuat.

Contoh rule eksplisit:

```javascript
if (
  qLower.includes("bandingkan") ||
  qLower.includes("compare") ||
  qLower.includes(" vs ") ||
  qLower.includes("apa bedanya")
) {
  return {
    intent: "compare",
    method: "compare_phrase_rule",
    score: 0.95,
  };
}
```

Perbedaan penting:

| Komponen | Cara kerja | Kekuatan | Keterbatasan |
| --- | --- | --- | --- |
| TF-IDF + Logistic Regression | Belajar bobot dari dataset berlabel | Cepat, probabilistik, mudah dievaluasi | Bergantung kualitas dan cakupan dataset |
| Keyword/rule | Kondisi yang ditulis developer | Sangat pasti untuk frasa eksplisit | Sulit mencakup semua variasi bahasa |
| Jaccard dataset lokal | Overlap token dengan contoh | Murah dan selalu tersedia | Tidak berbobot seperti TF-IDF dan tidak kontekstual |
| Semantic LLM | Memahami struktur dan konteks | Kuat untuk kalimat kompleks/follow-up | Latency, quota, dan perlu safety validation |

## 10. Hybrid decision: menerima atau menolak hasil ML

`classifyIntentHybrid` selalu menyiapkan rule pembanding:

```javascript
export async function classifyIntentHybrid(rawQuestion) {
  try {
    const ml = await classifyIntentML(rawQuestion);
    const rule = classifyIntentFromDataset(rawQuestion);

    return chooseHybridIntent({
      ml,
      rule,
      minConfidence: resolveIntentMlMinConfidence(
        process.env.INTENT_ML_MIN_CONFIDENCE,
      ),
    });
  } catch (err) {
    console.error("ML INTENT ERROR:", err?.message || err);

    const rule = classifyIntentFromDataset(rawQuestion);
    return {
      intent: rule.intent,
      method: "fallback_rule_low_confidence",
      score: rule.score ?? 0,
    };
  }
}
```

**Source aktif:** `ai-vercel/lib/chatbot/intentDecision.js`.

Kontrak intent yang diterima Node.js terdiri dari 13 label:

```javascript
export const CHATBOT_INTENTS = new Set([
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
```

Kondisi ML diterima:

```javascript
if (
  mlIntentSupported &&
  !apiMarksLowConfidence &&
  mlConfidence >= threshold
) {
  return {
    intent: mlIntent,
    method: ml?.method || "ml",
    score: mlConfidence,
    ml_confidence: mlConfidence,
    ml_is_low_confidence: false,
    ...(Array.isArray(ml?.top3) ? { ml_top3: ml.top3 } : {}),
  };
}
```

Jika salah satu syarat gagal, rule lokal dipakai:

```javascript
return {
  intent: safeRule.intent || "general",
  method: `fallback_rule_low_confidence:${safeRule.method || "fallback"}`,
  score: normalizeIntentConfidence(safeRule.score),
  ml_confidence: mlConfidence,
  ml_intent: mlIntent || null,
  ml_is_low_confidence:
    apiMarksLowConfidence ||
    !mlIntentSupported ||
    mlConfidence < threshold,
  ...(Array.isArray(ml?.top3) ? { ml_top3: ml.top3 } : {}),
};
```

Tabel keputusan:

| Kondisi | Hasil |
| --- | --- |
| ML confidence ≥ threshold, label valid, `is_low_confidence=false` | Gunakan intent ML. |
| Confidence di bawah threshold | Gunakan rule lokal. |
| API menandai low confidence | Gunakan rule lokal. |
| Label ML tidak termasuk 13 intent | Tolak label dan gunakan rule lokal. |
| API ML error/timeout/tidak dikonfigurasi | Tangkap error dan gunakan rule lokal. |

Threshold default Python dan Node sama-sama `0.6`, tetapi Node dapat dikonfigurasi melalui `INTENT_ML_MIN_CONFIDENCE`. Artinya Node tetap menjadi boundary validator terakhir.

## 11. Semantic LLM dan fusion setelah ML

Sesudah hybrid classifier selesai, hasilnya masih dapat dibandingkan dengan semantic router.

**Source aktif:** `ai-vercel/lib/chatbot/intentFusion.js`, fungsi `chooseSemanticIntent` sekitar baris 267.

```javascript
if (semanticConfidence < minSemanticConfidence) {
  return {
    ...localResult,
    ...(explicit || {}),
    method: explicit?.method
      ? `local_low_semantic_confidence:${explicit.method}`
      : `local_low_semantic_confidence:${localResult.method}`,
    ...(explicit ? { score: 1 } : {}),
    scope: localScope === "ambiguous" ? "in_scope" : localScope,
  };
}

return {
  ...localResult,
  intent: semanticIntent,
  method: `${semanticProvider}_semantic:${semantic.model || "unknown"}`,
  score: semanticConfidence,
  scope: "in_scope",
};
```

Default semantic threshold pada `ask.js` adalah `0.65`, dapat diubah dengan `GROQ_ROUTER_MIN_CONFIDENCE`.

Urutan keputusan sederhananya:

```text
local scope out-of-scope yang pasti
  → lindungi dari tebakan LLM pada mode legacy

tidak ada semantic result
  → gunakan hybrid ML/rule atau explicit rule

semantic out-of-scope
  → general/out_of_scope

semantic confidence < threshold
  → gunakan hasil lokal/hybrid

semantic confidence cukup
  → gunakan semantic intent
```

Pada `LLM_LED_ASSISTANT_MODE=active`, semantic intent ber-confidence tinggi dapat dikunci. Namun pending state atau structured action yang terverifikasi tetap dapat menjadi sumber intent eksplisit.

## 12. Arti 13 intent

| Intent | Contoh pertanyaan | Jalur respons utama |
| --- | --- | --- |
| `greeting` | “Halo” | Sambutan dan controlled suggestions |
| `product_discovery` | “Ada robot Voltron?” | Pencarian katalog |
| `recommendation` | “Rekomendasi robot untuk display” | Filter dan ranking produk |
| `product_detail` | “Bahannya apa?” | Fakta deskripsi/dimensi/kondisi WooCommerce |
| `price_promo` | “Getter sedang diskon?” | Harga regular, sale, dan promo katalog |
| `stock_availability` | “Masih ready berapa pcs?” | Status dan kuantitas stok katalog |
| `shipping_transaction` | “Ongkir ke Bandung berapa?” | Ongkir, pembayaran, COD, packing, asuransi |
| `shipping_origin` | “Barang dikirim dari mana?” | Lokasi/asalan pengiriman toko |
| `return_product` | “Kalau barang rusak bisa retur?” | Kebijakan retur/refund deterministik |
| `compare` | “Voltes V vs Getter bagus mana?” | Resolusi dua produk dan perbandingan |
| `transaction_status` | “Status order 6864?” | Verifikasi Order ID + billing email/telepon |
| `shipment_tracking` | “Resi JP123 sampai mana?” | Tracking Biteship |
| `general` | Pertanyaan toko atau di luar scope | Informasi toko atau penolakan scope |

Intent bukan response. Intent adalah sinyal routing untuk menentukan handler dan sumber data yang harus dipanggil.

## 13. Dari intent menjadi fakta commerce

Misalnya final intent adalah `stock_availability` atau `price_promo`, backend perlu membuka katalog.

**Source aktif:** `ai-vercel/lib/chatbot/wooCatalog.js`, sekitar baris 63-118.

```javascript
async function fetchAllWooProducts({
  timeoutMs = 15000,
  perPage = 50,
  maxPages = 20,
  retries = 1,
} = {}) {
  const all = [];
  const headers = buildWooAuthHeaders();

  for (let page = 1; page <= maxPages; page += 1) {
    const url = buildWooProductsUrl({
      per_page: perPage,
      page,
      status: "publish",
    });
    let data;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        data = await fetchWithTimeoutJson(url, { headers }, timeoutMs);
        break;
      } catch (error) {
        const retryable =
          error?.name === "AbortError" ||
          error?.code === "WC_FETCH_TIMEOUT" ||
          error?.status === 429 ||
          Number(error?.status || 0) >= 500;

        if (!retryable || attempt === retries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    all.push(...data);
    if (data.length < perPage) break;
  }

  return all;
}
```

Field WooCommerce yang diminta antara lain:

```text
id, name, permalink, price, regular_price, sale_price,
stock_status, stock_quantity, images, categories, description,
short_description, weight, dimensions, total_sales,
average_rating, rating_count
```

Prinsip grounding:

- Classifier hanya mengatakan “ini pertanyaan stok”.
- Handler mencari produk yang benar.
- WooCommerce menentukan stok dan kuantitas aktual.
- LLM tidak boleh mengisi nilai stok yang hilang.

Pemetaan intent ke sumber kebenaran:

| Kebutuhan | Sumber kebenaran |
| --- | --- |
| Produk, harga, promo, stok, dimensi, deskripsi | WooCommerce REST API |
| Ongkir domestik | Custom WordPress shipping API |
| Status pesanan | WooCommerce order API setelah verifikasi billing |
| Posisi paket | Biteship public tracking API |
| Cara membeli | Halaman WordPress |
| Kebijakan toko | Konfigurasi dan fungsi deterministik repository |
| Session, metric, feedback | Supabase bila dikonfigurasi |

## 14. Pertanyaan majemuk tidak boleh dipotong menjadi satu intent

Contoh:

```text
“Getter Black Version masih ready, harganya berapa, dan bisa COD?”
```

Primary intent mungkin `stock_availability` atau `product_detail`, tetapi kebutuhan sebenarnya terdiri dari:

- identitas produk;
- stok;
- harga;
- kebijakan COD.

`compoundQuestion.js`, `questionUnderstanding.js`, dan `answerCoverage.js` melacak facet tersebut. Intent utama menentukan jalur awal, sedangkan answer plan memastikan kebutuhan tambahan tidak hilang.

**Source aktif:** `ai-vercel/lib/chatbot/answerCoverage.js`.

```javascript
export function detectRequestedAnswerFacets(question = "") {
  const text = normalizeIndonesianCommerceText(question).toLowerCase();
  let facets = Object.entries(FACET_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([facet]) => facet);

  if (extractBudgetRange(text).detected) facets.push("budget");
  return [...new Set(facets)];
}
```

Jika jawaban belum memuat suatu facet, sistem mencoba:

1. mengambil fakta yang masih tersedia;
2. menambahkan bagian jawaban deterministik;
3. meminta klarifikasi spesifik;
4. menandainya unresolved jika memang tidak dapat dijawab.

## 15. Penyusunan dan validasi respons

Finalisasi terpusat berada pada fungsi `send()`.

**Source aktif:** `ai-vercel/api/ask.js`, sekitar baris 1824-2310.

Tanggung jawab `send()`:

- menambahkan planned answer sections;
- menormalisasi gambar dan data produk;
- menyimpan produk terakhir ke session;
- menjalankan humanizer;
- membuat controlled follow-up actions;
- menjalankan naturalizer atau composer bila aktif;
- memeriksa answer coverage;
- menjaga structured payload;
- mencatat observability;
- menyimpan session;
- mengirim response JSON.

Bagian akhir response:

```javascript
return res.json({
  ...finalPayload,
  intent: finalIntent,
  assistant_meta: assistantMeta,
});
```

`assistant_meta` membantu observasi tanpa mengubah data utama. Metadata dapat mencatat:

- sumber intent;
- provider semantic router;
- score/confidence;
- requested/repaired/unresolved facets;
- mode LLM-led;
- status composer dan safety validation.

### 15.1 Peran LLM composer

LLM composer dipakai untuk memperbaiki bahasa, bukan menciptakan fakta. Sebelum hasilnya diterima, sistem membandingkan field terstruktur dan coverage. Field seperti produk, pilihan, metode, langkah, pemenang perbandingan, dan admin handoff tidak boleh berubah semaunya.

Karena itu urutannya adalah:

```text
intent → ambil fakta → bentuk payload deterministik → optional perbaikan bahasa
```

Bukan:

```text
intent → minta LLM mengarang jawaban commerce
```

## 16. Respons dirender oleh frontend

Frontend membaca `data.type`, misalnya:

- `text`;
- `products`;
- `options`;
- `suggestions`;
- `compare`;
- `how_to_buy`;
- response transaksi atau admin handoff.

Teks Markdown diproses lalu disanitasi:

**Source aktif:** `ai-vercel/wordpress-frontend-chatbot/frontend.html`, sekitar baris 750-765.

```javascript
return DOMPurify.sanitize(rawHtml);
```

Sanitasi diperlukan karena response akan dimasukkan ke DOM browser. Structured product card tetap dirender melalui renderer khusus.

## 17. Walkthrough lengkap satu contoh

Pertanyaan:

```text
“Getter Robo Black Version masih ready dan harganya berapa?”
```

### Tahap A — frontend

Frontend membentuk request dengan pertanyaan, session ID, history, dan page context.

### Tahap B — preprocessing

Backend:

- memangkas spasi;
- meredaksi pola PII order jika ada;
- menormalisasi bahasa dan typo;
- membuat linguistic/morphology hint;
- memeriksa apakah pertanyaan merujuk produk sebelumnya atau produk baru.

### Tahap C — hybrid intent

Node mengirim `effectiveQuestion` ke FastAPI:

```json
{
  "question": "getter robo black version masih ready dan harganya berapa"
}
```

Pipeline Joblib mengubah teks ke vektor TF-IDF. Logistic Regression menghasilkan probabilitas per kelas. Misalnya, hanya untuk ilustrasi:

```text
stock_availability  0.72
price_promo         0.19
product_detail      0.06
```

API memilih kelas teratas dan mengembalikan top-3. Node memvalidasi label serta threshold.

### Tahap D — compound analysis

Walaupun intent utama hanya satu, analyzer menemukan facet:

```text
stock
price
```

### Tahap E — semantic fusion

Jika semantic router aktif, hasil semantic dibandingkan dengan hybrid result. Jika semantic confidence rendah, hasil lokal/hybrid dipertahankan. Jika tinggi dan valid, semantic intent dapat menjadi primary route.

### Tahap F — product resolution

Backend mencari `Getter Robo Black Version` dalam katalog WooCommerce. Jika hasil ambigu, bot mengirim pilihan produk dan menyimpan pending clarification. Jika cocok, data produk aktual digunakan.

### Tahap G — grounded answer

Harga dan stok diambil dari objek WooCommerce, bukan dari probabilitas classifier dan bukan dari LLM.

### Tahap H — coverage dan response

Coverage validator memastikan jawaban memuat stok dan harga. Response terstruktur dikirim ke frontend, misalnya secara konseptual:

```json
{
  "type": "products",
  "intro": "Produk yang cocok ditemukan.",
  "products": [
    {
      "id": 123,
      "name": "Getter Robo Black Version",
      "stock": "instock",
      "stockQuantity": 2,
      "numericPrice": 1500000,
      "link": "https://contoh.invalid/product/getter-robo"
    }
  ],
  "intent": "stock_availability",
  "assistant_meta": {
    "router": { "provider": "local_rules_ml" }
  }
}
```

Nilai pada contoh JSON di atas adalah ilustrasi format, bukan data toko.

## 18. Walkthrough fallback ketika ML mati

Kondisi:

- `INTENT_API_URL` tidak diset;
- service Python timeout;
- API memberikan HTTP error;
- response tidak dapat dipakai.

Urutan:

```text
classifyIntentML melempar error
  → catch pada classifyIntentHybrid
  → classifyIntentFromDataset
  → method = fallback_rule_low_confidence
  → chatbot tetap melanjutkan routing
```

Ini adalah graceful degradation: kualitas bisa berubah, tetapi chatbot tidak otomatis berhenti hanya karena ML service terpisah tidak tersedia.

## 19. Model dan hasil evaluasi yang tersedia

Artefak aktif pada `intent-ml-api`:

```text
intent_model_tfidf_logreg_training_3.joblib
intent_tfidf_logreg_final.joblib
intent_tfidf_logreg.joblib
classification_report.csv
result_predictions.csv
confusion_matrix_external_test (1).png
```

`classification_report.csv` mencatat evaluasi eksternal 160 contoh untuk delapan kelas:

| Intent | Precision | Recall | F1 | Support |
| --- | ---: | ---: | ---: | ---: |
| general | 0,882 | 0,750 | 0,811 | 20 |
| price_promo | 0,944 | 0,850 | 0,895 | 20 |
| product_detail | 0,833 | 0,750 | 0,789 | 20 |
| product_discovery | 0,690 | 1,000 | 0,816 | 20 |
| recommendation | 0,895 | 0,850 | 0,872 | 20 |
| return_product | 0,895 | 0,850 | 0,872 | 20 |
| shipping_transaction | 0,818 | 0,900 | 0,857 | 20 |
| stock_availability | 0,889 | 0,800 | 0,842 | 20 |

Ringkasan:

```text
Accuracy       : 0,84375 atau 84,375%
Macro F1       : 0,84427
Weighted F1    : 0,84427
Jumlah contoh  : 160
```

Cara menjelaskan metrik:

- **Precision**: dari semua prediksi sebuah intent, berapa yang benar.
- **Recall**: dari semua contoh aktual sebuah intent, berapa yang berhasil ditemukan.
- **F1-score**: harmonic mean precision dan recall.
- **Support**: jumlah contoh aktual per kelas.
- **Macro average**: rata-rata tiap kelas dengan bobot sama.
- **Weighted average**: rata-rata yang dibobot berdasarkan support.

Keterbatasan laporan:

- Hanya delapan kelas, sedangkan kontrak chatbot saat ini 13 intent.
- Tidak mencakup `greeting`, `shipping_origin`, `compare`, `transaction_status`, dan `shipment_tracking`.
- Tidak ada metadata di report yang mengikatnya secara pasti ke hash artefak `training_3.joblib`.
- Angka 84,375% bukan ukuran akurasi end-to-end jawaban chatbot.

## 20. Tests yang membuktikan hybrid boundary

**Source aktif:** `ai-vercel/tests/intentDecision.test.js`.

Contoh test penerimaan ML:

```javascript
test("accepts a supported high-confidence ML prediction", () => {
  const result = chooseHybridIntent({
    ml: {
      intent: "product_detail",
      confidence: 0.82,
      is_low_confidence: false,
      method: "tfidf_logreg",
    },
    rule: shippingRule,
  });

  assert.equal(result.intent, "product_detail");
  assert.equal(result.method, "tfidf_logreg");
  assert.equal(result.score, 0.82);
});
```

Contoh test fallback:

```javascript
test("uses the rule when ML confidence is below the default threshold", () => {
  const result = chooseHybridIntent({
    ml: {
      intent: "product_detail",
      confidence: 0.414,
      is_low_confidence: true,
    },
    rule: shippingRule,
  });

  assert.equal(result.intent, "shipping_transaction");
  assert.equal(result.ml_confidence, 0.414);
});
```

Regression suite terakhir yang dijalankan saat penyusunan panduan:

```text
tests      362
pass       362
fail       0
duration   sekitar 8,5 detik
```

Test lokal memakai mocks/fallback dan tidak membuktikan semua provider eksternal sedang hidup.

## 21. Panduan live coding

### 21.1 Demo paling aman: jalankan test decision boundary

Dari `ai-vercel`:

```powershell
node --test tests/intentDecision.test.js
```

Yang dapat dijelaskan sambil demo:

1. Buat objek hasil ML dengan confidence rendah.
2. Panggil `chooseHybridIntent`.
3. Tunjukkan rule lokal menang.
4. Naikkan confidence di atas `0.6` dan pastikan label valid.
5. Tunjukkan hasil ML menang.
6. Ganti label menjadi label yang tidak ada dalam `CHATBOT_INTENTS`.
7. Tunjukkan boundary menolak label asing.

### 21.2 Menjalankan Intent ML API lokal

Dari `intent-ml-api`, dengan Python environment yang sesuai:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app:app --reload --port 8000
```

Catatan: instalasi dependency memerlukan jaringan dan versi library saat ini tidak dipin. Untuk demo sidang, siapkan environment lebih awal dan jangan melakukan instalasi pertama kali di depan penguji.

#### 21.2.1 Self-check TF-IDF dan Logistic Regression tanpa menjalankan server

Repository `ai-vercel` menyediakan script:

```text
scripts/test-intent-ml-model.py
```

Script tersebut menguji logic ML secara langsung tanpa membuka port FastAPI. Pemeriksaannya meliputi:

1. object model merupakan scikit-learn `Pipeline`;
2. pipeline memiliki step `tfidf` dan `clf`;
3. tipe step adalah `TfidfVectorizer` dan `LogisticRegression`;
4. TF-IDF menghasilkan sparse matrix yang memiliki fitur aktif;
5. hasil `Pipeline.predict()` sama dengan pemanggilan eksplisit `tfidf.transform()` lalu `classifier.predict()`;
6. hasil `Pipeline.predict_proba()` sama dengan pemanggilan eksplisit classifier;
7. jumlah probabilitas setiap pertanyaan mendekati `1.0`;
8. label, confidence, dan top-3 dapat ditampilkan.

##### Mode A: demo aman yang membuat model kecil di memory

Mode ini tidak membaca file Joblib. Script membuat dataset mini, melatih TF-IDF + Logistic Regression, lalu membuktikan alur transformasi dan prediksi.

Dari folder `ai-vercel`, jika `uv` tersedia:

```powershell
$env:UV_CACHE_DIR = Join-Path $env:TEMP "intent-ml-uv-cache"

uv run `
  --with scikit-learn `
  --with joblib `
  --with numpy `
  python scripts/test-intent-ml-model.py --demo
```

Jika virtual environment Python sudah aktif dan dependency sudah terpasang:

```powershell
python scripts/test-intent-ml-model.py --demo
```

Hasil aktual pengujian lokal pada 2026-09-16:

```text
Mode        : demo aman
Model       : Pipeline dibuat di memory
Pipeline    : Pipeline
TF-IDF      : TfidfVectorizer
Classifier  : LogisticRegression
Vocabulary  : 44 fitur
Matrix      : shape=(3, 44), nonzero=16
Classes     : 3

Question    : stok getter masih ada
Prediction  : stock_availability

Question    : berapa harga mazinger
Prediction  : price_promo

Question    : barang bisa diretur
Prediction  : return_product

PASS: TF-IDF dan Logistic Regression berjalan konsisten.
```

Hasil tersebut membuktikan logic pipeline dan kesetaraan dua jalur berikut:

```text
model.predict(question)

sama dengan

tfidf.transform(question)
  --> LogisticRegression.predict(vector)
```

Mode demo hanya membuktikan mekanisme algoritma dan script pengujian. Mode ini bukan pengukuran akurasi artefak production.

##### Mode B: menguji artefak Joblib aktif

Struktur folder yang diharapkan:

```text
kumpulan-codingan-fadli/
|-- ai-vercel/
|   `-- scripts/test-intent-ml-model.py
`-- intent-ml-api/
    `-- intent_model_tfidf_logreg_training_3.joblib
```

Dari folder `ai-vercel`, jalankan tanpa `--demo`:

```powershell
python scripts/test-intent-ml-model.py
```

Script secara default mencari:

```text
../intent-ml-api/intent_model_tfidf_logreg_training_3.joblib
```

Path juga dapat diberikan secara eksplisit:

```powershell
python scripts/test-intent-ml-model.py `
  "C:\kumpulan-codingan-fadli\intent-ml-api\intent_model_tfidf_logreg_training_3.joblib"
```

Jika memakai `uv`:

```powershell
$env:UV_CACHE_DIR = Join-Path $env:TEMP "intent-ml-uv-cache"

uv run `
  --with scikit-learn `
  --with joblib `
  --with numpy `
  python scripts/test-intent-ml-model.py
```

Output yang dianggap lulus harus berakhir dengan:

```text
PASS: TF-IDF dan Logistic Regression berjalan konsisten.
```

Penting:

- Joblib/Pickle hanya boleh dimuat dari artefak yang dipercaya karena proses deserialisasi dapat menjalankan kode Python.
- Jangan mengunduh dan mengeksekusi file `.joblib` acak dari internet.
- Gunakan versi scikit-learn yang kompatibel dengan versi saat model dilatih. Dependency project saat ini belum dipin, sehingga warning atau incompatibility versi harus dicatat, bukan diabaikan.
- Pengujian artefak aktif belum membuktikan akurasi seluruh intent; script ini memverifikasi struktur dan konsistensi inference. Evaluasi akurasi tetap membutuhkan test set berlabel yang terpisah dari data training.

Pada sesi dokumentasi 2026-09-16, mode demo berhasil dijalankan. Artefak lokal production tidak dapat dijangkau oleh sandbox yang hanya memasang workspace `ai-vercel`, sehingga hasil artefak aktif tidak diklaim lulus sampai perintah Mode B dijalankan pada workspace lokal yang dapat melihat kedua folder.

Health check:

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8000/
```

Prediction:

```powershell
$body = @{ question = "stok getter masih ada" } | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/predict_intent `
  -ContentType "application/json" `
  -Body $body
```

Hal yang harus ditunjukkan:

- `intent`;
- `confidence`;
- `top3`;
- `method=tfidf_logreg`;
- `is_low_confidence`.

### 21.3 Menghubungkan Node ke API lokal

Pada terminal yang menjalankan `ai-vercel`, set URL hanya untuk proses lokal atau gunakan konfigurasi development yang aman:

```powershell
$env:INTENT_API_URL = "http://127.0.0.1:8000/predict_intent"
$env:INTENT_ML_MIN_CONFIDENCE = "0.6"
npx vercel dev
```

Jangan menampilkan isi `.env` pada layar sidang karena dapat mengandung credential WooCommerce, Supabase, atau provider AI.

### 21.4 Request langsung ke chatbot lokal

Sesuaikan port yang dicetak oleh Vercel CLI:

```powershell
$headers = @{ "X-Session-Id" = "sidang-live-demo" }
$body = @{
  question = "Getter Robo Black Version masih ready dan harganya berapa?"
  history = @()
  isSuggestionClick = $false
  isBootstrap = $false
  pageContext = $null
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/ask `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

Jika WooCommerce atau provider eksternal tidak tersedia, pilih demo intent decision test agar demonstrasi tetap deterministik.

### 21.5 Demo TF-IDF minimal di scratch file

Kode berikut untuk menjelaskan konsep, bukan untuk mengganti model production:

```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

texts = [
    "berapa harga getter",
    "ada promo getter",
    "stok getter masih ada",
    "barang bisa diretur",
]
labels = [
    "price_promo",
    "price_promo",
    "stock_availability",
    "return_product",
]

demo = Pipeline([
    ("tfidf", TfidfVectorizer(ngram_range=(1, 2))),
    ("clf", LogisticRegression(max_iter=500)),
])

demo.fit(texts, labels)

question = "stok getter ready"
print(demo.predict([question])[0])
print(demo.predict_proba([question])[0])
print(demo.named_steps["clf"].classes_)
```

Untuk melihat vocabulary dan bobot TF-IDF:

```python
vectorizer = demo.named_steps["tfidf"]
vector = vectorizer.transform([question])

print(vectorizer.get_feature_names_out())
print(vector.toarray())
```

## 22. Urutan file untuk dibuka saat presentasi

Gunakan urutan ini agar cerita live coding tidak meloncat-loncat:

1. `wordpress-frontend-chatbot/frontend.html` — tunjukkan request dibuat.
2. `api/ask.js` — tunjukkan handler, preprocessing, dan `Promise.all`.
3. `lib/chatbot/askLanguage.js` — tunjukkan `classifyIntentHybrid`.
4. `lib/classifyIntentML.js` — tunjukkan HTTP request ke Python.
5. `intent-ml-api/app.py` — tunjukkan model load dan `predict_proba`.
6. `git show 181d6a8:train_model.py` — tunjukkan TF-IDF + Logistic Regression training.
7. `lib/chatbot/intentDecision.js` — tunjukkan confidence boundary.
8. `lib/chatbot/intentFusion.js` — tunjukkan fusion dengan semantic router.
9. `lib/chatbot/wooCatalog.js` — tunjukkan fakta berasal dari WooCommerce.
10. `api/ask.js`, fungsi `send()` — tunjukkan coverage, safety, dan response.
11. `frontend.html` — tunjukkan rendering dan DOMPurify.

## 23. Pertanyaan penguji yang mungkin muncul

### “Kenapa memakai TF-IDF?”

TF-IDF ringan, cepat, cocok untuk dataset teks berlabel dengan vocabulary domain yang cukup khas, mudah dijelaskan, dan biaya inference rendah. Ia juga dapat menjadi fallback ketika LLM tidak tersedia.

### “Kenapa Logistic Regression?”

Logistic Regression bekerja baik untuk sparse high-dimensional features seperti TF-IDF, inference cepat, menyediakan `predict_proba`, dan bobot fiturnya relatif mudah dianalisis.

### “Kenapa bukan hanya keyword?”

Keyword bersifat kaku. TF-IDF + Logistic Regression belajar kombinasi fitur dan bobot dari data, termasuk unigram dan bigram. Namun keyword tetap dipertahankan untuk intent eksplisit dan graceful fallback.

### “Kenapa bukan hanya LLM?”

LLM memiliki latency, quota, dan risiko interpretasi atau generasi fakta yang tidak tepat. Sistem hybrid menjaga layanan tetap tersedia dan mempertahankan deterministic business rules.

### “Apakah confidence 0,8 berarti 80% pasti benar?”

Tidak. Itu adalah probabilitas model untuk kelas teratas berdasarkan pola training. Confidence perlu diuji kalibrasinya dan tetap divalidasi dengan threshold, label contract, rule, serta regression test.

### “Apakah TF-IDF membuat jawaban?”

Tidak. TF-IDF membuat fitur numerik. Logistic Regression memilih intent. Handler kemudian mengambil fakta dan membentuk response.

### “Di mana bukti TF-IDF benar-benar digunakan?”

Pada `train_model.py` historis terdapat `Pipeline` dengan step bernama `tfidf`. Pada source aktif, `app.py` memanggil `model.predict` dan `model.predict_proba` terhadap Pipeline Joblib, serta mengakses step `clf`. Method response juga bernama `tfidf_logreg`.

### “Bagaimana jika model salah?”

Hasil ML hanya diterima bila label didukung dan confidence cukup. Jika tidak, rule lokal dipakai. Setelah itu hasil masih dapat dibandingkan dengan semantic router dan deterministic overrides.

### “Bagaimana chatbot mencegah halusinasi harga atau stok?”

Model hanya menentukan route. Harga dan stok diambil dari WooCommerce. Composer hanya mengubah bahasa dan hasilnya divalidasi agar structured facts tidak berubah.

### “Apakah sistem ini microservices?”

Secara praktis terdapat pemisahan service: Node/Vercel untuk orkestrasi dan Python/FastAPI untuk ML inference. Namun bagian Node masih memiliki orkestrator besar dan bukan kumpulan microservice independen penuh.

### “Apa kekurangan penelitian saat ini?”

Artefak training ketiga belum reproducible, evaluasi tersimpan belum mencakup semua 13 intent, dependency Python belum dipin, dan pengujian end-to-end live masih bergantung layanan eksternal.

### “Apa pengembangan berikutnya yang paling ilmiah?”

Simpan dataset versioned, script training final, random seed, versi dependency, label contract, hash artefak, confusion matrix 13 kelas, calibration metrics, serta benchmark end-to-end pada data pelanggan yang telah dianonimkan.

## 24. Risiko dan technical debt yang relevan untuk sidang

| Temuan | Dampak | Jawaban yang jujur |
| --- | --- | --- |
| Training source model ketiga tidak tersedia | Model aktif sulit direproduksi | Ini batas artefak saat ini dan perlu model manifest/training package. |
| Requirements Python tidak dipin | Deserialisasi Joblib dapat berbeda antarversi | Bekukan versi pada environment reproducible. |
| Laporan hanya delapan kelas | Belum mewakili kontrak 13 intent | Evaluasi ulang semua kelas dengan test set terpisah. |
| Timeout ML 12 detik ikut ditunggu `Promise.all` | Dapat menambah latency turn | Ukur latency dan pertimbangkan deadline lebih pendek/circuit breaker bila terbukti perlu. |
| Detail exception Python dikirim ke client | Dapat membocorkan informasi internal | Produksi sebaiknya mengirim error generik dan mencatat detail server-side. |
| Tidak ada auth/rate limit khusus pada ML API | Potensi abuse bila endpoint publik | Batasi akses sesuai arsitektur deployment. |
| CORS chatbot wildcard | Endpoint dapat dipanggil origin lain | Lakukan threat assessment sebelum hardening. |
| Akurasi intent bukan akurasi jawaban | Klaim penelitian bisa terlalu luas | Pisahkan evaluasi classifier, routing, retrieval, factuality, dan response quality. |

## 25. Checklist sebelum sidang

### Kode dan environment

- Pastikan kedua repository berada pada commit yang sudah diuji.
- Pastikan Python dan Node version diketahui.
- Siapkan virtual environment Python sebelum hari sidang.
- Pastikan file Joblib aktif tersedia.
- Pastikan `INTENT_API_URL` menunjuk ke `/predict_intent`.
- Jangan membuka `.env` di proyektor.
- Siapkan mode demo tanpa provider eksternal.

### Demo

- Jalankan health endpoint FastAPI.
- Jalankan satu prediksi confidence tinggi.
- Jalankan satu pertanyaan ambigu untuk menunjukkan top-3/low-confidence.
- Jalankan `tests/intentDecision.test.js` untuk menunjukkan fallback.
- Tunjukkan satu fakta produk berasal dari WooCommerce, bukan classifier.
- Siapkan screenshot output sebagai cadangan jika jaringan gagal.

### Penjelasan

- Bedakan training dan inference.
- Bedakan intent dan response.
- Bedakan confidence model dan kepastian fakta.
- Jelaskan fungsi threshold.
- Jelaskan mengapa sistem hybrid.
- Akui batas reproducibility model training ketiga.

## 26. Checklist peningkatan reproducibility setelah sidang

Ini bukan syarat menjalankan sistem saat ini, tetapi penting untuk kualitas akademik:

1. Simpan `train_model.py` final yang benar-benar menghasilkan `training_3.joblib`.
2. Simpan dataset dengan versi atau checksum tanpa data sensitif.
3. Simpan daftar label final dan jumlah contoh per kelas.
4. Pin versi Python, scikit-learn, NumPy, pandas, dan Joblib.
5. Simpan seed, split policy, dan preprocessing policy.
6. Simpan classification report dan confusion matrix untuk semua 13 intent.
7. Catat SHA-256 model dalam model manifest.
8. Tambahkan smoke test yang memuat Joblib dan memprediksi contoh tetap.
9. Pisahkan test set dari contoh yang dipakai memperbaiki model.
10. Evaluasi precision, recall, F1, confusion matrix, dan calibration.

Contoh model manifest yang disarankan untuk masa depan:

```json
{
  "model_name": "intent_tfidf_logreg_training_3",
  "algorithm": "TfidfVectorizer + LogisticRegression",
  "dataset_version": "belum tersedia",
  "trained_at": "belum tersedia",
  "python_version": "belum tersedia",
  "scikit_learn_version": "belum tersedia",
  "labels": [],
  "test_metrics": {},
  "artifact_sha256": "belum tersedia"
}
```

## 27. Glosarium

| Istilah | Definisi |
| --- | --- |
| Intent | Kategori tujuan pertanyaan pelanggan. |
| Corpus | Kumpulan dokumen/kalimat yang dianalisis. |
| Token | Unit kata atau potongan teks. |
| Vocabulary | Daftar fitur token/ngram yang dikenal vectorizer. |
| Unigram | Fitur satu token. |
| Bigram | Fitur dua token berurutan. |
| TF | Frekuensi suatu token dalam dokumen. |
| IDF | Bobot kebalikan frekuensi dokumen untuk menekan token terlalu umum. |
| Sparse vector | Vektor yang sebagian besar nilainya nol. |
| Logistic Regression | Model linear probabilistik untuk klasifikasi. |
| Confidence | Probabilitas kelas teratas menurut model. |
| Threshold | Batas minimal agar prediksi diterima. |
| Inference | Penggunaan model terlatih untuk memprediksi input baru. |
| Training | Proses mempelajari vocabulary, IDF, dan bobot classifier. |
| Fallback | Jalur pengganti ketika jalur utama tidak tersedia/tidak dipercaya. |
| Grounding | Mengikat jawaban pada sumber data terverifikasi. |
| Semantic router | LLM yang mengubah pertanyaan menjadi struktur intent/entities/goals. |
| Answer coverage | Pemeriksaan apakah seluruh kebutuhan pertanyaan telah dijawab. |
| Structured payload | Data seperti produk, opsi, action, metode, atau langkah yang dirender khusus. |

## 28. Ringkasan akhir alur

```text
1. Pelanggan mengetik pertanyaan.
2. Frontend mengirim question + history + session + page context.
3. Vercel API memvalidasi dan menormalisasi bahasa.
4. Context resolver memahami follow-up, pending state, dan produk aktif.
5. Node memanggil Intent ML API.
6. Pipeline Joblib mengubah teks menjadi vektor TF-IDF.
7. Logistic Regression menghitung probabilitas setiap intent.
8. FastAPI mengirim intent, confidence, dan top-3.
9. Node menerima ML hanya jika label valid dan confidence cukup.
10. Rule lokal menjadi fallback.
11. Semantic LLM dapat dibandingkan dengan hasil hybrid.
12. Intent final memilih handler dan sumber data.
13. Fakta diambil dari WooCommerce/API terverifikasi.
14. Compound/coverage layer memastikan semua kebutuhan dijawab.
15. LLM hanya boleh memperbaiki bahasa dengan safety validation.
16. Backend mengirim JSON terstruktur.
17. Frontend merender dan menyanitasi respons.
```

Kesimpulan akademik yang aman:

> Sistem menggunakan arsitektur hybrid. TF-IDF mengekstraksi fitur teks dan Logistic Regression mengklasifikasikan intent secara probabilistik. Hasil ML divalidasi menggunakan label contract dan confidence threshold, dilengkapi rule lokal serta semantic router. Intent final kemudian mengarahkan backend ke sumber fakta commerce yang terverifikasi sebelum respons disusun, diperiksa coverage-nya, dan ditampilkan kepada pelanggan.
