import jwt from "jsonwebtoken";
import { parse } from "vcard-parser";

export function appleContacts(req, res) {
  console.log('=== APPLE CONTACTS HANDLER CALLED ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  console.log('Request path:', req.path);
  console.log('Request headers:', req.headers);
  console.log('Cookies:', req.cookies);
  console.log('Has file:', !!req.file);
  console.log('File info:', req.file ? {
    fieldname: req.file.fieldname,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  } : 'No file');
  
  // Remove JWT authentication check entirely
  const email = req.body.email || 'unknown@example.com'; // Use email from form data or fallback
  
  try {
    if (!req.file) {
      console.log('=== APPLE CONTACTS REQUEST FAILED: No file uploaded ===');
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

          // Collect TEL entries
          const telEntries = (entry.tel || [])
            .map((t) => (typeof t === "string" ? t : t.value))
            .filter(Boolean);

          // Normalize and deduplicate
          const seen = new Set();
          const canonicalNumbers = [];
          const regularNumbers = [];

          for (let raw of telEntries) {
            const cleaned = raw.replace(/[-\s]/g, "").trim(); // Remove dashes and spaces
            if (seen.has(cleaned)) continue;
            seen.add(cleaned);

            if (cleaned.startsWith("+")) {
              canonicalNumbers.push(cleaned);
            } else {
              regularNumbers.push(cleaned);
            }
          }

          const canonicalForm =
            canonicalNumbers.join(", ") || "No canonical number";
          const phoneNumber = regularNumbers.join(", ") || "No local number";

          return {
            displayName,
            canonicalForm,
            phoneNumber,
            uploadedByEmail: email,
            contactSource: "VCF",
          };
        } catch (error) {
          console.log("Error parsing a contact:", error);
          return null;
        }
      })
      .filter(Boolean);

    console.log('Apple contacts processed successfully, count:', contacts.length);
    console.log('=== APPLE CONTACTS REQUEST SUCCESS ===');
    res.json({ contacts });
  } catch (error) {
    console.error("=== APPLE CONTACTS REQUEST ERROR ===", error);
    console.error("Error processing file:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} 