import jwt from "jsonwebtoken";
import { extractExcelData } from "../extractExcelContacts.js";

export async function excelContacts(req, res) {
  // Check for access token in cookies (Android/Desktop approach)
  let accessToken = req.cookies?.accessToken;
  
  // Check Authorization header for access token (iOS approach)
  if (!accessToken) {
    const authHeader = req.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);
    }
  }

  // Fallback: Check for old jwtToken cookie (for backward compatibility)
  if (!accessToken) {
    accessToken = req.cookies?.jwtToken;
  }

  if (!accessToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
    
    // Process the Excel file
    const result = await extractExcelData(req.file);
    res.json(result);
  } catch (error) {
    console.error('Excel contacts error:', error);
    res.status(401).json({ error: "Invalid token" });
  }
} 