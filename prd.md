Product Requirement Document (PRD)
Project Name: SMKS Telematika Enterprise Academic & CBT Engine
Document Version: 3.0.0 (Ultimate Enterprise Architecture Revision)
Target Environment: Hybrid (Intranet Sekolah Lokal berkecepatan tinggi & Akses Internet Publik Terdistribusi)
Tech Stack Ultimate: Next.js App Router (Frontend), Node.js/Express with TypeScript (Backend), PostgreSQL (Main Relational DB), Redis (In-Memory Cache & Message Broker), Prisma ORM, Socket.io (WebSockets), BullMQ (Task Queue).

1. Executive Summary & Product Vision (Ringkasan Eksekutif & Visi)
Platform ini bukan sekadar aplikasi CRUD sekolah biasa. Ini adalah ekosistem Enterprise Resource Planning (ERP) Akademik dan Computer-Based Test (CBT) end-to-end berskala industri, dirancang khusus untuk SMKS Telematika Indramayu. Visi dari sistem ini adalah menghilangkan 100% bottleneck saat ujian massal (ribuan siswa submit bersamaan), mengotomatisasi rantai birokrasi nilai dari guru ke buku induk, dan menyediakan mesin ujian yang kebal terhadap manipulasi (cheat-proof) serta tahan terhadap kondisi internet tidak stabil (offline-resilient).

2. Technical Objectives, OKRs & Enterprise SLAs (Target Teknis & Metrik)
Sistem ini dibangun dengan standar arsitektur High Availability (HA). Metrik keberhasilan meliputi:

Massive Concurrency (CBT Engine): Arsitektur berbasis Redis-Queue harus sanggup melayani minimal 3.000 concurrent connections tanpa downtime, dengan waktu respons API (P95 Latency) di bawah 150ms saat peak load.

Zero Data Orphan & Absolute Integrity: Penghapusan relasional harus menggunakan soft_delete untuk data transaksional (nilai, log ujian) guna keperluan audit. Menghapus data master (misal: Rombel) akan memicu cascading state yang aman tanpa merusak riwayat nilai siswa yang telah lulus.

Offline-First Resilience: CBT Engine di sisi client wajib sanggup menampung perpindahan soal dan penyimpanan jawaban selama 30 menit penuh tanpa koneksi internet, lalu melakukan Background Bulk-Sync ketika koneksi pulih.

Anti-Cheat Precision: Deteksi anomali (Tab-switching, focus loss, window resizing) harus terekam 100% secara real-time ke dashboard pengawas dengan latensi pengiriman WebSocket < 50ms.

3. Comprehensive User Personas & RBAC Matrix (Profil & Matriks Akses)
Sistem menerapkan Role-Based Access Control (RBAC) absolut pada level Middleware (Backend) dan Route Guard (Frontend).

Administrator (Superadmin / Kepala Sekolah):

Akses: Full System Override, Konfigurasi Tahun Ajaran & Semester aktif.

Flow Kritis: Manajemen Role pengguna, Backup & Restore Database terjadwal, melihat Audit Trail (log aktivitas siapa mengubah apa), dan validasi final DKN (Daftar Kumpulan Nilai).

Guru Mata Pelajaran (Pengajar & Assessor):

Akses: Bank Soal, E-Learning, Modul Penilaian, Presensi.

Flow Kritis: Merakit matriks soal, mendistribusikan materi yang diisolasi ketat menggunakan WHERE guru_id = ? AND rombel_id = ?, memantau statistik daya serap materi, dan input manual nilai penugasan.

Wali Kelas (Homeroom Teacher):

Akses: Dashboard Analitik Rombel spesifik, Modul Cetak Rapor.

Flow Kritis: Menambahkan catatan wali kelas, memvalidasi kehadiran kumulatif, menginput nilai ekstrakurikuler, dan men- generate dokumen Rapor PDF secara batch.

Pengawas Ujian (Live Proctor):

Akses: Command Center Pelaksanaan Ujian.

Flow Kritis: Generate & Refresh Token sesi, me-reset status login siswa yang bermasalah (misal: perangkat hang), menambah durasi waktu eksepsional per siswa, dan memantau Traffic Light Status (Hijau: Aman, Kuning: Peringatan, Merah: Melanggar) via WebSocket.

Siswa (End-User CBT & LMS):

Akses: Portal E-Learning & Exam Engine dengan UI terisolasi (Kiosk Mode).

Flow Kritis: Akses materi, submit tugas mandiri, login ujian via Token, eksekusi soal (Navigasi, Ragu-ragu, Submit), dan melihat rekapitulasi nilai akhir (bila diizinkan rilis).

4. Deep-Dive Functional Specifications (Rincian Fungsionalitas Level Arsitektur)
4.1. Core Master Data Management (MDM)
Hierarki Akademik Multilevel: Relasi kompleks antara Tahun Ajaran -> Semester -> Jurusan -> Kelas -> Rombel -> Siswa.

Mass Import Engine: Fitur Upload Excel/CSV untuk Siswa dan Guru. Backend wajib menggunakan stream parsing (misal: csv-parser) dan validasi batch (Zod) untuk mencegah Memory Leak saat memproses 2.000+ baris data. Kesalahan baris (misal format email salah) akan mengembalikan JSON pelaporan error per baris, tanpa menggagalkan baris yang benar (Partial Success).

Pemisahan Entitas Guru & Hak Akses: Menggunakan tabel pivot (misal: user_roles). Seorang Guru bisa sekaligus menjadi Wali Kelas dan Pengawas tanpa perlu membuat akun ganda.

4.2. E-Learning & Content Delivery Network (LMS)
Strict Data Isolation: Middleware restrictToOwnClass wajib diaktifkan. Jika Guru A mencoba memanipulasi payload API untuk melihat tugas Rombel B (yang bukan ajarannya), Backend langsung merespons 403 Forbidden dan mencatat IP ke dalam Security Log.

File Handling & Compression: Unggahan materi (PDF, PPT) dan Tugas Siswa. Menggunakan Multer dengan batasan dinamis (Siswa maks 5MB, Guru maks 20MB). File divalidasi MIME-type secara binary (bukan hanya ekstensi string) untuk mencegah malware upload.

4.3. Advanced Item Bank Taxonomy (Bank Soal Kompleks)
Polymorphic Schema Design: Tabel Soal dirancang fleksibel dengan kolom JSONB/JSON (content_payload) untuk menampung struktur data tak terbatas:

Multiple Choice (A-E): Teks standar.

Rich Media/Image Only: Gambar beresolusi tinggi (wajib menggunakan Absolute URL di backend).

Matching Pairs (Menjodohkan): Disimpan sebagai [{left_node_id: string, right_node_id: string}].

Multi-Select: Lebih dari satu jawaban benar.

Versioning & Auditing: Soal yang sudah pernah diujikan (memiliki relasi ke HasilUjian) TIDAK BOLEH diubah langsung (immutable). Jika guru merevisi, sistem membuat version_2 dari soal tersebut, menjaga integritas nilai siswa di masa lalu.

Randomization Logic: Mesin harus mendukung pengacakan urutan Soal DAN pengacakan urutan Opsi Jawaban (A-E menjadi rotasi dinamis per siswa) berdasarkan seed ID Siswa.

4.4. The CBT Exam Engine (Critical Core)
State Machine Architecture: Ujian memiliki status ketat: SCHEDULED -> ACTIVE -> PAUSED -> SUBMITTED -> GRADED.

Token Lifecycle Management: Token alphanumeric 6 karakter disimpan di Redis dengan TTL (Time To Live) yang presisi. Endpoint validasi Token harus mampu menangani brute-force attack dengan Rate Limiter.

The "Queue" Strategy (Anti-Crash System): * Saat siswa menekan "Submit Akhir" atau ujian berakhir paksa, Frontend mengirim payload JSON ke Backend.

Backend TIDAK langsung menulis ke PostgreSQL. Ia memvalidasi token JWT, lalu melempar data ke BullMQ (Redis Message Queue) dan langsung membalas 202 Accepted ke Frontend dalam < 50ms.

Worker Nodes di latar belakang akan memproses antrean tersebut, menghitung nilai, dan menuliskannya ke PostgreSQL secara stabil.

Offline-First & Auto-Sync: Frontend menggunakan pustaka seperti localforage (IndexedDB). Setiap klik opsi A/B/C/D disimpan ke disk lokal. Sebuah Web Worker di background akan mencoba melakukan ping sinkronisasi ke server setiap 30 detik.

4.5. AI-Powered Anti-Cheat & Live Proctoring
Visibility & Focus API Heuristics: Menggabungkan document.visibilityState, window.onblur, dan deteksi klik di luar iframe.

Strike System: * Strike 1 & 2: Peringatan UI muncul di layar siswa, log "Kuning" dikirim via WebSocket ke Pengawas.

Strike 3: UI ujian terkunci blur (Kiosk Lock). Log "Merah" berbunyi di dashboard Pengawas. Hanya Pengawas yang bisa membuka kunci (resume) via tombol di Dashboard Command Center.

Clipboard & DevTools Blocking: Injeksi script untuk mematikan Ctrl+C, Ctrl+V, Right Click, dan mendeteksi pembukaan F12 (Developer Tools) berdasarkan resize ukuran layar yang mendadak.

4.6. Penilaian Otomatis (Auto-Grading) & Rapor Engine
Zero vs Null Matrix: Sistem kalibrasi nilai wajib memisahkan secara eksplisit: Siswa alfa (Tidak hadir = NULL, tidak masuk pembagi rata-rata kelas) dengan Siswa gagal (Skor 0 = Terinput 0, masuk pembagi rata-rata kelas).

Complex Grading Formula: Dukungan untuk pembobotan dinamis yang diatur Wali Kelas/Admin.
$$Nilai\_Rapor = (W_1 \times Rata2\_Tugas) + (W_2 \times PTS) + (W_3 \times PAS)$$
PDF Generation Engine: Menggunakan arsitektur Microservice kecil berbasis Puppeteer (Headless Chrome) untuk merender HTML/Tailwind menjadi dokumen Rapor multi-halaman yang sempurna (tidak ada tabel yang terpotong di tengah halaman).

5. System Architecture & Engineering Blueprint (Cetak Biru Teknikal)
Design Pattern: Layered Architecture (Controller -> Service -> Repository). Controller hanya mengurus HTTP Request/Response. Service menangani logika bisnis (grading, queueing). Repository menangani kueri Prisma/SQL.

Caching Strategy: Redis digunakan untuk menyimpan (1) Session JWT, (2) Token Ujian Aktif, dan (3) Daftar Soal yang sering diakses (menghindari kueri berat ke DB PostgreSQL berulang kali).

Database Triggers & Materialized Views: Untuk mempercepat loading halaman Laporan/DKN, rekapitulasi nilai kumulatif sekolah disimpan dalam Materialized View yang di-refresh setiap tengah malam secara asinkron.

6. Frontend Specifications (Standardisasi Antarmuka)
Framework & Routing: Next.js App Router (app/).

/dashboard/* (Server-Side Rendered untuk kecepatan SEO internal dan keamanan Admin).

/ujian/[id] (Client-Side Rendered murni dengan Hydration agar interaksi timer mundur dan state jawaban lokal berjalan sangat mulus).

State Management: Zustand untuk global store (mengelola State Login, Tema, Layout Sidebar). React Query (TanStack Query) khusus untuk data fetching, caching, dan sinkronisasi API Background.

Design Language (Sharp Edges): Sesuai kesepakatan eksekutif, TIDAK ADA desain melengkung. Penggunaan kelas Tailwind wajib konsisten: rounded-none, border-2, border-gray-900, high-contrast typography. Ini menciptakan kesan sistem akademik militer/profesional yang tegas.

7. Security, Compliance, & API Protection
Authentication Flow: Autentikasi ganda berbasis Access Token (JWT, umur 15 menit, dikirim via Authorization Header) dan Refresh Token (HttpOnly, Secure Cookie, umur 7 hari). Mencegah pencurian token via XSS.

CORS & Rate Limiting: * CORS diatur ketat hanya menerima dari domain sekolah.

express-rate-limit dipasang di endpoint /login (maks 5 percobaan per menit) dan /submit (maks 10 request per detik untuk mencegah spam klik).

SQL Injection & XSS Protection: Prisma ORM secara otomatis menetralkan potensi SQL Injection. Semua input HTML dari Rich Text Editor (saat guru membuat soal) disanitasi menggunakan pustaka DOMPurify di backend sebelum masuk database.

8. Deployment, DevOps, & Disaster Recovery Strategy
Containerization: Proyek di- bundling dalam multi-stage Dockerfile. Satu image untuk Next.js Frontend, satu image untuk Express Backend. Diorkestrasikan menggunakan docker-compose.yml bersama container PostgreSQL dan Redis.

Volume Persistence: Folder public/uploads (berisi ribuan gambar soal dan materi) di-mount ke host directory agar tidak hilang saat container di-restart ulang.

Automated Backup (Disaster Recovery): Sistem CRON Job di level server (Linux) atau node-cron di Backend yang menjalankan dump PostgreSQL setiap jam 02:00 pagi. File dienkripsi dan di-push ke layanan Cloud Storage eksternal (misal: AWS S3 atau Google Drive API) untuk memastikan data sekolah aman walau server fisik terbakar/rusak.
9. Scalable Directory Structure (Repository Schema)
Struktur di bawah ini bersifat MUTLAK dan wajib diikuti oleh agen AI selama fase implementasi untuk menjaga separasi masalah (Separation of Concerns).

Plaintext
smks-cbt-enterprise/
├── .github/
│   └── workflows/
│       └── ci-cd.yml                # Pipeline otomatisasi GitHub Actions
├── backend/
│   ├── src/
│   │   ├── config/                  # Konfigurasi DB, Redis, JWT, Multer
│   │   ├── controllers/             # Handler HTTP Request/Response
│   │   │   ├── auth.controller.ts
│   │   │   ├── master-data/
│   │   │   ├── e-learning/
│   │   │   ├── cbt/                 # Controller Ujian, Bank Soal, Anti-Cheat
│   │   │   ├── rapor/
│   │   │   └── system/
│   │   ├── middlewares/             # RBAC, Auth, Rate Limiter
│   │   ├── routes/                  # Definisi Endpoint API
│   │   ├── services/                # Logika Bisnis Utama (Kalkulasi, Tokenizer)
│   │   │   ├── auth.service.ts
│   │   │   ├── cbt/
│   │   │   ├── rapor/
│   │   │   └── backup/
│   │   ├── workers/                 # [NEW] Background Jobs / BullMQ Processors
│   │   │   └── answer-queue.worker.ts
│   │   ├── utils/                   # Helper, Zod Validators, Custom Errors
│   │   ├── websocket/               # Socket.io Handlers untuk Live Proctoring
│   │   ├── app.ts                   # Inisialisasi Express App
│   │   └── server.ts                # Entry point server & koneksi port
│   ├── prisma/
│   │   ├── schema.prisma            # Skema Database Enterprise
│   │   ├── migrations/
│   │   └── seed.ts                  # Seeder Admin awal & Data Dummy
│   ├── tests/                       # Unit & Integration Tests
│   ├── .env.example
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── app/                     # Next.js App Router
│   │   │   ├── (auth)/              # Halaman Login
│   │   │   ├── (dashboard)/         # Portal Admin, Guru, Siswa
│   │   │   ├── ujian/               # Layout UI Ujian Khusus (Kiosk Mode)
│   │   │   └── api/                 # Next.js Server-side routes
│   │   ├── components/
│   │   │   ├── ui/                  # Reusable UI (Button, Modal) - Wajib Sharp Edges
│   │   │   ├── layout/              # Sidebar, Header
│   │   │   └── cbt/                 # Engine Ujian, Anti-Cheat Monitor
│   │   ├── hooks/                   # Custom React Hooks
│   │   ├── lib/                     # Axios/Fetch clients, Socket client
│   │   ├── providers/               # [NEW] React Query & Theme Providers
│   │   │   └── AppProvider.tsx
│   │   ├── store/                   # Zustand Global State
│   │   ├── types/                   # Frontend Interfaces
│   │   └── middleware.ts            # Next.js Edge Middleware (Route Protection)
│   ├── public/                      # Static assets (Logo sekolah, dll)
│   ├── .env.example
│   ├── next.config.js
│   ├── Dockerfile
│   ├── package.json
│   └── tailwind.config.ts           # Konfigurasi utility Tailwind
│
├── shared/                          # Simpul tipe data Backend & Frontend
│   ├── types/                       # Interfaces global (cth: IExamPayload)
│   └── constants/                   # Konstanta global (cth: Roles, ExamStatus)
│
├── docker-compose.yml               # Orkestrasi Full-Stack lokal
├── README.md
└── docs/                            # Dokumentasi teknis & API Swagger
