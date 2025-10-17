/**
 * WhatsApp Messenger
 * 
 * Handles all outgoing WhatsApp messages via Dialog 360 API
 * - Guest count questions
 * - Confirmation messages
 * - Error messages
 * - Message read receipts
 */

/**
 * Mark message as read (shows colored ticks to sender)
 * 
 * @param {string} messageId - WhatsApp message ID
 * @param {string} phoneNumber - Phone number
 */
export async function markMessageAsRead(messageId, phoneNumber) {
  try {
    const apiKey = process.env.D360_API_KEY;
    
    if (!apiKey) {
      console.error('D360_API_KEY not configured');
      return;
    }

    const response = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to mark message as read: ${error}`);
    } else {
      console.log(`Message ${messageId} marked as read`);
    }
  } catch (error) {
    // Don't throw - marking as read is optional, shouldn't break message processing
    console.error('Error marking message as read:', error);
  }
}

/**
 * Send a follow-up message asking for guest count
 * 
 * @param {string} phoneNumber - Phone number to send to
 */
export async function sendGuestCountQuestion(phoneNumber) {
  try {
    const apiKey = process.env.D360_API_KEY;
    
    if (!apiKey) {
      console.error('D360_API_KEY not configured');
      return;
    }
    
    const messageText = 'מעולה! 🎉\n\nכמה אורחים יגיעו?\nאנא השב עם מספר בלבד (לדוגמה: 2)';
    
    console.log(`📤 Sending guest count question to ${phoneNumber}`);
    
    const response = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: messageText
        }
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to send guest count question: ${error}`);
    } else {
      console.log(`✅ Guest count question sent to ${phoneNumber}`);
    }
    
  } catch (error) {
    console.error('Error sending guest count question:', error);
  }
}

/**
 * Send invalid guest count message
 * 
 * @param {string} phoneNumber - Phone number to send to
 */
export async function sendInvalidGuestCountMessage(phoneNumber) {
  try {
    const apiKey = process.env.D360_API_KEY;
    
    if (!apiKey) {
      console.error('D360_API_KEY not configured');
      return;
    }
    
    const messageText = 'אנא השב עם מספר תקין (לדוגמה: 2, 3, 4...)';
    
    const response = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: messageText
        }
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to send invalid guest count message: ${error}`);
    }
    
  } catch (error) {
    console.error('Error sending invalid guest count message:', error);
  }
}

/**
 * Send guest count confirmation message
 * 
 * @param {string} phoneNumber - Phone number to send to
 * @param {number} guestCount - Number of guests
 */
export async function sendGuestCountConfirmation(phoneNumber, guestCount) {
  try {
    const apiKey = process.env.D360_API_KEY;
    
    if (!apiKey) {
      console.error('D360_API_KEY not configured');
      return;
    }
    
    const messageText = `תודה! רשמנו ${guestCount} אורחים. נתראה באירוע! 🎊`;
    
    const response = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: messageText
        }
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to send guest count confirmation: ${error}`);
    } else {
      console.log(`✅ Guest count confirmation sent to ${phoneNumber}`);
    }
    
  } catch (error) {
    console.error('Error sending guest count confirmation:', error);
  }
}

