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

    res.json({ contacts });
  } catch (error) {
    console.error("Apple contacts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} 