import jwt from "jsonwebtoken";

export function verifyJwt(req, res) {
  console.log('=== JWT Verification Request ===');
  console.log('Request URL:', req.url);
  console.log('Request method:', req.method);
  console.log('Request headers:', req.headers);
  console.log('Request cookies:', req.cookies);
  
  let jwtToken = req.cookies?.jwtToken;
  console.log('JWT from cookies:', jwtToken ? 'Found' : 'Not found');
  
  // Fallback: check Authorization header if cookie is not available (mobile browsers)
  if (!jwtToken) {
    const authHeader = req.get('Authorization');
    console.log('Authorization header:', authHeader);
    if (authHeader && authHeader.startsWith('Bearer ')) {
      jwtToken = authHeader.substring(7);
      console.log('JWT from Authorization header:', jwtToken ? 'Found' : 'Not found');
    }
  }
  
  if (!jwtToken) {
    console.log('No JWT token found in cookies or headers');
    return res.status(401).json({ message: "No token provided" });
  }
  
  try {
    const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
    console.log('JWT verification successful for user:', decoded.email);
    res.json({ user: decoded });
  } catch (error) {
    console.error('JWT verification failed:', error);
    res.status(401).json({ message: "Invalid token" });
  }
} 