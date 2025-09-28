import jwt from "jsonwebtoken";

export async function refreshToken(req, res) {
  try {
    console.log('=== REFRESH TOKEN REQUEST ===');
    console.log('Cookies:', req.cookies);
    console.log('Authorization header:', req.get('Authorization'));
    
    // Detect iOS device first
    const userAgent = req.get('User-Agent') || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    
    if (isIOS) {
      // iOS: Smart token extension (only when < 3 days remaining)
      const authHeader = req.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "No token provided" });
      }
      
      const accessToken = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
        
        // Check if token expires in less than 3 days
        const now = Math.floor(Date.now() / 1000); // Current time in seconds
        const tokenExp = decoded.exp; // Token expiration time
        const timeUntilExpiry = tokenExp - now; // Seconds until expiry
        const threeDaysInSeconds = 3 * 24 * 60 * 60; // 3 days in seconds
        
        if (timeUntilExpiry < threeDaysInSeconds) {
          // Token expires in less than 3 days, extend it
          const newJwtToken = jwt.sign(
            { name: decoded.name, email: decoded.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" } // New 7-day token
          );
          
          res.json({ 
            accessToken: newJwtToken,
            message: "Token extended successfully"
          });
        } else {
          // Token still has more than 3 days, no need to extend
          res.json({ 
            message: "Token is still valid, no extension needed"
          });
        }
        
      } catch (error) {
        console.error('iOS JWT token verification failed:', error);
        return res.status(401).json({ message: "Invalid or expired token" });
      }
      
    } else {
      // Desktop/Android: Check for different token types
      
      // First, check for refreshToken cookie (regular login)
      let refreshToken = req.cookies.refreshToken;
      
      if (refreshToken) {
        // Regular login with refresh token
        try {
          const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET);
          
          // Generate new short-lived access token (2 hours)
          const newAccessToken = jwt.sign(
            { name: decoded.name, email: decoded.email },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
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

          // Set the new access token in HTTP-only cookie
          res.cookie("accessToken", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            path: "/",
            maxAge: 60 * 60 * 2 * 1000, // 2 hours
          });
          
          console.log('Regular login token refreshed successfully');
          return res.json({ 
            message: "Token refreshed successfully"
          });
        } catch (error) {
          console.error('Refresh token verification failed:', error);
          return res.status(401).json({ message: "Invalid refresh token" });
        }
      }
      
      // Check for jwtToken cookie (Google Auth)
      const jwtToken = req.cookies.jwtToken;
      if (jwtToken) {
        try {
          const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
          
          // Check if token expires in less than 3 days
          const now = Math.floor(Date.now() / 1000);
          const tokenExp = decoded.exp;
          const timeUntilExpiry = tokenExp - now;
          const threeDaysInSeconds = 3 * 24 * 60 * 60;
          
          if (timeUntilExpiry < threeDaysInSeconds) {
            // Token expires in less than 3 days, extend it
            const newJwtToken = jwt.sign(
              { name: decoded.name, email: decoded.email },
              process.env.JWT_SECRET,
              { expiresIn: "7d" }
            );
            
            // Update the jwtToken cookie
            res.cookie("jwtToken", newJwtToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
              path: "/",
              maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
            });
            
            console.log('Google Auth token extended successfully');
            return res.json({ 
              accessToken: newJwtToken,
              message: "Token extended successfully"
            });
          } else {
            // Token still has more than 3 days, no need to extend
            console.log('Google Auth token still valid, no extension needed');
            return res.json({ 
              message: "Token is still valid, no extension needed"
            });
          }
        } catch (error) {
          console.error('Google Auth JWT token verification failed:', error);
          return res.status(401).json({ message: "Invalid or expired token" });
        }
      }
      
      // No valid token found
      console.log('No valid refresh token or jwt token found');
      return res.status(401).json({ message: "No refresh token provided" });
    }
    
  } catch (error) {
    console.error('Refresh token error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Token expired" });
    }
    
    res.status(401).json({ message: "Invalid token" });
  }
} 