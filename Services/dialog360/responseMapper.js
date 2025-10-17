/**
 * Invitation Button Response Mapper
 * 
 * Maps WhatsApp invitation quick reply button responses to Hebrew response types
 * 
 * ⚠️ IMPORTANT: Only processes quick reply buttons (button/interactive message types)
 * Free-text messages are NOT processed here (except guest count which is handled separately)
 * 
 * Expected invitation button responses:
 * - "כן, אני מגיע!" → מגיע (Attending)
 * - "לצערי, לא" → לא מגיע (Not Attending)
 * - "עדיין לא יודע\ת" → לא בטוח (Maybe/Uncertain)
 */

/**
 * Map WhatsApp invitation quick reply button to Hebrew response types
 * 
 * @param {string} buttonText - The button text from WhatsApp quick reply
 * @param {string} messageType - Type of message ('text', 'button', 'interactive')
 * @returns {string|null} - Hebrew response type ('מגיע', 'לא מגיע', 'לא בטוח') or null if not a button
 */
export function mapInvitationButtonResponse(buttonText, messageType) {
  // ✅ ONLY process quick reply buttons (button/interactive message types)
  // Free-text messages are handled separately (e.g., guest count in guestCountHandler.js)
  if (messageType !== 'button' && messageType !== 'interactive') {
    console.log(`ℹ️  Skipping free-text message (not a quick reply button): "${buttonText}"`);
    return null; // Not a button - don't process
  }
  
  // Normalize the text - trim and convert to lowercase for matching
  const normalizedText = buttonText.trim().toLowerCase();
  
  // Remove common punctuation for flexible matching
  const cleanText = normalizedText.replace(/[!.,?]/g, '').trim();
  
  // Match Button 1: "כן, אני מגיע!" → Attending
  if (cleanText.includes('כן') && cleanText.includes('אני') && cleanText.includes('מגיע')) {
    console.log(`✅ Button matched: Attending (מגיע)`);
    return 'מגיע';
  }
  
  // Match Button 2: "לצערי, לא" → Not Attending
  if (cleanText.includes('לצערי') && cleanText.includes('לא')) {
    console.log(`✅ Button matched: Not Attending (לא מגיע)`);
    return 'לא מגיע';
  }
  
  // Match Button 3: "עדיין לא יודע\ת" → Maybe/Uncertain
  if (cleanText.includes('עדיין') && cleanText.includes('לא') && cleanText.includes('יודע')) {
    console.log(`✅ Button matched: Maybe (לא בטוח)`);
    return 'לא בטוח';
  }
  
  // If button doesn't match any expected pattern, log warning and return null
  console.warn(`⚠️  Unexpected button reply: "${buttonText}" - not matching any of the 3 expected buttons`);
  return null;
}

