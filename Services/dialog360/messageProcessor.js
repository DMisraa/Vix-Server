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

// WhatsApp contact upload functions (moved from whatsappListener.js)
const TOKEN_PREFIX = 'VIX_';
const TOKEN_EXPIRY_DAYS = 10; // 10 days expiry

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
        console.log('🔍 Looking for user with hash:', userHash);
        
        // Get all users and test hash generation locally
        const allUsersQuery = `SELECT id, email, name FROM users`;
        const allUsers = await pool.query(allUsersQuery);
        
        console.log(`🔍 Found ${allUsers.rows.length} users in database`);
        
        for (const user of allUsers.rows) {
            // Generate hash the same way as frontend
            const generatedHash = Buffer.from(user.email).toString('base64')
                .replace(/[^a-zA-Z0-9]/g, '')
                .substring(0, 8);
            
            console.log(`🔍 Testing user ${user.email}: generated hash = ${generatedHash}, looking for = ${userHash}`);
            
            if (generatedHash === userHash) {
                console.log(`✅ Found matching user:`, user);
                return user;
            }
        }
        
        console.log('❌ No user found with matching hash');
        return null;
    } catch (error) {
        console.error('Error finding user by hash:', error);
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
 * Message Processor
 * 
 * Processes different types of WhatsApp messages:
 * - Text messages
 * - Button replies
 * - Interactive messages
 * - Media messages (image, document, audio, video)
 */

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

    // Debug logging for WhatsApp contact upload
    console.log('🔍 Dialog360 Message Received:', {
      messageId,
      from,
      messageType,
      textContent: message.text?.body,
      timestamp: new Date(timestamp * 1000).toISOString()
    });

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
        const imageId = message.image?.id;
        // DB logic
        break;

      case 'document':
        const documentId = message.document?.id;
        // DB logic
        break;

      case 'audio':
        const audioId = message.audio?.id;
        // DB logic
        break;

      case 'video':
        const videoId = message.video?.id;
        // DB logic
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

    // ✅ Add error handling logic here:
    // - Log to monitoring system (e.g., Sentry)
    // - Save to database for tracking
    // - Send alerts for critical errors
    // - Update message status in DB if related to specific message

    // Common error codes to handle:
    // - 130472: User's number is part of an experiment (no action needed)
    // - 131026: Message undeliverable
    // - 131047: Re-engagement message
    // - 131051: Unsupported message type
    // - etc.

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
    
    // ✅ Extract event_id from button payload FIRST (for duplicate contact handling)
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
        // No pending invitation found - get event and contact details for debugging
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
        
        const errorMsg = `[DEBUG] No pending invitation found. Event: ${eventName} (${eventId}) | Owner: ${ownerEmail} | Contact: ${contactName} (ID: ${contactId}) | Phone: ${phoneNumber} | Payload: ${payload} | Response may have already been recorded.`;
        
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
          const errorMsg = `[DEBUG] No pending invitation found (response already recorded). Event: ${row.event_name || 'unknown'} (${row.event_id || 'unknown'}) | Owner: ${row.owner_email || 'unknown'} | Contact ID: ${contactId} | Phone: ${phoneNumber} | Message type: ${messageType}`;
          
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
 * Handle WhatsApp contact upload messages
 * 
 * @param {string} messageText - The message content
 * @param {string} senderNumber - The sender's phone number
 * @returns {Object} - { handled: boolean, result?: Object }
 */
async function handleWhatsAppContactUpload(messageText, senderNumber) {
  try {
    console.log('🔍 Checking WhatsApp contact upload:', {
      messageText,
      senderNumber,
      hasToken: /VIX_[A-Z0-9]+_[A-Z0-9]+_[A-Z0-9]+/.test(messageText)
    });

    // Check if message contains a token (works even if message is just the token)
    // More specific regex to match valid token format: VIX_[hash]_[timestamp]_[random]
    const tokenMatch = messageText.match(/VIX_[A-Z0-9]+_[A-Z0-9]+_[A-Z0-9]+/);
    
    if (tokenMatch) {
      // Phase 1: Token validation
      const token = tokenMatch[0];
      console.log('WhatsApp Contact Upload - Token found:', token);
      console.log('🔍 Full message was:', JSON.stringify(messageText));
      
      const tokenData = parseToken(token);
      console.log('🔍 Token parsed:', tokenData);
      
      if (!tokenData || !tokenData.isValid) {
        await sendWhatsAppReply(senderNumber, '❌ הטוקן לא תקין או פג תוקף. אנא נסה שוב.');
        return { handled: true, result: { success: false, message: 'Invalid token' } };
      }
      
      console.log('🔍 Looking for user with hash:', tokenData.userHash);
      const user = await findUserByHash(tokenData.userHash);
      if (!user) {
        await sendWhatsAppReply(senderNumber, '❌ משתמש לא נמצא. אנא בדוק את הטוקן.');
        return { handled: true, result: { success: false, message: 'User not found' } };
      }
      
      // Store token in database for persistence
      await storeTokenInDatabase(token, user.id, user.email, user.name);
      
      await sendWhatsAppReply(senderNumber, `✅ הטוקן אומת בהצלחה!\n\nשלחו כעת את אנשי הקשר שלכם בפורמט:\nשם, טלפון, אימייל (אופציונלי)\n\n⏰ הטוקן פעיל למשך 10 דקות בלבד`);
      return { handled: true, result: { success: true, message: 'Token validated' } };
      
    } else {
      // Phase 2: Check if this message contains contact data
      // Since tokens are shared with third parties, we need to check if any active token
      // was recently validated (within a reasonable time window)
      const recentTokenData = await getRecentlyValidatedToken();
      
      if (!recentTokenData) {
        // Check if there's an expired token (within last 10 minutes but now expired)
        const expiredTokenData = await getExpiredTokenData();
        
        if (expiredTokenData) {
          // Token was recently active but has now timed out
          await sendWhatsAppReply(senderNumber, 
            '⏰ זמן הטוקן פג!\n\n' +
            'הטוקן שלכם פג תוקף לאחר 10 דקות.\n' +
            'כל האנשי קשר שנשלחו עד כה נשמרו בהצלחה.\n\n' +
            'כדי לשלוח אנשי קשר נוספים, אנא שלחו את הטוקן שוב כדי להתחיל תהליך חדש.'
          );
          return { handled: true, result: { success: false, message: 'Token timeout' } };
        }
        
        // No recently validated token, let it be processed as normal event response
        return { handled: false };
      }
      
      const { token: activeToken, user: activeUser } = recentTokenData;
      
      // Parse contact data from message
      const contacts = parseContactData(messageText);
      
      if (contacts.length === 0) {
        await sendWhatsAppReply(senderNumber, '❌ לא נמצאו אנשי קשר תקינים בהודעה. אנא שלחו בפורמט: שם, טלפון, אימייל');
        return { handled: true, result: { success: false, message: 'No valid contacts' } };
      }
      
      // Save contacts to database (using guest upload system)
      const result = await saveContactsToDatabase(activeUser.userId, contacts, activeUser.userEmail);
      
      if (result.success) {
        // Keep token active for future use (only time-based expiration)
        await sendWhatsAppReply(senderNumber, `✅ נשמרו ${contacts.length} אנשי קשר בהצלחה!\n\nהאנשי קשר יופיעו בהתראות שלכם לבדיקה ואישור.`);
        return { handled: true, result: { success: true, contacts: contacts, uploadId: result.uploadId } };
      } else {
        await sendWhatsAppReply(senderNumber, '❌ שגיאה בשמירת אנשי הקשר. אנא נסה שוב.');
        return { handled: true, result: { success: false, message: 'Failed to save contacts' } };
      }
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
      
      // Add columns to users table if they don't exist
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS whatsapp_token VARCHAR(255),
        ADD COLUMN IF NOT EXISTS whatsapp_token_expires_at TIMESTAMP
      `);
      
      // Update user with token
      await client.query(`
        UPDATE users 
        SET whatsapp_token = $1, 
            whatsapp_token_expires_at = $2
        WHERE id = $3
      `, [
        token,
        new Date(Date.now() + (TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)),
        userId
      ]);
      
      await client.query('COMMIT');
      console.log(`✅ Token stored in users table: ${token}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error storing token in users table:', error);
  }
}


/**
 * Get expired token data (was active within last 10 minutes but now expired)
 * This helps provide better error messages for timeout cases
 */
async function getExpiredTokenData() {
  try {
    const client = await pool.connect();
    try {
      // Find user with token that was active within last 10 minutes but is now expired
      const tenMinutesAgo = new Date(Date.now() - (10 * 60 * 1000));
      const now = new Date();
      
      const result = await client.query(`
        SELECT id, email, name, whatsapp_token, whatsapp_token_expires_at
        FROM users
        WHERE whatsapp_token IS NOT NULL
        AND whatsapp_token_expires_at > $1
        AND whatsapp_token_expires_at < $2
        ORDER BY whatsapp_token_expires_at DESC
        LIMIT 1
      `, [tenMinutesAgo, now]);
      
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
    console.error('Error getting expired token data:', error);
    return null;
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
        AND whatsapp_token_expires_at > $1
        ORDER BY whatsapp_token_expires_at DESC
        LIMIT 1
      `, [tenMinutesAgo]);
      
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
 * Remove token from database (clear from users table)
 */
async function removeTokenFromDatabase(token) {
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        UPDATE users 
        SET whatsapp_token = NULL, 
            whatsapp_token_expires_at = NULL
        WHERE whatsapp_token = $1
      `, [token]);
      
      console.log(`✅ Token removed from users table: ${token}`);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error removing token from users table:', error);
  }
}

/**
 * Generate and store a new token for a user
 */
async function generateAndStoreToken(userEmail, userName) {
  try {
    // Generate token the same way as frontend
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    const userHash = Buffer.from(userEmail).toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 8);
    const token = `VIX_${userHash}_${timestamp}_${randomStr}`.toUpperCase();
    
    // Find user in database
    const user = await findUserByHash(userHash);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Store token in database
    await storeTokenInDatabase(token, user.id, userEmail, userName, 'pending');
    
    return token;
  } catch (error) {
    console.error('Error generating and storing token:', error);
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

// Export for debugging and API endpoints
export { handleWhatsAppContactUpload, generateAndStoreToken, getActiveTokenForUser };

