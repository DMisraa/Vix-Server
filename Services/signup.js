import jwt from "jsonwebtoken";
import bcrypt from 'bcrypt';
import pool from '../db/db.js';
import { sendVerificationEmail } from './emailVerification.js';

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
      `INSERT INTO users (name, email, password, source, created_at, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email`,
      [fullName, email, hashedPassword, "Manual", new Date(), false]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(409).json({ error: "Email already exists." });
    }

    // Send verification email
    const emailResult = await sendVerificationEmail(user.email, fullName);

    if (!emailResult.success) {
      // If email sending fails, clean up the user record
      await client.query(`DELETE FROM users WHERE id = $1`, [user.id]);
      return res.status(500).json({ error: "Failed to send verification email. Please try again." });
    }

    client.release();

    return res.status(201).json({ 
      message: "User registered successfully. Please check your email to verify your account.",
      requiresVerification: true,
      email: user.email
    });

  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Server error during signup." });
  }
}
