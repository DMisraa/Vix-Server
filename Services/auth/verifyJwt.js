import jwt from "jsonwebtoken";

export function verifyJwt(req, res) {
  // Check for access token in cookies (Android/Desktop approach)
  let accessToken = req.cookies?.accessToken;
  
  // Check Authorization header for access token (iOS approach)
  if (!accessToken) {
    const authHeader = req.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);
    }
  }

  // Fallback: Check for old jwtToken cookie (for backward compatibility)
  if (!accessToken) {
    accessToken = req.cookies?.jwtToken;
  }
  
  if (!accessToken) {
    return res.status(401).json({ message: "No token provided" });
  }
  
  try {
    const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
    res.json({ user: decoded });
  } catch (error) {
    console.error('Token verification failed:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Token expired" });
    }
    
    res.status(401).json({ message: "Invalid token" });
  }
} 