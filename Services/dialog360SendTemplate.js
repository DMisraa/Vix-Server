import pool from '../db/db.js';
import { getTemplateConfiguration } from './templates/templateConfigurations.js';
import { normalizePhoneForDialog360 } from './utils/phoneNormalization.js';

/**
 * Dialog 360 Template Message Sender (v2 API)
 * 
 * Sends WhatsApp template messages with event invitation images
 * Uses Dialog 360 v2 API (waba-v2.360dialog.io) to send pre-approved templates
 * 
 * IMPORTANT: This service uses the v2 API which requires parameter_name field for named variables
 * 
 * DATA STRUCTURE REFERENCE:
 * ========================
 * 
 * Event Structure (from database):
 * - id: string (UUID)
 * - event_name: string
 * - event_type: 'wedding' | 'bar_mitzvah' | 'bat_mitzvah' | 'brit_milah'
 * - event_date: date
 * - event_time: string
 * - venue_name: string
 * - location: string (venue address)
 * - image_url: string (Cloudinary URL - already uploaded)
 * - owner_email: string
 * - celebrator1_name: string (groom, bar mitzvah boy, etc.)
 * - celebrator2_name: string (bride - for weddings)
 * 
 * Contact Structure (from database):
 * - id: integer
 * - display_name: string (contact's display name)
 * - canonical_form: string (contact's full name - NOT the phone number)
 * - phone_number: string (local or international format, e.g., "0544349661" or "972544349661")
 * - contact_owner: string (email of the user who owns this contact)
 * - contact_source: string
 * - tags: array
 * 
 * NOTE: phone_number will be auto-normalized to international format for Dialog360
 * 
 * Request Body Format:
 * {
 *   eventId: "uuid-string",
 *   contactIds: [1, 2, 3],  // Array of contact IDs
 *   userEmail: "user@example.com",  // REQUIRED - For authentication and validation
 *   templateName: "event_invitation" (optional, default),
 *   languageCode: "he" (optional, default),
 *   buttons: [  // Optional - only for templates that support interactive buttons
 *     { id: "attending_yes", payload: "attending_yes_{eventId}" },
 *     { id: "attending_no", payload: "attending_no_{eventId}" }
 *   ]
 * }
 * 
 * NOTE: Not all templates require buttons. Only include buttons parameter
 * if the specific WhatsApp template is configured to use interactive buttons.
 * 
 * IMAGE HANDLING:
 * ==============
 * - Images are OPTIONAL - not all templates require images
 * - Images are uploaded to Cloudinary from client
 * - Stored as image_url in events table
 * - Direct URL passed to Dialog 360 (no re-upload needed)
 * - Dialog 360 fetches image from Cloudinary URL
 * - If event.image_url is null/empty, template will be sent without header image
 */

/**
 * Send a WhatsApp template message
 * 
 * @param {Object} params - Template message parameters
 * @param {string} params.phoneNumber - Recipient phone number (with country code, no +)
 * @param {string} params.templateName - Name of the approved template in Dialog 360
 * @param {string} params.languageCode - Template language code (e.g., 'he', 'en')
 * @param {Object} params.templateData - Data to fill template variables
 * @param {string} params.templateData.guestName - Guest name
 * @param {string} params.templateData.eventName - Event name
 * @param {string} params.templateData.eventDate - Event date
 * @param {string} params.templateData.eventLocation - Event location
 * @param {string} params.imageUrl - Event invitation image URL (from Cloudinary/DB)
 * @param {Array} params.buttons - Optional interactive buttons (for RSVP)
 * @returns {Promise<Object>} Response from Dialog 360 API
 */
export async function sendTemplateMessage(params) {
  try {
    const {
      phoneNumber,
      templateName,
      languageCode = 'he',
      templateData,
      imageUrl,
      buttons = []
    } = params;

    // Validate required parameters
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    if (!templateName) {
      throw new Error('Template name is required');
    }

    const apiKey = process.env.D360_API_KEY;
    if (!apiKey) {
      throw new Error('D360_API_KEY not configured');
    }

    // Construct template message payload
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNumber,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode
        },
        components: []
      }
    };

    // Add header component with image for templates that support it (e.g., "event_invitation")
    // Note: Dialog360 v2 API requires exact match between template structure and payload
    if (imageUrl) {
      payload.template.components.push({
        type: 'header',
        parameters: [
          {
            type: 'image',
            image: {
              link: imageUrl
            }
          }
        ]
      });
    }

    // Add body component with template variables
    if (templateData) {
      console.log('🔍 TEMPLATE DATA RECEIVED:', templateData);
      
      const bodyParameters = [];

      // Add template variables in order with parameter names for Dialog360 v2 API
      console.log('🔍 TRUTHY CHECKS:', {
        'guestName truthy?': !!templateData.guestName,
        'eventName truthy?': !!templateData.eventName,
        'eventDate truthy?': !!templateData.eventDate,
        'eventLocation truthy?': !!templateData.eventLocation,
        'customParams length': templateData.customParams?.length
      });

      if (templateData.guestName) {
        bodyParameters.push({
          type: 'text',
          text: templateData.guestName,
          parameter_name: 'guest_name'
        });
        console.log('✅ Added guestName');
      } else {
        console.log('❌ Skipped guestName (falsy)');
      }

      if (templateData.eventName) {
        bodyParameters.push({
          type: 'text',
          text: templateData.eventName,
          parameter_name: 'variable_1'
        });
        console.log('✅ Added eventName as variable_1');
      } else {
        console.log('❌ Skipped eventName (falsy)');
      }

      if (templateData.eventDate) {
        bodyParameters.push({
          type: 'text',
          text: templateData.eventDate,
          parameter_name: 'variable_2'
        });
        console.log('✅ Added eventDate as variable_2');
      } else {
        console.log('❌ Skipped eventDate (falsy) - THIS CAUSES PARAMETER SHIFT!');
      }

      if (templateData.eventLocation) {
        bodyParameters.push({
          type: 'text',
          text: templateData.eventLocation,
          parameter_name: 'variable_3'
        });
        console.log('✅ Added eventLocation as variable_3');
      } else {
        console.log('❌ Skipped eventLocation (falsy) - THIS CAUSES PARAMETER SHIFT!');
      }

      // Add any additional custom parameters with sequential variable names
      if (templateData.customParams && Array.isArray(templateData.customParams)) {
        templateData.customParams.forEach((param, index) => {
          bodyParameters.push({
            type: 'text',
            text: param,
            parameter_name: `variable_${index + 4}` // Start from variable_4
          });
          console.log(`✅ Added customParams[${index}] as variable_${index + 4}: "${param}"`);
        });
      }

      console.log('🔍 FINAL BODY PARAMETERS COUNT:', bodyParameters.length);
      console.log('🔍 FINAL BODY PARAMETERS:', JSON.stringify(bodyParameters, null, 2));

      if (bodyParameters.length > 0) {
        payload.template.components.push({
          type: 'body',
          parameters: bodyParameters
        });
      }
    }

    // Add interactive buttons if provided (for RSVP)
    if (buttons && buttons.length > 0) {
      const buttonComponents = buttons.map((button, index) => ({
        type: 'button',
        sub_type: 'quick_reply',
        index: index,
        parameters: [
          {
            type: 'payload',
            payload: button.payload || button.id
          }
        ]
      }));

      payload.template.components.push(...buttonComponents);
    }

    console.log('Sending template message to:', phoneNumber);
    console.log('Template:', templateName);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    // Send message via Dialog 360 API
    const response = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    
    // Log the complete response for debugging
    console.log('📡 Dialog360 API Response Status:', response.status);
    console.log('📡 Dialog360 API Response:', JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.error('❌ Dialog 360 API error:', result);
      console.error('Template name:', templateName);
      console.error('Language code:', languageCode);
      console.error('Phone number:', phoneNumber);
      console.error('Full payload sent:', JSON.stringify(payload, null, 2));
      
      // Log the complete error response for debugging
      console.error('🔍 Complete error response:', JSON.stringify(result, null, 2));
      
      // Provide helpful error messages for different error types
      let userFriendlyMessage = 'Failed to send template message';
      
      if (result.error?.code === 100) {
        console.error('⚠️  Error 100 (Invalid parameter) usually means:');
        console.error('   1. Parameter structure mismatch with Dialog360 v2 API');
        console.error('   2. Template expects different parameter format');
        console.error('   3. Missing required fields in parameter objects');
        console.error('   4. Parameter count mismatch with template');
        console.error('   Details:', result.error?.error_data?.details || 'No details provided');
        userFriendlyMessage = 'פרמטר לא תקין - יתכן שהמספר אינו רשום בוואטסאפ';
      } else if (result.error?.code === 131026) {
        console.error('⚠️  Error 131026: User not registered on WhatsApp');
        userFriendlyMessage = 'המספר אינו רשום בוואטסאפ - המשתמש צריך להתקין את האפליקציה';
      } else if (result.error?.code === 131021) {
        console.error('⚠️  Error 131021: User blocked the business');
        userFriendlyMessage = 'המשתמש חסם את ההודעות מהעסק';
      } else if (result.error?.code === 190) {
        console.error('⚠️  Error 190: Rate limit exceeded');
        userFriendlyMessage = 'חריגה ממכסת הודעות - נסה שוב מאוחר יותר';
      } else if (result.error?.code === 132000) {
        console.error('⚠️  Error 132000 (Parameter count mismatch):');
        console.error('   Template expects different number of parameters');
        console.error('   Details:', result.error?.error_data?.details || 'No details provided');
        userFriendlyMessage = 'פרמטרים לא תואמים לתבנית ההודעה';
      } else if (result.meta?.http_code === 555) {
        console.error('⚠️  Error 555 usually means:');
        console.error('   1. Template "' + templateName + '" does not exist in Dialog360');
        console.error('   2. Template is not approved (check Dialog360 dashboard)');
        console.error('   3. Template parameters do not match (we sent ' + (templateData ? 'with data' : 'no data') + ')');
        console.error('   4. Language code "' + languageCode + '" does not match template language');
        userFriendlyMessage = 'תבנית ההודעה לא נמצאה או לא אושרה';
      } else if (result.error?.code === 131047) {
        console.error('⚠️  Error 131047: Message undeliverable');
        userFriendlyMessage = 'לא ניתן למסור את ההודעה - בדוק את מספר הטלפון';
      } else if (result.error?.code === 131051) {
        console.error('⚠️  Error 131051: Re-engagement message');
        userFriendlyMessage = 'המשתמש לא פתח את ההודעה במשך 24 שעות - נסה שוב מאוחר יותר';
      }
      
      console.error('📝 Final error message:', userFriendlyMessage);
      
      throw new Error(userFriendlyMessage);
    }

    console.log('Template message sent successfully:', result);
    return {
      success: true,
      messageId: result.messages?.[0]?.id,
      data: result
    };

  } catch (error) {
    console.error('Error sending template message:', error);
    throw error;
  }
}

/**
 * Generate RSVP buttons with event_id in payload
 * 
 * @param {string} eventId - Event ID to encode in button payload
 * @returns {Array} Array of button configurations
 */
function generateRSVPButtons(eventId) {
  return [
    {
      id: 'rsvp_yes',
      payload: `rsvp_yes_${eventId}`
    },
    {
      id: 'rsvp_no',
      payload: `rsvp_no_${eventId}`
    },
    {
      id: 'rsvp_maybe',
      payload: `rsvp_maybe_${eventId}`
    }
  ];
}

/**
 * Send template messages to multiple recipients (batch sending)
 * 
 * @param {Array} recipients - Array of recipient objects
 * @param {string} templateName - Template name
 * @param {string} languageCode - Language code
 * @param {string} imageUrl - Event image URL
 * @param {string} eventId - Event ID to encode in button payloads
 * @returns {Promise<Object>} Batch send results
 */
export async function sendBatchTemplateMessages(recipients, templateName, languageCode, imageUrl, eventId) {
  try {
    const results = {
      success: [],
      failed: [],
      total: recipients.length
    };

    // Generate RSVP buttons with event_id in payload (same for all recipients)
    const rsvpButtons = generateRSVPButtons(eventId);

    // Send messages with delay to avoid rate limiting
    for (const recipient of recipients) {
      try {
        const result = await sendTemplateMessage({
          phoneNumber: recipient.phoneNumber,
          templateName,
          languageCode,
          templateData: {
            // guestName: recipient.name,  // Not needed for this template
            eventName: recipient.eventName,        // Variable 1: Event type
            eventDate: recipient.eventDate,        // Variable 2: Celebrators
            eventLocation: recipient.eventLocation, // Variable 3: Day of week
            customParams: recipient.customParams   // Variables 4-6: Date, Location, Time
          },
          imageUrl,
          buttons: rsvpButtons // All recipients get same buttons with event_id
        });

        results.success.push({
          phoneNumber: recipient.phoneNumber,
          name: recipient.name,
          messageId: result.messageId
        });

        // Add small delay between messages (Dialog 360 rate limits)
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        results.failed.push({
          phoneNumber: recipient.phoneNumber,
          name: recipient.name,
          error: error.message
        });
      }
    }

    console.log(`Batch send complete: ${results.success.length} sent, ${results.failed.length} failed`);
    return results;

  } catch (error) {
    console.error('Error in batch send:', error);
    throw error;
  }
}

/**
 * Express route handler for sending template messages with event data
 */
export async function handleSendTemplate(req, res) {
  try {
    const {
      eventId,
      contactIds, // Array of contact IDs to send to
      userEmail, // User email for validation
      templateName = 'event_invitation', // Default to existing approved template
      languageCode = 'he',
      buttons
    } = req.body;

    // Validate request
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'Event ID is required'
      });
    }

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: 'User email is required'
      });
    }

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Contact IDs array is required'
      });
    }

    // Fetch event data from database
    const eventResult = await pool.query(
      'SELECT * FROM events WHERE id = $1',
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    const event = eventResult.rows[0];

    // Validate event ownership - CRITICAL SECURITY CHECK
    if (event.owner_email !== userEmail) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Event does not belong to this user'
      });
    }


    // Fetch contacts data - validate ownership
    const contactsResult = await pool.query(
      'SELECT * FROM contacts WHERE id = ANY($1) AND contact_owner = $2',
      [contactIds, userEmail]
    );

    const contacts = contactsResult.rows;

    if (contacts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No contacts found or contacts do not belong to this user'
      });
    }


    // Prepare recipients with personalized event data
    const recipients = contacts.map(contact => {
      // Use phone_number directly (canonical_form is the contact name, not phone)
      const rawPhone = contact.phone_number;
      const normalizedPhone = normalizePhoneForDialog360(rawPhone);
      
      console.log('📞 Phone normalization:', {
        contactId: contact.id,
        displayName: contact.display_name,
        phoneNumber: contact.phone_number,
        normalizedPhone: normalizedPhone
      });
      
      // Get template-specific configuration
      const templateConfig = getTemplateConfiguration(templateName, event, contact);
      
      return {
        phoneNumber: normalizedPhone,
        name: contact.display_name || contact.canonical_form || 'אורח',
        ...templateConfig // Spread template configuration (eventName, eventDate, eventLocation, customParams)
      };
    }).filter(r => r.phoneNumber); // Filter out contacts without valid phone numbers

    console.log(`📊 Recipients prepared: ${recipients.length} out of ${contacts.length} contacts`);
    
    // Validate we have recipients
    if (recipients.length === 0) {
      console.error('❌ No valid recipients after phone normalization');
      return res.status(400).json({
        success: false,
        message: 'No valid phone numbers found for selected contacts'
      });
    }

    // Send batch messages with event_id in button payloads
    const results = await sendBatchTemplateMessages(
      recipients,
      templateName,
      languageCode,
      event.image_url, // Cloudinary URL from database
      eventId // Pass event_id for button payloads
    );

    // Log successful sends to database
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const success of results.success) {
        const contact = contacts.find(c => {
          const normalized = normalizePhoneForDialog360(c.phone_number);
          return normalized === success.phoneNumber;
        });
        
        if (contact) {
          // Check if already logged
          const existing = await client.query(
            'SELECT id FROM event_messages WHERE event_id = $1 AND contact_id = $2 AND message_type = $3 AND message_round = $4',
            [eventId, contact.id, 'invitation', 1]
          );

          if (existing.rows.length === 0) {
            // Save invitation with WhatsApp message_id for tracking seen status
            await client.query(
              `INSERT INTO event_messages (
                event_id, contact_id, message_type, message_round, response, message_id
              ) VALUES ($1, $2, $3, $4, $5, $6)`,
              [eventId, contact.id, 'invitation', 1, 'ממתין לתגובה', success.messageId]
            );
            console.log(`✅ Invitation logged with message_id: ${success.messageId}`);
          } else {
            // Update existing record with WhatsApp message_id
            await client.query(
              `UPDATE event_messages 
               SET message_id = $1 
               WHERE id = $2`,
              [success.messageId, existing.rows[0].id]
            );
            console.log(`✅ Updated invitation with message_id: ${success.messageId}`);
          }
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error logging sent messages:', err);
    } finally {
      client.release();
    }

    return res.status(200).json({
      success: true,
      message: 'Template messages sent',
      results: {
        sent: results.success.length,
        failed: results.failed.length,
        total: results.total,
        successList: results.success, // Array of successful sends with details
        failedList: results.failed,   // Array of failed sends with error details
        details: results
      },
      event: {
        id: event.id,
        name: event.event_name,
        image: event.image_url
      }
    });

  } catch (error) {
    console.error('Error in handleSendTemplate:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send template messages'
    });
  }
}

