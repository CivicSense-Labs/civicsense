import crypto from 'crypto';

/**
 * Hash a phone number using SHA256
 * Normalizes the phone number to E.164 format before hashing
 */
export function hashPhone(phoneNumber: string): string {
  // Normalize to E.164 format (basic implementation)
  let normalized = phoneNumber.replace(/\D/g, ''); // Remove non-digits

  // Add +1 for US numbers if not present
  if (normalized.length === 10) {
    normalized = '1' + normalized;
  }

  // Add + prefix
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }

  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generate a secure random string for encryption keys
 */
export function generateSecureKey(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Encrypt sensitive data using AES-256-GCM
 */
export function encrypt(text: string, key: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher('aes-256-gcm', key);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt sensitive data using AES-256-GCM
 */
export function decrypt(encryptedText: string, key: string): string {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipher('aes-256-gcm', key);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}