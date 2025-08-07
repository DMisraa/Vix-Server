import nodemailer from 'nodemailer'

export default async function sendEmail(req, res) {
  const { userEmail, guestEmail, token } = req.body;
  console.log('email:', userEmail)

  if (!guestEmail) return res.status(400).json({ error: 'Email is required' });
  if (!token) return res.status(400).json({ error: 'Token is required' });

  // Create transporter (using Gmail)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.VIX_EMAIL,       // e.g., Vix@gmail.com
      pass: process.env.VIX_EMAIL_PASS,  // App Password, not your Gmail password
    },
  });

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
    await transporter.sendMail({
      from: `"Vix Invitations" <${process.env.VIX_EMAIL}>`,
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


