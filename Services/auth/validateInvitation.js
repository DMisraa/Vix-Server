import jwt from "jsonwebtoken";

export function validateInvitation(req, res) {
  console.log('=== VALIDATE INVITATION REQUEST ===');
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'No token provided' });
  }

  try {
    console.log('Verifying invitation token...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if it's a guest upload token
    if (decoded.type !== 'guest-upload') {
      return res.status(400).json({ error: 'Invalid token type' });
    }
    
    // Check expiration
    if (decoded.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Invitation expired' });
    }

    console.log('Invitation token validated successfully');
    res.json({ 
      valid: true, 
      invitedBy: decoded.invitedBy,
      maxUploads: decoded.maxUploads,
      expiresAt: decoded.expiresAt
    });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(400).json({ error: 'Invalid token' });
  }
} 