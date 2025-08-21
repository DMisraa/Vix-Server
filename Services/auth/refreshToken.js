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
    
    // Generate new short-lived access token
    const newAccessToken = jwt.sign(
      { name: decoded.name, email: decoded.email },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    
    // Return new access token
    res.json({ 
      accessToken: newAccessToken,
      message: "Token refreshed successfully"
    });
    
  } catch (error) {
    console.error('Refresh token error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Refresh token expired" });
    }
    
    res.status(401).json({ message: "Invalid refresh token" });
  }
} 