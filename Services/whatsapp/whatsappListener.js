// Simplified WhatsApp listener for development
// This is a mock implementation until we resolve the whatsapp-web.js issues

import pool from '../../db/db.js';

// Configuration
const TOKEN_PREFIX = 'VIX_';
const TOKEN_EXPIRY_DAYS = 30; // 30 days expiry

// Store active tokens and their associated users
const activeTokens = new Map();

/**
 * Parse token and extract user information
 * Token format: VIX_[userHash]_[timestamp]_[randomStr]
 */
function parseToken(token) {
    try {
        if (!token.startsWith(TOKEN_PREFIX)) {
            return null;
        }

        const parts = token.split('_');
        if (parts.length !== 4) {
            return null;
        }

        const [, userHash, timestampBase36, randomStr] = parts;
        
        // Convert base36 timestamp back to milliseconds
        const timestamp = parseInt(timestampBase36, 36);
        const tokenAge = Date.now() - timestamp;
        const maxAge = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // 30 days in milliseconds

        if (tokenAge > maxAge) {
            console.log(`Token expired: ${tokenAge}ms old (max: ${maxAge}ms)`);
            return null;
        }

        return {
            userHash,
            timestamp,
            randomStr,
            tokenAge,
            isValid: true
        };
    } catch (error) {
        console.error('Error parsing token:', error);
        return null;
    }
}

/**
 * Find user by user hash
 */
async function findUserByHash(userHash) {
    try {
        const query = `
            SELECT id, email, name 
            FROM users 
            WHERE encode(email::bytea, 'base64') LIKE $1
        `;
        const result = await pool.query(query, [`%${userHash}%`]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error finding user by hash:', error);
        return null;
    }
}

/**
 * Process contact data from WhatsApp message
 */
function parseContactData(messageText) {
    const contacts = [];
    const lines = messageText.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
        // Skip if it's the token line
        if (line.includes('VIX_')) continue;
        
        // Try to parse contact information
        // Expected format: Name, Phone, Email (optional)
        const parts = line.split(',').map(part => part.trim());
        
        if (parts.length >= 2) {
            const contact = {
                name: parts[0],
                phone: parts[1].replace(/[^\d+]/g, ''), // Keep only digits and +
                email: parts[2] || null
            };
            
            // Validate phone number
            if (contact.phone && contact.phone.length >= 8) {
                contacts.push(contact);
            }
        }
    }
    
    return contacts;
}

/**
 * Save contacts to database
 */
async function saveContactsToDatabase(userId, contacts) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const insertQuery = `
            INSERT INTO contacts (name, phone, email, owner_id, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (phone, owner_id) DO UPDATE SET
                name = EXCLUDED.name,
                email = EXCLUDED.email,
                updated_at = NOW()
        `;
        
        for (const contact of contacts) {
            await client.query(insertQuery, [
                contact.name,
                contact.phone,
                contact.email,
                userId
            ]);
        }
        
        await client.query('COMMIT');
        console.log(`Saved ${contacts.length} contacts for user ${userId}`);
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saving contacts:', error);
        return false;
    } finally {
        client.release();
    }
}

/**
 * Initialize WhatsApp client (mock implementation)
 */
function initializeWhatsApp() {
    console.log('WhatsApp listener initialized (mock mode)');
    console.log('For development, you can test token validation and contact processing');
    console.log('Real WhatsApp integration will be implemented later');
}

/**
 * Get WhatsApp connection status
 */
function getWhatsAppStatus() {
    return {
        isReady: true,
        isConnected: true,
        mode: 'mock',
        developmentNumber: '972544349661@c.us',
        activeTokensCount: activeTokens.size
    };
}

/**
 * Get information about active tokens
 */
function getActiveTokensInfo() {
    const tokens = [];
    for (const [token, info] of activeTokens.entries()) {
        tokens.push({
            token: token.substring(0, 20) + '...',
            userEmail: info.userEmail,
            userName: info.userName,
            createdAt: info.createdAt,
            expiresAt: info.expiresAt,
            isExpired: new Date() > info.expiresAt
        });
    }
    return tokens;
}

/**
 * Clean up expired tokens
 */
function cleanupActiveTokens() {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [token, info] of activeTokens.entries()) {
        if (now > info.expiresAt) {
            activeTokens.delete(token);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired tokens`);
    }
    
    return cleanedCount;
}

/**
 * Process a WhatsApp message (for testing)
 */
async function processWhatsAppMessage(messageText, senderNumber) {
    try {
        console.log('Processing WhatsApp message:', messageText);
        
        // Check if message contains a token
        const tokenMatch = messageText.match(/VIX_[A-Z0-9_]+/);
        
        if (tokenMatch) {
            const token = tokenMatch[0];
            console.log('Token found:', token);
            
            // Parse and validate token
            const tokenData = parseToken(token);
            
            if (!tokenData || !tokenData.isValid) {
                console.log('Invalid or expired token');
                return { success: false, message: 'Token invalid or expired' };
            }
            
            // Find user by hash
            const user = await findUserByHash(tokenData.userHash);
            
            if (!user) {
                console.log('User not found for hash:', tokenData.userHash);
                return { success: false, message: 'User not found' };
            }
            
            // Store token for this user
            activeTokens.set(token, {
                userId: user.id,
                userEmail: user.email,
                userName: user.name,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + (TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000))
            });
            
            console.log(`Token validated for user: ${user.email}`);
            return { 
                success: true, 
                message: `Token validated for user: ${user.name}`,
                user: user
            };
            
        } else {
            // Check if user has an active token
            let activeUser = null;
            let activeToken = null;
            
            for (const [token, tokenInfo] of activeTokens.entries()) {
                if (tokenInfo.userId) {
                    activeUser = tokenInfo;
                    activeToken = token;
                    break;
                }
            }
            
            if (!activeUser) {
                return { success: false, message: 'No active token found' };
            }
            
            // Parse contact data from message
            const contacts = parseContactData(messageText);
            
            if (contacts.length === 0) {
                return { success: false, message: 'No valid contacts found in message' };
            }
            
            // Save contacts to database
            const success = await saveContactsToDatabase(activeUser.userId, contacts);
            
            if (success) {
                // Remove the token after successful contact save
                activeTokens.delete(activeToken);
                return { 
                    success: true, 
                    message: `Saved ${contacts.length} contacts successfully`,
                    contacts: contacts
                };
            } else {
                return { success: false, message: 'Failed to save contacts' };
            }
        }
        
    } catch (error) {
        console.error('Error processing WhatsApp message:', error);
        return { success: false, message: 'Error processing message' };
    }
}

export {
    initializeWhatsApp,
    getWhatsAppStatus,
    getActiveTokensInfo,
    cleanupActiveTokens,
    processWhatsAppMessage
}; 