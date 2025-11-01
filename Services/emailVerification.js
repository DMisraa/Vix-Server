import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import pool from '../db/db.js';

/**
 * Send email verification to user
 * @param {string} email - User email
 * @param {string} fullName - User full name
 * @returns {Promise<Object>} - Result of email sending
 */
export async function sendVerificationEmail(email, fullName) {
  try {
    // Create verification token
    const verificationToken = jwt.sign(
      { email, fullName },
      process.env.JWT_SECRET,
      { expiresIn: '24h' } // Token expires in 24 hours
    );

    // Create transporter (using Zoho SMTP for production reliability)
    // Fallback to Gmail if Zoho credentials are not available (for development)
    const useZoho = !!(process.env.ZOHO_EMAIL && process.env.ZOHO_PASSWORD);
    
    console.log('📧 Email verification SMTP config check:');
    console.log('  - ZOHO_EMAIL exists:', !!process.env.ZOHO_EMAIL);
    console.log('  - ZOHO_PASSWORD exists:', !!process.env.ZOHO_PASSWORD);
    console.log('  - Using Zoho SMTP:', useZoho);
    console.log('  - Zoho email:', process.env.ZOHO_EMAIL || 'NOT SET');
    
    const transporter = nodemailer.createTransport(
      useZoho
        ? {
            host: 'smtp.zoho.com',
            port: 587,
            secure: false,
            auth: {
              user: process.env.ZOHO_EMAIL,
              pass: process.env.ZOHO_PASSWORD,
            },
            connectionTimeout: 10000, // 10 seconds
            greetingTimeout: 10000,
            socketTimeout: 10000,
          }
        : {
            service: 'gmail',
            auth: {
              user: process.env.VIX_EMAIL,
              pass: process.env.VIX_EMAIL_PASS,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000,
          }
    );

    // Build HTML email with RTL support
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="he">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>אימות אימייל - Vix</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; direction: rtl; text-align: right;">
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; direction: rtl;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px; direction: rtl;">ברוכים הבאים ל-Vix! 🎉</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; direction: rtl; text-align: right;">
            <h2 style="color: #333; margin-top: 0; direction: rtl; text-align: right;">שלום ${fullName}!</h2>
            
            <p style="font-size: 16px; margin-bottom: 20px; direction: rtl; text-align: right;">
              תודה שהצטרפתם ל-Vix! כדי להשלים את ההרשמה ולגשת לכל הפיצ'רים שלנו, אנא אמתו את כתובת האימייל שלכם.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.BASE_URL}/verify-email?token=${verificationToken}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 15px 30px; 
                        text-decoration: none; 
                        border-radius: 25px; 
                        font-weight: bold; 
                        font-size: 16px;
                        display: inline-block;
                        direction: rtl;">
                אמתו את האימייל שלכם
              </a>
            </div>
            
            <p style="font-size: 14px; color: #666; margin-top: 30px; direction: rtl; text-align: right;">
              אם הכפתור לא עובד, תוכלו להעתיק ולהדביק את הקישור הבא בדפדפן שלכם:
            </p>
            <p style="font-size: 12px; color: #999; word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px; direction: ltr; text-align: left;">
              ${process.env.BASE_URL}/verify-email?token=${verificationToken}
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #999; text-align: center; direction: rtl;">
              אם לא ביקשתם הרשמה ל-Vix, תוכלו להתעלם מהאימייל הזה.<br>
              הקישור יפוג תוקף תוך 24 שעות.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    const fromEmail = process.env.ZOHO_EMAIL || process.env.VIX_EMAIL;
    console.log(`📧 Attempting to send verification email:`);
    console.log(`  - From: ${fromEmail}`);
    console.log(`  - To: ${email}`);
    console.log(`  - Using service: ${useZoho ? 'Zoho SMTP' : 'Gmail SMTP'}`);
    
    await transporter.sendMail({
      from: `"Vix Team" <${fromEmail}>`,
      to: email,
      subject: 'אמתו את האימייל שלכם - Vix',
      html,
    });
    
    console.log(`✅ Verification email sent successfully using ${useZoho ? 'Zoho' : 'Gmail'}`);

    return { success: true, verificationToken };
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verify email token and activate user account
 * @param {string} token - Verification token
 * @returns {Promise<Object>} - Verification result
 */
export async function verifyEmailToken(token) {
  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email, fullName } = decoded;

    const client = await pool.connect();

    try {
      // Check if user exists and is not already verified
      const userResult = await client.query(
        `SELECT id, email, name, email_verified FROM users WHERE email = $1`,
        [email]
      );

      const user = userResult.rows[0];

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (user.email_verified === true) {
        return { success: false, error: 'Email already verified' };
      }

      // Update user as verified
      await client.query(
        `UPDATE users SET email_verified = true WHERE email = $1`,
        [email]
      );

      // Generate 7-day JWT token with email_verified: true (matching current auth pattern)
      const jwtToken = jwt.sign(
        { 
          name: fullName, 
          email: user.email,
          email_verified: true
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return {
        success: true,
        user: { name: fullName, email: user.email },
        jwtToken
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Email verification error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return { success: false, error: 'Verification link has expired' };
    } else if (error.name === 'JsonWebTokenError') {
      return { success: false, error: 'Invalid verification link' };
    }
    
    return { success: false, error: 'Verification failed' };
  }
}
