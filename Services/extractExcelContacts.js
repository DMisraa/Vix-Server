import xlsx from "xlsx";

// Column name mappings for detection
const NAME_COLUMNS = [
  "name",
  "full name",
  "contact",
  "שם",
  "איש קשר",
  "שם מלא",
  "contact name",
  "full_name",
  "contact_name"
].map(col => col.toLowerCase());

const PHONE_COLUMNS = [
  "phone",
  "phone number",
  "number",
  "mobile",
  "cell",
  "telephone",
  "מספר",
  "מספר טלפון",
  "טלפון",
  "נייד",
  "phone_number",
  "mobile_number",
  "cell_number"
].map(col => col.toLowerCase());

function normalizeColumnName(columnName) {
  if (!columnName) return '';
  return columnName
    .toString()
    .toLowerCase()
    .replace(/[:\u0591-\u05C7]/g, '') // Remove colons and Hebrew diacritics
    .trim();
}

function findColumnIndex(headers, columnName) {
  return headers.findIndex(h => h === columnName);
}

function detectColumns(headers, selectedColumns = null) {
  const lowerHeaders = headers.map(h => normalizeColumnName(h));
  
  let nameColumn, phoneColumn;

  if (selectedColumns) {
    // Use manually selected columns
    const nameIndex = findColumnIndex(headers, selectedColumns.name);
    const phoneIndex = findColumnIndex(headers, selectedColumns.phone);
    
    nameColumn = nameIndex !== -1 ? xlsx.utils.encode_col(nameIndex) : null;
    phoneColumn = phoneIndex !== -1 ? xlsx.utils.encode_col(phoneIndex) : null;
  } else {
    // Use automatic detection
    const hasNameColumn = NAME_COLUMNS.includes(lowerHeaders[0]);
    const hasPhoneColumn = PHONE_COLUMNS.includes(lowerHeaders[1]);
    
    nameColumn = hasNameColumn ? 'A' : null;
    phoneColumn = hasPhoneColumn ? 'B' : null;
  }

  return {
    nameColumn,
    phoneColumn,
    columnInfo: {
      detectedColumns: {
        name: selectedColumns?.name || headers[0] || null,
        phone: selectedColumns?.phone || headers[1] || null
      },
      undetectedColumns: selectedColumns ? [] : headers.filter((col, idx) => {
        const lowerCol = lowerHeaders[idx];
        return (idx === 0 && !NAME_COLUMNS.includes(lowerCol)) || 
               (idx === 1 && !PHONE_COLUMNS.includes(lowerCol));
      }),
      allColumns: headers
    }
  };
}

function normalizePhoneNumbers(rawPhone) {
  if (!rawPhone) return { canonicalNumbers: [], regularNumbers: [] };
  
  const numbers = String(rawPhone)
    .split(/[,;\n]/)
    .map(num => num.replace(/[-\s()]/g, "").trim())
    .filter(Boolean);
  
  const seen = new Set();
  const canonicalNumbers = [];
  const regularNumbers = [];
  
  for (let raw of numbers) {
    if (seen.has(raw)) continue;
    seen.add(raw);
    
    if (raw.startsWith("+")) {
      canonicalNumbers.push(raw);
    } else {
      regularNumbers.push(raw);
    }
  }
  
  return { canonicalNumbers, regularNumbers };
}

export async function extractExcelData(req, res) {
  if (!req.file) {
    return res.status(400).json({ 
      success: false,
      error: "No file uploaded",
      data: null
    });
  }

  try {
    // Use buffer instead of path since we're using memoryStorage
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawContacts = xlsx.utils.sheet_to_json(sheet, { header: "A" });
    
    // Get headers from first row
    const headers = Object.values(rawContacts[0]);
    const selectedColumns = req.body.selectedColumns ? JSON.parse(req.body.selectedColumns) : null;
    const { nameColumn, phoneColumn, columnInfo } = detectColumns(headers, selectedColumns);
    
    if (!nameColumn || !phoneColumn) {
      return res.status(200).json({
        success: false,
        error: "Could not detect required columns",
        data: {
          contacts: [],
          columnInfo
        }
      });
    }
    
    const email = req.body.email;
    const contacts = [];
    
    // Skip header row
    for (let i = 1; i < rawContacts.length; i++) {
      const row = rawContacts[i];
      const displayName = row[nameColumn] || "Unknown";
      const rawPhone = row[phoneColumn] || "";
      
      const { canonicalNumbers, regularNumbers } = normalizePhoneNumbers(rawPhone);
      
      contacts.push({
        displayName,
        canonicalForm: canonicalNumbers.join(", ") || "No canonical number",
        phoneNumber: regularNumbers.join(", ") || "No local number",
        uploadedByEmail: email,
        contactSource: "EXCEL"
      });
    }

    return res.status(200).json({
      success: true,
      error: null,
      data: {
        contacts,
        columnInfo,
        stats: {
          totalContacts: contacts.length,
          processedRows: rawContacts.length - 1 // Excluding header row
        }
      }
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to process file",
      data: null,
      details: error.message
    });
  }
}
