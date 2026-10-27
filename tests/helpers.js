export class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

export function deterministicCrypto() {
  let serial = 0;
  return {
    getRandomValues(bytes) { for (let i = 0; i < bytes.length; i++) bytes[i] = (i + serial) % 256; serial++; return bytes; },
    randomUUID() { serial++; return `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`; },
  };
}
