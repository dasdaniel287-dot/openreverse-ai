import crypto from 'node:crypto';
import JSZip from 'jszip';
import type { StaticFindingInput } from './websiteAnalyzer.ts';

export type SupportedCodeLanguage =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'java'
  | 'c'
  | 'cpp'
  | 'php'
  | 'go'
  | 'html'
  | 'css'
  | 'json'
  | 'xml';

export interface CodeFileInsight {
  path: string;
  language: SupportedCodeLanguage | 'other';
  linesOfCode: number;
  blankLines: number;
  commentLines: number;
  cyclomaticComplexity: number;
  functions: string[];
  classes: string[];
  imports: string[];
}

export interface ArchitectureGraphData {
  nodes: Array<{ id: string; label: string; type: 'module' | 'external' | 'entry'; lines?: number }>;
  edges: Array<{ from: string; to: string; relation: string }>;
  tree: Array<{ path: string; type: 'file' | 'folder' }>;
}

export interface CodeAnalysisOutput {
  targetName: string;
  contentHash: string;
  totalFiles: number;
  totalLines: number;
  languagesDetected: string[];
  files: CodeFileInsight[];
  dependencies: string[];
  architecture: ArchitectureGraphData;
  qualityObservations: string[];
  findings: StaticFindingInput[];
  riskScore: number;
  summary: string;
  limitations: string;
}

const EXT_LANG_MAP: Record<string, SupportedCodeLanguage> = {
  '.py': 'python',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.php': 'php',
  '.go': 'go',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.json': 'json',
  '.xml': 'xml',
};

export function detectLanguageFromName(fileName: string, explicitLang?: string): SupportedCodeLanguage | 'other' {
  if (explicitLang && Object.values(EXT_LANG_MAP).includes(explicitLang as SupportedCodeLanguage)) {
    return explicitLang as SupportedCodeLanguage;
  }
  const lower = fileName.toLowerCase();
  for (const [ext, lang] of Object.entries(EXT_LANG_MAP)) {
    if (lower.endsWith(ext)) return lang;
  }
  return 'other';
}

function inspectSingleSource(filePath: string, content: string, language: SupportedCodeLanguage | 'other'): {
  insight: CodeFileInsight;
  findings: StaticFindingInput[];
} {
  const lines = content.split(/\r?\n/);
  let blankLines = 0;
  let commentLines = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) blankLines++;
    else if (t.startsWith('//') || t.startsWith('#') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('<!--')) {
      commentLines++;
    }
  }

  const functions = new Set<string>();
  const classes = new Set<string>();
  const imports = new Set<string>();

  if (language === 'javascript' || language === 'typescript') {
    for (const m of content.matchAll(/(?:function\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g)) {
      const fn = m[1] || m[2];
      if (fn) functions.add(fn);
    }
    for (const m of content.matchAll(/\b(?:class|interface|type)\s+([A-Za-z0-9_$]+)/g)) {
      if (m[1]) classes.add(m[1]);
    }
    for (const m of content.matchAll(/(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g)) {
      const imp = m[1] || m[2];
      if (imp) imports.add(imp);
    }
  } else if (language === 'python') {
    for (const m of content.matchAll(/^\s*(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/gm)) {
      if (m[1]) functions.add(m[1]);
    }
    for (const m of content.matchAll(/^\s*class\s+([A-Za-z0-9_]+)/gm)) {
      if (m[1]) classes.add(m[1]);
    }
    for (const m of content.matchAll(/^\s*(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.]+))/gm)) {
      const imp = m[1] || m[2];
      if (imp) imports.add(imp);
    }
  } else if (language === 'java' || language === 'php') {
    for (const m of content.matchAll(/\b(?:public|private|protected|static|final|\s)+[\w<>[\]]+\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/g)) {
      if (m[1] && !['if', 'for', 'while', 'switch', 'catch'].includes(m[1])) functions.add(m[1]);
    }
    for (const m of content.matchAll(/\b(?:class|interface|trait|enum)\s+([A-Za-z0-9_]+)/g)) {
      if (m[1]) classes.add(m[1]);
    }
    for (const m of content.matchAll(/(?:import\s+([\w.]+);|use\s+([\w\\]+);|require(?:_once)?\s*\(?['"]([^'"]+)['"]\)?;)/g)) {
      const imp = m[1] || m[2] || m[3];
      if (imp) imports.add(imp);
    }
  } else if (language === 'go') {
    for (const m of content.matchAll(/\bfunc\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/g)) {
      if (m[1]) functions.add(m[1]);
    }
    for (const m of content.matchAll(/\btype\s+([A-Za-z0-9_]+)\s+(?:struct|interface)\b/g)) {
      if (m[1]) classes.add(m[1]);
    }
    for (const m of content.matchAll(/"([a-zA-Z0-9.\-_/]+)"/g)) {
      if (m[1] && (m[1].includes('/') || ['fmt', 'net/http', 'os', 'crypto', 'encoding/json'].includes(m[1]))) {
        imports.add(m[1]);
      }
    }
  } else if (language === 'c' || language === 'cpp') {
    for (const m of content.matchAll(/^[A-Za-z_][\w\s*&:<>]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*\{/gm)) {
      if (m[1] && !['if', 'for', 'while', 'switch'].includes(m[1])) functions.add(m[1]);
    }
    for (const m of content.matchAll(/\b(?:class|struct)\s+([A-Za-z0-9_]+)/g)) {
      if (m[1]) classes.add(m[1]);
    }
    for (const m of content.matchAll(/#include\s+[<"]([^>"]+)[>"]/g)) {
      if (m[1]) imports.add(m[1]);
    }
  } else if (language === 'html') {
    for (const m of content.matchAll(/<(?:script[^>]+src|link[^>]+href)=['"]([^'"]+)['"]/gi)) {
      if (m[1]) imports.add(m[1]);
    }
  } else if (language === 'json' && filePath.endsWith('package.json')) {
    try {
      const pkg = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      Object.keys(pkg.dependencies ?? {}).forEach((d) => imports.add(d));
      Object.keys(pkg.devDependencies ?? {}).forEach((d) => imports.add(d));
    } catch {
      // ignore invalid json
    }
  }

  const branchTokens = content.match(/\b(if|else\s+if|elif|for|while|case|catch|\?\s*[^:]+\s*:|&&|\|\|)\b/g) ?? [];
  const cyclomaticComplexity = 1 + branchTokens.length;

  const findings: StaticFindingInput[] = [];

  const securityRules: Array<{
    regex: RegExp;
    title: string;
    severity: StaticFindingInput['severity'];
    category: string;
    owaspRef: string;
    remediation: string;
  }> = [
    {
      regex: /AKIA[0-9A-Z]{16}/,
      title: `Potential AWS Access Key ID in ${filePath}`,
      severity: 'critical',
      category: 'Hardcoded Secret',
      owaspRef: 'OWASP A07:2021 / CWE-798',
      remediation: 'Revoke exposed credentials immediately and load secrets from environment variables or a secret manager.',
    },
    {
      regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      title: `Private cryptographic key block embedded in ${filePath}`,
      severity: 'critical',
      category: 'Hardcoded Secret',
      owaspRef: 'CWE-798',
      remediation: 'Remove private keys from source files and store them in secure runtime secret vaults.',
    },
    {
      regex: /(?:api_key|apikey|secret_key|password|passwd|db_password)\s*[:=]\s*['"][A-Za-z0-9_\-!@#$%^&*]{8,}['"]/i,
      title: `Hardcoded credential or API key literal in ${filePath}`,
      severity: 'high',
      category: 'Hardcoded Secret',
      owaspRef: 'OWASP A07:2021 / CWE-798',
      remediation: 'Replace hardcoded secrets with environment variables (process.env / os.environ).',
    },
    {
      regex: /\beval\s*\(|new\s+Function\s*\(/,
      title: `Dynamic code evaluation (eval / Function) in ${filePath}`,
      severity: 'high',
      category: 'Code Injection Risk',
      owaspRef: 'OWASP A03:2021 Injection / CWE-95',
      remediation: 'Replace dynamic eval() with explicit parsing (JSON.parse) or safe lookup maps.',
    },
    {
      regex: /dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\s*\(/,
      title: `Potential DOM XSS sink in ${filePath}`,
      severity: 'medium',
      category: 'Cross-Site Scripting (XSS)',
      owaspRef: 'OWASP A03:2021 / CWE-79',
      remediation: 'Use safe textContent bindings or sanitize untrusted HTML with DOMPurify before rendering.',
    },
    {
      regex: /\b(?:child_process\.exec|os\.system|subprocess\.Popen\([^)]*shell\s*=\s*True|shell_exec)\b/,
      title: `OS command execution with shell interpolation risk in ${filePath}`,
      severity: 'high',
      category: 'Command Injection Risk',
      owaspRef: 'OWASP A03:2021 / CWE-78',
      remediation: 'Use parameterized argument arrays (execFile / subprocess.run with shell=False) instead of shell strings.',
    },
    {
      regex: /\b(?:strcpy|strcat|sprintf|gets)\s*\(/,
      title: `Unsafe C/C++ unbounded buffer function in ${filePath}`,
      severity: 'high',
      category: 'Memory Safety',
      owaspRef: 'CWE-120 Buffer Overflow',
      remediation: 'Use bounded equivalents (strncpy, snprintf, std::string) with explicit buffer size checks.',
    },
    {
      regex: /\bpickle\.loads\s*\(|yaml\.load\s*\([^)]*(?!Loader=yaml\.SafeLoader)/,
      title: `Unsafe deserialization pattern in ${filePath}`,
      severity: 'high',
      category: 'Insecure Deserialization',
      owaspRef: 'OWASP A08:2021 / CWE-502',
      remediation: 'Use JSON or yaml.safe_load() for untrusted input.',
    },
    {
      regex: /verify\s*=\s*False|rejectUnauthorized\s*:\s*false|InsecureSkipVerify\s*:\s*true/,
      title: `TLS certificate verification disabled in ${filePath}`,
      severity: 'high',
      category: 'Cryptographic Validation',
      owaspRef: 'OWASP A02:2021 / CWE-295',
      remediation: 'Enable TLS certificate verification in all production HTTP/TLS clients.',
    },
  ];

  for (const rule of securityRules) {
    const match = rule.regex.exec(content);
    if (match) {
      findings.push({
        title: rule.title,
        severity: rule.severity,
        category: rule.category,
        owaspRef: rule.owaspRef,
        evidence: match[0].slice(0, 120),
        remediation: rule.remediation,
      });
    }
  }

  return {
    insight: {
      path: filePath,
      language,
      linesOfCode: lines.length,
      blankLines,
      commentLines,
      cyclomaticComplexity,
      functions: Array.from(functions).slice(0, 40),
      classes: Array.from(classes).slice(0, 30),
      imports: Array.from(imports).slice(0, 40),
    },
    findings,
  };
}

export function analyzeSourceFiles(
  targetName: string,
  entries: Array<{ path: string; content: string; explicitLanguage?: string }>
): CodeAnalysisOutput {
  const hashInput = entries.map((e) => `${e.path}:${e.content}`).join('\n');
  const contentHash = crypto.createHash('sha256').update(hashInput).digest('hex');

  const files: CodeFileInsight[] = [];
  const findings: StaticFindingInput[] = [];
  const allDeps = new Set<string>();
  const languages = new Set<string>();
  const folderSet = new Set<string>();

  const nodesMap = new Map<string, { id: string; label: string; type: 'module' | 'external' | 'entry'; lines?: number }>();
  const edges: Array<{ from: string; to: string; relation: string }> = [];

  for (const entry of entries.slice(0, 60)) {
    const lang = detectLanguageFromName(entry.path, entry.explicitLanguage);
    if (lang !== 'other') languages.add(lang);

    const parts = entry.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      folderSet.add(parts.slice(0, i).join('/'));
    }

    const { insight, findings: fileFindings } = inspectSingleSource(entry.path, entry.content, lang);
    files.push(insight);
    findings.push(...fileFindings);

    const isEntry = /(?:index|main|app|server)\.(ts|tsx|js|py|go|java)$/i.test(entry.path);
    nodesMap.set(entry.path, {
      id: entry.path,
      label: entry.path.split('/').pop() ?? entry.path,
      type: isEntry ? 'entry' : 'module',
      lines: insight.linesOfCode,
    });

    for (const imp of insight.imports) {
      allDeps.add(imp);
      const isRelative = imp.startsWith('.') || imp.startsWith('/');
      const targetId = isRelative ? imp : `ext:${imp}`;
      if (!nodesMap.has(targetId)) {
        nodesMap.set(targetId, {
          id: targetId,
          label: imp,
          type: isRelative ? 'module' : 'external',
        });
      }
      edges.push({ from: entry.path, to: targetId, relation: 'imports' });
    }
  }

  const totalLines = files.reduce((s, f) => s + f.linesOfCode, 0);
  const qualityObservations: string[] = [];
  const highComplexity = files.filter((f) => f.cyclomaticComplexity > 25);
  if (highComplexity.length > 0) {
    qualityObservations.push(`${highComplexity.length} file(s) exhibit elevated cyclomatic complexity (>25 branches); consider modularizing helper functions.`);
  }
  const lowCommentFiles = files.filter((f) => f.linesOfCode > 80 && f.commentLines === 0);
  if (lowCommentFiles.length > 0) {
    qualityObservations.push(`${lowCommentFiles.length} substantial file(s) contain zero inline documentation comments.`);
  }
  if (qualityObservations.length === 0) {
    qualityObservations.push(`Codebase structure across ${files.length} file(s) shows balanced complexity and readable modular separation.`);
  }

  const tree: ArchitectureGraphData['tree'] = [
    ...Array.from(folderSet)
      .sort()
      .map((p) => ({ path: p, type: 'folder' as const })),
    ...files.map((f) => ({ path: f.path, type: 'file' as const })),
  ];

  const severityWeights = { critical: 25, high: 16, medium: 9, low: 4, info: 1 };
  const riskScore = Math.min(
    100,
    findings.reduce((sum, f) => sum + severityWeights[f.severity], 0)
  );

  return {
    targetName,
    contentHash,
    totalFiles: files.length,
    totalLines,
    languagesDetected: Array.from(languages),
    files,
    dependencies: Array.from(allDeps).slice(0, 60),
    architecture: {
      nodes: Array.from(nodesMap.values()).slice(0, 60),
      edges: edges.slice(0, 100),
      tree: tree.slice(0, 120),
    },
    qualityObservations,
    findings,
    riskScore,
    summary: `Analyzed ${files.length} source file(s) (${totalLines} LOC) across ${languages.size || 1} language(s). Extracted ${files.reduce((s, f) => s + f.functions.length, 0)} functions, ${files.reduce((s, f) => s + f.classes.length, 0)} classes/types, ${allDeps.size} dependencies, and ${findings.length} static observations.`,
    limitations: 'Regex/structural static source analysis without full compiler type-checking or runtime taint execution.',
  };
}

export async function analyzeSourceZipBuffer(fileName: string, buffer: Buffer): Promise<CodeAnalysisOutput> {
  const zip = await JSZip.loadAsync(buffer);
  const entries: Array<{ path: string; content: string }> = [];

  for (const [entryPath, fileObj] of Object.entries(zip.files)) {
    if (fileObj.dir) continue;
    if (entryPath.includes('node_modules/') || entryPath.includes('.git/') || entryPath.includes('dist/')) continue;
    const lang = detectLanguageFromName(entryPath);
    if (lang === 'other' && !entryPath.endsWith('requirements.txt') && !entryPath.endsWith('go.mod')) continue;
    const text = await fileObj.async('string');
    if (text.length <= 200_000) {
      entries.push({ path: entryPath, content: text });
    }
    if (entries.length >= 50) break;
  }

  if (entries.length === 0) {
    throw new Error('No supported source code files found inside archive.');
  }

  return analyzeSourceFiles(fileName, entries);
}
