import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cookie from "cookie";
import pool from "../db/db.js";

dotenv.config();

export async function googleAuth(req, res) {
  const client = await pool.connect();

  try {
    const { accessToken } = req.body;

    const googleUserInfo = await fetch(
      `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${accessToken}`
    );
    const googleData = await googleUserInfo.json();
    console.log("Google Data:", googleData);

    if (!googleData.id) {
      return res.status(400).json({ message: "Invalid Google token" });
    }

    await client.query(
      `INSERT INTO users (google_id, name, email, created_at, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (google_id) DO NOTHING`,
      [googleData.id, googleData.name, googleData.email, new Date(), 'Google']
    );

    const jwtToken = jwt.sign(
      {
        name: googleData.name,
        email: googleData.email,
        googleId: googleData.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.setHeader("Set-Cookie", [
      cookie.serialize("token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      }),
      cookie.serialize("jwtToken", jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      }),
    ]);

    res.json({
      message: "User authenticated",
      success: true,
      user: {
        name: googleData.name,
        firstName: googleData.given_name,
        lastName: googleData.family_name,
        email: googleData.email,
      },
    });
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
