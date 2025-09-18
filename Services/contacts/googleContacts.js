import jwt from "jsonwebtoken";

export async function googleContacts(req, res) {
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

  const token = req.query.token;

  if (!token || !accessToken) {
    return res.status(401).json({ error: "Missing token or accessToken", authRequired: true });
  }

  try {
    // Verify the access token
    const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
    
    // Here you would typically use the Google token to fetch contacts
    // For now, return a success response
    res.json({ 
      contacts: [], 
      userEmail: decoded.email,
      message: "Google contacts access granted" 
    });
  } catch (error) {
    console.error('Google contacts auth error:', error);
    return res.status(401).json({ error: "Invalid accessToken" });
  }
} 