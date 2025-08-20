import jwt from "jsonwebtoken";

export function verifyJwt(req, res) {
  const jwtToken = req.cookies?.jwtToken;
  
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