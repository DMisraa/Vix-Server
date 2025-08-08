import jwt from "jsonwebtoken";
import * as XLSX from "xlsx";

export function excelContacts(req, res) {
  console.log('=== EXCEL CONTACTS REQUEST ===');
  console.log('Cookies:', req.cookies);
  
  const jwtToken = req.cookies?.jwtToken;
  
  if (!jwtToken) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    console.log('Verifying JWT for Excel contacts...');
    const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
    const email = decoded.email;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    const contacts = jsonData
      .map((row) => {
        const rawName = row["איש קשר:"];
        const rawPhone = row["טלפון:"];

        const name = typeof rawName === "string" ? rawName.trim() : String(rawName || "").trim();
        const phone = typeof rawPhone === "string" ? rawPhone.trim() : String(rawPhone || "").trim();

        if (!name && !phone) return null;

        const digitsOnly = phone.replace(/\D/g, ""); // Remove non-digits

        if (!digitsOnly) {
          return {
            displayName: name || "No name provided",
            canonicalForm: "No canonical number",
            phoneNumber: "No local number",
            uploadedByEmail: email,
            contactSource: "Excel",
          };
        }

        const isCanonical = digitsOnly.startsWith("972");

        const canonicalForm = isCanonical
          ? `+${digitsOnly}`
          : digitsOnly.startsWith("0")
          ? `+972${digitsOnly.slice(1)}`
          : `+972${digitsOnly}`; // fallback

        let phoneNumber = "No local number";

        if (!isCanonical) {
          if (
            digitsOnly.length === 9 &&
            (digitsOnly.startsWith("5") || digitsOnly.startsWith("7"))
          ) {
            const local = `0${digitsOnly}`;
            phoneNumber = `${local.slice(0, 3)}-${local.slice(3)}`;
          } else {
            phoneNumber = digitsOnly;
          }
        }

        return {
          displayName: name || "No name provided",
          canonicalForm: canonicalForm || "No canonical number",
          phoneNumber: phoneNumber || "No number provided",
          uploadedByEmail: email,
          contactSource: "Excel",
        };
      })
      .filter(Boolean);

    console.log('Excel contacts processed successfully');
    res.json({ contacts });
  } catch (error) {
    console.error("Error processing Excel:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} 