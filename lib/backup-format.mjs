import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat, unlink } from 'node:fs/promises';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';

export const BACKUP_MAGIC = Buffer.from('KIRA_BACKUP_V1\n', 'utf8');
export const AUTH_TAG_BYTES = 16;

export function decodeBackupKey(value) {
  if (!value) throw new Error('BACKUP_ENCRYPTION_KEY lipsește.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== value.trim().replace(/=+$/, '')) {
    throw new Error('BACKUP_ENCRYPTION_KEY trebuie să fie o cheie base64 de exact 32 bytes.');
  }
  return key;
}

export function backupKeyId(key) {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  stream.on('data', chunk => hash.update(chunk));
  await once(stream, 'end');
  return hash.digest('hex');
}

export async function encryptBackupFile(inputPath, outputPath, key, metadata = {}) {
  const iv = randomBytes(12);
  const header = Buffer.from(JSON.stringify({
    version: 1,
    algorithm: 'aes-256-gcm',
    created_at: new Date().toISOString(),
    key_id: backupKeyId(key),
    iv: iv.toString('base64'),
    ...metadata,
  }), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);
  const output = createWriteStream(outputPath, { flags: 'wx', mode: 0o600 });
  let outputCreated = false;
  output.once('open', () => { outputCreated = true; });
  output.write(BACKUP_MAGIC);
  output.write(length);
  output.write(header);
  try {
    await pipeline(createReadStream(inputPath), cipher, output, { end: false });
    const finished = once(output, 'finish');
    output.end(cipher.getAuthTag());
    await finished;
    return JSON.parse(header.toString('utf8'));
  } catch (error) {
    if (outputCreated) await unlink(outputPath).catch(() => undefined);
    throw error;
  }
}

export async function readBackupHeader(path) {
  const handle = await open(path, 'r');
  try {
    const prefix = Buffer.alloc(BACKUP_MAGIC.length + 4);
    const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
    if (bytesRead !== prefix.length || !prefix.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
      throw new Error('Format de backup necunoscut.');
    }
    const headerLength = prefix.readUInt32BE(BACKUP_MAGIC.length);
    if (headerLength < 2 || headerLength > 32_768) throw new Error('Antet de backup invalid.');
    const headerBuffer = Buffer.alloc(headerLength);
    await handle.read(headerBuffer, 0, headerLength, prefix.length);
    const file = await stat(path);
    const ciphertextStart = prefix.length + headerLength;
    const ciphertextEnd = file.size - AUTH_TAG_BYTES - 1;
    if (ciphertextEnd < ciphertextStart) throw new Error('Backup criptat incomplet.');
    const authTag = Buffer.alloc(AUTH_TAG_BYTES);
    await handle.read(authTag, 0, AUTH_TAG_BYTES, file.size - AUTH_TAG_BYTES);
    return {
      header: JSON.parse(headerBuffer.toString('utf8')),
      headerBuffer,
      authTag,
      ciphertextStart,
      ciphertextEnd,
      size: file.size,
    };
  } finally {
    await handle.close();
  }
}

export async function decryptBackupFile(inputPath, outputPath, key) {
  const parsed = await readBackupHeader(inputPath);
  if (parsed.header.version !== 1 || parsed.header.algorithm !== 'aes-256-gcm') {
    throw new Error('Versiunea sau algoritmul backupului nu este acceptat.');
  }
  if (parsed.header.key_id !== backupKeyId(key)) throw new Error('Cheia de backup nu corespunde arhivei.');
  const iv = Buffer.from(parsed.header.iv || '', 'base64');
  if (iv.length !== 12) throw new Error('Vector de inițializare invalid.');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(parsed.headerBuffer);
  decipher.setAuthTag(parsed.authTag);
  const output = createWriteStream(outputPath, { flags: 'wx', mode: 0o600 });
  let outputCreated = false;
  output.once('open', () => { outputCreated = true; });
  try {
    await pipeline(
      createReadStream(inputPath, { start: parsed.ciphertextStart, end: parsed.ciphertextEnd }),
      decipher,
      output,
    );
    return parsed.header;
  } catch (error) {
    if (outputCreated) await unlink(outputPath).catch(() => undefined);
    throw error;
  }
}

export function parseBackupTimestamp(name) {
  const match = /^kira-backup-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.kira$/.exec(name);
  if (!match) return null;
  return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${match[7]}Z`);
}

function utcWeekKey(date) {
  const current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((current - yearStart) / 86_400_000) + 1) / 7);
  return `${current.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function selectBackupsForRetention(names, now = new Date()) {
  const candidates = names
    .map(name => ({ name, date: parseBackupTimestamp(name) }))
    .filter(item => item.date && item.date <= now)
    .sort((left, right) => right.date - left.date);
  const keep = new Set();
  const weekly = new Set();
  const monthly = new Set();

  for (const item of candidates) {
    const ageDays = (now - item.date) / 86_400_000;
    if (ageDays <= 14) {
      keep.add(item.name);
      continue;
    }
    if (ageDays <= 90) {
      const key = utcWeekKey(item.date);
      if (!weekly.has(key)) {
        weekly.add(key);
        keep.add(item.name);
      }
      continue;
    }
    if (ageDays <= 365) {
      const key = `${item.date.getUTCFullYear()}-${item.date.getUTCMonth() + 1}`;
      if (!monthly.has(key)) {
        monthly.add(key);
        keep.add(item.name);
      }
    }
  }

  if (candidates[0]) keep.add(candidates[0].name);
  return {
    keep: [...keep],
    remove: candidates.map(item => item.name).filter(name => !keep.has(name)),
  };
}
