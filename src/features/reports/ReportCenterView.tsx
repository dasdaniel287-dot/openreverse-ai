import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import { Download, FileText } from 'lucide-react';
import type {
  AnalysisResultRecord,
  ProjectRecord,
  ReportFormat,
  ReportRecord,
  SecurityFindingRecord,
} from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { saveReportRecord } from '../../services/firestoreService';

export function ReportCenterView({
  project,
  results,
  findings,
  reports,
  onNeedProject,
}: {
  project: ProjectRecord | null;
  results: AnalysisResultRecord[];
  findings: SecurityFindingRecord[];
  reports: ReportRecord[];
  onNeedProject: () => void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [generating, setGenerating] = useState(false);

  const projectResults = project ? results.filter((r) => r.projectId === project.id) : [];
  const projectFindings = project ? findings.filter((f) => f.projectId === project.id) : [];

  const buildMarkdown = (): string => {
    if (!project) return '';
    const now = new Date().toISOString();
    const lines = [
      `# OpenReverse AI Security & Analysis Report`,
      `**Project:** ${project.name}`,
      `**Target Type:** ${project.targetType}`,
      `**Generated At:** ${now}`,
      `**Analyses Included:** ${projectResults.length}`,
      `**Findings Included:** ${projectFindings.length}`,
      '',
      `## Executive Summary`,
      ...projectResults.map((r) => `- **${r.analyzerType.toUpperCase()} (${r.targetLabel})** — Risk ${r.riskScore}/100: ${r.summary}`),
      '',
      `## Security Findings & Evidence`,
      ...(projectFindings.length === 0
        ? ['No security findings recorded for this project.']
        : projectFindings.flatMap((f, i) => [
            `### ${i + 1}. [${f.severity.toUpperCase()}] ${f.title}`,
            `- **Category:** ${f.category}${f.owaspRef ? ` (${f.owaspRef})` : ''}`,
            `- **Status:** ${f.status}`,
            ...(f.evidence ? [`- **Evidence:** \`${f.evidence}\``] : []),
            `- **Remediation:** ${f.remediation}`,
            '',
          ])),
      `## Analysis Limitations`,
      ...projectResults
        .map((r) => r.limitations)
        .filter(Boolean)
        .map((lim) => `- ${lim}`),
    ];
    return lines.join('\n');
  };

  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerate = async () => {
    if (!user) return;
    if (!project) {
      notify('Select or create a project', 'Select a project before exporting reports.', 'info');
      onNeedProject();
      return;
    }

    setGenerating(true);
    try {
      const safeName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const timestamp = new Date().toISOString().slice(0, 10);
      const summary = `${projectResults.length} analyses and ${projectFindings.length} findings exported for ${project.name}.`;

      if (format === 'json') {
        const payload = {
          generatedBy: 'OpenReverse AI',
          generatedAt: new Date().toISOString(),
          project: { id: project.id, name: project.name, targetType: project.targetType, targetUrl: project.targetUrl },
          analyses: projectResults.map((r) => ({
            id: r.id,
            analyzerType: r.analyzerType,
            targetLabel: r.targetLabel,
            riskScore: r.riskScore,
            summary: r.summary,
            limitations: r.limitations,
            data: r.data,
          })),
          findings: projectFindings,
        };
        triggerDownload(
          new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
          `${safeName}-report-${timestamp}.json`
        );
      } else if (format === 'markdown') {
        triggerDownload(
          new Blob([buildMarkdown()], { type: 'text/markdown;charset=utf-8' }),
          `${safeName}-report-${timestamp}.md`
        );
      } else if (format === 'html') {
        const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${project.name} - OpenReverse AI Report</title><style>body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#0f172a;line-height:1.6}h1,h2{color:#0f172a}pre,code{background:#f1f5f9;padding:2px 6px;border-radius:4px}.card{border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin:12px 0}</style></head><body><h1>OpenReverse AI Report: ${project.name}</h1><p>Generated ${new Date().toISOString()} · ${projectResults.length} analyses · ${projectFindings.length} findings</p><h2>Analysis Summaries</h2>${projectResults.map((r) => `<div class="card"><strong>${r.analyzerType.toUpperCase()} — ${r.targetLabel}</strong> (Risk ${r.riskScore}/100)<p>${r.summary}</p><small>${r.limitations ?? ''}</small></div>`).join('')}<h2>Findings</h2>${projectFindings.map((f) => `<div class="card"><strong>[${f.severity.toUpperCase()}] ${f.title}</strong><p>Category: ${f.category} ${f.owaspRef ?? ''}</p><p><code>${f.evidence ?? ''}</code></p><p><strong>Remediation:</strong> ${f.remediation}</p></div>`).join('')}</body></html>`;
        triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName}-report-${timestamp}.html`);
      } else {
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        let y = 48;
        const addLine = (text: string, size = 10, bold = false) => {
          doc.setFont('helvetica', bold ? 'bold' : 'normal');
          doc.setFontSize(size);
          const wrapped = doc.splitTextToSize(text, 500) as string[];
          for (const line of wrapped) {
            if (y > 780) {
              doc.addPage();
              y = 48;
            }
            doc.text(line, 48, y);
            y += size + 5;
          }
        };

        addLine(`OpenReverse AI — Analysis Report`, 16, true);
        addLine(`Project: ${project.name} (${project.targetType})`, 11, false);
        addLine(`Generated: ${new Date().toISOString()}`, 9, false);
        y += 8;
        addLine(`Analysis Summaries (${projectResults.length})`, 13, true);
        for (const r of projectResults) {
          addLine(`• [${r.analyzerType.toUpperCase()}] ${r.targetLabel} — Risk ${r.riskScore}/100`, 10, true);
          addLine(r.summary, 9, false);
        }
        y += 8;
        addLine(`Security Findings (${projectFindings.length})`, 13, true);
        for (const f of projectFindings) {
          addLine(`• [${f.severity.toUpperCase()}] ${f.title} (${f.status})`, 10, true);
          if (f.evidence) addLine(`Evidence: ${f.evidence}`, 8, false);
          addLine(`Remediation: ${f.remediation}`, 9, false);
          y += 4;
        }
        doc.save(`${safeName}-report-${timestamp}.pdf`);
      }

      await saveReportRecord({
        ownerId: user.uid,
        projectId: project.id,
        title: `${project.name} (${format.toUpperCase()})`,
        format,
        summary,
        findingCount: projectFindings.length,
      });
      notify('Report exported', `Downloaded ${format.toUpperCase()} report for ${project.name}.`, 'success');
    } catch (err) {
      notify('Export failed', err instanceof Error ? err.message : 'Report generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Report Center
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Export structured PDF, HTML, JSON, and Markdown reports containing evidence, timestamps, remediation guidance, and analysis limitations.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Active Project: {project?.name ?? 'None selected'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {projectResults.length} analyses · {projectFindings.length} findings ready for export
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Report export format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ReportFormat)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
          >
            <option value="pdf">PDF Document (.pdf)</option>
            <option value="html">HTML Report (.html)</option>
            <option value="json">Structured JSON (.json)</option>
            <option value="markdown">Markdown (.md)</option>
          </select>

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating || !project}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2 text-sm font-medium cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {generating ? 'Exporting...' : 'Generate & Download'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
          <h2 className="font-display text-base font-semibold">Export History ({reports.length})</h2>
        </div>
        {reports.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
            No reports generated yet. Select a format above and click Generate &amp; Download.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {reports.map((rpt) => (
              <div key={rpt.id} className="px-5 py-3.5 flex items-center justify-between gap-4 text-xs">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">{rpt.title}</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">{rpt.summary}</p>
                </div>
                <span className="font-mono uppercase text-blue-600 dark:text-cyan-400 shrink-0">{rpt.format}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
