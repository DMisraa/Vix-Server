import jwt from "jsonwebtoken";
import { parse } from "vcard-parser";

export function appleContacts(req, res) {
  const email = req.body.email || 'unknown@example.com';
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Convert buffer to string and split by vCard delimiters
    const vCardData = req.file.buffer.toString("utf-8");
    const vCards = vCardData.split("BEGIN:VCARD").filter(Boolean); // Split and remove empty strings

    // Parse each vCard
    const contacts = vCards
      .map((vCard) => {
        try {
          const cleanedVCard =
            "BEGIN:VCARD" + vCard.split("END:VCARD")[0] + "END:VCARD";
          const parsedContact = parse(cleanedVCard);
          const entry = Array.isArray(parsedContact)
            ? parsedContact[0]
            : parsedContact;

          const displayName = entry.fn?.[0]?.value || "Unknown";

          // Collect TEL entries with their types
          const telEntries = (entry.tel || [])
            .map((t) => {
              if (typeof t === "string") {
                return { value: t, type: "TEL" };
              } else {
                return { 
                  value: t.value, 
                  type: t.type || "TEL",
                  label: t.label || null
                };
              }
            })
            .filter(t => t.value);

          // Helper function to normalize for comparison (same logic as client-side)
          function normalizeForComparison(numberString) {
            let cleaned = numberString.replace(/[-\s()]/g, '');
            if (cleaned.startsWith('+')) {
              cleaned = cleaned.substring(1);
            }
            if (cleaned.startsWith('0') && (cleaned.length === 9 || cleaned.length === 10)) {
              cleaned = '972' + cleaned.substring(1);
            }
            return cleaned;
          };

          // Helper function to determine phone number priority (lower number = higher priority)
          function getPhonePriority(telEntry) {
            const type = (telEntry.type || '').toLowerCase();
            const label = (telEntry.label || '').toLowerCase();
            const number = telEntry.value.replace(/[-\s()]/g, '').trim();
            
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

          // Sort telEntries by priority (mobile first, then others, then work, then home/landline)
          const sortedTelEntries = [...telEntries].sort((a, b) => {
            return getPhonePriority(a) - getPhonePriority(b);
          });

          // Normalize and deduplicate, preferring mobile numbers
          const seen = new Set();
          const canonicalNumbers = [];
          const regularNumbers = [];

          for (let telEntry of sortedTelEntries) {
            const cleaned = telEntry.value.replace(/[-\s]/g, "").trim(); // Remove dashes and spaces
            const normalized = normalizeForComparison(cleaned);
            
            if (seen.has(normalized)) continue;
            seen.add(normalized);

            if (cleaned.startsWith("+")) {
              canonicalNumbers.push(cleaned);
            } else {
              regularNumbers.push(cleaned);
            }
          }

          const canonicalForm =
            canonicalNumbers.join(", ") || "No canonical number";
          const phoneNumber = regularNumbers.join(", ") || "No local number";

          // Create deduplicated phone numbers array, preferring mobile numbers
          const uniquePhoneNumbers = [];
          const seenNumbers = new Map(); // Use Map to store both normalized number and the entry
          
          for (let telEntry of telEntries) {
            const cleaned = telEntry.value.replace(/[-\s]/g, "").trim();
            const normalized = normalizeForComparison(cleaned);
            
            // If we haven't seen this normalized number, add it
            if (!seenNumbers.has(normalized)) {
              seenNumbers.set(normalized, {
                number: cleaned,
                type: telEntry.type,
                label: telEntry.label,
                isCanonical: cleaned.startsWith("+"),
                priority: getPhonePriority(telEntry)
              });
            } else {
              // If we have seen it, prefer the one with higher priority (lower number)
              const existing = seenNumbers.get(normalized);
              const currentPriority = getPhonePriority(telEntry);
              const existingPriority = existing.priority;
              
              // Replace if current has higher priority (lower number)
              if (currentPriority < existingPriority) {
                seenNumbers.set(normalized, {
                  number: cleaned,
                  type: telEntry.type,
                  label: telEntry.label,
                  isCanonical: cleaned.startsWith("+"),
                  priority: currentPriority
                });
              }
            }
          }
          
          // Convert Map values to array
          uniquePhoneNumbers.push(...seenNumbers.values());

          return {
            displayName,
            canonicalForm,
            phoneNumber,
            uploadedByEmail: email,
            contactSource: "VCF",
            tags: [], // Initialize with empty tags array
            // Store individual phone numbers with types for better selection (deduplicated)
            phoneNumbers: uniquePhoneNumbers
          };
        } catch (error) {
          console.log("Error parsing a contact:", error);
          return null;
        }
      })
      .filter(Boolean);

    res.json({ contacts });
  } catch (error) {
    console.error("Apple contacts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} 