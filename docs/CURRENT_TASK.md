# Current Task

## Status

Belum ada task aktif. Seluruh tahap Prioritas 1 kini sudah diperkuat sampai Perbandingan Produk tanpa mengubah baseline yang stabil. Ketersediaan Stok dan overview katalog telah dikonfirmasi lulus 5/5 di production; patch Perbandingan Produk sudah lulus verifikasi lokal dan menunggu deploy/smoke production.

## Current Progress

- Intent `compare` kini memiliki goal terstruktur `comparison`. Prompt mewajibkan tepat dua `product_names` sesuai urutan penyebutan dan `requires_product: true`, termasuk bahasa santai seperti `A sama B enakan mana`.
- Handler compare memakai dua nama LLM yang sudah grounded sebagai input utama, kemudian tetap mencocokkannya ke produk WooCommerce. Regex lama dipertahankan sebagai fallback ketika provider gagal, limit, atau tidak menghasilkan dua entitas tepercaya.
- Regression active-LLM memakai kalimat natural yang tidak dapat dipecah aman oleh regex lama dan membuktikan dua produk yang benar dipilih serta kelebihan/kekurangan tetap berasal dari deskripsi fixture WooCommerce.
- Verifikasi Compare: full suite lulus, coverage replay 9/9, serta benchmark pelanggan 26/26 turn dengan 135 assertion (100%).
- Pengguna mengonfirmasi lima smoke production Ketersediaan Stok dan overview katalog berjalan baik.
- Log production berikutnya menunjukkan Groq terkena 429, tetapi fallback Gemini sudah benar memilih `product_discovery`, goal `product_search`, `product_names: []`, dan `requires_product: false` untuk `brang apa saja yang dijual?`. Handler lama tetap mencari kata `brang` sebagai nama produk karena keputusan LLM tanpa objek belum dihubungkan ke overview katalog.
- Typo `brang` kini dinormalisasi menjadi `barang`. Structured understanding `product_search` tanpa nama produk juga membuka overview katalog selama pesan tidak memiliki istilah produk spesifik, sehingga pencarian seri seperti Voltes tetap memakai resolver produk.
- Regression mencakup kalimat production persis dan `lihat produk` sebagai bukti bridge LLM. Full suite lulus, coverage replay 9/9, serta benchmark pelanggan 26/26 turn dengan 135 assertion (100%).
- Log production membuktikan Groq salah membaca `yg bisa lngs dibungkus ada apa aja` sebagai `product_discovery` dengan confidence 0,92. Akibatnya handler stok tidak pernah dipanggil meskipun handler tersebut sudah benar.
- Normalisasi bersama kini memahami `lgs`, `lgsg`, dan `lngs` sebagai `langsung`. Prompt semantic router juga menetapkan bahwa `bisa langsung dibungkus ... apa aja` berarti daftar ready stock, bukan nama produk atau pertanyaan packing.
- Guard intent yang sempit menangani konflik ketika provider tetap mengembalikan `product_discovery` untuk pola tersebut. Hasil akhirnya hanya berasal dari produk WooCommerce berstatus `instock`, dan sumber koreksi tercatat sebagai `global_ready_stock_guard`.
- Regression meniru output Groq production yang salah secara persis. Full suite lulus, coverage replay 9/9, serta benchmark pelanggan 26/26 turn dengan 135 assertion (100%).
- Goal LLM `stock` tanpa nama produk dan `requires_product: false` kini membuka daftar produk ready WooCommerce, termasuk ungkapan informal yang tidak cocok dengan frasa stok lokal.
- Goal baru `stock_policy` membedakan pertanyaan kebijakan seperti apakah semua barang selalu ready dari permintaan daftar barang ready. LLM hanya menentukan jenis kebutuhan; hitungan ready/PO tetap dihitung dari katalog.
- Pengecualian pencarian katalog versus cek stok kini hanya berlaku jika LLM membawa nama produk. Karena itu `tampilkan Voltes yang tersedia` tetap Pencarian Produk, sedangkan permintaan stok global tanpa nama produk dapat mengikuti keputusan LLM.
- Aturan lokal `barang apa aja` yang terlalu luas dihapus dari detektor stok global agar `Barang apa aja yang dijual?` tetap menjadi Pencarian Produk.
- Regression active-LLM mencakup `yg bisa lgsg dibungkus ada apa aja?` dan `emang brangnya slalu ada smua?`, sekaligus mempertahankan guard lama untuk katalog Voltes. Full suite lulus, coverage replay 9/9, serta benchmark pelanggan 26/26 turn (135 assertion, 100%).
- Pengguna mengonfirmasi smoke production Harga/Promo lulus 5/5.
- Goal LLM `promo` kini langsung mengaktifkan handler promo walaupun pelanggan memakai bahasa informal atau typo yang tidak memuat kata literal `promo`, `diskon`, `sale`, atau `cashback`.
- Jika semantic router tidak menemukan nama produk, pertanyaan promo umum tetap memakai seluruh katalog. Jika nama produk grounded tersedia, pencarian promo memakai entitas tersebut agar filler percakapan tidak mencemari query.
- Presenter harga tunggal tidak lagi menimpa intro faktual dari handler. Status seperti `belum sedang promo` tetap terlihat, sementara nominal dan status diskon tetap berasal dari WooCommerce.
- Regression active-LLM mencakup promo umum `lg ada pnawaran spesial ga sih?`, promo produk `Jumbo Machinder Mazinger Z lg dpt harga spesial ga?`, dan harga slang `bandrolnya skrg brp?`. Full suite lulus, coverage replay 9/9, serta benchmark pelanggan 26/26 turn (135 assertion, 100%). Benchmark LLM shadow belum dapat dijalankan karena Vercel CLI lokal menolak token tersimpan yang sudah tidak valid.
- Pengguna mengonfirmasi smoke production Detail Produk lulus 3/3.
- Goal terstruktur LLM untuk Detail Produk (`material`, `dimensions`, `product_condition`, `completeness`, `price`, `stock`, dan `promo`) kini diteruskan ke formatter fakta. Bahasa santai atau typo yang dipahami LLM tidak lagi dibuang oleh parser kata lokal.
- Jawaban Detail Produk yang meminta facet tertentu hanya menampilkan fakta relevan dari WooCommerce. Pertanyaan detail umum tetap memakai tampilan lengkap, sedangkan permintaan kelebihan/kekurangan tetap mempertahankan pertimbangan katalog.
- Ekstraksi detail lengkap kini mempertahankan fakta asal produksi yang eksplisit seperti `Made in`, `diproduksi`, negara asal, atau status impor. Jika fakta tidak ada, guard lama tetap menolak menebak dan menawarkan admin handoff.
- Regression active-LLM memakai `Jumbo Machinder Mazinger Z bahanya apaan, trus isi dus komplit ga?` dan membuktikan intent, objek produk, serta goal LLM benar sementara isi jawaban tetap berasal dari deskripsi fixture WooCommerce. Verifikasi: full suite 408/408, coverage replay 9/9, dan benchmark pelanggan 26/26 turn (135 assertion, 100%).
- Pengguna mengonfirmasi smoke production untuk named-family recommendation Voltes sudah benar setelah deploy.
- Log production membuktikan intent `recommendation` sudah benar untuk `Menurut mu dari semua variasi Voltes mana yang paling worth it`, tetapi Groq mengembalikan `product_names: []`. Akibatnya handler lama meranking seluruh katalog dan menghasilkan produk non-Voltes.
- Rekomendasi kini memulihkan scope keluarga produk melalui matcher katalog ketika entitas LLM kosong, lalu memfilter kandidat secara keras sebelum ranking dan Gemini. Jika scope bernama tidak memiliki varian ready, chatbot tidak menggantinya dengan seri lain.
- Kata percakapan `mu`, `varian`, dan `variasi` tidak lagi dianggap bagian identitas produk. Prompt semantic router juga mewajibkan rekomendasi bernama seperti variasi Voltes membawa `product_names: ["Voltes"]` dan `requires_product: true`.
- Regression memakai pertanyaan dan output Groq production persis, termasuk confidence 0,92 dan `product_names` kosong; seluruh kartu hasil wajib Voltes. Verifikasi: full suite 406/406, coverage replay 9/9, dan benchmark pelanggan 26/26 turn (135 assertion, 100%).
- Pada mode active, `product_discovery` kini memakai satu entitas produk LLM yang tepercaya sebagai query utama sebelum parser teks lokal. Hasil tetap berasal dari katalog WooCommerce; parser lokal tetap fallback bila provider gagal, limit, atau entitas tidak valid.
- Entitas produk LLM hanya dianggap grounded bila seluruh token namanya hadir pada pesan pelanggan. Karena itu permintaan umum `Voltes` tidak boleh dipersempit menjadi `Robot Damashii Voltes V Legacy` jika varian lengkap tersebut tidak disebut pelanggan.
- Konflik production ketika provider menilai `Aku kepengen banget lihat koleksi lawas seri Voltes` sebagai `recommendation` kini dikoreksi oleh perintah katalog eksplisit. Prompt provider juga menegaskan bahwa `lihat koleksi/seri` adalah pencarian, sedangkan rekomendasi harus meminta pilihan atau penilaian.
- Regression active-LLM sengaja mensimulasikan salah klasifikasi `recommendation` confidence 0,96 dan membuktikan hasil tetap berupa beberapa produk Voltes; entitas yang terlalu spesifik juga tetap ditolak. Verifikasi: full suite 405/405, coverage replay 9/9, dan benchmark pelanggan 26/26 turn (135 assertion, 100%).
- Goal LLM `bulk_discount` kini langsung menuju policy handler sebelum pengambilan katalog. Pertanyaan `Kalau beli tiga barang, bisa dapat potongan harga nggak?` tidak lagi meminta nama produk atau mengembalikan produk tidak ditemukan.
- Angka kata `satu` sampai `sepuluh` didukung pada fallback bulk purchase. Respons menyatakan potongan tidak dijanjikan otomatis dan harus dikonfirmasi admin, tanpa mengarang promo.
- Regression active-LLM memastikan response tidak membawa kartu produk dan mencatat sumber `llm_bulk_discount_policy`. Verifikasi: full suite 405/405, coverage replay 9/9, dan benchmark pelanggan 26/26 turn (135 assertion, 100%).
- Pada mode LLM-led active, `product_names` terstruktur dari provider kini menjadi input utama resolver produk bersama. Nama tersebut tetap harus ditemukan di WooCommerce dan memiliki token yang berasal dari pertanyaan pelanggan; entitas LLM yang tidak grounded ditolak.
- Parser teks mentah tetap tersedia hanya sebagai fallback ketika provider limit/gagal atau tidak menghasilkan entitas tepercaya. Structured suggestion tetap memiliki prioritas tertinggi karena pilihan pengguna sudah tervalidasi.
- Regression active-LLM membuktikan `Daitarn` dari pemahaman LLM dipakai untuk pertanyaan restock informal, sementara entitas `Daitarn` ditolak ketika pelanggan menulis `Ultraman`. Full suite tetap 404/404, replay 9/9, dan benchmark pelanggan 26/26 (135 assertion, 100%).
- Pertanyaan `kalau Voltron habis, kapan restok?` tidak lagi memakai `habis`, `kapan`, dan `restock` sebagai bagian nama produk. Matcher kini menemukan keluarga produk `Voltron`, lalu jawaban jadwal/stok tetap memakai fakta WooCommerce.
- Variasi `kapan ready lagi`, `bakal masuk lagi kapan`, dan `restoknya kapan` dilindungi regression matcher; endpoint regression membuktikan pertanyaan restock informal tetap masuk `stock_availability` dan menemukan produk yang benar.
- Verifikasi patch restock: full suite 404/404, coverage replay 9/9, dan benchmark pelanggan 26/26 turn dengan 135 assertion (100%).
- Permintaan menampilkan/mencari seri produk `yang tersedia` kini tetap menjadi `product_discovery`, meskipun provider LLM keliru memberi `stock_availability` dengan confidence tinggi. Pertanyaan stok eksplisit seperti `sisa berapa pcs`, `ready`, dan `restock` tetap memakai jalur stok.
- Normalisasi bahasa katalog kini memahami `tampilin`, `nampilin`, dan `tunjukin`; filler `coba` tidak lagi mencemari token nama produk.
- Regression active-LLM mensimulasikan salah klasifikasi confidence 0,96 dan membuktikan hasil tetap berupa produk Voltes. Verifikasi: full suite 403/403, coverage replay 9/9, dan benchmark pelanggan 26/26 turn dengan 135 assertion (100%).
- Log Vercel kini mencetak `INTENT ML TOP 3` segera setelah hasil classifier tersedia, lengkap dengan peringkat, confidence desimal, dan persentase. Logging bersifat observability-only; keputusan routing tidak berubah dan fallback lokal ditandai jelas saat ML tidak tersedia.
- Badge intent frontend kini memakai label Indonesia untuk seluruh 13 intent aktif, ditambah label fitur pencarian produk dari foto. Nama intent internal, routing, classifier, dan response API tidak berubah; regression suite tetap lulus 403/403.
- Preflight final 2026-10-06 lulus: `npm test` 403/403, coverage replay 9/9, benchmark pelanggan 26/26 turn dengan 135 assertion (100%), dataset image 53 aktif/0 nonaktif, serta syntax check `api/ask.js` dan `api/ask-image.js`.
- Tidak ada source produksi yang diubah pada preflight. Menjelang sidang, perubahan fitur baru dibekukan dan patch hanya dilakukan untuk bug kritis yang dapat direproduksi.
- Menambahkan gate terpisah `npm run benchmark:transactions` agar perluasan verifikasi transaksi tidak mengubah baseline context 9/9 yang sudah stabil.
- Tujuh kasus mencakup ongkir kota+kecamatan satu pesan, alur natural tiga langkah kota -> kabupaten/kota -> kecamatan, perpindahan pending ongkir ke pembayaran, retur, atau produk, pengiriman internasional, dan pertanyaan ongkir majemuk dengan asuransi/packing.
- Mode transaksi memakai pacing 8 detik yang sama dengan context benchmark untuk mengurangi burst ke WordPress/WooCommerce.
- Production gate awal lulus 6/7. Satu kegagalan terjadi pada `Ongkir ke Tangerang` -> `Kalau bayar bisa pakai apa aja?`: LLM sudah benar menghasilkan intent `shipping_transaction` dan goal `payment_methods`, tetapi builder policy mengabaikan facet LLM lalu mengembalikan klarifikasi generik.
- `buildTransactionPolicyMessage` kini menerima facet transaksi terstruktur yang sudah divalidasi (`payment_methods`, COD, asuransi, packing, same-day, dan estimasi), sambil mempertahankan detektor kata lokal sebagai fallback.
- Regression unit dan endpoint active-LLM memakai kalimat production persis. Verifikasi setelah fix lulus: targeted 12/12, full suite 403/403, coverage replay 9/9, dan benchmark pelanggan 26/26 turn dengan 135 assertion (100%).
- Setelah deploy, pengguna mengonfirmasi rerun production gate lulus 7/7. Transaction Continuity Batch 1 selesai dan perilaku terverifikasi dipindahkan ke feature baseline.
- Follow-up alami tanpa kata ganti eksplisit, seperti `masih ready gak?`, `ada diskon gak?`, `ada fotonya?`, `lengkap gak?`, dan `full die-cast nggak?`, kini tetap terhubung ke produk fokus terakhir.
- Rujukan `keduanya`/`dua-duanya` mempertahankan tepat dua produk sebelumnya dan dapat menampilkan fakta keduanya; sistem tidak menebak jika kandidat sebelumnya lebih dari dua.
- Produk yang disebut eksplisit tetap mengalahkan konteks lama, sedangkan permintaan katalog umum seperti `ada promo apa aja?` dan `semua yang ready apa aja?` tidak diwarisi ke satu produk.
- Guard pencarian produk tidak lagi mengambil alih pertanyaan promo, harga, foto, atau detail hanya karena kalimat memakai kata `ada`.
- Verifikasi tahap Multi-turn Product Continuity: 403/403 test lokal, coverage replay 9/9 turn, dan benchmark pelanggan 26/26 turn (135 assertion, 100%) lulus.
- `npm run benchmark:context` kini memiliki 9 gate production, termasuk stok produk fokus, promo, foto, dua produk, perpindahan produk eksplisit, dan interupsi pending ongkir.
- Smoke production pertama lulus 8/9. Kasus yang gagal menunjukkan LLM benar memilih `stock_availability`, tetapi inferensi lokal dari intent `compare` sebelumnya menimpa hasil tersebut. Inferensi lanjutan compare kini hanya aktif ketika tidak ada semantic intent LLM yang terkunci.
- Regression aktif-LLM meniru kasus production tersebut: setelah dua produk dibandingkan, `keduanya ready gak?` harus menghasilkan intent `stock_availability`, response type `products`, dan mempertahankan kedua produk.
- Verifikasi setelah perbaikan konflik intent: 403/403 test lokal, coverage replay 9/9 turn, dan benchmark pelanggan 26/26 turn (135 assertion, 100%) lulus.
- Rerun smoke production setelah deploy lulus 9/9; output JSON berakhir normal tanpa `SMOKE ERROR`, dan kasus `context_pair_stock_followup` yang sebelumnya gagal kini memiliki `passed: true`.
- Inspeksi payload menemukan `context_focused_product_promo_followup` masih mengembalikan tiga produk walaupun hanya satu produk fokus yang ditanyakan. Promo fast path kini mendahulukan produk rujukan percakapan, regression active-LLM memastikan hanya produk fokus yang keluar, dan smoke gate mewajibkan `maxProducts: 1`.
- Verifikasi setelah penguatan gate promo: 403/403 test lokal, coverage replay 9/9 turn, dan benchmark pelanggan 26/26 turn (135 assertion, 100%) lulus. Production rerun dengan gate baru masih pending.
- Log production 2026-10-06 menunjukkan Groq tetap memilih `stock_availability` dengan confidence 0,96 untuk `masih ready gak?`, lalu pengambilan katalog gagal dua kali dengan HTTP 508 `Insufficient Resource`/`WC_PRODUCTS_UNAVAILABLE`. Respons tanpa produk dan kegagalan smoke pada kondisi itu tidak boleh dinilai sebagai regression intent.
- `benchmark:context` kini memakai jeda default 8 detik antarkasus dan maksimal 2 detik antarturn. Ketika payload menandakan katalog sementara tidak tersedia, benchmark berhenti sekali dengan pesan dependency unavailable alih-alih melanjutkan dan melaporkan seluruh kasus sebagai kegagalan logic.
- Jeda dapat diatur melalui `--delay-ms`; fitur ini tetap dipertahankan untuk mengurangi burst pada benchmark berikutnya.
- Setelah WooCommerce pulih, pengguna menjalankan ulang gate ketat dan mengonfirmasi production smoke lulus 9/9. Rerun production tidak lagi pending.
- Pengguna juga mengonfirmasi smoke manual production lulus 3/3: follow-up stok satu produk, stok dua produk melalui `keduanya`, dan promo yang tetap terikat ke satu produk fokus.
- Product matcher kini memisahkan huruf dan angka pada kode rapat, sehingga `GX92` diperlakukan sama dengan `GX-92`/`GX 92` tanpa mengubah angka percakapan biasa menjadi model number.
- Kata kebutuhan seperti bahan, dimensi, berat, aksesori, harga nett, dan satuan tidak lagi mencemari token nama produk. Pertanyaan `Ideon bahannya metal atau plastik?` tetap berlabuh ke produk Ideon, lalu facet material dijawab dari katalog.
- Guard tetap konservatif: `getter black` meminta klarifikasi ketika beberapa produk dekat, `ideon ultraman` tidak ditebak, dan kode salah `GX99 Ideon` tidak dialihkan ke `GX-92`.
- Regression matrix menjaga susunan nama terbalik, typo ringan, kode model, atribut produk, nama lini `POSE+ METAL`, ambiguity, dan unknown product.
- Verifikasi akhir tahap Product Grounding: 400/400 test lulus dan coverage replay 9/9 turn dengan coverage 59,4% ke 88,9%.
- Pengguna mengonfirmasi smoke production 5/5 lulus untuk kode model rapat, pertanyaan material + harga, dimensi + stok, produk ambigu, dan kode model yang tidak tersedia.
- Menambahkan matriks regression berbasis data untuk variasi rekomendasi sehari-hari: `rekomen`, `pilihin`, `mnurut lu`, `pengen`, `jtan/jtaan`, `sd`, nominal dengan spasi, tujuan pajangan/kado/koleksi, dan syarat ready stock.
- Normalisasi harga bersama kini memahami unit informal serta typo ringan tanpa mengubah model number menjadi nominal.
- Intent rekomendasi mempertahankan stok dan tujuan penggunaan sebagai constraint. Kalimat `yang ready dan paling cocok buat display yang mana?` tidak lagi turun menjadi cek stok saja.
- Follow-up singkat `klo yg 4jtan ada gak?` dan `kl yg 6 jtaan aja` tetap mewarisi goal rekomendasi, sedangkan contoh harga/stok non-rekomendasi tetap dilindungi oleh inverse tests.
- Log production membuktikan Groq dapat mengklasifikasikan `sekitar 7 jutaan` sebagai maksimum. Grounding lokal kini mengoreksi konflik tersebut menjadi target Rp7 juta sebelum filter/ranking berjalan.
- Resolver konteks tidak lagi menambahkan awalan `rekomendasi robot budget` pada pertanyaan rekomendasi baru yang sudah lengkap hanya karena goal sebelumnya juga rekomendasi.
- Regression endpoint memakai pertanyaan dan kesalahan semantic persis dari log production; hanya fixture Rp6,25-Rp7 juta yang lolos, sedangkan Rp3 juta dan Rp650 ribu ditolak.
- Verifikasi akhir: 399/399 test lulus, coverage replay 9/9 turn, dan benchmark pelanggan 26/26 turn (135 assertion, 100%).
- Pengguna mengonfirmasi tiga smoke production lulus: target harga, rentang dengan kebutuhan, dan follow-up target singkat dalam satu sesi.
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

- Belum ada task aktif; LLM-Grounded Product Comparison sudah terverifikasi lokal dan menunggu deploy/smoke production.

## Last Completed Task

- Task: menghubungkan dua entitas produk dari semantic LLM ke handler Perbandingan Produk.
- Tanggal selesai: 2026-10-06.
- Goal: memahami bahasa perbandingan natural tanpa menjadikan LLM sumber fakta produk dan tanpa menghapus parser fallback lama.

## Completed

- Menambahkan goal `comparison`, kontrak dua nama produk, tool plan WooCommerce, dan grounding entitas pada handler compare.
- Menambahkan regression active-LLM untuk bahasa compare natural serta mempertahankan test kelebihan/kekurangan deskripsi katalog.
- Menormalisasi singkatan `lgs`, `lgsg`, dan `lngs` pada pemahaman bahasa bersama.
- Menormalisasi typo `brang` dan menghubungkan keputusan LLM pencarian katalog tanpa objek ke overview WooCommerce.
- Menambahkan aturan prompt dan guard konflik yang hanya berlaku pada permintaan daftar ready global.
- Menambahkan regression berdasarkan output Groq production yang salah dan memverifikasi full suite serta benchmark utama.
- Meneruskan facet Detail Produk dari answer plan terverifikasi ke `buildProductTransactionSummary`.
- Mempertahankan detail lengkap untuk pertanyaan umum dan catatan katalog untuk permintaan kelebihan/kekurangan.
- Menambahkan fakta asal produksi/impor eksplisit ke ekstraksi detail WooCommerce.
- Menambahkan regression formatter dan active-LLM dengan typo bahasa sehari-hari.
- Memverifikasi 408/408 test, coverage replay 9/9, dan benchmark pelanggan 26/26 turn dengan 135 assertion.
- Menormalisasi kode alfanumerik rapat seperti `GX92` pada matcher katalog bersama.
- Mengeluarkan kata atribut produk dan satuan dari token identitas produk.
- Menambahkan `tests/productGroundingLanguageMatrix.test.js` serta regression endpoint pertanyaan material + harga untuk Ideon.
- Memverifikasi 400/400 test dan coverage replay 9/9 turn.
- Memverifikasi smoke production 5/5 berdasarkan pengujian manual pengguna.
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

- `api/ask.js`
- `lib/chatbot/productFormatter.js`
- `tests/askRouting.test.js`
- `tests/productFormatter.test.js`
- `docs/FEATURE_BASELINE.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/CURRENT_TASK.md`
- `docs/CHANGELOG.md`

## Next Steps

1. Deploy patch Perbandingan Produk ke Vercel.
2. Jalankan lima smoke compare: format eksplisit, bahasa natural, fokus harga, produk tidak ditemukan, dan follow-up produk kedua.
3. Jika semuanya benar, bekukan Prioritas 1 dan lanjutkan hardening intent transaksi tanpa mengubah baseline commerce yang sudah lulus.

## Blockers

- `mistral-small-latest` tetap HTTP 429 pada akun ini, tetapi tidak lagi menjadi model aktif lokal karena diganti dengan Ministral 8B dan 3B yang sudah lulus live smoke.
- `gemma-4-31b-it` tersedia pada akun, tetapi belum layak menjadi default karena latency live sekitar 115 detik pada respons yang berhasil.
- Hard test model aktif masih terbatas 104 contoh dan calibration metric belum tersedia.

## Notes For Next Session

- Panduan membedakan bukti source aktif, riwayat Git, dan penjelasan konsep; pertahankan perbedaan tersebut saat model diperbarui.
- Jangan menyatakan metrik classifier 13 intent sebagai akurasi jawaban chatbot end-to-end.
- Deployment 2026-09-15 telah diverifikasi melalui satu smoke text dan satu smoke image, tetapi dibuat sebelum sinkronisasi pool Gemini terbaru; fallback production Mistral/Cloudflare belum dipaksa karena primary provider berhasil.

