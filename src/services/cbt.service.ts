import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// Inisialisasi klien Prisma untuk database PostgreSQL
const prisma = new PrismaClient();

// Inisialisasi klien Redis untuk caching dan antrean
// Menggunakan ioredis untuk kompatibilitas dengan Upstash Redis
const redisClient = new Redis(process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379');

/**
 * Custom error class untuk menangani error bisnis dengan kode status HTTP.
 */
class AppError extends Error {
  statusCode: number;
  details?: any;

  constructor(message: string, statusCode: number, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'AppError';
  }
}

/**
 * Service untuk menangani logika bisnis Computer-Based Test (CBT).
 * Mengelola operasi database dan interaksi dengan Redis.
 */
export class CbtService {
  /**
   * Bergabung dengan sesi ujian menggunakan token ujian.
   * 
   * @param userId - ID pengguna yang akan mengikuti ujian
   * @param token - Token ujian untuk validasi sesi
   * @returns Detail ujian yang berhasil diakses
   * @throws AppError jika token tidak valid atau ujian tidak sedang berlangsung
   */
  async joinExam(userId: string, token: string): Promise<any> {
    try {
      // Mencari jadwal ujian berdasarkan token
      const jadwalUjian = await prisma.jadwalUjian.findFirst({
        where: {
          token: token
        },
        include: {
          mapel: true
        }
      });

      // Memeriksa apakah jadwal ujian ditemukan
      if (!jadwalUjian) {
        throw new AppError(
          "Token ujian tidak valid atau tidak ditemukan.",
          404,
          { token: token }
        );
      }

      // Memeriksa status ujian - harus ONGOING untuk bisa diakses
      if (jadwalUjian.status !== 'ONGOING') {
        throw new AppError(
          `Ujian belum atau telah selesai. Status saat ini: ${jadwalUjian.status}`,
          400,
          { status: jadwalUjian.status }
        );
      }

      // Membuat atau memperbarui record HasilUjian untuk siswa ini
      // answersPayload diinisialisasi dengan objek kosong {}
      const hasilUjian = await prisma.hasilUjian.upsert({
        where: {
          userId_jadwalUjianId: {
            userId: userId,
            jadwalUjianId: jadwalUjian.id
          }
        },
        update: {
          // Memperbarui timestamp jika sudah ada record
          updatedAt: new Date()
        },
        create: {
          userId: userId,
          jadwalUjianId: jadwalUjian.id,
          answersPayload: {}, // Inisialisasi dengan objek JSON kosong
          status: 'IN_PROGRESS'
        }
      });

      // Mengembalikan detail ujian
      return {
        jadwalUjianId: jadwalUjian.id,
        namaUjian: jadwalUjian.nama,
        mapel: jadwalUjian.mapel,
        waktuMulai: jadwalUjian.waktuMulai,
        waktuSelesai: jadwalUjian.waktuSelesai,
        durasiMenit: jadwalUjian.durasiMenit,
        hasilUjianId: hasilUjian.id
      };
    } catch (error: any) {
      // Melempar kembali error jika sudah merupakan AppError
      if (error instanceof AppError) {
        throw error;
      }
      // Menangani error tak terduga
      throw new AppError(
        "Gagal memasuki sesi ujian. Silakan coba lagi.",
        500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Mengambil soal ujian dengan mekanisme cache Redis.
   * 
   * @param jadwalUjianId - ID jadwal ujian
   * @returns Array soal ujian dari contentPayload BankSoal
   * @throws AppError jika jadwal ujian tidak ditemukan
   */
  async getExamQuestions(jadwalUjianId: string): Promise<any> {
    try {
      // Kunci cache Redis untuk soal ujian ini
      const cacheKey = `cbt:questions:${jadwalUjianId}`;

      // LOGIKA CACHE REDIS: Coba ambil dari cache terlebih dahulu
      const cachedData = await redisClient.get(cacheKey);

      if (cachedData) {
        // Jika data ada di cache, parse dan kembalikan segera
        console.log(`[Cache Hit] Soal ujian ${jadwalUjianId} diambil dari Redis.`);
        return JSON.parse(cachedData);
      }

      // Jika tidak ada di cache, ambil dari database
      console.log(`[Cache Miss] Soal ujian ${jadwalUjianId} diambil dari database.`);

      const jadwalUjian = await prisma.jadwalUjian.findUnique({
        where: {
          id: jadwalUjianId
        },
        include: {
          bankSoal: true
        }
      });

      // Memeriksa apakah jadwal ujian ditemukan
      if (!jadwalUjian) {
        throw new AppError(
          "Jadwal ujian tidak ditemukan.",
          404,
          { jadwalUjianId: jadwalUjianId }
        );
      }

      // Mengekstrak contentPayload dari setiap BankSoal
      const questionsPayload = jadwalUjian.bankSoal.map((bankSoal) => ({
        questionId: bankSoal.id,
        contentPayload: bankSoal.contentPayload
      }));

      // Menyimpan payload ke Redis dengan TTL 1 jam (3600 detik)
      // Menggunakan SETEX untuk set dengan expiry time
      await redisClient.setex(
        cacheKey,
        3600, // TTL dalam detik (1 jam)
        JSON.stringify(questionsPayload)
      );

      console.log(`[Cache Set] Soal ujian ${jadwalUjianId} disimpan ke Redis selama 1 jam.`);

      return questionsPayload;
    } catch (error: any) {
      // Melempar kembali error jika sudah merupakan AppError
      if (error instanceof AppError) {
        throw error;
      }
      // Menangani error tak terduga
      throw new AppError(
        "Gagal mengambil soal ujian. Silakan coba lagi.",
        500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Mendorong jawaban siswa ke antrean Redis untuk diproses secara asynchronous.
   * Ini mencegah bottleneck pada database PostgreSQL dengan menunda penulisan.
   * 
   * @param userId - ID pengguna yang menjawab
   * @param jadwalUjianId - ID jadwal ujian
   * @param questionId - ID soal yang dijawab
   * @param answer - Jawaban siswa (bisa string, number, atau objek)
   * @throws AppError jika terjadi kesalahan saat mendorong ke antrean
   */
  async pushAnswerToQueue(
    userId: string,
    jadwalUjianId: string,
    questionId: string,
    answer: any
  ): Promise<void> {
    try {
      // Membuat payload jawaban
      const answerPayload = {
        userId: userId,
        jadwalUjianId: jadwalUjianId,
        questionId: questionId,
        answer: answer,
        timestamp: Date.now()
      };

      // Mendorong payload ke antrean Redis menggunakan RPUSH
      // Antrean bernama: cbt:answers:queue
      await redisClient.rpush(
        'cbt:answers:queue',
        JSON.stringify(answerPayload)
      );

      console.log(
        `[Antrean] Jawaban untuk User ID: ${userId}, Soal: ${questionId} berhasil ditambahkan ke antrean.`
      );
    } catch (error: any) {
      // Menangani error saat mendorong ke antrean
      throw new AppError(
        "Gagal menyimpan jawaban ke antrean. Silakan coba lagi.",
        500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Menyelesaikan sesi ujian untuk siswa.
   * 
   * @param userId - ID pengguna yang menyelesaikan ujian
   * @param jadwalUjianId - ID jadwal ujian
   * @returns Objek konfirmasi penyelesaian ujian
   * @throws AppError jika record HasilUjian tidak ditemukan
   */
  async finishExam(userId: string, jadwalUjianId: string): Promise<any> {
    try {
      // Memverifikasi bahwa record HasilUjian ada
      const hasilUjian = await prisma.hasilUjian.findUnique({
        where: {
          userId_jadwalUjianId: {
            userId: userId,
            jadwalUjianId: jadwalUjianId
          }
        }
      });

      // Memeriksa apakah record HasilUjian ditemukan
      if (!hasilUjian) {
        throw new AppError(
          "Record hasil ujian tidak ditemukan. Pastikan Anda telah bergabung dengan ujian terlebih dahulu.",
          404,
          { userId: userId, jadwalUjianId: jadwalUjianId }
        );
      }

      // Memperbarui status ujian menjadi COMPLETED
      const updatedHasilUjian = await prisma.hasilUjian.update({
        where: {
          id: hasilUjian.id
        },
        data: {
          status: 'COMPLETED',
          submittedAt: new Date()
        }
      });

      console.log(
        `[Selesai] User ID: ${userId} telah menyelesaikan ujian ${jadwalUjianId}.`
      );

      // Mengembalikan konfirmasi penyelesaian
      return {
        hasilUjianId: updatedHasilUjian.id,
        status: updatedHasilUjian.status,
        submittedAt: updatedHasilUjian.submittedAt,
        message: "Perhitungan nilai akan diproses secara otomatis."
      };
    } catch (error: any) {
      // Melempar kembali error jika sudah merupakan AppError
      if (error instanceof AppError) {
        throw error;
      }
      // Menangani error tak terduga
      throw new AppError(
        "Gagal menyelesaikan ujian. Silakan hubungi administrator.",
        500,
        { originalError: error.message }
      );
    }
  }
}
