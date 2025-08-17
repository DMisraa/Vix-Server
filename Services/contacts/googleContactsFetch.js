export async function googleContactsFetch(req, res) {
  console.log('=== GOOGLE CONTACTS FETCH REQUEST ===');
  const { accessToken, email } = req.body;
  
  if (!accessToken || !email) {
    return res.status(400).json({ error: 'Missing accessToken or email' });
  }

  try {
    console.log('Fetching Google contacts for email:', email);
    
    // Fetch contacts from Google People API
    const response = await fetch(
      `https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers,emailAddresses&pageSize=2000`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google API error:', errorData);
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

    console.log(`Fetched ${transformedContacts.length} contacts from Google`);
    
    res.json({ 
      success: true,
      contacts: transformedContacts,
      userEmail: email
    });
  } catch (error) {
    console.error('Error fetching Google contacts:', error);
    res.status(500).json({ error: 'Failed to fetch Google contacts' });
  }
} 