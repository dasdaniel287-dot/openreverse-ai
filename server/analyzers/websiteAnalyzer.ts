import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { safeFetchPublicUrl } from '../middleware/ssrfGuard.ts';

export interface StaticFindingInput {
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  owaspRef: string;
  evidence: string;
  remediation: string;
}

export interface WebsiteAnalysisOutput {
  url: string;
  finalUrl: string;
  status: number;
  responseTimeMs: number;
  contentHash: string;
  redirectChain: string[];
  metadata: {
    title: string;
    description: string;
    canonical: string;
    lang: string;
    viewport: string;
    generator: string;
    ogTitle: string;
    ogDescription: string;
  };
  structure: {
    domElements: number;
    headings: { h1: number; h2: number; h3: number };
    linksTotal: number;
    externalLinks: number;
    formsCount: number;
    imagesTotal: number;
    imagesMissingAlt: number;
  };
  resources: {
    stylesheets: string[];
    scripts: string[];
    inlineScriptsCount: number;
    inlineStylesCount: number;
  };
  technologies: string[];
  headers: Record<string, string>;
  securityHeaders: Array<{
    header: string;
    present: boolean;
    value: string;
    recommendation: string;
  }>;
  seoObservations: string[];
  performanceObservations: string[];
  findings: StaticFindingInput[];
  summary: string;
  riskScore: number;
  limitations: string;
}

function detectTechnologies(html: string, headers: Record<string, string>, scripts: string[], stylesheets: string[]): string[] {
  const detected = new Set<string>();
  const lowerHtml = html.toLowerCase();
  const joinedAssets = [...scripts, ...stylesheets].join(' ').toLowerCase();

  if (headers['server']) detected.add(`Server: ${headers['server']}`);
  if (headers['x-powered-by']) detected.add(`Powered-By: ${headers['x-powered-by']}`);
  if (headers['cf-ray'] || headers['server']?.toLowerCase().includes('cloudflare')) detected.add('Cloudflare CDN/WAF');
  if (headers['x-vercel-id']) detected.add('Vercel Edge');
  if (headers['x-amz-cf-id']) detected.add('Amazon CloudFront');

  if (lowerHtml.includes('__next_data__') || joinedAssets.includes('/_next/')) detected.add('Next.js');
  if (lowerHtml.includes('data-reactroot') || lowerHtml.includes('__react') || joinedAssets.includes('react')) detected.add('React');
  if (lowerHtml.includes('__nuxt') || joinedAssets.includes('/_nuxt/')) detected.add('Nuxt.js');
  if (lowerHtml.includes('data-v-') || joinedAssets.includes('vue')) detected.add('Vue.js');
  if (lowerHtml.includes('ng-version') || joinedAssets.includes('angular')) detected.add('Angular');
  if (lowerHtml.includes('svelte') || joinedAssets.includes('svelte')) detected.add('Svelte');
  if (lowerHtml.includes('wp-content') || lowerHtml.includes('wp-includes')) detected.add('WordPress');
  if (joinedAssets.includes('tailwind') || lowerHtml.includes('tailwindcss')) detected.add('Tailwind CSS');
  if (joinedAssets.includes('bootstrap')) detected.add('Bootstrap');
  if (joinedAssets.includes('jquery')) detected.add('jQuery');
  if (lowerHtml.includes('/@vite/client') || joinedAssets.includes('vite')) detected.add('Vite');
  if (lowerHtml.includes('gtag(') || joinedAssets.includes('googletagmanager')) detected.add('Google Analytics / GTM');

  return Array.from(detected);
}

export async function analyzeWebsite(targetUrl: string): Promise<WebsiteAnalysisOutput> {
  const fetched = await safeFetchPublicUrl(targetUrl, { method: 'GET', maxBytes: 2 * 1024 * 1024 });
  const $ = cheerio.load(fetched.bodyText);
  const contentHash = crypto.createHash('sha256').update(fetched.bodyText).digest('hex');

  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() ?? '';
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() ?? '';
  const lang = $('html').attr('lang')?.trim() ?? '';
  const viewport = $('meta[name="viewport"]').attr('content')?.trim() ?? '';
  const generator = $('meta[name="generator"]').attr('content')?.trim() ?? '';
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() ?? '';
  const ogDescription = $('meta[property="og:description"]').attr('content')?.trim() ?? '';

  const stylesheets: string[] = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) stylesheets.push(href.slice(0, 300));
  });

  const scripts: string[] = [];
  let inlineScriptsCount = 0;
  $('script').each((_, el) => {
    const src = $(el).attr('src');
    if (src) scripts.push(src.slice(0, 300));
    else if ($(el).html()?.trim()) inlineScriptsCount++;
  });

  const inlineStylesCount = $('style').length;
  const domElements = $('*').length;
  const h1 = $('h1').length;
  const h2 = $('h2').length;
  const h3 = $('h3').length;

  let linksTotal = 0;
  let externalLinks = 0;
  const originHost = new URL(fetched.finalUrl).hostname;
  $('a[href]').each((_, el) => {
    linksTotal++;
    const href = $(el).attr('href') ?? '';
    if (href.startsWith('http://') || href.startsWith('https://')) {
      try {
        if (new URL(href).hostname !== originHost) externalLinks++;
      } catch {
        // ignore invalid href
      }
    }
  });

  const formsCount = $('form').length;
  let imagesTotal = 0;
  let imagesMissingAlt = 0;
  $('img').each((_, el) => {
    imagesTotal++;
    if (!$(el).attr('alt')?.trim()) imagesMissingAlt++;
  });

  const technologies = detectTechnologies(fetched.bodyText, fetched.headers, scripts, stylesheets);
  if (generator && !technologies.some((t) => t.includes(generator))) {
    technologies.push(`Generator: ${generator}`);
  }

  const securityHeaderSpecs = [
    {
      header: 'content-security-policy',
      recommendation: 'Define a strict Content-Security-Policy to mitigate XSS and unauthorized script execution.',
    },
    {
      header: 'strict-transport-security',
      recommendation: 'Enable HSTS (max-age >= 31536000; includeSubDomains) on HTTPS responses.',
    },
    {
      header: 'x-content-type-options',
      recommendation: 'Set X-Content-Type-Options: nosniff to prevent MIME-type sniffing.',
    },
    {
      header: 'x-frame-options',
      recommendation: 'Set X-Frame-Options: DENY or SAMEORIGIN (or CSP frame-ancestors) to prevent clickjacking.',
    },
    {
      header: 'referrer-policy',
      recommendation: 'Set Referrer-Policy: strict-origin-when-cross-origin to prevent URL leakage.',
    },
    {
      header: 'permissions-policy',
      recommendation: 'Configure Permissions-Policy to restrict unnecessary browser APIs (camera, geolocation, mic).',
    },
  ];

  const securityHeaders = securityHeaderSpecs.map((spec) => ({
    header: spec.header,
    present: Boolean(fetched.headers[spec.header]),
    value: fetched.headers[spec.header] ?? 'Missing',
    recommendation: spec.recommendation,
  }));

  const findings: StaticFindingInput[] = [];

  if (!fetched.finalUrl.startsWith('https://')) {
    findings.push({
      title: 'Target served over unencrypted HTTP',
      severity: 'high',
      category: 'Transport Security',
      owaspRef: 'OWASP A02:2021 Cryptographic Failures',
      evidence: `Final URL resolved to ${fetched.finalUrl}`,
      remediation: 'Enforce HTTPS with TLS 1.2+ and redirect all HTTP traffic to HTTPS.',
    });
  }

  for (const sh of securityHeaders) {
    if (!sh.present) {
      findings.push({
        title: `Missing security header: ${sh.header}`,
        severity: sh.header === 'content-security-policy' || sh.header === 'strict-transport-security' ? 'medium' : 'low',
        category: 'HTTP Security Headers',
        owaspRef: 'OWASP A05:2021 Security Misconfiguration',
        evidence: `Header "${sh.header}" was absent in HTTP ${fetched.status} response.`,
        remediation: sh.recommendation,
      });
    }
  }

  if (fetched.headers['x-powered-by']) {
    findings.push({
      title: 'Technology stack disclosed via X-Powered-By header',
      severity: 'low',
      category: 'Information Exposure',
      owaspRef: 'OWASP A05:2021 Security Misconfiguration',
      evidence: `X-Powered-By: ${fetched.headers['x-powered-by']}`,
      remediation: 'Remove or suppress X-Powered-By in production web server/framework configuration.',
    });
  }

  $('script[src^="http://"], link[href^="http://"]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('href') || '';
    if (fetched.finalUrl.startsWith('https://') && src.startsWith('http://')) {
      findings.push({
        title: 'Mixed content reference over insecure HTTP',
        severity: 'medium',
        category: 'Transport Security',
        owaspRef: 'OWASP A02:2021 Cryptographic Failures',
        evidence: `Resource referenced via HTTP on HTTPS page: ${src.slice(0, 180)}`,
        remediation: 'Load all scripts and stylesheets exclusively over HTTPS.',
      });
    }
  });

  const seoObservations: string[] = [];
  if (!title) seoObservations.push('Missing <title> tag.');
  else if (title.length > 65) seoObservations.push(`Title length (${title.length} chars) exceeds optimal 60-65 char search snippet window.`);
  if (!description) seoObservations.push('Missing <meta name="description"> tag.');
  if (!canonical) seoObservations.push('No canonical URL link tag detected.');
  if (h1 === 0) seoObservations.push('No <h1> heading detected on page.');
  if (h1 > 1) seoObservations.push(`Multiple <h1> headings (${h1}) detected; consider a single primary <h1>.`);
  if (imagesMissingAlt > 0) seoObservations.push(`${imagesMissingAlt} of ${imagesTotal} images are missing alt attributes.`);
  if (!lang) seoObservations.push('Missing lang attribute on <html> root element.');
  if (seoObservations.length === 0) seoObservations.push('Core HTML SEO metadata and heading structure look well-formed.');

  const performanceObservations: string[] = [];
  const bodyKb = Math.round(Buffer.byteLength(fetched.bodyText, 'utf8') / 1024);
  if (bodyKb > 250) performanceObservations.push(`Large HTML payload (${bodyKb} KB); consider trimming inline markup.`);
  if (domElements > 1500) performanceObservations.push(`High DOM complexity (${domElements} elements); may slow initial layout.`);
  if (scripts.length > 15) performanceObservations.push(`${scripts.length} external script tags detected; bundling or deferring scripts can improve TTI.`);
  if (fetched.responseTimeMs > 1200) performanceObservations.push(`Slow initial TTFB/response (${fetched.responseTimeMs} ms).`);
  if (!fetched.headers['content-encoding']) performanceObservations.push('No Content-Encoding compression header observed.');
  if (performanceObservations.length === 0) performanceObservations.push(`Responsive HTML fetch (${fetched.responseTimeMs} ms, ${bodyKb} KB, ${domElements} DOM nodes).`);

  const severityWeights = { critical: 25, high: 16, medium: 9, low: 4, info: 1 };
  const riskScore = Math.min(
    100,
    findings.reduce((sum, f) => sum + severityWeights[f.severity], 0)
  );

  return {
    url: targetUrl,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    responseTimeMs: fetched.responseTimeMs,
    contentHash,
    redirectChain: fetched.redirectChain,
    metadata: { title, description, canonical, lang, viewport, generator, ogTitle, ogDescription },
    structure: { domElements, headings: { h1, h2, h3 }, linksTotal, externalLinks, formsCount, imagesTotal, imagesMissingAlt },
    resources: { stylesheets: stylesheets.slice(0, 40), scripts: scripts.slice(0, 40), inlineScriptsCount, inlineStylesCount },
    technologies,
    headers: fetched.headers,
    securityHeaders,
    seoObservations,
    performanceObservations,
    findings,
    riskScore,
    summary: `Inspected ${fetched.finalUrl} (HTTP ${fetched.status}, ${fetched.responseTimeMs}ms). Detected ${technologies.length} technologies, ${scripts.length} external scripts, ${stylesheets.length} stylesheets, and ${findings.length} defensive observations.`,
    limitations: 'Static HTTP GET inspection only. Client-side rendered DOM changes after JavaScript execution and authenticated routes behind login walls are not executed in a headless browser.',
  };
}
