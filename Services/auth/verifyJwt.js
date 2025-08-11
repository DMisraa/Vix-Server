import jwt from "jsonwebtoken";

export function verifyJwt(req, res) {
  let jwtToken = req.cookies?.jwtToken;
  
  // Fallback: check Authorization header if cookie is not available (mobile browsers)
  if (!jwtToken) {
    const authHeader = req.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      jwtToken = authHeader.substring(7);
    }
  }
  
  if (!jwtToken) {
    return res.status(401).json({ message: "No token provided" });
  }
  
  try {
    const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
    res.json({ user: decoded });
  } catch (error) {
    console.error('JWT verification failed:', error);
    res.status(401).json({ message: "Invalid token" });
  }
} 