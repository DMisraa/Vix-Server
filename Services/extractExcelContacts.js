import xlsx from "xlsx";
import fs from "fs/promises";

export async function extractExcelData(req, res) {
  if (!req.file) {
    console.log("No file uploaded");
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawContacts = xlsx.utils.sheet_to_json(sheet); // [{Name, Phone}, ...]

    const email = req.body.email; // Extract email from FormData

    const contacts = rawContacts.map((row) => {
      const displayName = row["Name"] || "Unknown";
      const rawPhone = row["Phone"] || "";

      // Support multiple numbers in one field (comma/semicolon-separated)
      const telEntries = rawPhone
        
        .map((num) => num.replace(/[-\s]/g, "").trim())
        .filter(Boolean);

      const seen = new Set();
      const canonicalNumbers = [];
      const regularNumbers = [];

      for (let raw of telEntries) {
        if (seen.has(raw)) continue;
        seen.add(raw);

        if (raw.startsWith("+")) {
          canonicalNumbers.push(raw);
        } else {
          regularNumbers.push(raw);
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
        contactSource: "EXCEL",
      };
    });

    await fs.unlink(filePath); // Clean up temp file

    res.json({ contacts });
  } catch (error) {
    console.error("Upload error:", error);
    res
      .status(500)
      .json({ error: "Failed to process file", details: error.message });
  }
}
