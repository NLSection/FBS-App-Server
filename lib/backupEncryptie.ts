import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

/** Genereer een salt voor wachtwoord-hashing */
export function genereerSalt(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Hash het wachtwoord met PBKDF2 (voor opslag/verificatie) */
export function hashWachtwoord(wachtwoord: string, salt: string): string {
  return crypto.pbkdf2Sync(wachtwoord, salt, PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
}

/** Verifieer een wachtwoord tegen de opgeslagen hash */
export function verifieerWachtwoord(wachtwoord: string, salt: string, hash: string): boolean {
  return hashWachtwoord(wachtwoord, salt) === hash;
}

/** Genereer een herstelsleutel (24 tekens in groepjes van 4) */
export function genereerHerstelsleutel(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // geen I, O, 0, 1 (vermijd verwarring)
  const bytes = crypto.randomBytes(24);
  const delen: string[] = [];
  for (let i = 0; i < 24; i += 4) {
    let deel = '';
    for (let j = 0; j < 4; j++) deel += chars[bytes[i + j] % chars.length];
    delen.push(deel);
  }
  return delen.join('-');
}

/** Versleutel data met AES-256-GCM */
export function versleutel(data: Buffer, wachtwoord: string, salt: string): Buffer {
  const key = crypto.pbkdf2Sync(wachtwoord, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: [iv (16 bytes)][tag (16 bytes)][encrypted data]
  return Buffer.concat([iv, tag, encrypted]);
}

/** Ontsleutel data met AES-256-GCM */
export function ontsleutel(data: Buffer, wachtwoord: string, salt: string): Buffer {
  const key = crypto.pbkdf2Sync(wachtwoord, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
