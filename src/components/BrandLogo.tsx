import React from 'react';

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width="28"
        height="28"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M16 2.5L28 8V16.5C28 23.2 22.9 28.4 16 30C9.1 28.4 4 23.2 4 16.5V8L16 2.5Z"
          className="fill-blue-600/15 stroke-blue-600 dark:fill-blue-500/20 dark:stroke-cyan-400"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M16 8.5L22.5 12.25V19.75L16 23.5L9.5 19.75V12.25L16 8.5Z"
          className="stroke-blue-700 dark:stroke-blue-400"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M16 8.5V16M16 16L22.5 19.75M16 16L9.5 19.75"
          className="stroke-indigo-600 dark:stroke-cyan-300"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
          OpenReverse AI
        </span>
      )}
    </div>
  );
}
