/**
 * Normalises a client address into the identity used for login throttling.
 * - IPv4-mapped IPv6 (::ffff:1.2.3.4) is treated as the IPv4 address.
 * - IPv6 clients are grouped by their /64 prefix: a single host or subscriber normally controls a whole /64, so keying
 *   on the full address would let it rotate source addresses to get a fresh attempt budget each time.
 */
export function clientKey(ip: string): string {
  const addr = ip.split('%')[0]?.toLowerCase() ?? ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
  if (mapped?.[1]) return mapped[1];
  if (!addr.includes(':')) return addr; // IPv4 (or "unknown")
  return `${ipv6Prefix64(addr)}::/64`;
}

function ipv6Prefix64(addr: string): string {
  const [head = '', tail = ''] = addr.split('::');
  const h = head === '' ? [] : head.split(':');
  const t = tail === '' ? [] : tail.split(':');
  const fill = addr.includes('::') ? Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0') : [];
  const groups = [...h, ...fill, ...t].slice(0, 4);
  return groups.map((g) => (Number.parseInt(g || '0', 16) || 0).toString(16)).join(':');
}
