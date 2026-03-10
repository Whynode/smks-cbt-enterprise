import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// Inisialisasi klien Prisma untuk database PostgreSQL
const prisma = new PrismaClient();

// Inisialisasi klien Redis untuk mengakses antrean jawaban
// Menggunakan ioredis untuk kompatibilitas dengan Upstash Redis
const redisClient = new Redis(process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379');

/**
 * Fungsi utilitas untuk membuat delay/penundaan.
 * Digunakan saat antrean kosong untuk menghindari polling yang terlalu agresif.
 * 
 * @param ms - Durasi penundaan dalam milidetik
 * @returns Promise yang resolve setelah waktu yang ditentukan
 */
const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Memproses satu item jawaban dari antrean Redis.
 * 
 * @param payloadString - String JSON yang berisi data jawaban
 * @returns Promise yang resolve ketika pemrosesan selesai
 */
async function processAnswer(payloadString: string): Promise<void> {
  try {
    // Mengurai string JSON menjadi objek
    const payload = JSON.parse(payloadString);
    
    const { userId, jadwalUjianId, questionId, answer, timestamp } = payload;

    // Validasi payload yang diperlukan
    if (!userId || !jadwalUjianId || !questionId) {
      console.error(
        `[Worker] ERROR: Payload tidak valid. Data: ${payloadString}`
      );
      return;
    }

    // Mencari record HasilUjian yang ada untuk user dan jadwal ujian ini
    const hasilUjian = await prisma.hasilUjian.findUnique({
      where: {
        userId_jadwalUjianId: {
          userId: userId,
          jadwalUjianId: jadwalUjianId
        }
      }
    });

    // Jika record tidak ditemukan, log error dan lanjutkan
    // Ini bisa terjadi jika siswa belum bergabung dengan ujian secara resmi
    if (!hasilUjian) {
      console.error(
        `[Worker] ERROR: Record HasilUjian tidak ditemukan untuk User ID: ${userId}, Jadwal: ${jadwalUjianId}`
      );
      return;
    }

    // Mengurai answersPayload yang sudah ada (field JSON di database)
    // Jika null atau undefined, inisialisasi dengan objek kosong
    let currentAnswers = hasilUjian.answersPayload || {};

    // Jika answersPayload adalah string (karena alasan legacy), parse dulu
    if (typeof currentAnswers === 'string') {
      currentAnswers = JSON.parse(currentAnswers);
    }

    // Memperbarui atau menambahkan jawaban untuk questionId ini
    // Struktur: { "questionId1": "answer1", "questionId2": "answer2", ... }
    currentAnswers[questionId] = answer;

    // Menyimpan answersPayload yang telah diperbarui ke database PostgreSQL
    await prisma.hasilUjian.update({
      where: {
        id: hasilUjian.id
      },
      data: {
        answersPayload: currentAnswers,
        updatedAt: new Date()
      }
    });

    // Log sukses dalam Bahasa Indonesia sesuai PRD
    console.log(
      `[Worker] Berhasil memproses jawaban untuk User ID: ${userId}. Soal: ${questionId}`
    );
  } catch (error: any) {
    // Menangani error saat memproses payload individual
    // PENTING: Error pada satu payload tidak boleh menghentikan worker
    console.error(
      `[Worker] ERROR: Gagal memproses payload. Error: ${error.message}`,
      `Payload: ${payloadString}`
    );
  }
}

/**
 * Fungsi utama untuk memproses antrean jawaban secara berkelanjutan.
 * Menggunakan pola polling dengan LPOP untuk mengambil item dari antrean.
 */
async function processQueue(): Promise<void> {
  console.log('[Worker] Worker antrean jawaban dimulai...');
  console.log('[Worker] Menunggu jawaban masuk ke antrean cbt:answers:queue');

  // Loop tak terbatas untuk memproses antrean secara berkelanjutan
  while (true) {
    try {
      // Melakukan LPOP untuk mengambil item pertama dari antrean
      // LPOP menghapus item dari antrean setelah diambil (FIFO)
      const item = await redisClient.lpop('cbt:answers:queue');

      if (item) {
        // Item ditemukan, proses jawaban
        await processAnswer(item);
      } else {
        // Antrean kosong, tunggu 1000ms sebelum mencoba lagi
        await delay(1000);
      }
    } catch (error: any) {
      // ROBUST ERROR HANDLING: Error di level loop tidak boleh menghentikan worker
      console.error(
        `[Worker] ERROR: Kesalahan pada loop utama worker. Error: ${error.message}`
      );
      
      // Tunggu sebentar sebelum melanjutkan loop untuk menghindari error berulang yang cepat
      await delay(2000);
    }
  }
}

/**
 * Entry point untuk worker.
 * Menjalankan fungsi processQueue dan menangani shutdown yang graceful.
 */
async function main(): Promise<void> {
  console.log('===========================================');
  console.log('SMKS CBT Enterprise - Answer Queue Worker');
  console.log('===========================================');
  console.log(`[Worker] Waktu mulai: ${new Date().toISOString()}`);
  
  try {
    // Mulai memproses antrean
    await processQueue();
  } catch (error: any) {
    // Error fatal yang tidak tertangkap
    console.error('[Worker] FATAL: Worker berhenti karena error fatal:', error);
    process.exit(1);
  } finally {
    // Membersihkan koneksi saat worker berhenti
    console.log('[Worker] Menutup koneksi database dan Redis...');
    await prisma.$disconnect();
    await redisClient.quit();
    console.log('[Worker] Worker telah berhenti.');
  }
}

// Menjalankan worker
main().catch(error => {
  console.error('[Worker] ERROR UNHANDLED:', error);
  process.exit(1);
});
