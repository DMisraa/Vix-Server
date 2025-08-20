import jwt from "jsonwebtoken";
import bcrypt from 'bcrypt';
import pool from '../db/db.js';

export async function signup(req, res) {
  const { email, fullName, password } = req.body;
  
  console.log('manual signup logic:', email, fullName, password);
  console.log('Database connection:', {
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    databaseURL: process.env.DATABASE_URL,
  });

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
    console.log('user:', user)

    if (!user) {
      return res.status(409).json({ error: "Email already exists." });
    }

    // Detect iOS device
    const userAgent = req.get('User-Agent') || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);

    if (isIOS) {
      // iOS: Use hybrid approach (short-lived access token + refresh token)
      console.log('📱 iOS device detected - using hybrid token approach for signup');
      
      const accessToken = jwt.sign(
        { name: fullName, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
      );

      const refreshToken = jwt.sign(
        { name: fullName, email: user.email },
        process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Store refresh token in HTTP-only cookie
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
      });

      // Return access token for client storage
      return res.status(201).json({ 
        message: "User registered successfully.",
        accessToken: accessToken,
        user: { name: fullName, email: user.email }
      });
      
    } else {
      // Android/Desktop: Use pure HTTP-only cookies (maximum security)
      console.log('🖥️ Android/Desktop device detected - using HTTP-only cookies for signup');
      
      const jwtToken = jwt.sign(
        { name: fullName, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Store long-lived token in HTTP-only cookie
      res.cookie("jwtToken", jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
      });

      return res.status(201).json({ message: "User registered successfully." });
    }

  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Server error during signup." });
  }
}
