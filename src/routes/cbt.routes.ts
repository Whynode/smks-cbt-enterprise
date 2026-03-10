import { Router } from 'express';
import { verifyToken } from '../middlewares/auth.middleware';
import { CbtController } from '../controllers/cbt.controller';

// Inisialisasi Express Router
const router = Router();

// Inisialisasi controller CBT
const cbtController = new CbtController();

/**
 * Rute untuk memasuki sesi ujian.
 * @route POST /cbt/join
 * @access Private (memerlukan token)
 */
router.post('/join', verifyToken, (req, res, next) => {
  cbtController.joinExam(req, res, next);
});

/**
 * Rute untuk mengambil daftar soal ujian.
 * @route GET /cbt/questions/:jadwalUjianId
 * @access Private (memerlukan token)
 */
router.get('/questions/:jadwalUjianId', verifyToken, (req, res, next) => {
  cbtController.getQuestions(req, res, next);
});

/**
 * Rute untuk mengirimkan jawaban siswa ke antrean Redis.
 * @route POST /cbt/submit-answer
 * @access Private (memerlukan token)
 */
router.post('/submit-answer', verifyToken, (req, res, next) => {
  cbtController.submitAnswer(req, res, next);
});

/**
 * Rute untuk menyelesaikan sesi ujian.
 * @route POST /cbt/finish
 * @access Private (memerlukan token)
 */
router.post('/finish', verifyToken, (req, res, next) => {
  cbtController.finishExam(req, res, next);
});

// Mengekspor router untuk digunakan di aplikasi utama
export default router;
