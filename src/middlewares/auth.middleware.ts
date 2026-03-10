import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Memperluas tipe Express Request untuk menyertakan properti user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

/**
 * Middleware untuk memverifikasi token JWT pada setiap permintaan API CBT.
 * 
 * @param req - Objek permintaan Express
 * @param res - Objek respons Express
 * @param next - Fungsi berikutnya dalam rantai middleware
 */
export const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
  // Mengambil header Authorization dari permintaan
  const authHeader = req.headers.authorization;

  // Memeriksa apakah header Authorization ada
  if (!authHeader) {
    res.status(401).json({
      success: false,
      message: "Akses ditolak. Token tidak ditemukan.",
      error: null
    });
    return;
  }

  // Memformat token: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      success: false,
      message: "Akses ditolak. Token tidak ditemukan.",
      error: null
    });
    return;
  }

  const token = parts[1];
  const jwtSecret = process.env.JWT_SECRET;

  // Memeriksa apakah JWT_SECRET diatur
  if (!jwtSecret) {
    res.status(500).json({
      success: false,
      message: "Konfigurasi server tidak valid. Hubungi administrator.",
      error: null
    });
    return;
  }

  // Memverifikasi token menggunakan jsonwebtoken
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      // Token tidak valid atau telah kedaluwarsa
      res.status(403).json({
        success: false,
        message: "Sesi ujian tidak valid atau telah kedaluwarsa.",
        error: null
      });
      return;
    }

    // Menambahkan payload yang telah didekode ke objek request
    req.user = decoded;
    
    // Melanjutkan ke middleware atau handler berikutnya
    next();
  });
};
