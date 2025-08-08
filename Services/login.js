import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import pool from '../db/db.js';

export async function login(req, res) {
  console.log('=== LOGIN REQUEST START ===');
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Request body:', req.body);
  
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    console.log('Attempting database connection...');
    const client = await pool.connect();
    console.log('Database connected successfully');

    console.log('Executing query...');
    const result = await client.query(
      `SELECT id, name, email, password FROM users WHERE email = $1`,
      [email]
    );
    console.log('Query completed, rows found:', result.rows.length);

    const user = result.rows[0];

    if (!user) {
      client.release();
      return res.status(401).json({ error: "Invalid email or password." });
    }

    console.log('Comparing password...');
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      client.release();
      return res.status(401).json({ error: "Invalid email or password." });
    }

    console.log('Creating JWT...');
    const jwtToken = jwt.sign(
      { name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log('Setting cookie...');
    res.cookie("jwtToken", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
    });

    console.log('Login successful');
    client.release();
    return res.status(200).json({ message: "Login successful." });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error during login." });
  }
}
