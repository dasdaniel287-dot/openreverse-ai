import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { requireAuth } from './server/middleware/auth.ts';
import { aiApiLimiter, analysisApiLimiter, generalApiLimiter } from './server/middleware/rateLimit.ts';
import { analyzeWebsite } from './server/analyzers/websiteAnalyzer.ts';
import { analyzeApkBuffer } from './server/analyzers/apkAnalyzer.ts';
import { analyzeExeBuffer } from './server/analyzers/exeAnalyzer.ts';
import { analyzeSourceFiles, analyzeSourceZipBuffer } from './server/analyzers/codeAnalyzer.ts';
import { analyzeOpenApiSpec, inspectAuthorizedRestEndpoint } from './server/analyzers/apiAnalyzer.ts';
import { runSecurityAndDependencyAudit } from './server/analyzers/securityAnalyzer.ts';
import { runAiCodeIntelligence } from './server/ai/aiService.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1);

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const origin = req.headers.origin;
  const allowedOrigins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...(process.env.APP_URL ? [process.env.APP_URL.replace(/\/+$/, '')] : []),
  ]);
  if (origin && (allowedOrigins.has(origin) || origin.endsWith('.run.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use('/api', generalApiLimiter);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max
    files: 1,
  },
});

// Lightweight server-side automation scheduler registry (tracks active scheduled checks)
interface ScheduledMonitor {
  jobId: string;
  ownerId: string;
  analyzerType: 'website' | 'api';
  targetUrl: string;
  intervalMs: number;
  lastHash: string;
  lastCheckedAt: string;
  changeDetected: boolean;
  timer?: NodeJS.Timeout;
}

const activeMonitors = new Map<string, ScheduledMonitor>();

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'openreverse-ai',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    automationEngineActive: true,
    activeMonitorCount: activeMonitors.size,
    timestamp: new Date().toISOString(),
  });
});

// Website Analyzer
app.post('/api/analyze/website', requireAuth, analysisApiLimiter, async (req, res) => {
  try {
    const { url, authorizationAttested } = req.body as { url?: string; authorizationAttested?: boolean };
    if (!authorizationAttested) {
      res.status(400).json({ error: 'Explicit authorization attestation is required before inspecting a target URL.' });
      return;
    }
    if (!url || typeof url !== 'string' || url.length > 512) {
      res.status(400).json({ error: 'A valid HTTP/HTTPS target URL is required.' });
      return;
    }
    const result = await analyzeWebsite(url);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Website analysis failed.';
    res.status(400).json({ error: message });
  }
});

// APK Analyzer (strictly static, in-memory)
app.post('/api/analyze/apk', requireAuth, analysisApiLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Please upload an .apk file.' });
      return;
    }
    if (!req.file.originalname.toLowerCase().endsWith('.apk')) {
      res.status(400).json({ error: 'Only .apk archives are accepted by the APK Analyzer.' });
      return;
    }
    const result = await analyzeApkBuffer(req.file.originalname, req.file.buffer);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'APK analysis failed.';
    res.status(400).json({ error: message });
  }
});

// EXE / PE Analyzer (strictly static, in-memory, never executed)
app.post('/api/analyze/exe', requireAuth, analysisApiLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Please upload a .exe or .dll PE binary.' });
      return;
    }
    const lower = req.file.originalname.toLowerCase();
    if (!lower.endsWith('.exe') && !lower.endsWith('.dll')) {
      res.status(400).json({ error: 'Only Windows .exe or .dll files are accepted by the PE Analyzer.' });
      return;
    }
    const result = analyzeExeBuffer(req.file.originalname, req.file.buffer);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PE/EXE analysis failed.';
    res.status(400).json({ error: message });
  }
});

// Source Code Analyzer (ZIP upload or raw multi-file JSON payload)
app.post('/api/analyze/code', requireAuth, analysisApiLimiter, upload.single('file'), async (req, res) => {
  try {
    if (req.file) {
      const name = req.file.originalname;
      if (name.toLowerCase().endsWith('.zip')) {
        const result = await analyzeSourceZipBuffer(name, req.file.buffer);
        res.json(result);
        return;
      }
      const text = req.file.buffer.toString('utf8');
      const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      const result = analyzeSourceFiles(name, [{ path: name, content: text }]);
      res.json({ ...result, uploadedSha256: sha256, sizeBytes: req.file.size, previewText: text.slice(0, 12000) });
      return;
    }

    const { targetName, files } = req.body as {
      targetName?: string;
      files?: Array<{ path: string; content: string; explicitLanguage?: string }>;
    };
    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'Provide source files or a .zip archive for analysis.' });
      return;
    }
    const sanitizedFiles = files.slice(0, 50).map((f) => ({
      path: String(f.path || 'snippet.ts').slice(0, 200),
      content: String(f.content || '').slice(0, 200_000),
      explicitLanguage: f.explicitLanguage,
    }));
    const result = analyzeSourceFiles(targetName || 'Source Snippet', sanitizedFiles);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Source code analysis failed.';
    res.status(400).json({ error: message });
  }
});

// API Analyzer (OpenAPI Spec or Authorized REST Probe)
app.post('/api/analyze/api', requireAuth, analysisApiLimiter, async (req, res) => {
  try {
    const { mode, specContent, label, url, method, headers, body, authorizationAttested } = req.body as {
      mode?: 'openapi' | 'live-probe';
      specContent?: string;
      label?: string;
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      authorizationAttested?: boolean;
    };

    if (mode === 'openapi') {
      if (!specContent || typeof specContent !== 'string') {
        res.status(400).json({ error: 'OpenAPI JSON or YAML content is required.' });
        return;
      }
      const result = analyzeOpenApiSpec(specContent, label);
      res.json(result);
      return;
    }

    if (!authorizationAttested) {
      res.status(400).json({ error: 'Authorization attestation is required before probing a live API endpoint.' });
      return;
    }
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'API endpoint URL is required.' });
      return;
    }
    const result = await inspectAuthorizedRestEndpoint({ url, method, headers, body });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'API analysis failed.';
    res.status(400).json({ error: message });
  }
});

// Security & Dependency Analyzer
app.post('/api/analyze/security', requireAuth, analysisApiLimiter, async (req, res) => {
  try {
    const { targetLabel, manifestContent, configOrCodeContent } = req.body as {
      targetLabel?: string;
      manifestContent?: string;
      configOrCodeContent?: string;
    };
    if (!manifestContent?.trim() && !configOrCodeContent?.trim()) {
      res.status(400).json({ error: 'Provide a dependency manifest (package.json / requirements.txt) or configuration/code snippet.' });
      return;
    }
    const result = runSecurityAndDependencyAudit({
      targetLabel: targetLabel || 'Security Audit',
      manifestContent,
      configOrCodeContent,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Security audit failed.';
    res.status(400).json({ error: message });
  }
});

// AI Code Intelligence (Gemini primary, optional Ollama)
app.post('/api/ai/query', requireAuth, aiApiLimiter, async (req, res) => {
  try {
    const {
      prompt,
      codeOrContext,
      taskType,
      language,
      provider,
      geminiModel,
      ollamaBaseUrl,
      ollamaModel,
    } = req.body as {
      prompt?: string;
      codeOrContext?: string;
      taskType?: 'explain' | 'function' | 'algorithm' | 'docs' | 'bugs' | 'improve' | 'architecture' | 'qa';
      language?: 'en' | 'bn';
      provider?: 'gemini' | 'ollama';
      geminiModel?: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
      ollamaBaseUrl?: string;
      ollamaModel?: string;
    };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'A prompt or question is required.' });
      return;
    }

    const aiResponse = await runAiCodeIntelligence({
      prompt,
      codeOrContext,
      taskType: taskType ?? 'explain',
      language: language === 'bn' ? 'bn' : 'en',
      provider: provider === 'ollama' ? 'ollama' : 'gemini',
      geminiModel,
      ollamaBaseUrl,
      ollamaModel,
    });

    res.json(aiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI query failed.';
    const statusCode = message.includes('GEMINI_API_KEY') ? 503 : 502;
    res.status(statusCode).json({ error: message });
  }
});

// Optional external Ollama health test
app.post('/api/ai/ollama-status', requireAuth, aiApiLimiter, async (req, res) => {
  try {
    const { ollamaBaseUrl } = req.body as { ollamaBaseUrl?: string };
    const cleanUrl = (ollamaBaseUrl || '').trim().replace(/\/+$/, '');
    if (!cleanUrl || (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://'))) {
      res.status(400).json({ ok: false, error: 'Provide a valid http:// or https:// external Ollama URL.' });
      return;
    }
    const response = await fetch(`${cleanUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) {
      res.status(502).json({ ok: false, error: `Ollama responded with HTTP ${response.status}` });
      return;
    }
    const data = (await response.json()) as { models?: Array<{ name: string }> };
    res.json({
      ok: true,
      models: (data.models ?? []).map((m) => m.name),
    });
  } catch (err) {
    res.json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to reach external Ollama service.',
    });
  }
});

// Automation Engine: Register & run scheduled change-detection monitor
app.post('/api/automation/register', requireAuth, async (req, res) => {
  const uid = req.authUser?.uid ?? '';
  const { jobId, analyzerType, targetUrl, interval } = req.body as {
    jobId?: string;
    analyzerType?: 'website' | 'api';
    targetUrl?: string;
    interval?: 'hourly' | 'daily' | 'weekly';
  };
  if (!jobId || !targetUrl || (analyzerType !== 'website' && analyzerType !== 'api')) {
    res.status(400).json({ error: 'Valid jobId, analyzerType (website/api), and targetUrl are required.' });
    return;
  }

  const existing = activeMonitors.get(jobId);
  if (existing?.timer) clearInterval(existing.timer);

  const intervalMs =
    interval === 'hourly' ? 60 * 60 * 1000 : interval === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  let initialHash = '';
  try {
    if (analyzerType === 'website') {
      const r = await analyzeWebsite(targetUrl);
      initialHash = r.contentHash;
    } else {
      const r = await inspectAuthorizedRestEndpoint({ url: targetUrl, method: 'GET' });
      initialHash = r.contentHash;
    }
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed initial baseline check.' });
    return;
  }

  const monitor: ScheduledMonitor = {
    jobId,
    ownerId: uid,
    analyzerType,
    targetUrl,
    intervalMs,
    lastHash: initialHash,
    lastCheckedAt: new Date().toISOString(),
    changeDetected: false,
  };

  monitor.timer = setInterval(async () => {
    try {
      const next =
        monitor.analyzerType === 'website'
          ? await analyzeWebsite(monitor.targetUrl)
          : await inspectAuthorizedRestEndpoint({ url: monitor.targetUrl, method: 'GET' });
      monitor.changeDetected = next.contentHash !== monitor.lastHash;
      monitor.lastHash = next.contentHash;
      monitor.lastCheckedAt = new Date().toISOString();
    } catch {
      // keep previous baseline if transient fetch fails
    }
  }, intervalMs);

  activeMonitors.set(jobId, monitor);
  res.json({
    jobId,
    lastHash: initialHash,
    lastCheckedAt: monitor.lastCheckedAt,
    changeDetected: false,
  });
});

app.get('/api/automation/status', requireAuth, (req, res) => {
  const uid = req.authUser?.uid ?? '';
  const items = Array.from(activeMonitors.values())
    .filter((m) => m.ownerId === uid)
    .map(({ timer: _t, ...rest }) => rest);
  res.json({ engineActive: true, monitors: items });
});

// Vite / Static Frontend Serving
async function startServer() {
  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OpenReverse AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start OpenReverse AI server:', err);
  process.exit(1);
});
