import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
]);

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  const ranges: Array<[number, number]> = [
    [ipv4ToInt('0.0.0.0'), ipv4ToInt('0.255.255.255')],       // Current network
    [ipv4ToInt('10.0.0.0'), ipv4ToInt('10.255.255.255')],     // RFC1918
    [ipv4ToInt('100.64.0.0'), ipv4ToInt('100.127.255.255')],  // CGNAT
    [ipv4ToInt('127.0.0.0'), ipv4ToInt('127.255.255.255')],   // Loopback
    [ipv4ToInt('169.254.0.0'), ipv4ToInt('169.254.255.255')], // Link-local / Cloud metadata
    [ipv4ToInt('172.16.0.0'), ipv4ToInt('172.31.255.255')],   // RFC1918
    [ipv4ToInt('192.0.0.0'), ipv4ToInt('192.0.0.255')],       // IETF protocol
    [ipv4ToInt('192.0.2.0'), ipv4ToInt('192.0.2.255')],       // TEST-NET-1
    [ipv4ToInt('192.168.0.0'), ipv4ToInt('192.168.255.255')], // RFC1918
    [ipv4ToInt('198.18.0.0'), ipv4ToInt('198.19.255.255')],   // Benchmarking
    [ipv4ToInt('198.51.100.0'), ipv4ToInt('198.51.100.255')], // TEST-NET-2
    [ipv4ToInt('203.0.113.0'), ipv4ToInt('203.0.113.255')],   // TEST-NET-3
    [ipv4ToInt('224.0.0.0'), ipv4ToInt('255.255.255.255')],   // Multicast & Reserved
  ];
  return ranges.some(([start, end]) => n >= start && n <= end);
}

export function isBlockedIpAddress(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  const ver = net.isIP(normalized);
  if (ver === 4) {
    return isBlockedIPv4(normalized);
  }
  if (ver === 6) {
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('::ffff:')) {
      const v4 = normalized.slice(7);
      if (net.isIP(v4) === 4) return isBlockedIPv4(v4);
    }
    if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) {
      return true;
    }
    if (normalized.startsWith('ff')) return true;
    return false;
  }
  return true;
}

export async function validatePublicTargetUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid URL format.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS protocols are permitted.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Embedded credentials in target URLs are forbidden.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Target hostname is blocked by SSRF policy.');
  }

  if (net.isIP(hostname) !== 0) {
    if (isBlockedIpAddress(hostname)) {
      throw new Error('Direct private, loopback, or reserved IP addresses are blocked.');
    }
    return parsed;
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`DNS resolution failed for host: ${hostname}`);
  }

  if (!resolved || resolved.length === 0) {
    throw new Error(`No DNS records found for host: ${hostname}`);
  }

  for (const record of resolved) {
    if (isBlockedIpAddress(record.address)) {
      throw new Error(`Resolved address (${record.address}) is blocked by private-network SSRF protection.`);
    }
  }

  return parsed;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyText: string;
  redirectChain: string[];
  responseTimeMs: number;
}

export async function safeFetchPublicUrl(
  rawUrl: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    maxBytes?: number;
    maxRedirects?: number;
    timeoutMs?: number;
  } = {}
): Promise<SafeFetchResult> {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 5;
  const timeoutMs = options.timeoutMs ?? 12000;
  const method = (options.method ?? 'GET').toUpperCase();

  let currentUrl = (await validatePublicTargetUrl(rawUrl)).toString();
  const redirectChain: string[] = [];
  const start = Date.now();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method,
        headers: {
          'User-Agent': 'OpenReverseAI-Inspector/1.0 (+defensive-static-analyzer)',
          ...(options.headers ?? {}),
        },
        body: method !== 'GET' && method !== 'HEAD' ? options.body : undefined,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new Error(`Redirect (${res.status}) missing Location header.`);
      }
      if (hop === maxRedirects) {
        throw new Error('Exceeded maximum allowed redirect hops.');
      }
      const nextUrlObj = new URL(location, currentUrl);
      const validatedNext = await validatePublicTargetUrl(nextUrlObj.toString());
      redirectChain.push(currentUrl);
      currentUrl = validatedNext.toString();
      continue;
    }

    const headersRecord: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headersRecord[key.toLowerCase()] = value;
    });

    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            chunks.push(value.subarray(0, Math.max(0, maxBytes - (totalBytes - value.byteLength))));
            break;
          }
          chunks.push(value);
        }
      }
    }

    const combined = Buffer.concat(chunks);
    const bodyText = combined.toString('utf8');

    return {
      finalUrl: currentUrl,
      status: res.status,
      statusText: res.statusText,
      headers: headersRecord,
      bodyText,
      redirectChain,
      responseTimeMs: Date.now() - start,
    };
  }

  throw new Error('Unexpected redirect loop termination.');
}
