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

    const jwtToken = jwt.sign(
      { name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Detect if it's a mobile browser
    const userAgent = req.get('User-Agent') || '';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    
    // Get the origin for cookie domain setting
    const origin = req.get('Origin') || process.env.PRODUCTION_URL || process.env.BASE_URL;
    const isProduction = process.env.NODE_ENV === "production";
    
    // Use None for production to allow cross-origin cookies
    const sameSiteSetting = isProduction ? "None" : "Lax";
    
    // Add additional headers for mobile Safari
    if (isMobile) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: sameSiteSetting,
      path: "/",
      maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
    };
    
    // Set domain for Vercel deployments to allow cross-subdomain cookies
    if (isProduction) {
      cookieOptions.domain = ".vercel.app";
    }
    
    console.log('Setting JWT cookie with options:', {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      domain: cookieOptions.domain,
      maxAge: cookieOptions.maxAge
    });
    
    res.cookie("jwtToken", jwtToken, cookieOptions);

    // For mobile browsers, also return the token in response as fallback
    const responseData = { message: "Login successful." };
    // Always return token for cross-domain cookie support
    responseData.token = jwtToken;

    client.release();
    return res.status(200).json(responseData);

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "שגיאת שרת במהלך ההתחברות." });
  }
}
