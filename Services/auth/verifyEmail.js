import { verifyEmailToken } from '../emailVerification.js';

/**
 * Verify email endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function verifyEmail(req, res) {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Verification token is required' });
  }

  try {
    const result = await verifyEmailToken(token);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Detect iOS device
    const userAgent = req.get('User-Agent') || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);

    let responseData = {
      success: true,
      message: 'Email verified successfully',
      user: result.user
    };

    if (isIOS) {
      // iOS: Return JWT token for localStorage (no cookie)
      responseData.accessToken = result.jwtToken;
    } else {
      // Desktop/Android: Set 7-day JWT token in HTTP-only cookie
      res.cookie("jwtToken", result.jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
      });
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Email verification endpoint error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
