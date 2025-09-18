import jwt from "jsonwebtoken";

export async function refreshToken(req, res) {
  try {
    // Get refresh token from HTTP-only cookie
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ message: "No refresh token provided" });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET);
    
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

    // Set the new refresh token in HTTP-only cookie
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
    });

    // Set the new access token in HTTP-only cookie (for desktop/Android)
    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      path: "/",
      maxAge: 60 * 60 * 15 * 1000, // 15 minutes
    });
    
    // Detect iOS device to determine response format
    const userAgent = req.get('User-Agent') || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);

    if (isIOS) {
      // iOS: Return access token in response body for localStorage
      res.json({ 
        accessToken: newAccessToken,
        message: "Token refreshed successfully"
      });
    } else {
      // Desktop/Android: Access token is in cookie, no need to return it
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