import jwt from "jsonwebtoken";
import bcrypt from 'bcrypt';
import pool from '../db/db.js';

export async function signup(req, res) {
  const { email, fullName, password } = req.body;

  if (!email || !fullName || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  if (password.length < 7 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({
      error: "Password must be at least 7 characters and include letters and numbers.",
    });
  }

  try {
    const client = await pool.connect();
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await client.query(
      `INSERT INTO users (name, email, password, source, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email`,
      [fullName, email, hashedPassword, "Manual", new Date()]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(409).json({ error: "Email already exists." });
    }

    // Detect iOS device
    const userAgent = req.get('User-Agent') || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);

    if (isIOS) {
      // iOS: Use 7-day JWT token with smart extension (same as login)
      const jwtToken = jwt.sign(
        { name: fullName, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "7d" } // 7 days
      );

      // NO HTTP-only cookie for iOS access token - only localStorage
      return res.status(201).json({ 
        message: "User registered successfully.",
        accessToken: jwtToken, // For localStorage
        user: { name: fullName, email: user.email }
      });
      
    } else {
      // Desktop/Android: Use refresh token rotation approach
      
      // Short-lived access token (15 minutes)
      const accessToken = jwt.sign(
        { name: fullName, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "2h" }
      );

      // Long-lived refresh token (7 days)
      const refreshToken = jwt.sign(
        { name: fullName, email: user.email },
        process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Store refresh token in HTTP-only cookie (all platforms)
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

      return res.status(201).json({ 
        message: "User registered successfully.",
        user: { name: fullName, email: user.email }
      });
    }

  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Server error during signup." });
  }
}
