import jwt from "jsonwebtoken";

export function googleContacts(req, res) {
  console.log('=== GOOGLE CONTACTS REQUEST ===');
  console.log('Cookies:', req.cookies);
  
  const token = req.cookies?.token;
  const jwtToken = req.cookies?.jwtToken;

  if (!token || !jwtToken) {
    return res.status(401).json({ error: "Missing token or jwtToken", authRequired: true });
  }

  let email = "";
  let googleId = "";
  try {
    console.log('Verifying JWT for Google contacts...');
    const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
    email = decoded.email;
    googleId = decoded.googleId;
  } catch (err) {
    console.error("Invalid JWT token:", err);
    return res.status(401).json({ error: "Invalid jwtToken" });
  }

  // For now, return a placeholder response
  // The actual Google API integration would go here
  console.log('Google contacts request validated, email:', email);
  res.json({ 
    message: 'Google contacts endpoint moved to Node.js server',
    userEmail: email,
    googleId: googleId
  });
} 