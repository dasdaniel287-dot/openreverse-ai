import crypto from 'node:crypto';
import JSZip from 'jszip';
import type { StaticFindingInput } from './websiteAnalyzer.ts';

export interface ApkAnalysisOutput {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  packageInfo: {
    packageCandidates: string[];
    dexFiles: string[];
    nativeAbis: string[];
    nativeLibraries: string[];
    signingCertificates: string[];
    totalEntries: number;
    hasKotlinMetadata: boolean;
    hasFlutter: boolean;
    hasReactNative: boolean;
  };
  permissions: Array<{
    name: string;
    protectionLevel: 'dangerous' | 'normal' | 'signature';
    description: string;
  }>;
  components: {
    activities: string[];
    services: string[];
    receivers: string[];
    providers: string[];
  };
  sdkInfo: {
    detectedSdkHints: string[];
    embeddedUrls: string[];
    flags: {
      usesCleartextTraffic: boolean;
      debuggableFlagSeen: boolean;
      allowBackupSeen: boolean;
    };
  };
  entriesSample: Array<{ path: string; compressedSize: number; uncompressedSize: number }>;
  findings: StaticFindingInput[];
  riskScore: number;
  summary: string;
  limitations: string;
}

const DANGEROUS_PERMISSIONS: Record<string, string> = {
  'android.permission.CAMERA': 'Access device camera hardware.',
  'android.permission.RECORD_AUDIO': 'Record audio via device microphone.',
  'android.permission.ACCESS_FINE_LOCATION': 'Access precise GPS location.',
  'android.permission.ACCESS_COARSE_LOCATION': 'Access approximate network location.',
  'android.permission.ACCESS_BACKGROUND_LOCATION': 'Access location continuously in background.',
  'android.permission.READ_CONTACTS': 'Read user address book contacts.',
  'android.permission.WRITE_CONTACTS': 'Modify user address book contacts.',
  'android.permission.READ_SMS': 'Read incoming or stored SMS messages.',
  'android.permission.SEND_SMS': 'Send SMS messages.',
  'android.permission.READ_CALL_LOG': 'Read device call history.',
  'android.permission.READ_EXTERNAL_STORAGE': 'Read shared external storage files.',
  'android.permission.WRITE_EXTERNAL_STORAGE': 'Write to shared external storage.',
  'android.permission.REQUEST_INSTALL_PACKAGES': 'Request installation of external APK packages.',
  'android.permission.SYSTEM_ALERT_WINDOW': 'Draw overlays on top of other apps.',
  'android.permission.READ_PHONE_STATE': 'Read telephony state and device identifiers.',
};

function extractStringsFromBinaryXml(buf: Buffer): string[] {
  const results = new Set<string>();
  // ASCII / UTF-8 printable strings >= 4 chars
  const asciiMatches = buf.toString('latin1').match(/[A-Za-z0-9_.:/\-]{4,180}/g) ?? [];
  for (const s of asciiMatches) {
    results.add(s);
  }
  // UTF-16LE strings commonly used in Android AXML string pool
  let current = '';
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const code = buf.readUInt16LE(i);
    if (code >= 32 && code <= 126) {
      current += String.fromCharCode(code);
    } else {
      if (current.length >= 4 && current.length <= 180) {
        results.add(current);
      }
      current = '';
    }
  }
  if (current.length >= 4 && current.length <= 180) {
    results.add(current);
  }
  return Array.from(results);
}

export async function analyzeApkBuffer(fileName: string, buffer: Buffer): Promise<ApkAnalysisOutput> {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error('Uploaded file is not a valid ZIP/APK container (missing PK magic bytes).');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const zip = await JSZip.loadAsync(buffer);

  const allPaths = Object.keys(zip.files);
  const dexFiles = allPaths.filter((p) => /^classes\d*\.dex$/i.test(p));
  const nativeLibraries = allPaths.filter((p) => p.startsWith('lib/') && p.endsWith('.so'));
  const nativeAbis = Array.from(
    new Set(
      nativeLibraries
        .map((p) => p.split('/')[1])
        .filter((abi): abi is string => Boolean(abi))
    )
  );
  const signingCertificates = allPaths.filter((p) => /^META-INF\/.+\.(RSA|DSA|EC|SF)$/i.test(p));
  const hasKotlinMetadata = allPaths.some((p) => p.includes('kotlin/') || p.endsWith('.kotlin_module'));
  const hasFlutter = allPaths.some((p) => p.includes('libflutter.so') || p.includes('flutter_assets'));
  const hasReactNative = allPaths.some((p) => p.includes('index.android.bundle') || p.includes('libreactnativejni.so'));

  const manifestEntry = zip.file('AndroidManifest.xml');
  if (!manifestEntry) {
    throw new Error('Invalid APK: AndroidManifest.xml not found inside archive.');
  }

  const manifestBuf = await manifestEntry.async('nodebuffer');
  const manifestStrings = extractStringsFromBinaryXml(manifestBuf);

  const permissionsSet = new Set<string>();
  const activities = new Set<string>();
  const services = new Set<string>();
  const receivers = new Set<string>();
  const providers = new Set<string>();
  const packageCandidates = new Set<string>();
  const sdkHints = new Set<string>();
  const embeddedUrls = new Set<string>();

  for (const s of manifestStrings) {
    if (s.startsWith('android.permission.') || s.startsWith('com.google.android.gms.permission.')) {
      permissionsSet.add(s);
    } else if (/^[a-z][a-z0-9_]*(\.[A-Za-z0-9_$]+){2,}$/.test(s) && !s.startsWith('http') && !s.startsWith('android.')) {
      if (s.endsWith('Activity')) activities.add(s);
      else if (s.endsWith('Service')) services.add(s);
      else if (s.endsWith('Receiver')) receivers.add(s);
      else if (s.endsWith('Provider')) providers.add(s);
      else if (s.split('.').length <= 4 && !s.includes('/')) packageCandidates.add(s);
    }
    if (s.includes('firebase') || s.includes('google') || s.includes('okhttp') || s.includes('retrofit') || s.includes('androidx')) {
      sdkHints.add(s.slice(0, 100));
    }
    if (/^https?:\/\/[a-zA-Z0-9.-]+/.test(s)) {
      embeddedUrls.add(s.slice(0, 160));
    }
  }

  // Also scan first DEX file strings lightly (never executing!) for URLs/SDKs
  if (dexFiles[0]) {
    const dexFile = zip.file(dexFiles[0]);
    if (dexFile) {
      const dexBuf = await dexFile.async('nodebuffer');
      const slice = dexBuf.subarray(0, Math.min(dexBuf.length, 512 * 1024));
      const dexText = slice.toString('latin1');
      const urls = dexText.match(/https?:\/\/[A-Za-z0-9.\-_/]{4,120}/g) ?? [];
      for (const u of urls.slice(0, 30)) embeddedUrls.add(u);
      if (dexText.includes('okhttp3')) sdkHints.add('OkHttp3 HTTP Client');
      if (dexText.includes('retrofit2')) sdkHints.add('Retrofit2 REST Client');
      if (dexText.includes('com/google/firebase')) sdkHints.add('Firebase Android SDK');
      if (dexText.includes('com/bumptech/glide')) sdkHints.add('Glide Image Loader');
      if (dexText.includes('TrustAllCerts') || dexText.includes('ALLOW_ALL_HOSTNAME_VERIFIER')) {
        sdkHints.add('Custom TLS HostnameVerifier / TrustManager reference');
      }
    }
  }

  const manifestJoined = manifestStrings.join(' ').toLowerCase();
  const usesCleartextTraffic = manifestJoined.includes('usescleartexttraffic');
  const debuggableFlagSeen = manifestJoined.includes('debuggable');
  const allowBackupSeen = manifestJoined.includes('allowbackup');

  const permissions = Array.from(permissionsSet)
    .sort()
    .map((name) => {
      const dangerousDesc = DANGEROUS_PERMISSIONS[name];
      return {
        name,
        protectionLevel: dangerousDesc ? ('dangerous' as const) : name.includes('SIGNATURE') ? ('signature' as const) : ('normal' as const),
        description: dangerousDesc ?? 'Standard Android capability declaration.',
      };
    });

  const findings: StaticFindingInput[] = [];
  if (signingCertificates.length === 0) {
    findings.push({
      title: 'No v1 JAR signing certificates in META-INF',
      severity: 'info',
      category: 'Code Signing',
      owaspRef: 'OWASP MASVS-RESILIENCE',
      evidence: 'No .RSA/.DSA/.EC/.SF files found in META-INF/ (app may rely solely on APK Signature Scheme v2/v3).',
      remediation: 'Verify APK Signature Scheme v2/v3 blocks using apksigner before distribution.',
    });
  }

  const dangerousCount = permissions.filter((p) => p.protectionLevel === 'dangerous').length;
  if (dangerousCount >= 4) {
    findings.push({
      title: `Broad dangerous permission footprint (${dangerousCount} permissions)`,
      severity: 'medium',
      category: 'Permissions & Least Privilege',
      owaspRef: 'OWASP MASVS-PLATFORM-1',
      evidence: permissions
        .filter((p) => p.protectionLevel === 'dangerous')
        .map((p) => p.name)
        .join(', '),
      remediation: 'Audit each dangerous permission and enforce runtime permission checks with minimal scope.',
    });
  }

  if (Array.from(embeddedUrls).some((u) => u.startsWith('http://'))) {
    findings.push({
      title: 'Cleartext HTTP URLs detected in manifest or DEX strings',
      severity: 'medium',
      category: 'Network Security',
      owaspRef: 'OWASP MASVS-NETWORK-1',
      evidence: Array.from(embeddedUrls)
        .filter((u) => u.startsWith('http://'))
        .slice(0, 5)
        .join(', '),
      remediation: 'Migrate endpoints to HTTPS and enforce network_security_config with cleartextTrafficPermitted="false".',
    });
  }

  if (usesCleartextTraffic) {
    findings.push({
      title: 'Manifest references usesCleartextTraffic attribute',
      severity: 'medium',
      category: 'Network Security',
      owaspRef: 'OWASP MASVS-NETWORK-1',
      evidence: 'usesCleartextTraffic string present in AndroidManifest.xml string pool.',
      remediation: 'Disable cleartext traffic in release builds unless explicitly required for local diagnostics.',
    });
  }

  if (debuggableFlagSeen) {
    findings.push({
      title: 'Debuggable attribute reference found in AndroidManifest.xml',
      severity: 'low',
      category: 'Build Configuration',
      owaspRef: 'OWASP MASVS-RESILIENCE-2',
      evidence: 'debuggable attribute token detected in binary manifest string table.',
      remediation: 'Ensure android:debuggable="false" in release Gradle build variants.',
    });
  }

  const entriesSample = allPaths.slice(0, 50).map((p) => {
    const f = zip.files[p] as unknown as { _data?: { compressedSize?: number; uncompressedSize?: number } };
    return {
      path: p,
      compressedSize: f?._data?.compressedSize ?? 0,
      uncompressedSize: f?._data?.uncompressedSize ?? 0,
    };
  });

  const severityWeights = { critical: 25, high: 16, medium: 10, low: 4, info: 1 };
  const riskScore = Math.min(
    100,
    findings.reduce((sum, f) => sum + severityWeights[f.severity], 0)
  );

  return {
    fileName,
    sizeBytes: buffer.length,
    sha256,
    packageInfo: {
      packageCandidates: Array.from(packageCandidates).slice(0, 12),
      dexFiles,
      nativeAbis,
      nativeLibraries: nativeLibraries.slice(0, 40),
      signingCertificates,
      totalEntries: allPaths.length,
      hasKotlinMetadata,
      hasFlutter,
      hasReactNative,
    },
    permissions,
    components: {
      activities: Array.from(activities).slice(0, 25),
      services: Array.from(services).slice(0, 20),
      receivers: Array.from(receivers).slice(0, 20),
      providers: Array.from(providers).slice(0, 15),
    },
    sdkInfo: {
      detectedSdkHints: Array.from(sdkHints).slice(0, 20),
      embeddedUrls: Array.from(embeddedUrls).slice(0, 25),
      flags: { usesCleartextTraffic, debuggableFlagSeen, allowBackupSeen },
    },
    entriesSample,
    findings,
    riskScore,
    summary: `Static APK inspection complete for ${fileName} (${Math.round(buffer.length / 1024)} KB, SHA-256 ${sha256.slice(0, 12)}...). Found ${dexFiles.length} DEX file(s), ${permissions.length} permission declarations, ${nativeLibraries.length} native .so libraries, and ${findings.length} security observations.`,
    limitations: 'Purely static archive & binary AXML string-table inspection without executing DEX bytecode or decompiling Dalvik instructions on the server.',
  };
}
