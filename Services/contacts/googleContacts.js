import jwt from "jsonwebtoken";
import fetch from "node-fetch";

export async function googleContacts(req, res) {
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

  // User is authenticated, now fetch contacts using the stored access token
  try {
    console.log('Fetching Google contacts for authenticated user:', email);
    
    // Fetch contacts from Google People API using the stored access token
    const response = await fetch(
      `https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers,emailAddresses&pageSize=2000`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google API error:', errorData);
      
      // If token is expired/invalid, return authRequired so user can re-authenticate
      if (response.status === 401) {
        return res.status(401).json({ 
          error: 'Google token expired', 
          authRequired: true 
        });
      }
      
      return res.status(response.status).json({ 
        error: 'Failed to fetch contacts from Google',
        details: errorData
      });
    }

    const data = await response.json();
    const contacts = data.connections || [];

    // Transform Google contacts to our format
    const transformedContacts = contacts
      .filter(contact => {
        // Only include contacts with names and phone numbers
        return contact.names && contact.names.length > 0 && 
               contact.phoneNumbers && contact.phoneNumbers.length > 0;
      })
      .map(contact => {
        const name = contact.names[0]?.displayName || 
                    contact.names[0]?.givenName + ' ' + contact.names[0]?.familyName || 
                    'Unknown';
        
        const phoneNumbers = contact.phoneNumbers
          .map(phone => phone.value)
          .filter(phone => phone && phone.trim())
          .join(', ');

        return {
          displayName: name,
          phoneNumber: phoneNumbers,
          canonicalForm: phoneNumbers, // For now, use the same as phoneNumber
          uploadedByEmail: email,
          contactSource: "GOOGLE"
        };
      });

    console.log(`Fetched ${transformedContacts.length} contacts from Google for authenticated user`);
    
    res.json({ 
      success: true,
      userEmail: email,
      googleId: googleId,
      contacts: transformedContacts,
      message: 'User authenticated and contacts fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching Google contacts for authenticated user:', error);
    res.status(500).json({ error: 'Failed to fetch Google contacts' });
  }
} 