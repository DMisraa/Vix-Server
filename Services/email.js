import nodemailer from 'nodemailer'

export default async function sendEmail(req, res) {
  const { userEmail, guestEmail, token } = req.body;
  console.log('email:', userEmail)

  if (!guestEmail) return res.status(400).json({ error: 'Email is required' });
  if (!token) return res.status(400).json({ error: 'Token is required' });

  // Create transporter (using Zoho SMTP for production reliability)
  // Fallback to Gmail if Zoho credentials are not available (for development)
  const transporter = nodemailer.createTransport(
    process.env.ZOHO_EMAIL && process.env.ZOHO_PASSWORD
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

  // Build HTML email with JWT token
  const html = `
    <div style="font-family: Arial; line-height: 1.5;">
      <h2>הזמנה לשליחת אנשי קשר</h2>
      <p>היי! הוזמנת לשלוח אנשי קשר מהנייד או מהאקסל על ידי ("שם המבקש").</p>
      <p>להעלאת אנשי קשר, לחץ על הקישור הבא:</p>
      <a href="${process.env.BASE_URL}/guest-upload?token=${token}" target="_blank">פתח הזמנה</a>
    </div>
  `;

  try {
    const fromEmail = process.env.ZOHO_EMAIL || process.env.VIX_EMAIL;
    await transporter.sendMail({
      from: `"Vix Invitations" <${fromEmail}>`,
      to: guestEmail,
      subject: 'הוזמנת לאירוע 🎉',
      html,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Failed to send email:', err);
    return res.status(500).json({ error: 'Failed to send email' });
  }
};


