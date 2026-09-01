CODEX PROJECT SETUP

«Universal Project Bootstrap & Persistent Memory System untuk Codex

File ini digunakan sebagai blueprint untuk menyiapkan project agar dapat dikerjakan secara konsisten oleh Codex dalam jangka panjang.

File ini dapat digunakan untuk:

- Project baru.
- Project lama yang belum pernah digunakan dengan Codex.
- Project yang sebelumnya dikerjakan oleh manusia atau AI lain.
- Project yang berpindah-pindah session atau akun Codex.
- Project yang memiliki development jangka panjang.»

---

1. TUJUAN UTAMA

Tujuan sistem ini adalah membuat project memiliki memory yang tersimpan di repository, bukan hanya bergantung pada:

- Chat Codex.
- Session Codex.
- Memory akun.
- Satu akun pengguna.
- Percakapan sebelumnya.

Informasi penting mengenai project harus disimpan di dalam repository agar Codex pada session berikutnya dapat memahami project dari kondisi aktualnya.

Prinsip utama:

«Chat adalah tempat berdiskusi. Repository adalah tempat menyimpan pengetahuan permanen project.»

---

2. PRINSIP DEVELOPMENT

Project harus dikembangkan dengan prinsip:

«Progress tanpa regression.»

Artinya:

- Fitur baru harus menambah kemampuan.
- Fitur yang sudah stabil harus dipertahankan.
- Bug harus diperbaiki tanpa merusak fitur lain.
- Refactor tidak boleh dilakukan hanya karena kode bisa dibuat berbeda.
- Perubahan besar harus memahami dampaknya terlebih dahulu.
- Perilaku yang sudah terbukti benar harus dianggap sebagai baseline.

Jangan hanya mencatat apa yang rusak.

Catat juga apa yang:

- sudah berjalan baik,
- sudah stabil,
- sudah teruji,
- sudah disepakati,
- dan harus dipertahankan.

---

3. MODE OPERASI

File ini mendukung dua kondisi utama.

MODE A — PROJECT BARU

Jika repository masih baru:

1. Analisis struktur yang sudah tersedia.
2. Identifikasi technology stack.
3. Identifikasi konfigurasi.
4. Identifikasi arsitektur awal.
5. Buat dokumentasi dasar.
6. Tandai bagian yang belum diketahui.
7. Jangan mengarang fitur yang belum ada.

---

MODE B — PROJECT LAMA

Jika repository sudah memiliki source code:

1. Perlakukan repository sebagai project existing.
2. Jangan langsung melakukan refactor.
3. Jangan langsung memperbaiki semua masalah yang ditemukan.
4. Lakukan discovery terlebih dahulu.
5. Pahami architecture yang sebenarnya.
6. Baca dokumentasi existing.
7. Periksa Git history jika tersedia dan relevan.
8. Identifikasi fitur yang sudah berjalan.
9. Identifikasi fitur yang belum selesai.
10. Identifikasi workaround dan technical debt.
11. Identifikasi fitur yang stabil dan harus dilindungi.
12. Dokumentasikan kondisi project saat ini.

Tujuan utama:

«Memahami project sebelum mengubah project.»

---

4. ATURAN ABSOLUT

4.1 Jangan Mengarang

Jangan membuat klaim berdasarkan asumsi.

Jika informasi tidak dapat dibuktikan dari:

- source code,
- konfigurasi,
- database schema,
- migration,
- Git history,
- dokumentasi existing,
- test,
- atau bukti lain di repository,

tuliskan:

«Belum diketahui / perlu dikonfirmasi.»

Jangan mengubah ketidakpastian menjadi fakta.

---

5. JANGAN MENGUBAH SOURCE CODE SAAT DISCOVERY

Pada tahap awal setup:

JANGAN:

- memperbaiki bug,
- refactor,
- menghapus file,
- mengubah database,
- menjalankan migration destruktif,
- mengubah dependency,
- mengubah API,
- mengubah UI,
- mengubah konfigurasi,
- melakukan deployment.

Fokus:

«Discover → Understand → Document»

Bukan:

«Discover → Fix everything.»

Pengecualian hanya jika pengguna secara eksplisit meminta perubahan source code.

---

6. ANALISIS REPOSITORY

Sebelum membuat dokumentasi, analisis repository.

Periksa:

Struktur

- directory
- source code
- tests
- configuration
- scripts
- assets
- documentation

Technology

Identifikasi jika ada:

- runtime
- framework
- library
- package manager
- ORM
- database
- storage
- authentication
- external API
- payment
- messaging
- queue
- cron
- AI
- deployment
- CI/CD

Configuration

Periksa file konfigurasi yang relevan.

Contoh:

package.json
composer.json
requirements.txt
pyproject.toml
pubspec.yaml
go.mod
Dockerfile
docker-compose.yml
vercel.json

Sesuaikan dengan jenis project.

---

7. IDENTIFIKASI PROJECT

Tentukan:

Nama

[NAMA PROJECT]

Jenis

Contoh:

- Web application
- API
- Backend
- Frontend
- Mobile
- Desktop
- CLI
- WordPress
- WooCommerce
- Plugin
- Theme
- Bot
- AI application
- Automation
- Monorepo
- Library

Tujuan

Apa masalah yang diselesaikan project?

Target User

Siapa pengguna project?

---

8. IDENTIFIKASI TECHNOLOGY STACK

Dokumentasikan technology yang benar-benar ditemukan.

Gunakan kategori:

Runtime
Framework
Frontend
Backend
Database
ORM
Authentication
Storage
External Services
Testing
Infrastructure
Deployment
CI/CD
Other

Jangan mencantumkan technology yang hanya diduga.

---

9. IDENTIFIKASI STRUKTUR

Cari directory penting.

Contoh:

src/
app/
pages/
components/
controllers/
services/
models/
routes/
lib/
utils/
tests/
public/
prisma/

Jangan mengasumsikan fungsi folder berdasarkan namanya.

Periksa penggunaan sebenarnya.

---

10. IDENTIFIKASI DATABASE

Jika menggunakan database, analisis:

- schema
- model
- table
- field
- relationship
- foreign key
- index
- constraint
- enum
- migration
- seed

Jangan mengubah database.

---

11. IDENTIFIKASI API

Cari:

- routes
- endpoint
- controller
- service
- middleware
- validation
- authentication
- authorization
- webhook
- external API
- response format
- error handling

Dokumentasikan endpoint penting.

---

12. IDENTIFIKASI AUTHENTICATION

Cari:

- login
- register
- logout
- session
- JWT
- OAuth
- API key
- middleware
- role
- permission

Dokumentasikan flow aktual.

---

13. IDENTIFIKASI EXTERNAL SERVICES

Cari integrasi dengan:

- payment
- email
- WhatsApp
- Telegram
- AI
- storage
- analytics
- maps
- social media
- shipping
- cloud
- webhook
- third-party API

Dokumentasikan:

- service
- tujuan
- integration method
- file terkait

Jangan menyimpan credential.

---

14. IDENTIFIKASI ENVIRONMENT VARIABLES

Periksa:

- ".env.example"
- configuration
- source code
- deployment configuration

Dokumentasikan nama variable dan fungsinya.

JANGAN memasukkan nilai secret.

Jangan pernah menuliskan:

- password
- API key
- token
- private key
- webhook secret
- credential

---

15. IDENTIFIKASI TESTING

Cari:

- unit test
- integration test
- e2e
- test framework
- test command
- coverage

Jangan mengatakan test berhasil jika belum dijalankan.

---

16. IDENTIFIKASI DEPLOYMENT

Cari:

- Vercel
- Netlify
- AWS
- Docker
- VPS
- Cloudflare
- Railway
- Render
- GitHub Actions
- atau platform lain.

Jangan melakukan deployment saat discovery.

---

17. IDENTIFIKASI BUSINESS LOGIC

Cari aturan bisnis penting.

Contoh:

- pricing
- order
- payment
- subscription
- inventory
- invitation
- messaging
- notification
- user roles
- permission
- workflow

Dokumentasikan logic yang benar-benar ditemukan.

---

18. IDENTIFIKASI FITUR

Buat daftar fitur project.

Untuk setiap fitur, tentukan:

Status:
- STABLE
- WORKING
- IN_PROGRESS
- PARTIAL
- BROKEN
- UNKNOWN
- DEPRECATED

Jangan menyatakan STABLE hanya karena kode terlihat selesai.

Gunakan bukti seperti:

- implementation
- test
- penggunaan nyata
- dokumentasi
- Git history
- hasil verifikasi

Jika belum dapat dipastikan:

«UNKNOWN»

---

19. FEATURE BASELINE

Fitur yang sudah berjalan baik harus dicatat secara khusus.

Buat:

docs/FEATURE_BASELINE.md

File ini adalah daftar:

«FITUR YANG SUDAH BAGUS DAN HARUS DILINDUNGI.»

Untuk setiap fitur STABLE, dokumentasikan:

Nama Fitur

Status

STABLE

Fungsi

Apa yang dilakukan?

Perilaku yang Sudah Benar

- ...
- ...
- ...

Jangan Rusak

- ...
- ...
- ...

File Penting

- ...
- ...

Dependency

- ...
- ...

Cara Verifikasi

- ...
- ...

Catatan

...

---

20. REGRESSION PROTECTION

Fitur STABLE atau PROTECTED harus diperlakukan sebagai baseline.

Sebelum mengubah fitur tersebut:

1. Baca dokumentasinya.
2. Pahami perilaku yang sudah benar.
3. Cari dependency-nya.
4. Cari consumer-nya.
5. Perkirakan dampak perubahan.
6. Lakukan perubahan sekecil mungkin.
7. Lakukan regression testing.
8. Update dokumentasi jika perilakunya berubah.

Jangan merusak fitur yang sudah baik hanya karena:

«"Ada cara yang lebih modern."»

atau:

«"Kodenya bisa dibuat lebih sederhana."»

Perubahan harus memiliki alasan yang jelas.

---

21. PROJECT MEMORY

Buat:

docs/PROJECT_CONTEXT.md

File ini harus berisi:

- project overview
- tujuan
- target user
- current status
- completed features
- current work
- pending work
- business logic
- technical facts
- constraints
- known issues
- important files
- external services
- things we must not break
- session handoff

---

22. CURRENT TASK

Buat:

docs/CURRENT_TASK.md

Gunakan untuk pekerjaan yang sedang berlangsung.

Isi:

- task
- goal
- current status
- completed
- current problem
- files being modified
- findings
- decisions
- next steps
- blockers
- notes for next session

Jika tidak ada task aktif:

«Belum ada task aktif.»

---

23. ARCHITECTURE

Buat:

docs/ARCHITECTURE.md

Dokumentasikan:

- high-level architecture
- frontend
- backend
- API
- database
- authentication
- storage
- external services
- background jobs
- deployment
- data flow
- architectural rules
- risks

Gunakan diagram ASCII jika berguna.

---

24. DATABASE

Buat:

docs/DATABASE.md

Jika database ada, dokumentasikan:

- database
- ORM
- models
- fields
- relationships
- indexes
- constraints
- migrations
- seed
- data safety

Jika tidak ada database, tuliskan bahwa project tidak menggunakan database berdasarkan hasil analisis.

---

25. DECISION LOG

Buat:

docs/DECISIONS.md

Catat keputusan penting.

Format:

## [YYYY-MM-DD] — [JUDUL]

### Status

ACCEPTED

### Decision

[Apa yang diputuskan]

### Context

[Kenapa diperlukan]

### Reason

[Alasan]

### Alternatives

[Alternatif]

### Consequences

[Dampak]

Jangan mengarang alasan historis.

---

26. CHANGELOG

Buat:

docs/CHANGELOG.md

Catat perubahan signifikan.

Kategori:

- Added
- Changed
- Fixed
- Removed
- Technical
- Documentation

Jangan membuat sejarah palsu.

Jika project existing dan Git history tersedia, gunakan informasi yang dapat diverifikasi.

---

27. README

Buat atau perbarui:

README.md

Minimal:

- nama
- deskripsi
- stack
- requirement
- installation
- environment
- development
- testing
- build
- deployment
- link dokumentasi

README harus menjadi pintu masuk project, bukan tempat menyimpan seluruh detail teknis.

---

28. AGENTS.MD

Buat:

AGENTS.md

AGENTS.md harus menjadi aturan permanen Codex.

Minimal berisi:

Project Identity

Technology Stack

Project Structure

Coding Rules

Database Rules

API Rules

Security Rules

Testing Rules

Documentation Rules

Feature Regression Protection

Git Safety

Session Handoff

Project-Specific Rules

AGENTS.md harus menginstruksikan Codex untuk membaca dokumentasi yang relevan sebelum melakukan perubahan besar.

---

29. ACCOUNT DAN SESSION INDEPENDENCE

Pengetahuan penting project tidak boleh hanya berada dalam chat.

Simpan informasi penting di repository.

Tujuannya:

Codex Session A
       |
       ↓
   Repository
       ↑
       |
Codex Session B

Jika pengguna:

- berganti akun,
- berganti session,
- membuat chat baru,
- membuka project setelah lama tidak dikerjakan,

Codex harus dapat memulai kembali dengan membaca:

AGENTS.md
docs/PROJECT_CONTEXT.md
docs/CURRENT_TASK.md
docs/FEATURE_BASELINE.md

---

30. SESSION HANDOFF

Setelah menyelesaikan pekerjaan besar, update dokumentasi.

Minimal periksa:

docs/PROJECT_CONTEXT.md
docs/CURRENT_TASK.md
docs/FEATURE_BASELINE.md
docs/CHANGELOG.md

Jika ada keputusan penting:

docs/DECISIONS.md

Jika architecture berubah:

docs/ARCHITECTURE.md

Jika database berubah:

docs/DATABASE.md

---

31. SETIAP FITUR YANG SELESAI

Jangan hanya mengatakan:

«Fitur selesai.»

Evaluasi:

1. Apakah benar-benar berjalan?
2. Apakah sudah diverifikasi?
3. Apakah ada regression?
4. Apakah fitur ini sekarang dapat dianggap STABLE?
5. Apa perilaku yang harus dipertahankan?
6. Apa dependency pentingnya?
7. Apa cara memverifikasinya?

Jika memenuhi kriteria STABLE:

Tambahkan ke:

docs/FEATURE_BASELINE.md

---

32. JIKA FITUR SUDAH BAGUS

Jika pengguna mengatakan:

- "ini sudah bagus"
- "jangan diubah lagi"
- "ini sudah pas"
- "sudah sesuai"
- "sudah stabil"
- "pertahankan seperti ini"

anggap itu sebagai sinyal kuat bahwa fitur tersebut perlu masuk Feature Baseline.

Catat:

- kondisi yang dianggap benar
- perilaku yang harus dipertahankan
- file terkait
- cara testing
- batasan perubahan

Jangan menganggap fitur tersebut boleh dirombak bebas pada task berikutnya.

---

33. JIKA FITUR BERUBAH

Jika fitur STABLE harus diubah:

Sebelum perubahan:

Feature Baseline
       ↓
Impact Analysis
       ↓
Implementation
       ↓
Testing
       ↓
Update Baseline

Jika perubahan disengaja dan hasil baru memang lebih baik:

Update dokumentasi baseline.

Jangan meninggalkan dokumentasi lama yang sudah tidak sesuai.

---

34. TECHNICAL DEBT

Jika menemukan technical debt:

Jangan langsung memperbaikinya kecuali diminta atau memang diperlukan untuk task aktif.

Catat jika penting:

docs/PROJECT_CONTEXT.md

atau:

docs/CURRENT_TASK.md

Bedakan:

- bug
- technical debt
- improvement
- refactor
- feature request

Jangan mencampurnya.

---

35. TODO DAN PENDING TASK

Jangan menganggap semua TODO di source code sebagai prioritas.

Analisis konteksnya.

Jika relevan, masukkan ke:

docs/PROJECT_CONTEXT.md

atau:

docs/CURRENT_TASK.md

Prioritas harus ditentukan berdasarkan kondisi project dan instruksi pengguna.

---

36. GIT HISTORY

Jika repository menggunakan Git:

Gunakan history sebagai sumber informasi tambahan.

Cari jika relevan:

- feature development
- architectural changes
- bug fixes
- migration
- important decisions
- recent work

Namun:

- jangan mengubah history
- jangan membuat commit
- jangan reset
- jangan checkout branch lain tanpa instruksi

Gunakan Git history untuk memahami project, bukan untuk melakukan perubahan.

---

37. EXISTING DOCUMENTATION

Jika project sudah memiliki dokumentasi:

1. Baca.
2. Validasi terhadap source code.
3. Pertahankan informasi yang masih benar.
4. Update informasi yang sudah berubah.
5. Jangan membuat dokumentasi duplikat jika tidak perlu.

Source code dan konfigurasi aktual memiliki prioritas lebih tinggi daripada dokumentasi yang sudah jelas outdated.

---

38. MONOREPO

Jika project adalah monorepo:

Identifikasi:

apps/
packages/
services/

dan subproject lainnya.

Jika sebuah subproject memiliki aturan khusus, pertimbangkan "AGENTS.md" pada directory tersebut.

Jangan membuat banyak file "AGENTS.md" tanpa kebutuhan.

---

39. SECURITY

Jangan pernah memasukkan ke dokumentasi:

- password
- API key
- token
- private key
- credential
- database password
- secret
- session token

Gunakan nama variable saja.

Contoh:

DATABASE_URL
API_KEY
SECRET_KEY

bukan nilai sebenarnya.

---

40. QUALITY CHECK

Sebelum menyelesaikan setup, verifikasi:

- [ ] Tidak ada informasi yang dikarang.
- [ ] Tidak ada secret.
- [ ] Source code tidak berubah tanpa izin.
- [ ] Technology stack benar.
- [ ] Struktur project benar.
- [ ] Database terdokumentasi.
- [ ] Architecture terdokumentasi.
- [ ] Fitur penting teridentifikasi.
- [ ] Fitur stabil dicatat.
- [ ] Regression protection dibuat.
- [ ] Current task dibuat.
- [ ] Project context dibuat.
- [ ] Decision log dibuat.
- [ ] Changelog dibuat.
- [ ] README tersedia.
- [ ] AGENTS.md tersedia.

---

41. STRUKTUR HASIL AKHIR

Setelah setup selesai, target struktur:

PROJECT/
│
├── AGENTS.md
├── README.md
│
└── docs/
    ├── PROJECT_CONTEXT.md
    ├── CURRENT_TASK.md
    ├── FEATURE_BASELINE.md
    ├── ARCHITECTURE.md
    ├── DATABASE.md
    ├── DECISIONS.md
    └── CHANGELOG.md

"CODEX_PROJECT_SETUP.md" boleh tetap disimpan di repository atau dihapus setelah setup.

Jika disimpan, file tersebut hanya berfungsi sebagai bootstrap/template.

Memory project utama berada di:

AGENTS.md
docs/

---

42. LAPORAN SETUP

Setelah selesai, berikan laporan singkat:

Setup project selesai.

Project:
[NAMA]

Jenis:
[JENIS PROJECT]

Stack:
[STACK]

Status Project:
[STATUS]

File yang dibuat/diperbarui:
- AGENTS.md
- README.md
- docs/PROJECT_CONTEXT.md
- docs/CURRENT_TASK.md
- docs/FEATURE_BASELINE.md
- docs/ARCHITECTURE.md
- docs/DATABASE.md
- docs/DECISIONS.md
- docs/CHANGELOG.md

Fitur yang ditemukan:
- ...
- ...
- ...

Fitur yang sudah stabil:
- ...
- ...

Fitur yang sedang dikerjakan:
- ...
- ...

Masalah yang ditemukan:
- ...
- ...

Hal yang belum diketahui:
- ...
- ...

Catatan penting:
- ...
- ...

---

43. SETELAH SETUP

Setelah setup dokumentasi selesai:

Jangan langsung memperbaiki atau mengubah source code.

Tunggu instruksi pengguna berikutnya.

Jika pengguna kemudian memberikan task:

1. Baca "AGENTS.md".
2. Baca "docs/PROJECT_CONTEXT.md".
3. Baca "docs/CURRENT_TASK.md".
4. Baca "docs/FEATURE_BASELINE.md".
5. Baca dokumentasi lain yang relevan.
6. Inspect source code.
7. Buat rencana.
8. Implementasikan perubahan.
9. Test.
10. Periksa regression.
11. Update memory project.

---

44. WORKFLOW PERMANEN

Gunakan workflow berikut untuk setiap pekerjaan besar:

UNDERSTAND
    ↓
READ MEMORY
    ↓
INSPECT
    ↓
PLAN
    ↓
IMPLEMENT
    ↓
TEST
    ↓
REGRESSION CHECK
    ↓
DOCUMENT
    ↓
UPDATE MEMORY
    ↓
NEXT TASK

Jangan melewati tahap penting hanya untuk mempercepat pengerjaan.

---

45. FILOSOFI PROJECT

Project harus berkembang seperti ini:

             PROJECT
                │
       ┌────────┴────────┐
       ↓                 ↓
   NEW FEATURES       EXISTING FEATURES
       ↓                 ↓
    Develop           Protect
       ↓                 ↓
     Test             Test
       └────────┬────────┘
                ↓
          Stable Progress
                ↓
          Update Memory
                ↓
          Next Progress

Tujuan akhirnya bukan sekadar membuat lebih banyak kode.

Tujuannya:

«Membuat project semakin baik tanpa kehilangan hal-hal yang sudah berhasil.»

---

46. PERINTAH BOOTSTRAP

Setelah membaca file ini, lakukan hal berikut:

«Analisis project ini terlebih dahulu. Tentukan apakah ini project baru atau project existing. Jika project existing, lakukan discovery terhadap kondisi aktual project sebelum membuat kesimpulan.»

Kemudian:

1. Baca repository.
2. Baca dokumentasi existing.
3. Periksa konfigurasi.
4. Periksa dependency.
5. Periksa source code.
6. Periksa database/schema jika ada.
7. Periksa Git history jika relevan.
8. Identifikasi fitur.
9. Identifikasi fitur yang sudah stabil.
10. Identifikasi pekerjaan yang sedang berjalan jika dapat diketahui.
11. Identifikasi masalah.
12. Identifikasi architecture.
13. Buat dokumentasi project.
14. Buat Feature Baseline.
15. Jangan mengubah source code.
16. Jangan memperbaiki bug.
17. Jangan melakukan deployment.
18. Setelah selesai, berikan laporan setup.

---

47. PERINTAH UNTUK DEVELOPMENT BERIKUTNYA

Setelah bootstrap selesai, gunakan pola berikut:

«Sebelum mengerjakan task ini, baca "AGENTS.md", "docs/PROJECT_CONTEXT.md", "docs/CURRENT_TASK.md", dan "docs/FEATURE_BASELINE.md". Pahami kondisi project dan fitur yang sudah stabil. Setelah itu inspect source code yang relevan. Jangan mengubah fitur yang sudah stabil tanpa memahami dampak dan melakukan regression check. Setelah task selesai, update dokumentasi dan memory project yang relevan.»

---

48. HASIL YANG DIHARAPKAN

Pada akhirnya, setiap project harus memiliki:

SOURCE CODE
    +
PROJECT MEMORY
    +
CURRENT TASK
    +
FEATURE BASELINE
    +
ARCHITECTURE
    +
DATABASE KNOWLEDGE
    +
DECISION HISTORY
    +
CHANGELOG
    +
CODEX RULES

Dengan demikian, project tidak bergantung pada satu conversation.

Jika Codex kehilangan konteks conversation, repository tetap memiliki memory.

Jika menggunakan account berbeda, repository tetap memiliki memory.

Jika membuat session baru, repository tetap memiliki memory.

Jika project berhenti selama beberapa bulan, repository tetap memiliki memory.

Jika developer lain melanjutkan project, repository tetap memiliki memory.

---

END OF CODEX PROJECT SETUP