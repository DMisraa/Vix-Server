export function googleContactsFetch(req, res) {
  console.log('=== GOOGLE CONTACTS FETCH REQUEST ===');
  const { accessToken, email } = req.body;
  
  if (!accessToken || !email) {
    return res.status(400).json({ error: 'Missing accessToken or email' });
  }

  try {
    console.log('Fetching Google contacts for email:', email);
    
    // For now, return a placeholder response
    // The actual Google API integration would go here
    res.json({ 
      message: 'Google contacts fetch endpoint moved to Node.js server',
      contacts: [],
      userEmail: email
    });
  } catch (error) {
    console.error('Error fetching Google contacts:', error);
    res.status(500).json({ error: 'Failed to fetch Google contacts' });
  }
} 