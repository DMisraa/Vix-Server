import jwt from "jsonwebtoken";

export async function refreshToken(req, res) {
  try {
    console.log('=== REFRESH TOKEN REQUEST ===');
    console.log('Cookies received:', Object.keys(req.cookies));
    
    // Get refresh token from HTTP-only cookie
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      console.log('No refresh token found in cookies');
      return res.status(401).json({ message: "No refresh token provided" });
    }
    
    console.log('Refresh token found, verifying...');
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET);
    console.log('Refresh token verified for user:', decoded.email);
    
    // Generate new short-lived access token (15 minutes)
    const newAccessToken = jwt.sign(
      { name: decoded.name, email: decoded.email },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    // Generate new refresh token (7 days) - Refresh Token Rotation
    const newRefreshToken = jwt.sign(
      { name: decoded.name, email: decoded.email },
      process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log('Generated new tokens, setting cookies...');

    // Set the new refresh token in HTTP-only cookie (all platforms)
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
    });

    // Detect iOS device to determine response format
    const userAgent = req.get('User-Agent') || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    console.log('Device type:', isIOS ? 'iOS' : 'Desktop/Android');

    if (isIOS) {
      // iOS: Return access token in response body for localStorage (NO HTTP-only cookie)
      console.log('Returning access token in response body for iOS');
      res.json({ 
        accessToken: newAccessToken,
        message: "Token refreshed successfully"
      });
    } else {
      // Desktop/Android: Set access token in HTTP-only cookie (NO response body)
      console.log('Setting access token in HTTP-only cookie for Desktop/Android');
      res.cookie("accessToken", newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        path: "/",
        maxAge: 60 * 60 * 15 * 1000, // 15 minutes
      });
      
      res.json({ 
        message: "Token refreshed successfully"
      });
    }
    
  } catch (error) {
    console.error('Refresh token error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Refresh token expired" });
    }
    
    res.status(401).json({ message: "Invalid refresh token" });
  }
} 