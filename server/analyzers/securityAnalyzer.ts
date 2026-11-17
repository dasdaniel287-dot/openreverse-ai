import crypto from 'node:crypto';
import type { StaticFindingInput } from './websiteAnalyzer.ts';

export interface DependencyCheckItem {
  name: string;
  version: string;
  ecosystem: string;
  advisoryNote: string;
  risk: 'high' | 'medium' | 'low' | 'ok';
}

export interface SecurityAuditOutput {
  targetLabel: string;
  contentHash: string;
  dependencies: DependencyCheckItem[];
  findings: StaticFindingInput[];
  owaspCoverage: Array<{ control: string; status: 'pass' | 'warning' | 'fail'; detail: string }>;
  riskScore: number;
  summary: string;
  limitations: string;
}

const KNOWN_ADVISORY_HINTS: Array<{ pkg: string; regex: RegExp; risk: 'high' | 'medium'; note: string }> = [
  { pkg: 'lodash', regex: /^[~^]?(0|1|2|3|4\.(0|1[0-6]|17\.(0|1\d|20)))\b/, risk: 'high', note: 'Older lodash <4.17.21 vulnerable to prototype pollution.' },
  { pkg: 'axios', regex: /^[~^]?(0\.|1\.[0-5]\.)/, risk: 'medium', note: 'Verify axios >=1.6.0 for SSRF/CSRF defense updates.' },
  { pkg: 'express', regex: /^[~^]?([0-3]\.|4\.(0|1[0-8])\.)/, risk: 'medium', note: 'Upgrade Express to >=4.19.2 for path/redirect fixes.' },
  { pkg: 'jsonwebtoken', regex: /^[~^]?([0-8]\.)/, risk: 'high', note: 'Upgrade jsonwebtoken >=9.0.0 to enforce strict algorithm validation.' },
  { pkg: 'django', regex: /^[~^=<>]*([123]\.|4\.0\.)/, risk: 'high', note: 'Unsupported or legacy Django release; upgrade to active LTS.' },
  { pkg: 'flask', regex: /^[~^=<>]*(0\.|1\.)/, risk: 'medium', note: 'Legacy Flask <2.3; upgrade for modern Werkzeug/cookie security.' },
  { pkg: 'pyyaml', regex: /^[~^=<>]*([0-4]\.|5\.[0-3]\.)/, risk: 'high', note: 'PyYAML <5.4 unsafe FullLoader default; upgrade to >=6.0.' },
];

export function runSecurityAndDependencyAudit(params: {
  targetLabel: string;
  manifestContent?: string;
  configOrCodeContent?: string;
}): SecurityAuditOutput {
  const combined = `${params.manifestContent ?? ''}\n${params.configOrCodeContent ?? ''}`;
  const contentHash = crypto.createHash('sha256').update(combined).digest('hex');

  const dependencies: DependencyCheckItem[] = [];
  const findings: StaticFindingInput[] = [];

  if (params.manifestContent?.trim()) {
    const trimmed = params.manifestContent.trim();
    if (trimmed.startsWith('{')) {
      try {
        const pkgJson = JSON.parse(trimmed) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const allDeps = { ...(pkgJson.dependencies ?? {}), ...(pkgJson.devDependencies ?? {}) };
        for (const [name, version] of Object.entries(allDeps)) {
          const hint = KNOWN_ADVISORY_HINTS.find((h) => h.pkg === name.toLowerCase() && h.regex.test(version));
          dependencies.push({
            name,
            version,
            ecosystem: 'npm',
            advisoryNote: hint ? hint.note : 'No legacy version baseline warning matched.',
            risk: hint ? hint.risk : 'ok',
          });
          if (hint) {
            findings.push({
              title: `Outdated / vulnerable dependency baseline: ${name}@${version}`,
              severity: hint.risk,
              category: 'Vulnerable and Outdated Components',
              owaspRef: 'OWASP A06:2021',
              evidence: `${name}: "${version}"`,
              remediation: hint.note,
            });
          }
        }
      } catch {
        findings.push({
          title: 'Malformed JSON package manifest',
          severity: 'info',
          category: 'Configuration Integrity',
          owaspRef: 'OWASP A05:2021',
          evidence: 'Unable to parse package.json cleanly.',
          remediation: 'Validate JSON syntax in manifest before CI/CD packaging.',
        });
      }
    } else {
      // Parse requirements.txt style lines
      for (const line of trimmed.split(/\r?\n/)) {
        const clean = line.trim();
        if (!clean || clean.startsWith('#')) continue;
        const m = /^([A-Za-z0-9_.\-]+)\s*([=<>!~]+\s*[^\s;#]+)?/.exec(clean);
        if (m) {
          const name = m[1];
          const version = (m[2] ?? 'unpinned').replace(/\s+/g, '');
          const hint = KNOWN_ADVISORY_HINTS.find((h) => h.pkg === name.toLowerCase() && h.regex.test(version));
          dependencies.push({
            name,
            version,
            ecosystem: 'PyPI / Generic',
            advisoryNote: version === 'unpinned' ? 'Unpinned dependency version reduces build reproducibility.' : hint?.note ?? 'Version pinned.',
            risk: hint ? hint.risk : version === 'unpinned' ? 'low' : 'ok',
          });
          if (hint) {
            findings.push({
              title: `Outdated Python dependency: ${name} ${version}`,
              severity: hint.risk,
              category: 'Vulnerable and Outdated Components',
              owaspRef: 'OWASP A06:2021',
              evidence: clean,
              remediation: hint.note,
            });
          }
        }
      }
    }
  }

  if (params.configOrCodeContent?.trim()) {
    const content = params.configOrCodeContent;
    const checks: Array<{ regex: RegExp; title: string; sev: StaticFindingInput['severity']; owasp: string; fix: string }> = [
      {
        regex: /AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\-_]{35}|sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{36}/,
        title: 'High-confidence API token or cloud key pattern detected',
        sev: 'critical',
        owasp: 'OWASP A07:2021 / Secret Exposure',
        fix: 'Rotate the exposed token immediately and store secrets outside source/config files.',
      },
      {
        regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
        title: 'Embedded private key material detected',
        sev: 'critical',
        owasp: 'OWASP A02:2021 Cryptographic Failures',
        fix: 'Remove private keys from repository and provision via KMS or secret manager.',
      },
      {
        regex: /allow read, write:\s*if\s*true;|0\.0\.0\.0\/0.*(?:22|3389|5432|3306)/,
        title: 'Overly permissive access rule or open management port configuration',
        sev: 'high',
        owasp: 'OWASP A01:2021 Broken Access Control',
        fix: 'Apply least-privilege authorization checks and restrict administrative network CIDR ranges.',
      },
      {
        regex: /\b(md5|sha1)\b/i,
        title: 'Legacy weak hash algorithm reference (MD5/SHA-1)',
        sev: 'low',
        owasp: 'OWASP A02:2021 Cryptographic Failures',
        fix: 'Use SHA-256+ for integrity checks and Argon2id/bcrypt for password hashing.',
      },
    ];
    for (const c of checks) {
      const m = c.regex.exec(content);
      if (m) {
        findings.push({
          title: c.title,
          severity: c.sev,
          category: 'Configuration & Secret Audit',
          owaspRef: c.owasp,
          evidence: m[0].slice(0, 100),
          remediation: c.fix,
        });
      }
    }
  }

  const hasCriticalSecrets = findings.some((f) => f.severity === 'critical');
  const hasOutdatedDeps = dependencies.some((d) => d.risk === 'high' || d.risk === 'medium');
  const hasAccessIssues = findings.some((f) => f.owaspRef.includes('A01'));

  const owaspCoverage: SecurityAuditOutput['owaspCoverage'] = [
    {
      control: 'A01: Broken Access Control',
      status: hasAccessIssues ? 'fail' : 'pass',
      detail: hasAccessIssues ? 'Permissive rule pattern flagged.' : 'No permissive rule patterns detected in supplied snippet.',
    },
    {
      control: 'A02 / A07: Secrets & Cryptography',
      status: hasCriticalSecrets ? 'fail' : findings.some((f) => f.owaspRef.includes('A02')) ? 'warning' : 'pass',
      detail: hasCriticalSecrets ? 'Potential embedded secret or private key found.' : 'No hardcoded cloud/private keys matched.',
    },
    {
      control: 'A06: Vulnerable & Outdated Components',
      status: hasOutdatedDeps ? 'warning' : 'pass',
      detail: `${dependencies.length} dependencies inspected.`,
    },
  ];

  const severityWeights = { critical: 30, high: 18, medium: 10, low: 4, info: 1 };
  const riskScore = Math.min(100, findings.reduce((s, f) => s + severityWeights[f.severity], 0));

  return {
    targetLabel: params.targetLabel,
    contentHash,
    dependencies: dependencies.slice(0, 100),
    findings,
    owaspCoverage,
    riskScore,
    summary: `Defensive security & dependency audit for ${params.targetLabel}: inspected ${dependencies.length} dependencies and identified ${findings.length} finding(s).`,
    limitations: 'Heuristic offline baseline rules; integrate live OSV/NVD feeds in CI/CD for continuous CVE coverage.',
  };
}
