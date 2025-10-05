/**
 * DISCONNECTED: Refresh token service
 * 
 * This service is no longer used since we switched to 7-day tokens for all devices.
 * It is kept for review and manual deletion later.
 */

import jwt from "jsonwebtoken";

export async function refreshToken(req, res) {
  // DISCONNECTED: This service is no longer active
  console.log('DISCONNECTED: refreshToken service is no longer used');
  return res.status(501).json({ message: "Token refresh service is no longer available" });
} 