import nodemailer from 'nodemailer';

export async function handleContactForm(req, res) {
  console.log('Contact form endpoint hit!');
  console.log('Request body:', req.body);
  
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  const { name, email, subject, message } = req.body;

  // Validate required fields
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ 
      error: 'כל השדות נדרשים',
      missing: {
        name: !name,
        email: !email,
        subject: !subject,
        message: !message
      }
    });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'כתובת אימייל לא תקינה' });
  }

  try {
    // Check if email credentials are available
    if (!process.env.VIX_EMAIL || !process.env.VIX_EMAIL_PASS) {
      console.error('Missing email credentials:', {
        VIX_EMAIL: !!process.env.VIX_EMAIL,
        VIX_EMAIL_PASS: !!process.env.VIX_EMAIL_PASS
      });
      return res.status(500).json({ error: 'שרת דואר לא מוגדר' });
    }

    console.log('Creating email transporter...');
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.VIX_EMAIL,
        pass: process.env.VIX_EMAIL_PASS,
      },
    });

    // Email content
    const mailOptions = {
      from: `"Vix Contact Form" <${process.env.VIX_EMAIL}>`,
      to: 'hello@vixsolutions.co.il',
      subject: `הודעה חדשה מ-${name}: ${subject}`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #e91e63; padding-bottom: 10px;">
            הודעה חדשה מהאתר
          </h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #e91e63; margin-top: 0;">פרטי השולח:</h3>
            <p><strong>שם:</strong> ${name}</p>
            <p><strong>אימייל:</strong> ${email}</p>
            <p><strong>נושא:</strong> ${subject}</p>
          </div>
          
          <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="color: #333; margin-top: 0;">תוכן ההודעה:</h3>
            <p style="line-height: 1.6; white-space: pre-wrap;">${message}</p>
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background-color: #e3f2fd; border-radius: 8px;">
            <p style="margin: 0; color: #1976d2; font-size: 14px;">
              <strong>זמן שליחה:</strong> ${new Date().toLocaleString('he-IL', { 
                timeZone: 'Asia/Jerusalem',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
        </div>
      `,
      replyTo: email
    };

    // Send email
    console.log('Sending contact form email...');
    await transporter.sendMail(mailOptions);
    console.log('Contact form email sent successfully');

    // Send confirmation email to the user
    const confirmationMailOptions = {
      from: `"Vix Solutions" <${process.env.VIX_EMAIL}>`,
      to: email,
      subject: 'תודה על פנייתך - Vix Solutions',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e91e63; text-align: center;">תודה על פנייתך!</h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p>שלום ${name},</p>
            <p>קיבלנו את הודעתך ונחזור אליך בהקדם האפשרי.</p>
            <p><strong>פרטי הפנייה שלך:</strong></p>
            <ul>
              <li><strong>נושא:</strong> ${subject}</li>
              <li><strong>זמן שליחה:</strong> ${new Date().toLocaleString('he-IL', { 
                timeZone: 'Asia/Jerusalem',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</li>
            </ul>
          </div>
          
          <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center;">
            <p style="margin: 0; color: #1976d2;">
              <strong>צוות Vix Solutions</strong><br>
              📧 hello@vixsolutions.co.il<br>
              📞 053-924-2324
            </p>
          </div>
        </div>
      `
    };

    console.log('Sending confirmation email...');
    await transporter.sendMail(confirmationMailOptions);
    console.log('Confirmation email sent successfully');

    res.status(200).json({ 
      success: true, 
      message: 'ההודעה נשלחה בהצלחה! נחזור אליך בהקדם.' 
    });

  } catch (error) {
    console.error('Error sending contact form email:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      response: error.response,
      stack: error.stack
    });
    
    let errorMessage = 'שגיאה בשליחת ההודעה. אנא נסה שוב מאוחר יותר.';
    
    // Provide more specific error messages
    if (error.code === 'EAUTH') {
      errorMessage = 'שגיאה באימות הדואר. אנא פנה לתמיכה.';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'שגיאה בחיבור לשרת הדואר. אנא נסה שוב מאוחר יותר.';
    } else if (error.message && error.message.includes('Invalid login')) {
      errorMessage = 'שגיאה בהגדרות הדואר. אנא פנה לתמיכה.';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
