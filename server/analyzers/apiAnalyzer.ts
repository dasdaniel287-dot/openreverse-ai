import crypto from 'node:crypto';
import { load as loadYaml } from 'js-yaml';
import { safeFetchPublicUrl } from '../middleware/ssrfGuard.ts';
import type { StaticFindingInput } from './websiteAnalyzer.ts';

export interface ApiEndpointSpec {
  method: string;
  path: string;
  summary: string;
  authRequired: boolean;
  parametersCount: number;
  responses: string[];
}

export interface ApiAnalysisOutput {
  mode: 'openapi' | 'live-probe';
  targetLabel: string;
  contentHash: string;
  specInfo?: {
    title: string;
    version: string;
    openApiVersion: string;
    servers: string[];
    securitySchemes: string[];
  };
  endpoints: ApiEndpointSpec[];
  probeResult?: {
    finalUrl: string;
    status: number;
    responseTimeMs: number;
    contentType: string;
    corsAllowOrigin: string;
    headers: Record<string, string>;
    bodyPreview: string;
    inferredJsonKeys: string[];
  };
  findings: StaticFindingInput[];
  riskScore: number;
  summary: string;
  limitations: string;
}

export function analyzeOpenApiSpec(rawSpec: string, label = 'OpenAPI Specification'): ApiAnalysisOutput {
  const contentHash = crypto.createHash('sha256').update(rawSpec).digest('hex');
  let parsed: Record<string, unknown>;
  try {
    const loaded = rawSpec.trim().startsWith('{') ? JSON.parse(rawSpec) : loadYaml(rawSpec);
    if (!loaded || typeof loaded !== 'object') {
      throw new Error('Parsed specification is not an object.');
    }
    parsed = loaded as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Invalid OpenAPI JSON/YAML: ${err instanceof Error ? err.message : String(err)}`);
  }

  const info = (parsed.info ?? {}) as Record<string, unknown>;
  const title = String(info.title ?? label);
  const version = String(info.version ?? '1.0.0');
  const openApiVersion = String(parsed.openapi ?? parsed.swagger ?? '3.0');

  const serversRaw = Array.isArray(parsed.servers) ? parsed.servers : [];
  const servers = serversRaw
    .map((s) => (s && typeof s === 'object' ? String((s as Record<string, unknown>).url ?? '') : ''))
    .filter(Boolean);

  const components = (parsed.components ?? {}) as Record<string, unknown>;
  const securitySchemesObj = (components.securitySchemes ?? parsed.securityDefinitions ?? {}) as Record<string, unknown>;
  const securitySchemes = Object.keys(securitySchemesObj);
  const globalSecurity = Array.isArray(parsed.security) && parsed.security.length > 0;

  const pathsObj = (parsed.paths ?? {}) as Record<string, Record<string, unknown>>;
  const endpoints: ApiEndpointSpec[] = [];
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

  for (const [endpointPath, pathItem] of Object.entries(pathsObj)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of httpMethods) {
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;
      const opObj = op as Record<string, unknown>;
      const opSecurity = Array.isArray(opObj.security) ? opObj.security.length > 0 : globalSecurity;
      const params = Array.isArray(opObj.parameters) ? opObj.parameters.length : 0;
      const responses = opObj.responses && typeof opObj.responses === 'object' ? Object.keys(opObj.responses) : [];

      endpoints.push({
        method: method.toUpperCase(),
        path: endpointPath,
        summary: String(opObj.summary ?? opObj.operationId ?? 'No summary'),
        authRequired: opSecurity,
        parametersCount: params,
        responses,
      });
    }
  }

  const findings: StaticFindingInput[] = [];
  for (const srv of servers) {
    if (srv.startsWith('http://') && !srv.includes('localhost')) {
      findings.push({
        title: `Insecure HTTP server URL in specification: ${srv}`,
        severity: 'high',
        category: 'API Transport Security',
        owaspRef: 'OWASP API8:2023 Security Misconfiguration',
        evidence: srv,
        remediation: 'Use HTTPS endpoints in production OpenAPI server definitions.',
      });
    }
  }

  const unauthenticatedMutations = endpoints.filter(
    (e) => !e.authRequired && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(e.method)
  );
  if (unauthenticatedMutations.length > 0) {
    findings.push({
      title: `${unauthenticatedMutations.length} mutating endpoint(s) lack explicit security declaration`,
      severity: 'medium',
      category: 'API Authentication',
      owaspRef: 'OWASP API2:2023 Broken Authentication',
      evidence: unauthenticatedMutations
        .slice(0, 5)
        .map((e) => `${e.method} ${e.path}`)
        .join(', '),
      remediation: 'Declare global or per-operation securitySchemes (Bearer JWT, OAuth2, or API Key) on mutating endpoints.',
    });
  }

  const severityWeights = { critical: 25, high: 16, medium: 9, low: 4, info: 1 };
  const riskScore = Math.min(100, findings.reduce((s, f) => s + severityWeights[f.severity], 0));

  return {
    mode: 'openapi',
    targetLabel: `${title} v${version}`,
    contentHash,
    specInfo: { title, version, openApiVersion, servers, securitySchemes },
    endpoints: endpoints.slice(0, 120),
    findings,
    riskScore,
    summary: `Parsed OpenAPI ${openApiVersion} spec "${title}" (${version}): ${endpoints.length} endpoints across ${Object.keys(pathsObj).length} paths, ${securitySchemes.length} security scheme(s), and ${findings.length} configuration findings.`,
    limitations: 'Static OpenAPI contract inspection; live server authorization enforcement should be verified against authorized staging environments.',
  };
}

export async function inspectAuthorizedRestEndpoint(params: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<ApiAnalysisOutput> {
  const method = (params.method ?? 'GET').toUpperCase();
  const allowedMethods = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH']);
  if (!allowedMethods.has(method)) {
    throw new Error(`Unsupported HTTP method for authorized API inspection: ${method}`);
  }

  const res = await safeFetchPublicUrl(params.url, {
    method,
    headers: params.headers,
    body: params.body,
    maxBytes: 1024 * 1024,
  });

  const contentHash = crypto.createHash('sha256').update(res.bodyText).digest('hex');
  const contentType = res.headers['content-type'] ?? 'unknown';
  const corsAllowOrigin = res.headers['access-control-allow-origin'] ?? 'Not set';

  let inferredJsonKeys: string[] = [];
  if (contentType.includes('json') || res.bodyText.trim().startsWith('{') || res.bodyText.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(res.bodyText) as unknown;
      if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object') {
        inferredJsonKeys = Object.keys(parsed[0] as Record<string, unknown>);
      } else if (parsed && typeof parsed === 'object') {
        inferredJsonKeys = Object.keys(parsed as Record<string, unknown>);
      }
    } catch {
      // ignore non-json
    }
  }

  const findings: StaticFindingInput[] = [];
  if (!res.finalUrl.startsWith('https://')) {
    findings.push({
      title: 'API endpoint accessed over unencrypted HTTP',
      severity: 'high',
      category: 'Transport Security',
      owaspRef: 'OWASP API8:2023',
      evidence: res.finalUrl,
      remediation: 'Enforce HTTPS on all API endpoints.',
    });
  }
  if (corsAllowOrigin === '*') {
    findings.push({
      title: 'Wildcard CORS Access-Control-Allow-Origin: * detected',
      severity: 'low',
      category: 'CORS Policy',
      owaspRef: 'OWASP API8:2023',
      evidence: 'access-control-allow-origin: *',
      remediation: 'Restrict CORS allowed origins to trusted application domains for authenticated APIs.',
    });
  }
  if (!res.headers['x-content-type-options']) {
    findings.push({
      title: 'Missing X-Content-Type-Options: nosniff on API response',
      severity: 'low',
      category: 'Response Hardening',
      owaspRef: 'OWASP API8:2023',
      evidence: `HTTP ${res.status} missing x-content-type-options`,
      remediation: 'Return X-Content-Type-Options: nosniff on JSON/API responses.',
    });
  }

  const severityWeights = { critical: 25, high: 16, medium: 9, low: 4, info: 1 };
  const riskScore = Math.min(100, findings.reduce((s, f) => s + severityWeights[f.severity], 0));

  return {
    mode: 'live-probe',
    targetLabel: `${method} ${res.finalUrl}`,
    contentHash,
    endpoints: [
      {
        method,
        path: new URL(res.finalUrl).pathname,
        summary: `Authorized probe (${res.status} ${res.statusText})`,
        authRequired: Boolean(params.headers?.Authorization || params.headers?.authorization || res.status === 401 || res.status === 403),
        parametersCount: Array.from(new URL(res.finalUrl).searchParams.keys()).length,
        responses: [String(res.status)],
      },
    ],
    probeResult: {
      finalUrl: res.finalUrl,
      status: res.status,
      responseTimeMs: res.responseTimeMs,
      contentType,
      corsAllowOrigin,
      headers: res.headers,
      bodyPreview: res.bodyText.slice(0, 6000),
      inferredJsonKeys: inferredJsonKeys.slice(0, 40),
    },
    findings,
    riskScore,
    summary: `Authorized API inspection of ${method} ${res.finalUrl} returned HTTP ${res.status} in ${res.responseTimeMs}ms (${contentType}).`,
    limitations: 'Single-endpoint SSRF-protected inspection; does not perform automated fuzzing or brute-force scanning.',
  };
}
