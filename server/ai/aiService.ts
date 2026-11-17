import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export interface AiQueryRequest {
  prompt: string;
  codeOrContext?: string;
  taskType: 'explain' | 'function' | 'algorithm' | 'docs' | 'bugs' | 'improve' | 'architecture' | 'qa';
  language: 'en' | 'bn';
  provider: 'gemini' | 'ollama';
  geminiModel?: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}

export interface AiQueryResponse {
  answer: string;
  providerUsed: 'gemini' | 'ollama';
  modelUsed: string;
  language: 'en' | 'bn';
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Configure it in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildSystemInstruction(taskType: AiQueryRequest['taskType'], language: 'en' | 'bn'): string {
  const langInstruction =
    language === 'bn'
      ? 'Respond clearly in natural Bengali (বাংলা) while preserving exact technical identifiers, function names, and code blocks in monospace.'
      : 'Respond in clear, concise technical English with structured Markdown headings and code blocks where helpful.';

  const taskMap: Record<AiQueryRequest['taskType'], string> = {
    explain: 'Explain what this code or software artifact does, its data flow, inputs/outputs, and design intent.',
    function: 'Break down the specific function(s), parameters, edge cases, return values, and time/space behavior.',
    algorithm: 'Explain the underlying algorithm, state transitions, invariants, and asymptotic complexity.',
    docs: 'Generate clean, production-grade technical documentation (overview, API/function signatures, usage examples).',
    bugs: 'Perform a defensive code & bug review identifying logic errors, race conditions, null/boundary bugs, and security hardening improvements.',
    improve: 'Provide actionable refactoring, readability, maintainability, and performance improvements with clean code snippets.',
    architecture: 'Analyze the software architecture, module boundaries, coupling, and scalability recommendations.',
    qa: 'Answer the user technical reverse-engineering or software understanding question accurately and defensively.',
  };

  return [
    'You are OpenReverse AI, a defensive software intelligence and code understanding assistant.',
    'Only assist with authorized software understanding, reverse-engineering education, architecture mapping, documentation, and defensive security remediation.',
    'Refuse requests for malware creation, exploitation payloads, credential theft, DRM circumvention, or unauthorized access.',
    taskMap[taskType],
    langInstruction,
  ].join(' ');
}

export async function runAiCodeIntelligence(req: AiQueryRequest): Promise<AiQueryResponse> {
  const systemInstruction = buildSystemInstruction(req.taskType, req.language);
  const fullPrompt = req.codeOrContext?.trim()
    ? `${req.prompt.trim()}\n\n--- CONTEXT / CODE ---\n${req.codeOrContext.slice(0, 24000)}`
    : req.prompt.trim();

  if (req.provider === 'ollama') {
    const baseUrl = (req.ollamaBaseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const model = req.ollamaModel || 'qwen2.5-coder:7b';
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        system: systemInstruction,
        prompt: fullPrompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`External Ollama service error (${res.status}): ${errText || res.statusText}`);
    }
    const data = (await res.json()) as { response?: string };
    return {
      answer: data.response ?? 'No response returned by Ollama.',
      providerUsed: 'ollama',
      modelUsed: model,
      language: req.language,
    };
  }

  // Primary Provider: Google Gemini via @google/genai
  const model = req.geminiModel === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
  const ai = getGeminiClient();

  const response = await ai.models.generateContent({
    model,
    contents: fullPrompt,
    config: {
      systemInstruction,
      ...(model === 'gemini-4-hydrogen' ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  return {
    answer: text,
    providerUsed: 'gemini',
    modelUsed: model,
    language: req.language,
  };
}
