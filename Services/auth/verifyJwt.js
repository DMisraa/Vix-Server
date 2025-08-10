import jwt from "jsonwebtoken";

export function verifyJwt(req, res) {
  console.log('=== JWT VERIFICATION REQUEST ===');
  console.log('User-Agent:', req.get('User-Agent'));
  console.log('Origin:', req.get('Origin'));
  console.log('Referer:', req.get('Referer'));
  console.log('Cookies:', req.cookies);
  console.log('Cookie header:', req.get('Cookie'));
  console.log('Authorization header:', req.get('Authorization'));
  
  let jwtToken = req.cookies?.jwtToken;
  
  // Fallback: check Authorization header if cookie is not available (mobile browsers)
  if (!jwtToken) {
    const authHeader = req.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      jwtToken = authHeader.substring(7);
      console.log('Using JWT from Authorization header (mobile fallback)');
    }
  }
  
  if (!jwtToken) {
    console.log('No JWT token found in cookies or Authorization header');
    return res.status(401).json({ message: "No token provided" });
  }
  
  try {
    console.log('Verifying JWT token...');
    const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
    console.log('JWT verified successfully:', decoded);
    res.json({ user: decoded });
  } catch (error) {
    console.error('JWT verification failed:', error);
    res.status(401).json({ message: "Invalid token" });
  }
} 