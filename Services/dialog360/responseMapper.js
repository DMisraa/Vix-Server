/**
 * Invitation Response Mapper
 * 
 * Maps WhatsApp invitation responses (buttons and text) to Hebrew response types
 * 
 * Supports:
 * - Quick reply buttons (button/interactive message types)
 * - Free-text messages (for templates without buttons)
 * 
 * Expected responses:
 * - "כן, אני אגיע!" / "כן" / "מגיע" / "אגיע" → מגיע (Attending)
 * - "לצערי, לא" / "לא מגיע" / "לא אגיע" → לא מגיע (Not Attending)
 * - "עדיין לא יודע\ת" / "אולי" / "לא בטוח" → לא בטוח (Maybe/Uncertain)
 */

/**
 * Map WhatsApp invitation response to Hebrew response types
 * 
 * @param {string} responseText - The response text from WhatsApp (button or free text)
 * @param {string} messageType - Type of message ('text', 'button', 'interactive')
 * @param {boolean} allowTextFallback - If true, processes text messages for templates without buttons
 * @returns {string|null} - Hebrew response type ('מגיע', 'לא מגיע', 'לא בטוח') or null if not recognized
 */
export function mapInvitationButtonResponse(responseText, messageType, allowTextFallback = false) {
  // Skip text messages unless explicitly allowed (for templates without buttons)
  if (messageType === 'text' && !allowTextFallback) {
    console.log(`ℹ️  Skipping text message (allowTextFallback=false): "${responseText}"`);
    return null;
  }
  
  if (!responseText) {
    return null;
  }
  
  // Normalize the text - trim and convert to lowercase for matching
  const normalizedText = responseText.trim().toLowerCase();
  
  // Remove common punctuation for flexible matching
  const cleanText = normalizedText.replace(/[!.,?]/g, '').trim();
  
  // Match Attending responses (check specific patterns first)
  if (cleanText.includes('כן') && cleanText.includes('אני') && (cleanText.includes('מגיע') || cleanText.includes('אגיע'))) {
    console.log(`✅ Response matched: Attending (מגיע)`);
    return 'מגיע';
  }
  
  // Match Not Attending responses
  if (cleanText.includes('לצערי') && cleanText.includes('לא')) {
    console.log(`✅ Response matched: Not Attending (לא מגיע)`);
    return 'לא מגיע';
  }
  
  // Match Maybe responses
  if (cleanText.includes('עדיין') && cleanText.includes('לא') && cleanText.includes('יודע')) {
    console.log(`✅ Response matched: Maybe (לא בטוח)`);
    return 'לא בטוח';
  }
  
  // Additional text patterns (for free text messages)
  if (messageType === 'text' && allowTextFallback) {
    // Simple negative responses (check these before positive to avoid conflicts)
    if (cleanText.includes('לא מגיע') || cleanText.includes('לא אגיע') || cleanText.includes('לא נגיע') || 
        cleanText.includes('מצטער') || cleanText === 'no' || cleanText === 'לא') {
      console.log(`✅ Text matched: Not Attending (לא מגיע)`);
      return 'לא מגיע';
    }
    
    // Maybe responses
    if (cleanText.includes('אולי') || cleanText.includes('לא בטוח') || cleanText.includes('לא יודע') || 
        cleanText.includes('maybe') || cleanText.includes('תלוי')) {
      console.log(`✅ Text matched: Maybe (לא בטוח)`);
      return 'לא בטוח';
    }
    
    // Simple positive responses
    if (cleanText === 'כן' || cleanText.includes('מגיע') || cleanText.includes('אגיע') || 
        cleanText.includes('נגיע') || cleanText.includes('בטוח') || cleanText === 'yes' || cleanText === 'ok') {
      console.log(`✅ Text matched: Attending (מגיע)`);
      return 'מגיע';
    }
  }
  
  // If response doesn't match any expected pattern, log warning and return null
  console.warn(`⚠️  Unrecognized response: "${responseText}" (type: ${messageType})`);
  return null;
}

