import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import pool from '../db/db.js';

export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "נדרשים אימייל וסיסמה." });
  }

  try {
    const client = await pool.connect();
    const result = await client.query(
      `SELECT id, name, email, password FROM users WHERE email = $1`,
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      client.release();
      return res.status(401).json({ error: "אימייל או סיסמה שגויים." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      client.release();
      return res.status(401).json({ error: "אימייל או סיסמה שגויים." });
    }

    // Detect iOS device
    const userAgent = req.get('User-Agent') || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);

    let responseData = { 
      message: "Login successful.",
      user: { name: user.name, email: user.email }
    };

    if (isIOS) {
      // iOS: Use 7-day JWT token with smart extension
      const jwtToken = jwt.sign(
        { name: user.name, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "7d" } // 7 days
      );

      // NO HTTP-only cookie for iOS access token - only localStorage
      responseData.accessToken = jwtToken;
      
    } else {
      // Desktop/Android: Use refresh token rotation approach
      
      // Short-lived access token (15 minutes)
      const accessToken = jwt.sign(
        { name: user.name, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "2h" }
      );

      // Long-lived refresh token (7 days)
      const refreshToken = jwt.sign(
        { name: user.name, email: user.email },
        process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Store refresh token in HTTP-only cookie
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
      });

      // Store access token in HTTP-only cookie (Desktop/Android only)
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        path: "/",
        maxAge: 60 * 60 * 15 * 1000, // 15 minutes
      });
    }

    client.release();
    return res.status(200).json(responseData);

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "שגיאת שרת במהלך ההתחברות." });
  }
}
