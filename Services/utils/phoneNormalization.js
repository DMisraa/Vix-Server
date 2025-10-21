/**
 * Phone Number Normalization Utilities
 * 
 * Provides functions to normalize phone numbers for different services
 */

/**
 * Normalize phone number to international format for Dialog360
 * 
 * Converts Israeli local format (0544349661) to international format (972544349661)
 * Handles various input formats and edge cases
 * 
 * @param {string} phoneNumber - Phone number in any format
 * @returns {string|null} Normalized phone number or null if invalid
 */
export function normalizePhoneForDialog360(phoneNumber) {
  if (!phoneNumber) return null;
  
  // Remove all non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, '');
  
  // If starts with 0 and is 9-10 digits (Israeli local format)
  if (cleaned.startsWith('0') && (cleaned.length === 9 || cleaned.length === 10)) {
    // Convert to international format: 972XXXXXXXXX
    cleaned = '972' + cleaned.substring(1);
  }
  
  // If starts with +, remove it
  if (phoneNumber.startsWith('+')) {
    cleaned = phoneNumber.substring(1).replace(/\D/g, '');
  }
  
  return cleaned;
}

/**
 * Normalize phone number between international and local formats
 * For Israel: 972544349661 <-> 0544349661
 * 
 * @param {string} phoneNumber - Phone number in any format
 * @returns {Array<string>} Array of possible phone number formats to check
 */
export function normalizePhoneNumberFormats(phoneNumber) {
  const formats = [phoneNumber]; // Always include original format
  
  // Handle Israeli phone numbers
  if (phoneNumber.startsWith('972')) {
    // Convert international to local: 972544349661 -> 0544349661
    const localFormat = '0' + phoneNumber.substring(3);
    formats.push(localFormat);
  } else if (phoneNumber.startsWith('0')) {
    // Convert local to international: 0544349661 -> 972544349661
    const internationalFormat = '972' + phoneNumber.substring(1);
    formats.push(internationalFormat);
  }
  
  return formats;
}
