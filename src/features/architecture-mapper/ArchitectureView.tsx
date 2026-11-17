import React, { useMemo, useState } from 'react';
import { Database, FolderTree, Network, Webhook } from 'lucide-react';
import type { AnalysisResultRecord, ProjectRecord } from '../../types';

export function ArchitectureView({
  project,
  results,
}: {
  project: ProjectRecord | null;
  results: AnalysisResultRecord[];
}) {
  const [diagramMode, setDiagramMode] = useState<'modules' | 'api' | 'database'>('modules');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const projectResults = useMemo(
    () => (project ? results.filter((r) => r.projectId === project.id) : results),
    [project, results]
  );

  const latestCodeResult = projectResults.find((r) => r.analyzerType === 'source');
  const latestApiResult = projectResults.find((r) => r.analyzerType === 'api');

  const graphData = useMemo(() => {
    if (diagramMode === 'database') {
      return {
        nodes: [
          { id: 'users', label: 'users/{uid}', type: 'entry' },
          { id: 'projects', label: 'projects/{projectId}', type: 'entry' },
          { id: 'uploadedFiles', label: 'uploadedFiles/{fileId}', type: 'module' },
          { id: 'analysisJobs', label: 'analysisJobs/{jobId}', type: 'module' },
          { id: 'analysisResults', label: 'analysisResults/{resultId}', type: 'module' },
          { id: 'securityFindings', label: 'securityFindings/{findingId}', type: 'external' },
          { id: 'reports', label: 'reports/{reportId}', type: 'external' },
          { id: 'auditLogs', label: 'auditLogs/{logId}', type: 'external' },
        ],
        edges: [
          { from: 'users', to: 'projects', relation: '1:N ownerId' },
          { from: 'projects', to: 'uploadedFiles', relation: '1:N projectId' },
          { from: 'projects', to: 'analysisJobs', relation: '1:N projectId' },
          { from: 'analysisJobs', to: 'analysisResults', relation: '1:1 jobId' },
          { from: 'analysisResults', to: 'securityFindings', relation: '1:N resultId' },
          { from: 'projects', to: 'reports', relation: '1:N projectId' },
          { from: 'users', to: 'auditLogs', relation: '1:N append-only' },
        ],
      };
    }

    if (diagramMode === 'api') {
      const endpoints =
        (latestApiResult?.data?.endpoints as Array<{ method: string; path: string }> | undefined) ?? [];
      if (endpoints.length > 0) {
        const nodes = [
          { id: 'gateway', label: 'API Gateway / Client', type: 'entry' },
          ...endpoints.slice(0, 9).map((ep, i) => ({
            id: `ep_${i}`,
            label: `${ep.method} ${ep.path}`,
            type: 'module',
          })),
        ];
        const edges = endpoints.slice(0, 9).map((ep, i) => ({
          from: 'gateway',
          to: `ep_${i}`,
          relation: ep.method,
        }));
        return { nodes, edges };
      }
      return {
        nodes: [
          { id: 'client', label: 'React Client (ID Token)', type: 'entry' },
          { id: 'auth', label: 'Firebase Auth Guard', type: 'module' },
          { id: 'website', label: '/api/analyze/website', type: 'module' },
          { id: 'binary', label: '/api/analyze/apk & exe', type: 'module' },
          { id: 'code', label: '/api/analyze/code', type: 'module' },
          { id: 'ai', label: '/api/ai/query (Gemini)', type: 'external' },
        ],
        edges: [
          { from: 'client', to: 'auth', relation: 'Bearer JWT' },
          { from: 'auth', to: 'website', relation: 'SSRF Guard' },
          { from: 'auth', to: 'binary', relation: 'Memory Buffer' },
          { from: 'auth', to: 'code', relation: 'Static AST' },
          { from: 'auth', to: 'ai', relation: 'Server Key' },
        ],
      };
    }

    // Module Dependency Graph from latest Source Code analysis
    const arch = latestCodeResult?.data?.architecture as
      | {
          nodes: Array<{ id: string; label: string; type: string }>;
          edges: Array<{ from: string; to: string; relation: string }>;
        }
      | undefined;

    if (arch && arch.nodes?.length > 0) {
      return {
        nodes: arch.nodes.slice(0, 12),
        edges: arch.edges.slice(0, 20),
      };
    }

    return {
      nodes: [
        { id: 'ui', label: 'OpenReverse UI', type: 'entry' },
        { id: 'server', label: 'Express API Server', type: 'entry' },
        { id: 'analyzers', label: 'Static Analyzers', type: 'module' },
        { id: 'gemini', label: 'Gemini AI Service', type: 'external' },
        { id: 'firestore', label: 'Cloud Firestore', type: 'external' },
      ],
      edges: [
        { from: 'ui', to: 'server', relation: 'HTTPS REST' },
        { from: 'server', to: 'analyzers', relation: 'In-Memory' },
        { from: 'server', to: 'gemini', relation: '@google/genai' },
        { from: 'ui', to: 'firestore', relation: 'Security Rules' },
      ],
    };
  }, [diagramMode, latestCodeResult, latestApiResult]);

  const folderTree =
    (latestCodeResult?.data?.architecture as { tree?: Array<{ path: string; type: string }> } | undefined)?.tree ?? [];

  // Deterministic circular/layered SVG layout
  const width = 760;
  const height = 400;
  const positioned = graphData.nodes.map((node, idx) => {
    const angle = (idx / Math.max(1, graphData.nodes.length)) * Math.PI * 2 - Math.PI / 2;
    const rx = graphData.nodes.length <= 4 ? 170 : 250;
    const ry = graphData.nodes.length <= 4 ? 105 : 135;
    return {
      ...node,
      x: Math.round(width / 2 + Math.cos(angle) * rx),
      y: Math.round(height / 2 + Math.sin(angle) * ry),
    };
  });

  const posMap = new Map(positioned.map((n) => [n.id, n]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Architecture Mapper
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Interactive dependency graph, project folder tree, API topology, and Firestore data model visualization.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setDiagramMode('modules')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              diagramMode === 'modules' ? 'bg-white dark:bg-[#0B1120] text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            Modules
          </button>
          <button
            type="button"
            onClick={() => setDiagramMode('api')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              diagramMode === 'api' ? 'bg-white dark:bg-[#0B1120] text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            API Map
          </button>
          <button
            type="button"
            onClick={() => setDiagramMode('database')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              diagramMode === 'database' ? 'bg-white dark:bg-[#0B1120] text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Database ER
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800"
          >
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" className="fill-blue-500 dark:fill-cyan-400" />
              </marker>
            </defs>

            {graphData.edges.map((edge, idx) => {
              const from = posMap.get(edge.from);
              const to = posMap.get(edge.to);
              if (!from || !to) return null;
              const isHighlighted = selectedNodeId === from.id || selectedNodeId === to.id;
              return (
                <g key={`${edge.from}_${edge.to}_${idx}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    strokeWidth={isHighlighted ? 2.2 : 1.3}
                    markerEnd="url(#arrow)"
                    className={
                      isHighlighted
                        ? 'stroke-blue-600 dark:stroke-cyan-400'
                        : 'stroke-slate-300 dark:stroke-slate-700'
                    }
                  />
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 - 4}
                    textAnchor="middle"
                    className="fill-slate-500 dark:fill-slate-400 text-[9px] font-mono"
                  >
                    {edge.relation}
                  </text>
                </g>
              );
            })}

            {positioned.map((node) => {
              const selected = selectedNodeId === node.id;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => setSelectedNodeId(selected ? null : node.id)}
                  className="cursor-pointer"
                >
                  <rect
                    x={-72}
                    y={-18}
                    width={144}
                    height={36}
                    rx={8}
                    className={
                      selected
                        ? 'fill-blue-600 stroke-blue-400'
                        : node.type === 'entry'
                        ? 'fill-white dark:fill-[#111C33] stroke-blue-500 dark:stroke-cyan-400'
                        : 'fill-white dark:fill-[#0F172A] stroke-slate-300 dark:stroke-slate-700'
                    }
                    strokeWidth={1.5}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`text-[10px] font-mono font-medium ${
                      selected ? 'fill-white' : 'fill-slate-800 dark:fill-slate-100'
                    }`}
                  >
                    {node.label.length > 21 ? `${node.label.slice(0, 19)}..` : node.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
            Click any node to highlight its direct dependency or relationship edges.
          </p>
        </div>

        <div className="xl:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            <h2 className="font-display text-base font-semibold">Project Tree &amp; Inspector</h2>
          </div>

          {selectedNodeId && (
            <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-xs">
              <p className="font-semibold text-slate-900 dark:text-white font-mono">{selectedNodeId}</p>
              <p className="text-slate-600 dark:text-slate-300 mt-1">
                Connected edges:{' '}
                {graphData.edges.filter((e) => e.from === selectedNodeId || e.to === selectedNodeId).length}
              </p>
            </div>
          )}

          {folderTree.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Run a Source Code or ZIP archive analysis in the selected project to populate the interactive module graph and folder tree with real extracted imports.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto space-y-1 text-xs font-mono text-slate-700 dark:text-slate-300">
              {folderTree.map((item) => (
                <li key={`${item.type}_${item.path}`} className="truncate">
                  {item.type === 'folder' ? `📁 ${item.path}/` : `📄 ${item.path}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
