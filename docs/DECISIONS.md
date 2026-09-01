# Decision Log

## 2026-09-01 - Repository As Persistent Project Memory

### Status

ACCEPTED

### Decision

Menyimpan aturan, context, baseline, arsitektur, database knowledge, current task, decisions, dan changelog di repository.

### Context

Pengguna meminta penerapan `CODEX_PROJECT_SETUP.md` agar project dapat dilanjutkan lintas session/account tanpa kehilangan progress.

### Reason

Alasan dinyatakan langsung oleh blueprint: chat adalah tempat diskusi, repository adalah memory permanen project.

### Alternatives

Mengandalkan history percakapan saja. Blueprint secara eksplisit menolak alternatif tersebut.

### Consequences

- Pekerjaan besar wajib memperbarui dokumentasi relevan.
- Agent berikutnya wajib membaca memory sebelum perubahan substansial.
- Status stabil dan ketidakpastian harus ditulis eksplisit.

## 2026-09-01 - Confirm Progress Without Regression As Permanent Rule

### Status

ACCEPTED

### Decision

Perilaku yang sudah benar menjadi baseline terlindungi. Fitur baru/refactor harus menjalani impact analysis, regression test, dan documentation update.

### Context

`rule.txt`, blueprint, dan rangkaian regression fixes menunjukkan kebutuhan mencegah bug lama muncul kembali.

### Reason

Prinsip ini dinyatakan eksplisit oleh pengguna dan `CODEX_PROJECT_SETUP.md`.

### Alternatives

Refactor bebas berdasarkan preferensi implementasi. Alternatif ini ditolak oleh pedoman project.

### Consequences

- Bug fix perlu regression test.
- Fitur stabil tidak boleh dirombak tanpa alasan.
- Shadow migration dipertahankan untuk perubahan LLM besar.

## 2026-08-24 - LLM-Led Understanding With Grounded Tools

### Status

ACCEPTED

### Decision

LLM menjadi penentu semantic understanding untuk pertanyaan nontrivial pada mode yang diaktifkan. Local rules tetap guard/fallback. Fakta commerce tetap berasal dari tool/data terverifikasi.

### Context

Keputusan terverifikasi oleh commit `2c267cf` (`membuat agar LLM menjadi penentu`) dan implementasi `LLM_LED_ASSISTANT_MODE`, semantic router, intent lock, dan tool plan.

### Reason

Source dan test menunjukkan target response yang lebih natural tanpa melepaskan validasi fakta dan structured payload.

### Alternatives

- `legacy`: local/deterministic routing utama.
- `shadow`: LLM dievaluasi tanpa disajikan.

Keduanya tetap tersedia sebagai mode operasi/fallback.

### Consequences

- Mode active hanya boleh menyajikan candidate yang lolos safety/coverage.
- Provider failure harus turun ke fallback/local rules.
- Benchmark shadow tetap dibutuhkan sebelum aktivasi perubahan besar.

## 2026-08-22 - Multi-Provider Model Failover

### Status

ACCEPTED

### Decision

Membagi provider/model berdasarkan fungsi dan menyediakan fallback saat model limit atau gagal.

### Context

Commit `88126da` mencatat pembagian model ketika limit; commit `6c8f913` dan `305f287` menambahkan Cloudflare. Source saat ini memakai Groq, Gemini, Mistral, dan Cloudflare sesuai kemampuan text/vision.

### Reason

Provider memiliki quota, rate limit, timeout, serta kemampuan text/vision yang berbeda. Implementasi cooldown/deadline membuktikan kebutuhan tersebut.

### Alternatives

Satu provider/model untuk semua tugas. Source lama tidak dipilih sebagai arsitektur aktif saat ini.

### Consequences

- Konfigurasi environment bertambah.
- Latency dan quota harus dipantau.
- Semua provider tetap tunduk pada grounded-fact validator.

## 2026-08-22 - Visual Index And Provider-Independent Rerank

### Status

ACCEPTED

### Decision

Image search memakai katalog visual index, candidate pool, multi-provider analysis, dan rerank yang tidak mengikat hasil akhir pada satu provider.

### Context

Serangkaian commit `4d6e852`, `1cf9030`, `14b5bd9`, `5570466`, serta implementation `visualIndex.js`, `imageCandidatePool.js`, `imageBenchmark.js`, dan `ask-image.js`.

### Reason

Kualitas tebak gambar harus dinilai terhadap seluruh kandidat katalog dan provider availability, bukan nama file atau satu jawaban vision.

### Alternatives

Mencari produk hanya dari keyword hasil satu model vision. Pipeline saat ini mempertahankannya hanya sebagai salah satu signal, bukan keputusan tunggal.

### Consequences

- Visual index perlu rebuild dan benchmark dataset.
- Production readiness tunduk pada gate accuracy, false-confidence, success rate, dan latency.
- Quota vision perlu dikelola dengan checkpoint/cooldown.

