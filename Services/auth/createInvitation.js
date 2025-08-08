import jwt from "jsonwebtoken";

export function createInvitation(req, res) {
  console.log('=== CREATE INVITATION REQUEST ===');
  console.log('Cookies:', req.cookies);
  
  const jwtToken = req.cookies?.jwtToken;
  
  if (!jwtToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Verifying current user JWT...');
    const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
    const currentUserEmail = decoded.email;

    // Create secure invitation token for current user
    const invitationData = {
      invitedBy: currentUserEmail,
      expiresAt: Date.now() + (48 * 60 * 60 * 1000), // 48 hours
      maxUploads: 1, // 1 upload per invitation
      type: 'guest-upload'
    };

    const token = jwt.sign(invitationData, process.env.JWT_SECRET);
    console.log('Invitation token created successfully');

    res.json({ 
      token,
      invitedBy: currentUserEmail,
      expiresAt: invitationData.expiresAt
    });
  } catch (error) {
    console.error('Error creating invitation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
} 