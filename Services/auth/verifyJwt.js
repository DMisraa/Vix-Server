import jwt from "jsonwebtoken";

export function verifyJwt(req, res) {
  // Debug logging
  console.log('🔍 Verify JWT - Cookies:', Object.keys(req.cookies || {}));
  console.log('🔍 Verify JWT - Authorization header:', req.get('Authorization') ? 'Present' : 'Missing');
  
  // Check for JWT token in cookies (Android/Desktop approach)
  let jwtToken = req.cookies?.jwtToken;
  
  // Check Authorization header for access token (iOS approach)
  if (!jwtToken) {
    const authHeader = req.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      jwtToken = authHeader.substring(7);
    }
  }
  
  if (!jwtToken) {
    console.log('❌ No token found in cookies or Authorization header');
    return res.status(401).json({ message: "No token provided" });
  }
  
  try {
    const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
    res.json({ user: decoded });
  } catch (error) {
    console.error('Token verification failed:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Token expired" });
    }
    
    res.status(401).json({ message: "Invalid token" });
  }
} 