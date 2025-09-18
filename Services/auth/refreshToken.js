import jwt from "jsonwebtoken";

export async function refreshToken(req, res) {
  try {
    console.log('=== REFRESH TOKEN REQUEST ===');
    
    // Detect iOS device first
    const userAgent = req.get('User-Agent') || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    console.log('Device type:', isIOS ? 'iOS' : 'Desktop/Android');
    
    if (isIOS) {
      // iOS: Smart token extension (only when < 3 days remaining)
      const authHeader = req.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('No Authorization header found for iOS');
        return res.status(401).json({ message: "No token provided" });
      }
      
      const accessToken = authHeader.substring(7);
      console.log('Checking iOS JWT token expiration...');
      
      try {
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
        console.log('iOS JWT token verified for user:', decoded.email);
        
        // Check if token expires in less than 3 days
        const now = Math.floor(Date.now() / 1000); // Current time in seconds
        const tokenExp = decoded.exp; // Token expiration time
        const timeUntilExpiry = tokenExp - now; // Seconds until expiry
        const threeDaysInSeconds = 3 * 24 * 60 * 60; // 3 days in seconds
        
        console.log(`Token expires in ${Math.floor(timeUntilExpiry / (24 * 60 * 60))} days`);
        
        if (timeUntilExpiry < threeDaysInSeconds) {
          // Token expires in less than 3 days, extend it
          console.log('Token expires in less than 3 days, extending...');
          
          const newJwtToken = jwt.sign(
            { name: decoded.name, email: decoded.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" } // New 7-day token
          );
          
          console.log('Returning extended JWT token for iOS');
          res.json({ 
            accessToken: newJwtToken,
            message: "Token extended successfully"
          });
        } else {
          // Token still has more than 3 days, no need to extend
          console.log('Token still has more than 3 days, no extension needed');
          res.json({ 
            message: "Token is still valid, no extension needed"
          });
        }
        
      } catch (error) {
        console.error('iOS JWT token verification failed:', error);
        return res.status(401).json({ message: "Invalid or expired token" });
      }
      
    } else {
      // Desktop/Android: Use refresh token rotation approach (unchanged)
      const refreshToken = req.cookies.refreshToken;
      
      if (!refreshToken) {
        console.log('No refresh token found for Desktop/Android');
        return res.status(401).json({ message: "No refresh token provided" });
      }
      
      console.log('Verifying refresh token for Desktop/Android...');
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

      console.log('Generated new tokens for Desktop/Android, setting cookies...');

      // Set the new refresh token in HTTP-only cookie
      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
      });

      // Set the new access token in HTTP-only cookie
      res.cookie("accessToken", newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        path: "/",
        maxAge: 60 * 60 * 15 * 1000, // 15 minutes
      });
      
      console.log('Returning success message for Desktop/Android');
      res.json({ 
        message: "Token refreshed successfully"
      });
    }
    
  } catch (error) {
    console.error('Refresh token error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Token expired" });
    }
    
    res.status(401).json({ message: "Invalid token" });
  }
} 