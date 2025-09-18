import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  console.log('🔍 Auth Middleware - Starting...');
  
  const token = req.cookies?.jwtToken;
  
  if (!token) {
    console.log('❌ No JWT token found in cookies');
    return res.status(401).json({ error: "Access denied. No token provided." });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token verified for user:', decoded.email);
    
    // Add user info to request
    req.user = decoded;
    
    // Reset token expiration on every authenticated request
    const newToken = jwt.sign(
      { name: decoded.name, email: decoded.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    
    // Set new cookie with fresh expiration
    res.cookie("jwtToken", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
    });
    
    console.log('✅ New token set, proceeding to route handler');
    next();
    
  } catch (error) {
    console.log('❌ Token verification failed:', error.message);
    res.status(401).json({ error: "Invalid token" });
  }
} 