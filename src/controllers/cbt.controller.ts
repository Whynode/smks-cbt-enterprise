import { Request, Response, NextFunction } from 'express';
import { CbtService } from '../services/cbt.service';

/**
 * Controller untuk menangani operasi Computer-Based Test (CBT).
 * Mengikuti arsitektur berlapis: Routes -> Controllers -> Services.
 */
export class CbtController {
  private cbtService: CbtService;

  constructor() {
    this.cbtService = new CbtService();
  }

  /**
   * Menangani permintaan siswa untuk memasuki sesi ujian.
   * @param req - Objek permintaan Express
   * @param res - Objek respons Express
   * @param next - Fungsi berikutnya dalam rantai middleware
   */
  async joinExam(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tokenUjian } = req.body;
      const userId = req.user?.id || req.user?.userId;

      // Memvalidasi input
      if (!tokenUjian) {
        res.status(400).json({
          success: false,
          message: "Token ujian tidak disediakan.",
          error: null
        });
        return;
      }

      // Memanggil service untuk bergabung dengan ujian
      const result = await this.cbtService.joinExam(userId, tokenUjian);

      // Mengembalikan respons sukses
      res.status(200).json({
        success: true,
        message: "Berhasil memasuki sesi ujian",
        data: result
      });
    } catch (error: any) {
      // Menangani error dengan kode status yang sesuai
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || "Terjadi kesalahan pada server.",
        error: error.details || null
      });
    }
  }

  /**
   * Menangani permintaan untuk mengambil soal ujian.
   * @param req - Objek permintaan Express
   * @param res - Objek respons Express
   * @param next - Fungsi berikutnya dalam rantai middleware
   */
  async getQuestions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jadwalUjianId } = req.params;

      // Memvalidasi parameter
      if (!jadwalUjianId) {
        res.status(400).json({
          success: false,
          message: "ID jadwal ujian tidak disediakan.",
          error: null
        });
        return;
      }

      // Memanggil service untuk mendapatkan soal ujian
      const questions = await this.cbtService.getExamQuestions(jadwalUjianId);

      // Mengembalikan respons sukses
      res.status(200).json({
        success: true,
        message: "Berhasil mengambil soal ujian",
        data: questions
      });
    } catch (error: any) {
      // Menangani error dengan kode status yang sesuai
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || "Terjadi kesalahan pada server.",
        error: error.details || null
      });
    }
  }

  /**
   * Menangani pengiriman jawaban siswa ke antrean Redis.
   * @param req - Objek permintaan Express
   * @param res - Objek respons Express
   * @param next - Fungsi berikutnya dalam rantai middleware
   */
  async submitAnswer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jadwalUjianId, questionId, answer } = req.body;
      const userId = req.user?.id || req.user?.userId;

      // Memvalidasi input
      if (!jadwalUjianId || !questionId) {
        res.status(400).json({
          success: false,
          message: "Data jawaban tidak lengkap.",
          error: null
        });
        return;
      }

      // Memanggil service untuk mendorong jawaban ke antrean
      await this.cbtService.pushAnswerToQueue(userId, jadwalUjianId, questionId, answer);

      // Mengembalikan respons sukses
      res.status(200).json({
        success: true,
        message: "Jawaban berhasil disimpan ke antrean",
        data: null
      });
    } catch (error: any) {
      // Menangani error dengan kode status yang sesuai
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || "Terjadi kesalahan pada server.",
        error: error.details || null
      });
    }
  }

  /**
   * Menangani penyelesaian sesi ujian oleh siswa.
   * @param req - Objek permintaan Express
   * @param res - Objek respons Express
   * @param next - Fungsi berikutnya dalam rantai middleware
   */
  async finishExam(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jadwalUjianId } = req.body;
      const userId = req.user?.id || req.user?.userId;

      // Memvalidasi input
      if (!jadwalUjianId) {
        res.status(400).json({
          success: false,
          message: "ID jadwal ujian tidak disediakan.",
          error: null
        });
        return;
      }

      // Memanggil service untuk menyelesaikan ujian
      const result = await this.cbtService.finishExam(userId, jadwalUjianId);

      // Mengembalikan respons sukses
      res.status(200).json({
        success: true,
        message: "Ujian telah selesai",
        data: result
      });
    } catch (error: any) {
      // Menangani error dengan kode status yang sesuai
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || "Terjadi kesalahan pada server.",
        error: error.details || null
      });
    }
  }
}
