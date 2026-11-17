import React, { useState } from 'react';
import { ArrowRight, Code2, FileCode2, Globe, Layers, Lock, ShieldCheck, Smartphone } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { useAuth } from '../contexts/AuthContext';

export function AuthLanding() {
  const { signInWithGoogle, authError } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(true);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // handled in AuthContext
    } finally {
      setSigningIn(false);
    }
  };

  const capabilities = [
    {
      icon: Globe,
      title: 'Website & Header Inspection',
      desc: 'SSRF-guarded HTML, CSS, JavaScript, technology detection, metadata, SEO, and security header auditing.',
    },
    {
      icon: Smartphone,
      title: 'Static APK & PE/EXE Triage',
      desc: 'Non-executing binary inspection for Android manifests, permissions, DEX counts, PE sections, entropy, and DLL imports.',
    },
    {
      icon: Code2,
      title: 'Multi-Language Source & AI Intelligence',
      desc: 'Static code structure extraction across 12 languages paired with Gemini AI explanation in English and Bengali.',
    },
    {
      icon: Layers,
      title: 'Architecture Mapping & Reports',
      desc: 'Interactive module dependency graphs, OpenAPI inspection, automated change detection, and PDF/HTML/JSON/Markdown exports.',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-[#070B14]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a href="#top" className="whitespace-nowrap shrink-0">
            <BrandLogo />
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#analyzers" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Analyzers
            </a>
            <a href="#intelligence" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              AI Intelligence
            </a>
            <a href="#security" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Security Model
            </a>
            <a href="#reporting" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Reporting
            </a>
          </nav>

          <button
            type="button"
            onClick={handleSignIn}
            disabled={signingIn}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {signingIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
      </header>

      {/* Hero Split */}
      <main id="top" className="flex-1">
        <section className="max-w-7xl mx-auto px-6 py-16 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-medium tracking-wide text-blue-600 dark:text-cyan-400">
              Open-Source Software Intelligence · Defensive Reverse Engineering
            </p>
            <h1 className="mt-4 font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance] leading-[1.12]">
              Analyze Anything. Understand Everything.
            </h1>
            <p className="mt-5 text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              OpenReverse AI unifies static website inspection, Android APK &amp; Windows PE triage, multi-language source analysis, REST/OpenAPI auditing, and Gemini AI code explanation in one workspace.
            </p>

            {authError && (
              <div className="mt-5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                {authError}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleSignIn}
                disabled={signingIn}
                className="inline-flex items-center gap-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-3 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {signingIn ? 'Authenticating...' : 'Open Workspace with Google'}
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#analyzers"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors whitespace-nowrap shrink-0"
              >
                Explore Modules
              </a>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Zero binary execution on server</span>
              <span aria-hidden="true">·</span>
              <span>SSRF &amp; private-network protection</span>
              <span aria-hidden="true">·</span>
              <span>Authorized inspection only</span>
            </div>
          </div>

          <div className="lg:col-span-6 flex">
            <div className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 overflow-hidden relative min-h-[320px]">
              {heroLoaded ? (
                <img
                  src="/src/assets/images/openreverse_architecture_hero_1794932971018.jpg"
                  alt="OpenReverse AI isometric software architecture and defensive security inspection graph"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroLoaded(false)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full min-h-[320px] flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-[#0B1528] to-slate-950 p-8 text-center">
                  <FileCode2 className="w-12 h-12 text-cyan-400 mb-3" />
                  <p className="font-display text-lg font-semibold text-white">Unified Static Analysis Engine</p>
                  <p className="text-sm text-slate-400 mt-1 max-w-sm">
                    Websites · APKs · PE Binaries · Source Trees · OpenAPI Specs
                  </p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-transparent p-6">
                <p className="text-sm font-medium text-white">
                  Integrated Static Inspection &amp; Architecture Visualization
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Web · Android APK · Windows PE · 12 Source Languages · OpenAPI 3.x · Gemini AI
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section id="analyzers" className="border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120]">
          <div className="max-w-7xl mx-auto px-6 py-16">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                Six Integrated Inspection Engines
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Every analyzer runs in-memory static inspection or SSRF-protected requests and stores structured findings inside your Firestore project workspace.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
              {capabilities.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0F172A]/80 p-6"
                  >
                    <Icon className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                    <h3 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-white">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Security & Reporting Summary */}
        <section id="security" className="border-t border-slate-200 dark:border-slate-800/80 max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 gap-10" >
          <div id="intelligence">
            <div className="flex items-center gap-2.5 text-blue-600 dark:text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
              <span className="text-xs font-semibold tracking-wide">Defensive Security Boundaries</span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-bold text-slate-900 dark:text-white">
              Built for Authorized &amp; Defensive Analysis
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Uploaded APKs and Windows PE binaries are parsed strictly as static byte buffers in memory and never executed. Network inspectors enforce DNS rebinding checks, private IPv4/IPv6 CIDR blocks, and redirect validation.
            </p>
          </div>

          <div id="reporting">
            <div className="flex items-center gap-2.5 text-indigo-600 dark:text-blue-400">
              <Lock className="w-5 h-5" />
              <span className="text-xs font-semibold tracking-wide">Zero-Trust Workspace Persistence</span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-bold text-slate-900 dark:text-white">
              Tenant-Isolated Firestore &amp; Export Center
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Projects, uploaded artifact metadata, security findings, AI conversations in English and Bengali, and audit logs are strictly scoped to your verified Firebase account with downloadable PDF, HTML, JSON, and Markdown reports.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800/80 py-6 px-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>OpenReverse AI · Open-Source Defensive Software Intelligence</span>
          <span>Apache-2.0 License · Authorized Systems Only</span>
        </div>
      </footer>
    </div>
  );
}
