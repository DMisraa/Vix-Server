import jwt from "jsonwebtoken";

export function verifyJwt(req, res) {
  console.log('=== JWT VERIFICATION REQUEST ===');
  console.log('Cookies:', req.cookies);
  
  const jwtToken = req.cookies?.jwtToken;
  
  if (!jwtToken) {
    console.log('No JWT token found in cookies');
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