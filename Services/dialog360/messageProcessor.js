import pool from '../../db/db.js';
import {
  findContactByPhoneNumber,
  findAwaitingGuestCountMessage,
  findPendingInvitation,
  updateMessageResponse,
  setAwaitingGuestCount,
  findEventMessageByMessageId,
  updateMessageSeenAt,
  updateMessageFailure
} from '../database/eventMessagesRepository.js';
import { mapInvitationButtonResponse } from './responseMapper.js';
import { sendGuestCountQuestion, markMessageAsRead, sendDeclineConfirmation, sendMaybeConfirmation } from './whatsappMessenger.js';
import { handleGuestCountReply } from './guestCountHandler.js';
import { calculateFollowupDate, getFollowupDisplayText } from './followUpButtonsHelper.js';

// WhatsApp contact upload functions
const TOKEN_PREFIX = 'VIX_';
const TOKEN_EXPIRY_DAYS = 10; // 10 days expiry
const CONTACT_UPLOAD_TIMEOUT = 10 * 60 * 1000; // 10 minutes in milliseconds

// In-memory storage for buffered contacts (in production, use Redis or similar)
const contactBuffers = new Map(); // phoneNumber -> { user, contacts[], timeoutId }

/**
 * Parse token and extract user information
 * Token format: VIX_[userHash]_[timestamp]_[randomStr]
 */
function parseToken(token) {
    try {
        if (!token.startsWith(TOKEN_PREFIX)) {
            return null;
        }

        const parts = token.split('_');
        if (parts.length !== 4) {
            return null;
        }

        const [, userHash, timestampBase36, randomStr] = parts;
        
        // Convert base36 timestamp back to milliseconds
        const timestamp = parseInt(timestampBase36, 36);
        const tokenAge = Date.now() - timestamp;
        const maxAge = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // 10 days in milliseconds

        if (tokenAge > maxAge) {
            console.log(`Token expired: ${tokenAge}ms old (max: ${maxAge}ms)`);
            return null;
        }

        return {
            userHash,
            timestamp,
            randomStr,
            tokenAge,
            isValid: true
        };
    } catch (error) {
        console.error('Error parsing token:', error);
        return null;
    }
}

/**
 * Find user by user hash
 */
async function findUserByHash(userHash) {
    try {
        console.log('🔍 Searching for user with hash:', userHash);
        
        // Get all users and test hash generation locally
        const allUsersQuery = `SELECT id, email, name FROM users`;
        const allUsers = await pool.query(allUsersQuery);
        
        console.log('📊 Total users in database:', allUsers.rows.length);
        
        for (const user of allUsers.rows) {
            // Generate hash the same way as frontend
            const generatedHash = Buffer.from(user.email).toString('base64')
                .replace(/[^a-zA-Z0-9]/g, '')
                .substring(0, 8);
            
            console.log(`  Checking user: ${user.email} -> hash: ${generatedHash}`);
            
            // Compare in uppercase because token is converted to uppercase
            if (generatedHash.toUpperCase() === userHash.toUpperCase()) {
                console.log('✅ Found matching user:', user.email);
                return user;
            }
        }
        
        console.error('❌ No user found with hash:', userHash);
        return null;
    } catch (error) {
        console.error('❌ Error finding user by hash:', error);
        return null;
    }
}

/**
 * Process contact data from WhatsApp message
 */
function parseContactData(messageText) {
    const contacts = [];
    const lines = messageText.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
        // Skip if it's the token line
        if (line.includes('VIX_')) continue;
        
        // Try to parse contact information
        // Expected format: Name, Phone, Email (optional)
        const parts = line.split(',').map(part => part.trim());
        
        if (parts.length >= 2) {
            const contact = {
                name: parts[0],
                phone: parts[1].replace(/[^\d+]/g, ''), // Keep only digits and +
                email: parts[2] || null
            };
            
            // Validate phone number
            if (contact.phone && contact.phone.length >= 8) {
                contacts.push(contact);
            }
        }
    }
    
    return contacts;
}

/**
 * Save contacts to database using guest upload system
 */
async function saveContactsToDatabase(userId, contacts, userEmail) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Insert into guest_contact_uploads table
        const uploadQuery = `
            INSERT INTO guest_contact_uploads 
            (invited_by_email, guest_name, guest_notes, token) 
            VALUES ($1, $2, $3, $4) 
            RETURNING upload_id
        `;
        const uploadResult = await client.query(uploadQuery, [
            userEmail,
            'WhatsApp Contact Upload', // guest_name
            'Contacts sent via WhatsApp', // guest_notes
            'whatsapp_upload' // token identifier
        ]);
        
        const uploadId = uploadResult.rows[0].upload_id;
        
        // Insert contacts into guest_contacts table
        const contactQuery = `
            INSERT INTO guest_contacts 
            (upload_id, display_name, phone_number, email, invited_by, contact_source, canonical_form) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        
        for (const contact of contacts) {
            await client.query(contactQuery, [
                uploadId,
                contact.name || '',
                contact.phone || '',
                contact.email || '',
                userEmail,
                'whatsapp_upload', // contact_source
                contact.name || '' // canonical_form
            ]);
        }
        
        await client.query('COMMIT');
        console.log(`Saved ${contacts.length} WhatsApp contacts for user ${userId} (upload_id: ${uploadId})`);
        
        return { success: true, uploadId: uploadId };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saving WhatsApp contacts:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

/**
 * Process incoming WhatsApp message
 * 
 * @param {Object} message - WhatsApp message object
 * @param {Object} value - WhatsApp webhook value object
 */
export async function processDialog360Message(message, value) {
  try {
    const messageId = message.id;
    const from = message.from;
    const timestamp = message.timestamp;
    const messageType = message.type;

    // Process WhatsApp contact upload

    // Mark message as read (shows colored ticks to sender)
    await markMessageAsRead(messageId, from);

    switch (messageType) {
      case 'text':
        const textContent = message.text?.body;
        
        // Check if this is a WhatsApp contact upload message
        const contactUploadResult = await handleWhatsAppContactUpload(textContent, from);
        if (contactUploadResult.handled) {
          // Contact upload was processed, don't process as event response
          return;
        }
        
        // Update database with text response (normal event invitation flow)
        await updateEventMessageResponse(from, textContent, timestamp, null, 'text');
        break;

      case 'image':
        break;

      case 'document':
        break;

      case 'audio':
        break;

      case 'video':
        break;

      case 'contacts':
        // Handle contact cards (vCard format)
        const contacts = message.contacts || [];
        console.log(`📇 Received ${contacts.length} contact card(s) from ${from}`);
        
        // Check if this is a WhatsApp contact upload
        const contactCardResult = await handleWhatsAppContactCards(contacts, from);
        if (contactCardResult.handled) {
          // Contact upload was processed, don't process as event response
          return;
        }
        break;

      case 'button':
        const buttonText = message.button?.text;
        const buttonPayload = message.button?.payload;
        
        // Update database with RSVP response
        await updateEventMessageResponse(from, buttonText, timestamp, buttonPayload);
        break;

      case 'interactive':
        const interactiveType = message.interactive?.type;
        if (interactiveType === 'button_reply') {
          const buttonReplyText =
            message.interactive.button_reply?.title || '';
          const buttonReplyId = message.interactive.button_reply?.id || '';
          
          // Update database with RSVP response
          await updateEventMessageResponse(from, buttonReplyText, timestamp, buttonReplyId);
        }
        break;

      default:
        break;
    }
  } catch (error) {
    // Silently fail
  }
}

/**
 * Process status updates for sent messages
 * Tracks when guests open/read invitations AND when delivery fails
 * 
 * @param {Object} status - WhatsApp status object
 * @param {Object} value - WhatsApp webhook value object
 */
export async function processDialog360Status(status, value) {
  try {
    const messageId = status.id; // WhatsApp message ID
    const recipientId = status.recipient_id; // Phone number
    const statusType = status.status; // 'sent', 'delivered', 'read', 'failed'
    const timestamp = status.timestamp; // Unix timestamp

    // Find the event_message record by message_id (needed for both read and failed)
    const eventMessage = await findEventMessageByMessageId(messageId);
    
    if (!eventMessage) {
      return;
    }
    
    // Convert WhatsApp timestamp to JavaScript Date
    const statusTime = new Date(parseInt(timestamp) * 1000);

    // Track "read" status - when guest opens the invitation
    if (statusType === 'read') {
      await updateMessageSeenAt(eventMessage.id, statusTime);
      
    // Track "failed" status - when delivery fails
    } else if (statusType === 'failed') {
      // Extract failure reason from status errors
      const errors = status.errors || [];
      let failureReason = 'Unknown failure';
      
      if (errors.length > 0) {
        const errorDetails = errors[0].error_data?.details || errors[0].message || 'No details provided';
        failureReason = errorDetails;
      }
      
      // Save failure reason to database
      await updateMessageFailure(eventMessage.id, failureReason);
    }
    
  } catch (error) {
    // Silently fail
  }
}

/**
 * Process errors from Dialog 360
 * 
 * @param {Object} error - Dialog 360 error object
 * @param {Object} value - WhatsApp webhook value object
 */
export async function processDialog360Error(error, value) {
  try {
    const errorCode = error.code;
    const errorTitle = error.title;
    const errorMessage = error.message;
    const errorDetails = error.error_data?.details;

    // Add error handling logic here:
    // - Log to monitoring system (e.g., Sentry)
    // - Save to database for tracking
    // - Send alerts for critical errors
    // - Update message status in DB if related to specific message

  } catch (err) {
    // Silently fail
  }
}

/**
 * Update event_messages table with WhatsApp reply response
 * 
 * @param {string} phoneNumber - International phone number (e.g., "972544349661")
 * @param {string} replyText - The reply text or button text
 * @param {string} timestamp - WhatsApp timestamp
 * @param {string} payload - Button payload (if applicable)
 * @param {string} messageType - Type of message ('text', 'button', etc.)
 */
async function updateEventMessageResponse(phoneNumber, replyText, timestamp, payload, messageType = 'button') {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Convert WhatsApp timestamp to PostgreSQL timestamp
    const responseTime = new Date(parseInt(timestamp) * 1000);
    
    // Extract event_id from button payload FIRST (for duplicate contact handling)
    let eventId = null;
    
    if (payload) {
      // Payload format: "rsvp_yes_event-uuid" or "rsvp_no_event-uuid" or "rsvp_maybe_event-uuid"
      const payloadMatch = payload.match(/rsvp_(yes|no|maybe)_(.+)/);
      
      if (payloadMatch) {
        eventId = payloadMatch[2];
      }
    }
    
    // Find the contact by phone number AND event_id (handles duplicate phone numbers)
    const contact = await findContactByPhoneNumber(phoneNumber, eventId);
    
    if (!contact) {
      await client.query('ROLLBACK');
      return;
    }
    
    const contactId = contact.id;
    
    // Check if we're expecting a guest count (awaiting_guest_count flag)
    const awaitingMessage = await findAwaitingGuestCountMessage(contactId);
    
    if (awaitingMessage) {
      // This is a guest count reply
      await handleGuestCountReply(client, awaitingMessage.id, awaitingMessage.event_id, contactId, replyText);
      await client.query('COMMIT');
      return;
    }
    
    // Find the event_message for this event + contact combination
    let eventMessageId = null;
    
    if (eventId) {
      const eventMessageResult = await client.query(
        `SELECT id FROM event_messages 
         WHERE event_id = $1 
         AND contact_id = $2 
         AND message_type = 'invitation' 
         AND response IN ('ממתין לתגובה', 'ללא מענה')
         ORDER BY id DESC 
         LIMIT 1`,
        [eventId, contactId]
      );
      
      if (eventMessageResult.rows.length > 0) {
        eventMessageId = eventMessageResult.rows[0].id;
      } else {
        // No pending invitation found - get event and contact details
        const eventDetailsResult = await client.query(
          'SELECT owner_email, event_name FROM events WHERE id = $1',
          [eventId]
        );
        
        const contactDetailsResult = await client.query(
          'SELECT display_name FROM contacts WHERE id = $1',
          [contactId]
        );
        
        const ownerEmail = eventDetailsResult.rows.length > 0 ? eventDetailsResult.rows[0].owner_email : 'unknown';
        const eventName = eventDetailsResult.rows.length > 0 ? eventDetailsResult.rows[0].event_name : 'unknown';
        const contactName = contactDetailsResult.rows.length > 0 ? contactDetailsResult.rows[0].display_name : 'unknown';
        
        // Try to find ANY invitation for this event+contact
        const anyInvitationResult = await client.query(
          `SELECT id FROM event_messages 
           WHERE event_id = $1 
           AND contact_id = $2 
           AND message_type = 'invitation'
           ORDER BY id DESC 
           LIMIT 1`,
          [eventId, contactId]
        );
        
        const errorMsg = `No pending invitation found. Event: ${eventName} (${eventId}) | Owner: ${ownerEmail} | Contact: ${contactName} (ID: ${contactId}) | Phone: ${phoneNumber} | Payload: ${payload} | Response may have already been recorded.`;
        
        if (anyInvitationResult.rows.length > 0) {
          // Found an invitation - update it with error
          await client.query(
            `UPDATE event_messages 
             SET error_message = $1 
             WHERE id = $2`,
            [errorMsg, anyInvitationResult.rows[0].id]
          );
        }
        
        await client.query('COMMIT');
        return;
      }
    }
    
    // Check if this is a follow-up timeframe button (for "maybe" responses)
    if (payload && payload.startsWith('followup_')) {
      // Find the most recent "לא בטוח" (maybe) invitation for this contact
      const maybeInvitationResult = await client.query(
        `SELECT id FROM event_messages 
         WHERE contact_id = $1 
         AND message_type = 'invitation' 
         AND response = 'לא בטוח'
         ORDER BY id DESC 
         LIMIT 1`,
        [contactId]
      );
      
      if (maybeInvitationResult.rows.length > 0) {
        const eventMessageId = maybeInvitationResult.rows[0].id;
        
        // Calculate follow-up date using helper function (handles all button types including 5 days)
        const followupDate = calculateFollowupDate(payload);
        const followupText = getFollowupDisplayText(payload);
        
        // Store follow-up date in database
        await client.query(
          `UPDATE event_messages 
           SET followup_date = $1 
           WHERE id = $2`,
          [followupDate, eventMessageId]
        );
        
        // Send confirmation
        await client.query('COMMIT');
        
        const confirmationText = `תודה! נחזור אליך ${followupText} ✅`;
        await fetch('https://waba-v2.360dialog.io/messages', {
          method: 'POST',
          headers: {
            'D360-API-KEY': process.env.D360_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phoneNumber,
            type: 'text',
            text: { body: confirmationText }
          }),
        });
      } else {
        await client.query('ROLLBACK');
      }
      
      return;
    }
    
    // If no eventMessageId from payload, try to find most recent pending invitation
    if (!eventMessageId) {
      // Find most recent pending invitation for this contact (no event_id filter needed)
      const fallbackResult = await client.query(
        `SELECT em.id, em.event_id 
         FROM event_messages em
         WHERE em.contact_id = $1 
         AND em.message_type = 'invitation'
         AND em.response IN ('ממתין לתגובה', 'ללא מענה')
         ORDER BY em.id DESC 
         LIMIT 1`,
        [contactId]
      );
      
      if (fallbackResult.rows.length > 0) {
        eventMessageId = fallbackResult.rows[0].id;
        eventId = fallbackResult.rows[0].event_id; // Set eventId for later use
      } else {
        // No pending invitation found - try ANY recent invitation
        const anyRecentResult = await client.query(
          `SELECT em.id, em.event_id, e.event_name, e.owner_email 
           FROM event_messages em
           LEFT JOIN events e ON em.event_id = e.id
           WHERE em.contact_id = $1 
           AND em.message_type = 'invitation'
           ORDER BY em.id DESC 
           LIMIT 1`,
          [contactId]
        );
        
        if (anyRecentResult.rows.length > 0) {
          const row = anyRecentResult.rows[0];
          const errorMsg = `No pending invitation found (response already recorded). Event: ${row.event_name || 'unknown'} (${row.event_id || 'unknown'}) | Owner: ${row.owner_email || 'unknown'} | Contact ID: ${contactId} | Phone: ${phoneNumber} | Message type: ${messageType}`;
          
          await client.query(
            `UPDATE event_messages 
             SET error_message = $1 
             WHERE id = $2`,
            [errorMsg, row.id]
          );
        }
        
        await client.query('COMMIT');
        return;
      }
    }
    
    // Map invitation response to Hebrew response types
    // For text messages, enable fallback to handle templates without buttons
    const allowTextFallback = (messageType === 'text');
    const mappedResponse = mapInvitationButtonResponse(replyText, messageType, allowTextFallback);
    
    // If no mapped response, skip processing
    if (!mappedResponse) {
      await client.query('ROLLBACK');
      return;
    }
    
    // Update the event_messages record with the response
    await updateMessageResponse(eventMessageId, mappedResponse, responseTime);
    
    // For "maybe" responses, fetch event date and celebrator names before committing (within transaction)
    let eventDate = null;
    let celebrator1Name = null;
    let celebrator2Name = null;
    
    if (mappedResponse === 'לא בטוח') {
      const eventInfoResult = await client.query(
        'SELECT event_date, celebrator1_name, celebrator2_name FROM events WHERE id = $1',
        [eventId]
      );
      
      if (eventInfoResult.rows.length > 0) {
        eventDate = eventInfoResult.rows[0].event_date;
        celebrator1Name = eventInfoResult.rows[0].celebrator1_name;
        celebrator2Name = eventInfoResult.rows[0].celebrator2_name;
      }
    }
    
    await client.query('COMMIT');
    
    // Send appropriate follow-up message based on response type
    if (mappedResponse === 'מגיע') {
      // Attending - Set awaiting_guest_count flag and ask for guest count
      await setAwaitingGuestCount(eventMessageId);
      await sendGuestCountQuestion(phoneNumber);
      
    } else if (mappedResponse === 'לא מגיע') {
      // Not attending - Send decline confirmation
      await sendDeclineConfirmation(phoneNumber);
      
    } else if (mappedResponse === 'לא בטוח') {
      // Maybe - Send maybe confirmation with dynamic buttons based on event proximity
      await sendMaybeConfirmation(phoneNumber, eventDate, celebrator1Name, celebrator2Name);
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
}

/**
 * Handle WhatsApp contact cards (vCard format)
 * 
 * @param {Array} contacts - Array of contact objects from WhatsApp
 * @param {string} senderNumber - The sender's phone number
 * @returns {Object} - { handled: boolean, result?: Object }
 */
async function handleWhatsAppContactCards(contacts, senderNumber) {
  try {
    console.log('📇 Processing contact cards from:', senderNumber);
    
    // Check if there's an active token validated by this phone number
    const recentTokenData = await getRecentlyValidatedToken();
    
    if (!recentTokenData) {
      // No active token, let it be processed as normal event response
      console.log('⚠️ No active token found for contact cards');
      return { handled: false };
    }
    
    const { user: activeUser } = recentTokenData;
    
    // Parse vCard contacts
    const parsedContacts = [];
    for (const contact of contacts) {
      const contactData = {
        name: contact.name?.formatted_name || contact.name?.first_name || contact.name?.display_name || 'Unknown',
        phone: contact.phones?.[0]?.phone || null,
        email: contact.emails?.[0]?.email || null
      };
      
      // Validate that we have at least a name or phone
      if (contactData.name || contactData.phone) {
        parsedContacts.push(contactData);
        console.log(`  📇 Parsed contact: ${contactData.name} - ${contactData.phone}`);
      }
    }
    
    if (parsedContacts.length === 0) {
      await sendWhatsAppReply(senderNumber, '❌ לא נמצאו אנשי קשר תקינים בכרטיסי הקשר ששלחתם.');
      return { handled: true, result: { success: false, message: 'No valid contacts' } };
    }
    
    // Check if we already have a buffer for this sender
    const existingBuffer = contactBuffers.get(senderNumber);
    
    if (existingBuffer) {
      // Add to existing buffer
      existingBuffer.contacts.push(...parsedContacts);
      console.log(`📊 Buffering ${parsedContacts.length} contacts. Total in buffer: ${existingBuffer.contacts.length}`);
      
      // Reset the timeout
      clearTimeout(existingBuffer.timeoutId);
      existingBuffer.timeoutId = setTimeout(() => {
        finalizeContactUpload(senderNumber);
      }, CONTACT_UPLOAD_TIMEOUT);
      
      await sendWhatsAppReply(senderNumber, `✅ קיבלנו ${parsedContacts.length} אנשי קשר!\n\nנוספה${parsedContacts.length > 1 ? 'ו' : ''} את${parsedContacts.length > 1 ? '' : 'ם'} לרשימה.\n\nסה"כ נשלחו: ${existingBuffer.contacts.length} אנשי קשר\n\nאפשר להמשיך לשלוח עוד או להשיב "סיימתי" אם סיימתם.`);
      return { handled: true, result: { success: true, contacts: parsedContacts } };
    } else {
      // Create new buffer
      const timeoutId = setTimeout(() => {
        finalizeContactUpload(senderNumber);
      }, CONTACT_UPLOAD_TIMEOUT);
      
      contactBuffers.set(senderNumber, {
        user: activeUser,
        contacts: parsedContacts,
        timeoutId: timeoutId
      });
      
      console.log(`📊 Started new buffer with ${parsedContacts.length} contacts`);
      
      await sendWhatsAppReply(senderNumber, `✅ מעולה! קיבלנו ${parsedContacts.length} אנשי קשר!\n\nאפשר להמשיך לשלוח עוד אנשי קשר או להשיב "סיימתי" אם סיימתם.\n\n⏰ המשך הפעיל למשך 10 דקות בלבד.`);
      return { handled: true, result: { success: true, contacts: parsedContacts } };
    }
    
  } catch (error) {
    console.error('❌ Error handling WhatsApp contact cards:', error);
    await sendWhatsAppReply(senderNumber, '❌ שגיאה בעיבוד ההודעה. אנא נסה שוב.');
    return { handled: true, result: { success: false, message: 'Error processing message' } };
  }
}

/**
 * Finalize contact upload - save all buffered contacts to database
 * 
 * @param {string} senderNumber - The sender's phone number
 */
async function finalizeContactUpload(senderNumber) {
  try {
    const buffer = contactBuffers.get(senderNumber);
    
    if (!buffer) {
      console.log('⚠️ No buffer found for:', senderNumber);
      return;
    }
    
    const { user, contacts } = buffer;
    
    if (contacts.length === 0) {
      console.log('⚠️ No contacts to save for:', senderNumber);
      contactBuffers.delete(senderNumber);
      return;
    }
    
    console.log(`💾 Finalizing contact upload for ${senderNumber}: ${contacts.length} contacts`);
    
    // Save contacts to database (using guest upload system)
    const result = await saveContactsToDatabase(user.id, contacts, user.email);
    
    if (result.success) {
      await sendWhatsAppReply(senderNumber, `✅ נשמרו ${contacts.length} אנשי קשר בהצלחה!\n\nהאנשי קשר יופיעו בהתראות שלכם לבדיקה ואישור.`);
      console.log(`✅ Saved ${contacts.length} contacts for user ${user.email}`);
    } else {
      await sendWhatsAppReply(senderNumber, '❌ שגיאה בשמירת אנשי הקשר. אנא נסה שוב.');
      console.error('❌ Failed to save contacts:', result.error);
    }
    
    // Clear the buffer
    contactBuffers.delete(senderNumber);
    
  } catch (error) {
    console.error('❌ Error finalizing contact upload:', error);
    contactBuffers.delete(senderNumber);
  }
}

/**
 * Handle WhatsApp contact upload messages
 * 
 * @param {string} messageText - The message content
 * @param {string} senderNumber - The sender's phone number
 * @returns {Object} - { handled: boolean, result?: Object }
 */
async function handleWhatsAppContactUpload(messageText, senderNumber) {
  try {
    // Check for WhatsApp contact upload

    // Check if message contains a token (works even if message is just the token)
    // More specific regex to match valid token format: VIX_[hash]_[timestamp]_[random]
    const tokenMatch = messageText.match(/VIX_[A-Z0-9]+_[A-Z0-9]+_[A-Z0-9]+/);
    
    if (tokenMatch) {
      // Phase 1: Token validation
      const token = tokenMatch[0];
      console.log('WhatsApp Contact Upload - Token found:', token);
      const tokenData = parseToken(token);
      
      if (!tokenData || !tokenData.isValid) {
        await sendWhatsAppReply(senderNumber, '❌ הטוקן לא תקין או פג תוקף. אנא נסה שוב.');
        return { handled: true, result: { success: false, message: 'Invalid token' } };
      }
      const user = await findUserByHash(tokenData.userHash);
      if (!user) {
        await sendWhatsAppReply(senderNumber, '❌ משתמש לא נמצא. אנא בדוק את הטוקן.');
        return { handled: true, result: { success: false, message: 'User not found' } };
      }
      
      // Store token in database for persistence
      await storeTokenInDatabase(token, user.id, user.email, user.name);
      
      await sendWhatsAppReply(senderNumber, `✅ הטוקן אומת בהצלחה!\n\nשלחו כעת את כרטיסי אנשי הקשר שלכם - פשוט לחצו על כפתור השיתוף של אנשי הקשר בתפריט ולחצו על כל אנשי הקשר שתרצו לשלוח.\n\n⏰ הטוקן פעיל למשך 10 דקות בלבד`);
      return { handled: true, result: { success: true, message: 'Token validated' } };
      
    } else {
      // Check if user is trying to finalize contact upload
      const trimmedText = messageText.trim().toLowerCase();
      if (trimmedText === 'סיימתי' || trimmedText === 'סיימתי!' || trimmedText === 'סיימתי?') {
        console.log('📥 User requested to finalize contact upload');
        
        // Check if there's an active buffer for this sender
        const buffer = contactBuffers.get(senderNumber);
        
        if (buffer && buffer.contacts.length > 0) {
          // Clear the timeout and finalize immediately
          clearTimeout(buffer.timeoutId);
          await finalizeContactUpload(senderNumber);
          return { handled: true, result: { success: true, message: 'Contact upload finalized' } };
        } else {
          // No buffer found, nothing to save
          await sendWhatsAppReply(senderNumber, '❗ לא נמצאו אנשי קשר לשמירה. אנא שלחו כרטיסי קשר לפני הסיום.');
          return { handled: true, result: { success: false, message: 'No contacts to save' } };
        }
      }
      
      // Phase 2: Manual contact upload not supported
      // Only contact cards are accepted. If user sends text, inform them to send contact cards.
      const recentTokenData = await getRecentlyValidatedToken();
      
      if (recentTokenData) {
        // User has an active token but sent text instead of contact cards
        await sendWhatsAppReply(senderNumber, '📇 אנא שלחו כרטיסי קשר בלבד.\n\nלחצו על כפתור השיתוף של אנשי הקשר וצרו קשר עם הכרטיסים שתרצו לשלוח.');
        return { handled: true, result: { success: false, message: 'Text contacts not accepted' } };
      }
      
      // No active token, let it be processed as normal event response
      return { handled: false };
    }
    
  } catch (error) {
    console.error('Error handling WhatsApp contact upload:', error);
    await sendWhatsAppReply(senderNumber, '❌ שגיאה בעיבוד ההודעה. אנא נסה שוב.');
    return { handled: true, result: { success: false, message: 'Error processing message' } };
  }
}

/**
 * Send WhatsApp reply message
 * 
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message to send
 */
async function sendWhatsAppReply(phoneNumber, message) {
  try {
    const apiKey = process.env.D360_API_KEY;
    
    if (!apiKey) {
      console.error('❌ D360_API_KEY not found in environment variables');
      return;
    }

    // Use Dialog360 v2 API to send message (same as other functions)
    const response = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: message
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ WhatsApp reply failed (${response.status}): ${errorText}`);
    } else {
      const successData = await response.json();
      console.log(`✅ WhatsApp reply sent: ${successData.messages?.[0]?.id || 'no-id'}`);
    }
  } catch (error) {
    console.error('❌ WhatsApp reply error:', error.message);
  }
}

/**
 * Store token in users table
 */
async function storeTokenInDatabase(token, userId, userEmail, userName) {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      console.log('💾 Storing token for user ID:', userId, 'Email:', userEmail);
      
      // Add columns to users table if they don't exist
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS whatsapp_token VARCHAR(255),
        ADD COLUMN IF NOT EXISTS whatsapp_token_expires_at TIMESTAMP
      `);
      
      // Update user with token
      // Store token with 10-day expiry
      const result = await client.query(`
        UPDATE users 
        SET whatsapp_token = $1, 
            whatsapp_token_expires_at = $2
        WHERE id = $3
      `, [
        token,
        new Date(Date.now() + (TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)), // 10 days for token validity
        userId
      ]);
      
      console.log('📊 Update result - rows affected:', result.rowCount);
      
      await client.query('COMMIT');
      console.log(`✅ Token stored in users table: ${token} for user: ${userEmail}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error in transaction:', error);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error storing token in users table:', error);
  }
}

/**
 * Get recently validated token (within last 10 minutes)
 * This allows third parties to send contacts after token validation
 */
async function getRecentlyValidatedToken() {
  try {
    const client = await pool.connect();
    try {
      // Find user with recently validated token (within last 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - (10 * 60 * 1000));
      
      const result = await client.query(`
        SELECT id, email, name, whatsapp_token, whatsapp_token_expires_at
        FROM users
        WHERE whatsapp_token IS NOT NULL
        AND whatsapp_token_expires_at > NOW()
        AND whatsapp_token IS NOT NULL
        ORDER BY whatsapp_token_expires_at DESC
        LIMIT 1
      `);
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          token: row.whatsapp_token,
          user: {
            id: row.id,
            email: row.email,
            name: row.name
          }
        };
      }
      
      return null;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error getting recently validated token:', error);
    return null;
  }
}


/**
 * Generate and store a new token for a user
 */
async function generateAndStoreToken(userEmail, userName) {
  try {
    console.log('📝 Generating token for email:', userEmail);
    
    // Generate token the same way as frontend
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    const userHash = Buffer.from(userEmail).toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 8);
    const token = `VIX_${userHash}_${timestamp}_${randomStr}`.toUpperCase();
    
    console.log('🔍 Searching for user with email:', userEmail);
    
    // Find user in database by email directly (more reliable than hash)
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        `SELECT id, email, name FROM users WHERE email = $1`,
        [userEmail]
      );
      
      if (userResult.rows.length === 0) {
        console.error('❌ User not found for email:', userEmail);
        throw new Error('User not found');
      }
      
      const user = userResult.rows[0];
      console.log('✅ Found user:', user.email, 'ID:', user.id);
      
      // Store token in database
      await storeTokenInDatabase(token, user.id, userEmail, userName);
      console.log('💾 Token stored in database for user:', user.email);
    } finally {
      client.release();
    }
    
    return token;
  } catch (error) {
    console.error('❌ Error generating and storing token:', error);
    throw error;
  }
}

/**
 * Get active token for a user from users table
 */
async function getActiveTokenForUser(userEmail) {
  try {
    const client = await pool.connect();
    try {
      // Get user with token from users table
      const result = await client.query(`
        SELECT whatsapp_token, whatsapp_token_expires_at
        FROM users
        WHERE email = $1 
        AND whatsapp_token IS NOT NULL
        AND whatsapp_token_expires_at > NOW()
      `, [userEmail]);
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          token: row.whatsapp_token,
          createdAt: null, // We don't store creation time in users table
          expiresAt: row.whatsapp_token_expires_at,
          isValid: true
        };
      }
      
      return null;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error getting active token for user:', error);
    return null;
  }
}

export { handleWhatsAppContactUpload, generateAndStoreToken, getActiveTokenForUser };