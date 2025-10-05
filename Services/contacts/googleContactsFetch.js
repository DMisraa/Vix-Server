export async function googleContactsFetch(req, res) {
  console.log('=== GOOGLE CONTACTS FETCH REQUEST ===');
  const { accessToken, email } = req.body;
  
  if (!accessToken || !email) {
    return res.status(400).json({ error: 'Missing accessToken or email' });
  }

  try {
    console.log('Fetching Google contacts for email:', email);
    
    let allContacts = [];
    let nextPageToken = null;
    let pageCount = 0;
    const maxPages = 20; // Safety limit to prevent infinite loops

    do {
      pageCount++;
      console.log(`Fetching page ${pageCount}...`);
      
      // Build URL with pagination
      let url = `https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers,emailAddresses&pageSize=500`;
      if (nextPageToken) {
        url += `&pageToken=${nextPageToken}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Google API error:', errorData);
        return res.status(response.status).json({ 
          error: 'Failed to fetch contacts from Google',
          details: errorData
        });
      }

      const data = await response.json();
      const pageContacts = data.connections || [];
      allContacts = allContacts.concat(pageContacts);
      
      nextPageToken = data.nextPageToken;
      console.log(`Page ${pageCount}: ${pageContacts.length} contacts, total so far: ${allContacts.length}`);
      
      // Safety check to prevent infinite loops
      if (pageCount >= maxPages) {
        console.warn(`Reached maximum page limit (${maxPages}), stopping pagination`);
        break;
      }
      
    } while (nextPageToken);

    console.log(`Total contacts fetched: ${allContacts.length}`);
    const contacts = allContacts;

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
        
        // Process phone numbers with the same logic as VCF files
        const phoneNumbers = contact.phoneNumbers || [];
        
        if (phoneNumbers.length === 0) {
          return {
            displayName: name,
            phoneNumber: "No phone number",
            canonicalForm: "No canonical number",
            uploadedByEmail: email,
            contactSource: "GOOGLE",
            tags: [],
            phoneNumbers: []
          };
        }

        // Helper function to determine phone number priority (same as VCF logic)
        const getPhonePriority = (phoneData) => {
          const type = (phoneData.type || '').toLowerCase();
          const label = (phoneData.label || '').toLowerCase();
          const number = phoneData.value.replace(/[-\s()]/g, '').trim();
          
          // Mobile numbers have highest priority
          if (type.includes('cell') || type.includes('mobile') || 
              label.includes('cell') || label.includes('mobile') ||
              label.includes('נייד') || label.includes('סלולר')) {
            return 1;
          }
          
          // Heuristic: Detect mobile numbers by format (Israeli mobile numbers start with 05)
          if (number.startsWith('05') || number.startsWith('+9725') || number.startsWith('9725')) {
            return 1; // Mobile number detected by format
          }
          
          // Work numbers have medium priority
          if (type.includes('work') || type.includes('office') ||
              label.includes('work') || label.includes('office') ||
              label.includes('עבודה') || label.includes('משרד')) {
            return 3;
          }
          
          // Home numbers have lower priority
          if (type.includes('home') || type.includes('house') ||
              label.includes('home') || label.includes('house') ||
              label.includes('בית') || label.includes('ביתי')) {
            return 4;
          }
          
          // Heuristic: Detect landline numbers by format (Israeli landlines start with 02, 03, 04, 08, 09)
          if (number.startsWith('02') || number.startsWith('03') || number.startsWith('04') || 
              number.startsWith('08') || number.startsWith('09') ||
              number.startsWith('+9722') || number.startsWith('+9723') || 
              number.startsWith('+9724') || number.startsWith('+9728') || number.startsWith('+9729') ||
              number.startsWith('9722') || number.startsWith('9723') || 
              number.startsWith('9724') || number.startsWith('9728') || number.startsWith('9729')) {
            return 4; // Landline number detected by format
          }
          
          // Default priority for unknown types (other numbers)
          return 2;
        };

        // Sort phone numbers by priority (mobile first, then others, then work, then home/landline)
        const sortedPhoneNumbers = [...phoneNumbers].sort((a, b) => {
          return getPhonePriority(a) - getPhonePriority(b);
        });

        // Get the highest priority number for display
        const bestPhone = sortedPhoneNumbers[0];
        const displayPhoneNumber = bestPhone ? bestPhone.value : "No phone number";
        const displayCanonicalForm = bestPhone && bestPhone.value.startsWith('+') 
          ? bestPhone.value 
          : "No canonical number";

        // Create phoneNumbers array for the phone picker (same format as VCF)
        const phoneNumbersArray = phoneNumbers.map(phone => ({
          number: phone.value,
          type: phone.type || 'TEL',
          label: phone.label || phone.type || (phone.value.startsWith('+') ? 'בינלאומי' : 'מקומי'),
          isCanonical: phone.value.startsWith('+'),
          priority: getPhonePriority(phone)
        }));

        return {
          displayName: name,
          phoneNumber: displayPhoneNumber,
          canonicalForm: displayCanonicalForm,
          uploadedByEmail: email,
          contactSource: "GOOGLE",
          tags: [],
          phoneNumbers: phoneNumbersArray // Store individual phone numbers with types for phone picker
        };
      });

    console.log(`Transformed ${transformedContacts.length} contacts from Google`);
    
    res.json({ 
      success: true,
      contacts: transformedContacts,
      userEmail: email,
      totalFetched: allContacts.length,
      totalTransformed: transformedContacts.length
    });
  } catch (error) {
    console.error('Error fetching Google contacts:', error);
    res.status(500).json({ error: 'Failed to fetch Google contacts' });
  }
}