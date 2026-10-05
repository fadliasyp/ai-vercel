# Current Task

## Status

Belum ada task aktif. Hardening bahasa sehari-hari pada rekomendasi selesai lokal dan menunggu deployment serta smoke production terarah.

## Current Progress

- Menambahkan matriks regression berbasis data untuk variasi rekomendasi sehari-hari: `rekomen`, `pilihin`, `mnurut lu`, `pengen`, `jtan/jtaan`, `sd`, nominal dengan spasi, tujuan pajangan/kado/koleksi, dan syarat ready stock.
- Normalisasi harga bersama kini memahami unit informal serta typo ringan tanpa mengubah model number menjadi nominal.
- Intent rekomendasi mempertahankan stok dan tujuan penggunaan sebagai constraint. Kalimat `yang ready dan paling cocok buat display yang mana?` tidak lagi turun menjadi cek stok saja.
- Follow-up singkat `klo yg 4jtan ada gak?` dan `kl yg 6 jtaan aja` tetap mewarisi goal rekomendasi, sedangkan contoh harga/stok non-rekomendasi tetap dilindungi oleh inverse tests.
- Log production membuktikan Groq dapat mengklasifikasikan `sekitar 7 jutaan` sebagai maksimum. Grounding lokal kini mengoreksi konflik tersebut menjadi target Rp7 juta sebelum filter/ranking berjalan.
- Resolver konteks tidak lagi menambahkan awalan `rekomendasi robot budget` pada pertanyaan rekomendasi baru yang sudah lengkap hanya karena goal sebelumnya juga rekomendasi.
- Regression endpoint memakai pertanyaan dan kesalahan semantic persis dari log production; hanya fixture Rp6,25-Rp7 juta yang lolos, sedangkan Rp3 juta dan Rp650 ribu ditolak.
- Verifikasi akhir: 399/399 test lulus, coverage replay 9/9 turn, dan benchmark pelanggan 26/26 turn (135 assertion, 100%).
- Memperbaiki pesan rekomendasi yang memuat rentang lama lalu alternatif baru, misalnya `Cari robot antara 5 sampe 8 juta buat pajangan. Kalau yang 3 jutaan ada?`.
- Structured LLM prompt kini mewajibkan constraint harga eksplisit paling akhir menggantikan constraint lama sambil mempertahankan tujuan seperti `pajangan`.
- Validator grounding membedakan target `kalau yang 3 jutaan` dari batas `maksimal/budget 3 juta`, sehingga produk Rp650 ribu atau Rp1,5 juta tidak lolos sebagai rekomendasi Rp3 jutaan.
- Regression mencakup parser, ranking, dan endpoint dengan output LLM yang sengaja disimulasikan salah sebagai `maximum`; verifikasi lulus 393/393 test, coverage replay 9/9, dan benchmark pelanggan 26/26.
- `benchmark:context` lokal tidak dapat menjadi bukti pada sesi ini karena fetch WooCommerce eksternal gagal; kegagalannya berupa respons server sibuk/data produk, bukan kegagalan assertion harga.
- Semantic router kini menghasilkan `recommendation_request` terstruktur untuk mode harga, target/batas, tujuan penggunaan, stok, kondisi, dan promo.
- Jalur rekomendasi utama memakai hasil tersebut secara langsung; parser lokal tetap menjadi fallback saat provider tidak tersedia atau output LLM gagal validasi.
- Nominal LLM divalidasi terhadap pesan pelanggan. Nilai dari goal lama hanya dapat diwarisi pada relasi `follow_up`/`clarification_answer`, sehingga topik baru tidak tercemar konteks lama.
- Goal percakapan menyimpan target harga, mode harga, dan tujuan rekomendasi untuk turn lanjutan.
- Fallback lokal memperbaiki negasi `jangan lebih dari 6 juta` sebagai batas maksimum dan rentang `di atas 6 juta tapi jangan lebih dari 8 juta`.
- Regression endpoint membuktikan `Modal gue 10 jutaan, enaknya ambil robot apa?` hanya menghasilkan fixture Rp10 juta.
- Memperbaiki laporan production `Cari robot antara 5 sampai 8 juta buat pajangan dong`: LLM sudah benar, tetapi guard produk lokal salah menganggap kata rentang `antara`/`sampai` sebagai nama produk.
- Guard rekomendasi kini memakai `entities.product_names` dari semantic understanding tepercaya untuk membedakan rekomendasi generik dan permintaan produk eksplisit; fallback lokal juga mengabaikan kata constraint harga.
- Regression kebalikan memastikan nama produk eksplisit yang benar-benar tidak ada tetap ditolak dan tidak diganti produk lain.
- Verifikasi tahap ini: 391/391 test, coverage replay 9/9 turn, dan benchmark pelanggan 26/26 turn lulus.
- Frasa rekomendasi seperti `harga 7 jutaan` dan `harga sekitar 7 juta` sekarang menjadi target harga, bukan batas maksimum generik.
- Frasa tanpa kata `harga`, termasuk laporan persis `rekomen cok robot 19 jutaan`, sekarang menjadi target harga selama intent rekomendasi disebut eksplisit.
- Target harga memakai filter toleransi 20%; jika tidak ada kandidat dekat, sistem tidak lagi kembali ke produk murah yang tidak relevan.
- Follow-up `yg 3 jutaan` setelah rekomendasi kini dilengkapi dari goal aktif menjadi permintaan rekomendasi target Rp3 juta sebelum local/LLM routing.
- Follow-up nominal tanpa `yang/yg`, misalnya `3 juta`, tetap menjadi batas budget; pertanyaan intent baru seperti `kapan restock ya` tidak ditulis ulang.
- Regression target awal dan dua turn lulus, seluruh suite lulus 386/386, dan coverage replay lulus 9/9 turn.
- Follow-up `yang kedua stoknya berapa?` kini mempertahankan produk kedua dan memakai intent stok, bukan harga/promo.
- Follow-up atribut `stoknya`, `harganya`, `kondisinya`, dan `bahannya` kini menggunakan produk fokus terakhir tanpa menimpa nama produk baru atau produk halaman.
- Mode `npm run benchmark:context` menyediakan enam gate multi-turn untuk refinement, referensi produk, topic switch, dan pending interruption.
- Verifikasi tahap ini: 384/384 test, benchmark pelanggan 26/26, dan coverage replay 9/9 lulus.
- Kandidat di sekitar target (toleransi 20%) diprioritaskan; sinyal promo/penjualan tidak lagi dapat memenangkan produk yang jauh dari target bila kandidat dekat tersedia.
- Frasa budget eksplisit dan rentang tetap memakai filter keras lama.
- Regression endpoint membuktikan target Rp7 juta dan Rp4 juta menghasilkan kelompok produk berbeda.
- Seluruh regression suite lulus 382/382 dan coverage replay lulus 9/9 turn.
- Tahap 1 selesai secara lokal: migrasi Groq Qwen dari `qwen/qwen3.6-27b` ke `qwen/qwen3.8-27b`.
- Default fallback source, konfigurasi `.env` lokal, dan regression fixture sudah diperbarui.
- Smoke test naturalizer aktual berhasil memakai `qwen/qwen3.8-27b` dengan status `success`.
- Audit 2026-09-15 pernah menemukan `gemini-2.5-flash-lite` pada daftar akun, tetapi bukti runtime production terbaru 2026-09-30 mengembalikan HTTP 404 unavailable untuk project ini; model tersebut kini dikeluarkan dari pool default.
- Tahap 3 selesai secara lokal: parser Cloudflare menerima `result.response` berbentuk object; smoke test dengan prompt image chatbot aktual berhasil.
- Label dashboard "Gemini 3 Flash" terdaftar oleh API dengan ID `gemini-3-flash-preview`; ID tersebut dikembalikan ke fallback bersama `gemini-3.5-flash`.
- Tahap 4 selesai secara lokal: Mistral memakai `ministral-8b-2512` dengan fallback `ministral-3b-2512` untuk text dan vision.
- Live structured-text smoke berhasil pada 8B; live vision smoke menghasilkan JSON lengkap dalam 238 completion token.
- Prompt analisis gambar membatasi setiap array maksimal 5 item agar output tidak terpotong dan konsumsi token lebih terkendali.
- Seluruh regression suite lulus 365/365 dan coverage replay terakhir lulus 9/9 turn.
- Environment Vercel sudah disesuaikan dan deployment production sudah dilakukan oleh pengguna.
- Smoke production text berhasil: router `openai/gpt-oss-20b`, composer `qwen/qwen3.8-27b`, `active_accepted`, dan validasi fakta/struktur lulus.
- Smoke production image berhasil: Gemini `gemini-2.5-flash` memproses gambar tanpa provider fallback atau error.
- Audit `models.list` 2026-09-15 pernah menampilkan enam ID text-output, tetapi hasil panggilan runtime terbaru menjadi bukti yang mengalahkan daftar tersebut untuk `gemini-2.5-flash-lite`.
- Regression suite setelah sinkronisasi fallback Gemini lulus 365/365.
- Panduan teknis tahap 8 diperluas untuk menjelaskan tujuan `INTENT_API_URL`, batas proses Node/Python, lokasi inference TF-IDF + Logistic Regression, kontrak request/response, fallback, dan demo lokal.
- Subbagian 8.4 kini menjelaskan bagaimana `joblib.load()`, `named_steps["tfidf"]`, `named_steps["clf"]`, `predict()`, dan `predict_proba()` menjalankan TF-IDF serta Logistic Regression.
- Script `scripts/test-intent-ml-model.py` ditambahkan; mode demo aman lulus dan panduan menjelaskan cara menguji artefak Joblib lokal yang tepercaya.
- Log production menunjukkan respons rekomendasi sekitar 3.100 karakter berulang kali memicu Groq `failed_generation`, sementara jawaban faktual asli tetap lengkap dan berhasil dikirim.
- Naturalizer kini melewati respons di atas 2.400 karakter agar tidak membuang request/token pada output yang berisiko melewati batas 850 completion token; `failed_generation` juga dicatat terpisah dan dapat memakai model Groq cadangan yang memang dikonfigurasi.
- Regression suite setelah perbaikan naturalizer lulus 367/367 dan coverage replay lulus 9/9 turn.
- Pertanyaan buy-one-get-one kini dikenali terpisah dari diskon katalog, termasuk variasi `beli barang1 gratis 1`, `buy 1 get 1`, dan `beli satu dapat satu gratis`.
- Guard berjalan sebelum katalog/pending handler, mengalahkan semantic intent lock `price_promo`, tidak menampilkan produk diskon, dan mengirim jawaban belum terverifikasi beserta `admin_handoff`.
- Regression suite setelah perbaikan promo bersyarat lulus 368/368 dan coverage replay lulus 9/9 turn.
- Parser budget kini menormalkan kata informal `sampe` menjadi `sampai`, sehingga permintaan hadiah dengan rentang seperti `3 juta sampe 6 jutaan` tidak lagi meminta budget ulang.
- Regression end-to-end memastikan permintaan tersebut menghasilkan produk ready non-JUNK pada rentang Rp3.000.000-Rp6.000.000 tanpa melonggarkan filter hadiah.
- Regression suite setelah perbaikan rentang informal tetap lulus 368/368 dan coverage replay lulus 9/9 turn.
- Audit production membuktikan budget Rp4-Rp12 juta dan tujuan `gift` sudah terbaca, tetapi semua kandidat live dibuang karena deskripsi positif seperti `bukan barang JUNK` dianggap JUNK oleh pencocokan kata mentah.
- Deteksi kelayakan hadiah kini menghapus frasa JUNK yang dinegasikan sebelum mencari kondisi JUNK aktual; `kondisi JUNK`, `rongsok`, dan `part only` yang tidak dinegasikan tetap ditolak.
- Validasi read-only terhadap 100 produk katalog publik menemukan 18 produk pada rentang Rp4-Rp12 juta dan 17 kandidat ready yang lolos filter hadiah setelah perbaikan.
- Regression suite setelah perbaikan negasi kondisi lulus 369/369 dan coverage replay tetap lulus 9/9 turn.
- Frasa `dengan produk lain` kini diperlakukan sebagai permintaan nama produk kedua, bukan nama produk literal.
- Produk pertama disimpan dalam session dan state `compare_second`; jawaban lanjutan seperti `bandingkan dengan robot [Produk B]` dibersihkan lalu digabungkan menjadi perbandingan lengkap.
- State compare kedua dilindungi hanya pada intent compare, sehingga pertanyaan eksplisit dengan intent lain tetap dapat mengganti topik.
- Regression routing dua turn lulus; seluruh suite tetap 369/369 dan coverage replay tetap 9/9 turn.
- Metadata WPC Product Timer `woopt_actions` sekarang dibaca dari katalog WooCommerce dan dinormalisasi tanpa mengirim raw action ke LLM.
- Pertanyaan umum restock menampilkan semua jadwal mendatang; pertanyaan spesifik hanya menjawab produk yang cocok.
- Timer lampau, aksi selain `set_instock`, role non-storefront, tanggal invalid, dan kondisi waktu yang belum dapat dihitung pasti tidak dijadikan fakta restock.
- Produk tanpa jadwal terverifikasi mendapat admin handoff, bukan tanggal perkiraan.
- Audit read-only live berhasil membaca jadwal produk ID 4994 sebagai `30 September 2026 pukul 10.24 WIB`.
- Regression suite lulus 373/373 dan coverage replay tetap lulus 9/9 turn.
- Deteksi restock umum kini mengabaikan filler percakapan seperti `sih`, `udah`, `nunggu`, `lama`, `nih`, `barang`, dan `emang`, tanpa mengubah pencarian nama produk eksplisit.
- Dua laporan pengguna persis sudah menjadi regression endpoint; suite tetap lulus 373/373 dan coverage replay 9/9 turn.
- Audit log memastikan error yang dilaporkan berasal dari sapaan `halo` yang tidak perlu memasuki answer composer: Groq mencapai TPD, Gemini sedang cooldown, lalu kandidat Mistral ditolak safety validator sementara template tetap terkirim.
- Intent `greeting` kini berhenti di template sebelum panggilan Groq, Gemini, atau Mistral; intent lain tetap memakai urutan composer dan fallback yang lama.
- Regression baru membuktikan ketiga provider dipanggil nol kali untuk sapaan; seluruh suite lulus 374/374 dan coverage replay tetap 9/9 turn.
- Kalimat persis `Dari kemarin nunggu kapan restock sih` sebelumnya menyisakan token `dari` dan `kemarin`, sehingga salah dianggap sebagai pencarian produk spesifik meskipun semantic router menyatakan tidak ada nama produk.
- Filler restock kini mengenali frasa waktu tersebut; regression endpoint mengembalikan semua produk terjadwal dan tetap menjaga pertanyaan dengan nama produk sebagai jalur spesifik.
- Jawaban restock kini melewati Groq/Gemini/Mistral answer composer karena faktanya sudah final dari WooCommerce. Error naturalizer pada log yang dilampirkan tidak lagi dipicu oleh pertanyaan restock.
- `gemini-2.5-flash-lite` dihapus dari semua pool default setelah production API mengembalikan 404. Jika ID itu masih ada pada `GEMINI_*_MODEL(S)` di Vercel, override tersebut harus dibersihkan sebelum redeploy.
- Seluruh suite lulus 375/375 dan coverage replay tetap 9/9 turn.
- Audit Supabase pada 2026-09-30 menemukan 3.386 request, terdiri dari 3.372 greeting dan 3.360 session unik; detail Vercel mengidentifikasi User-Agent `meta-externalagent/1.1` sebagai sumber burst.
- Guard `/api/ask` kini mengembalikan HTTP 204 khusus untuk `meta-externalagent` sebelum session, Supabase, intent ML, katalog, atau provider LLM dijalankan. Browser pelanggan biasa tidak diblokir.
- Regression baru membuktikan crawler diblokir dan Chrome biasa tetap menerima greeting HTTP 200; seluruh suite lulus 376/376.
- Smoke production setelah deployment: `meta-externalagent/1.1` mendapat HTTP 403 dari WAF sebelum Function, sedangkan Chrome biasa mendapat HTTP 200 dengan `provider: template` dan `reason: deterministic_intent`.
- Audit log pertanyaan `Dari kemarin nunggu kapan restock sih` membuktikan intent restock berhasil (`stock_availability`, confidence 0.95); kegagalan terjadi setelahnya saat request katalog WooCommerce berakhir dengan `TypeError: fetch failed` sebelum status HTTP diterima.
- Kegagalan transport `fetch failed` dan kode jaringan sementara seperti `UND_ERR_CONNECT_TIMEOUT`, `ECONNRESET`, serta `EAI_AGAIN` kini memakai retry katalog yang sebelumnya hanya berlaku untuk timeout aplikasi, HTTP 429, dan HTTP 5xx.
- HTTP 4xx non-transient seperti 401 tetap tidak di-retry. Log WooCommerce sekarang mencatat kode transport tanpa mencetak credential.
- Regression fokus dan seluruh suite lulus 378/378.
- Default text pool Google kini menambahkan `gemini-3.8-flash`, `gemini-3.7-flash`, dan `gemma-4-26b-a4b-it`; pool vision, batas tiga percobaan, cooldown, dan fallback provider lain tidak diubah.
- Gemini 3.7/3.8 membuang sampling parameter lama dan memakai thinking rendah. Gemma 4 memakai thinking minimal serta output JSON berbasis prompt yang tetap melewati parser/validator lokal.
- Live smoke adapter berhasil menghasilkan JSON valid pada ketiga model aktif tersebut.
- `gemma-4-31b-it` tidak diaktifkan default: dua constrained smoke menghasilkan HTTP 500, sedangkan probe yang berhasil memerlukan sekitar 115 detik dan melewati batas fungsi Vercel 90 detik.
- Regression provider dan seluruh suite lulus 380/380; coverage replay tetap lulus 9/9 turn.
- Panduan teknis kini memiliki alur linear 21 langkah dari input browser sampai renderer, lengkap dengan potongan source dan nomor baris aktif.
- Dokumentasi Intent ML diselaraskan dengan artefak production `training_13`: FeatureUnion TF-IDF kata/karakter, Logistic Regression, metadata/checksum, 13 intent, dan test API aktif.

## Active Task

- Belum ada task aktif; hardening rekomendasi bahasa sehari-hari siap di-deploy dan diuji dengan smoke production terarah.

## Last Completed Task

- Task: hardening pemahaman bahasa sehari-hari untuk rekomendasi LLM-first yang tetap data-grounded.
- Tanggal selesai: 2026-10-06.
- Goal: mencegah slang, singkatan, typo harga, tujuan penggunaan, dan syarat stok mengubah intent atau constraint rekomendasi.

## Completed

- Menambahkan `tests/recommendationLanguageMatrix.test.js` agar variasi bahasa dan kasus kebalikannya diuji otomatis oleh `npm test`.
- Memusatkan normalisasi nominal informal pada parser harga bersama dan menyelaraskan explicit intent fallback dengan kontrak semantic router.
- Menjaga LLM sebagai pemahaman utama pada mode aktif, dengan parser/validator lokal sebagai grounding dan fallback yang tidak boleh membelokkan intent tepercaya.
- Memperbaiki follow-up sehari-hari `Kalau yang 6 jutaan ada apa aja?` agar tetap mewarisi intent rekomendasi dan memakai Rp6 juta sebagai target harga.
- Mempertahankan variasi lama `yg 3 jutaan dong` serta bentuk budget eksplisit, dan mengganti kasus benchmark konteks agar memakai bentuk percakapan alami.
- Memperbaiki kalimat alami `budget sekitar 12 jutaan` agar Rp12 juta menjadi target rekomendasi sekaligus batas maksimum, bukan plafon longgar yang memenangkan produk jauh lebih murah.
- Menambahkan regression parser/ranking dan endpoint untuk kalimat persis laporan pengguna; `budget maksimal`, batas bawah/atas, dan rentang harga tetap memakai perilaku lama.
- Mengoreksi dua kasus `benchmark:context` yang memakai nama fixture lokal `Action Toys Ideon`; keduanya kini memakai nama katalog production `Soul of Chogokin GX-92 Ideon Full Action`.
- Menambahkan `optionNames` pada laporan smoke agar kandidat klarifikasi yang salah atau ambigu langsung terlihat.
- Memastikan hasil lama pada kasus pending ongkir sebenarnya sudah berpindah ke intent stok dan relasi `new_topic`; kegagalan berasal dari ekspektasi produk benchmark, bukan karena chatbot masih menunggu kecamatan.
- Membuat `docs/PANDUAN_TEKNIS_INTENT_ML_DAN_ALUR_CHATBOT.md`.
- Mendokumentasikan pipeline training historis TF-IDF + Logistic Regression dan inference model aktif.
- Mendokumentasikan request frontend, normalisasi, hybrid decision, semantic fusion, commerce grounding, coverage, response, dan renderer.
- Menambahkan panduan live coding, pertanyaan penguji, limitation, dan checklist reproducibility.
- Memverifikasi ulang 380 unit/regression tests tetap lulus tanpa perubahan source produksi.
- Menambahkan normalisasi `sampe` pada parser budget bersama.
- Menambahkan regression parser dan end-to-end untuk pertanyaan persis dari laporan pengguna.
- Membuat deteksi kondisi JUNK peka terhadap negasi pada metadata rekomendasi.
- Menambahkan regression untuk frasa negasi katalog dan kondisi JUNK aktual.
- Menambahkan state dan regression dua turn untuk `bandingkan [Produk A] dengan produk lain`, diikuti nama Produk B.
- Menambahkan parser jadwal WPC Product Timer, integrasi routing stok, fallback admin, dan regression test umum/spesifik/tanpa jadwal.
- Menambahkan composer guard dan regression test nol-panggilan-provider untuk intent `greeting`.
- Menambahkan `dari` dan `kemarin` sebagai filler terbatas pada klasifikasi restock umum.
- Menambahkan regression parser, endpoint, dan nol-panggilan-composer untuk kalimat persis laporan pengguna.
- Menghapus `gemini-2.5-flash-lite` dari pool default berdasarkan bukti 404 production.
- Menambahkan guard HTTP 204 untuk `meta-externalagent` dan regression yang mempertahankan respons browser pelanggan normal.

## Findings

- Akar pola bug berulang adalah perbedaan kosakata antara semantic prompt, explicit intent fallback, parser harga, dan resolver follow-up. Satu kalimat dapat dipahami LLM tetapi berubah pada tahap lokal berikutnya.
- Matriks baru menguji keluarga bahasa, bukan hanya kalimat laporan. Stok pada permintaan pemilihan produk sekarang diperlakukan sebagai constraint rekomendasi, bukan intent utama.
- Pada laporan `sekitar 7 jutaan`, semantic prompt sebenarnya sudah benar tetapi Groq tetap menghasilkan mode `maximum`; validator lama hanya memeriksa bahwa angka Rp7 juta grounded, bukan bahwa makna `maximum` benar. Konflik mode kini dikoreksi dari teks eksplisit sebelum ranking.
- Resolver sebelumnya hanya mengenali follow-up yang seluruh pesannya berbentuk `yang/yg + nominal`; pembuka `kalau` dan penutup `ada apa aja` membuat konteks rekomendasi terlepas lalu intent jatuh ke `price_promo`.
- Setelah perbaikan, sequence dua turn laporan menghasilkan intent `recommendation`, target Rp6 juta, dan hanya produk fixture Rp4,8-Rp7,2 juta; seluruh suite tetap lulus 385/385 dan coverage replay 9/9.
- Akar laporan rekomendasi Rp12 juta adalah `extractRecommendationNeeds`: parser umum menemukan `budgetMax`, tetapi `targetPrice` sebelumnya hanya dibuat jika pelanggan memakai kata `harga`.
- Setelah perbaikan, kalimat laporan menghasilkan `targetPrice: 12000000` dan `budgetMax: 12000000`; regression endpoint hanya mengembalikan produk fixture pada Rp9,6-Rp12 juta.
- Seluruh suite lulus 385/385 dan coverage replay lulus 9/9 turn.
- Respons lama `cek ongkir ke Tangerang -> Action Toys Ideon masih ready?` sudah berhasil memutus pending ongkir: intent akhir `stock_availability` dan relasi LLM `new_topic`.
- Katalog production tidak memiliki nama exact `Action Toys Ideon`; query tersebut menghasilkan tiga opsi yang hanya cocok pada `Action Toys`. Nama Ideon production yang terverifikasi adalah `Soul of Chogokin GX-92 Ideon Full Action`.
- Setelah koreksi benchmark, verifikasi lokal lulus 384/384 test, coverage replay 9/9 turn, dan `node --check scripts/smoke-ask.js`.
- Benchmark konteks terhadap endpoint production lulus 6/6 kasus, termasuk pergantian produk eksplisit dan pertanyaan produk baru ketika klarifikasi ongkir masih pending.
- Runtime Intent ML aktif memakai `intent_model_tfidf_logreg_training_13.joblib` dan metadata terverifikasi.
- Notebook, script pembangun notebook, dataset training/hard test, kontrak label, checksum, dan dependency model 13 intent tersedia di repository `intent-ml-api`.
- Metadata model mencakup evaluasi 13 intent; metrik classifier tetap tidak mewakili kualitas chatbot end-to-end.
- Intent ML adalah classifier/routing signal; fakta commerce tetap berasal dari WooCommerce dan API terverifikasi.
- Timer per produk tersedia melalui Woo REST `meta_data`; Global Timer tersimpan sebagai option WordPress dan belum tercakup endpoint katalog.

## Files Modified

- `lib/chatbot/intentFusion.js`
- `lib/chatbot/textNormalization.js`
- `lib/chatbot/semanticRouter.js`
- `tests/recommendationLanguageMatrix.test.js`
- `tests/semanticRouter.test.js`
- `benchmarks/customer-conversations.json`
- `benchmarks/results/customer-conversations.json`
- `lib/chatbot/conversationGoal.js`
- `tests/conversationGoal.test.js`
- `lib/chatbot/productRecommendation.js`
- `tests/productRecommendationReasoning.test.js`
- `tests/askRouting.test.js`
- `scripts/smoke-ask.js`
- `lib/chatbot/conversationGoal.js`
- `tests/conversationGoal.test.js`
- `lib/chatbot/productRecommendation.js`
- `tests/productRecommendationReasoning.test.js`
- `README.md`
- `docs/PANDUAN_TEKNIS_INTENT_ML_DAN_ALUR_CHATBOT.md`
- `lib/chatbot/gemini.js`
- `tests/geminiFallback.test.js`
- `lib/chatbot/responseNaturalizer.js`
- `tests/responseNaturalizer.test.js`
- `api/ask.js`
- `lib/chatbot/storePolicy.js`
- `tests/askRouting.test.js`
- `tests/storePolicy.test.js`
- `lib/chatbot/priceIntent.js`
- `tests/priceIntent.test.js`
- `lib/chatbot/recommendationMetadata.js`
- `tests/recommendationMetadata.test.js`
- `lib/chatbot/restockSchedule.js`
- `tests/restockSchedule.test.js`
- `lib/chatbot/llmAssistant.js`
- `tests/llmAssistant.test.js`
- `tests/crawlerRequestGuard.test.js`
- `lib/chatbot/wooCatalog.js`
- `lib/chatbot/wpApi.js`
- `tests/wooCatalog.test.js`
- `scripts/test-intent-ml-model.py`
- `docs/FEATURE_BASELINE.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/CURRENT_TASK.md`
- `docs/CHANGELOG.md`

## Next Steps

1. Deploy perubahan source ke Vercel.
2. Jalankan smoke production terarah untuk rekomendasi target, rentang, dan follow-up singkat; pengujian variasi bahasa selebihnya sudah ditanggung matriks otomatis.
3. Pantau metadata intent/provider, latency, HTTP 429/5xx, dan konsumsi quota sebelum uji pengguna ramai.

## Blockers

- `mistral-small-latest` tetap HTTP 429 pada akun ini, tetapi tidak lagi menjadi model aktif lokal karena diganti dengan Ministral 8B dan 3B yang sudah lulus live smoke.
- `gemma-4-31b-it` tersedia pada akun, tetapi belum layak menjadi default karena latency live sekitar 115 detik pada respons yang berhasil.
- Hard test model aktif masih terbatas 104 contoh dan calibration metric belum tersedia.

## Notes For Next Session

- Panduan membedakan bukti source aktif, riwayat Git, dan penjelasan konsep; pertahankan perbedaan tersebut saat model diperbarui.
- Jangan menyatakan metrik classifier 13 intent sebagai akurasi jawaban chatbot end-to-end.
- Deployment 2026-09-15 telah diverifikasi melalui satu smoke text dan satu smoke image, tetapi dibuat sebelum sinkronisasi pool Gemini terbaru; fallback production Mistral/Cloudflare belum dipaksa karena primary provider berhasil.

