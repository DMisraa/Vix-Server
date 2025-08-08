import jwt from "jsonwebtoken";
import bcrypt from 'bcrypt';
import pool from '../db/db.js';

export async function signup(req, res) {
  console.log('=== SIGNUP REQUEST START ===');
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Request body:', req.body);
  
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
    console.log('Attempting database connection...');
    const client = await pool.connect();
    console.log('Database connected successfully');

    console.log('Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('Executing insert query...');
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
      client.release();
      return res.status(409).json({ error: "Email already exists." });
    }

    console.log('Creating JWT...');
    // Create JWT
    const jwtToken = jwt.sign(
      { name: fullName, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log('Setting cookie...');
    // Set JWT as cookie
    res.cookie("jwtToken", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days in ms
    });

    console.log('Signup successful');
    client.release();
    return res.status(201).json({ message: "User registered successfully." });

  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Server error during signup." });
  }
}
