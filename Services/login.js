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
      `SELECT id, name, email, password, email_verified FROM users WHERE email = $1`,
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

    // Check if email is verified (only for manual signup, not Google)
    if (user.email_verified === false) {
      client.release();
      return res.status(403).json({ 
        error: "אנא אמתו את האימייל שלכם לפני ההתחברות. בדקו את תיבת הדואר הנכנס.",
        requiresVerification: true 
      });
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
      // Desktop/Android: Now also use 7-day JWT token (simplified approach)
      const jwtToken = jwt.sign(
        { name: user.name, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "7d" } // 7 days
      );

      // Store 7-day JWT token in HTTP-only cookie for desktop/Android
      res.cookie("jwtToken", jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
      });
    }

    client.release();
    return res.status(200).json(responseData);

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "שגיאת שרת במהלך ההתחברות." });
  }
}
