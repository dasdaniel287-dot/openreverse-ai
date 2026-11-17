import crypto from 'node:crypto';
import type { StaticFindingInput } from './websiteAnalyzer.ts';

export interface PeSectionInfo {
  name: string;
  virtualSize: number;
  virtualAddress: string;
  rawSize: number;
  rawOffset: number;
  entropy: number;
  characteristics: string[];
}

export interface ExeAnalysisOutput {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  peFormat: {
    format: 'PE32 (32-bit)' | 'PE32+ (64-bit)';
    machine: string;
    subsystem: string;
    compileTimestamp: string;
    entryPointRva: string;
    imageBase: string;
    numberOfSections: number;
    isDll: boolean;
  };
  securityMitigations: {
    aslr: boolean;
    highEntropyVa: boolean;
    depNx: boolean;
    controlFlowGuard: boolean;
    noSeh: boolean;
    authenticodeSigned: boolean;
    signatureSizeBytes: number;
  };
  sections: PeSectionInfo[];
  importedDlls: string[];
  notableStrings: string[];
  suspiciousIndicators: string[];
  findings: StaticFindingInput[];
  riskScore: number;
  summary: string;
  limitations: string;
}

const MACHINE_MAP: Record<number, string> = {
  0x014c: 'x86 (i386)',
  0x8664: 'x64 (AMD64)',
  0x01c0: 'ARM',
  0xaa64: 'ARM64',
  0x0200: 'IA-64',
};

const SUBSYSTEM_MAP: Record<number, string> = {
  1: 'Native / Driver',
  2: 'Windows GUI',
  3: 'Windows Console (CUI)',
  7: 'POSIX CUI',
  9: 'Windows CE GUI',
  10: 'EFI Application',
};

function computeShannonEntropy(slice: Buffer): number {
  if (slice.length === 0) return 0;
  const freq = new Uint32Array(256);
  for (let i = 0; i < slice.length; i++) {
    freq[slice[i]]++;
  }
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (freq[i] === 0) continue;
    const p = freq[i] / slice.length;
    entropy -= p * Math.log2(p);
  }
  return Math.round(entropy * 100) / 100;
}

function rvaToOffset(rva: number, sections: Array<{ va: number; vsize: number; rawOff: number; rawSize: number }>): number | null {
  for (const s of sections) {
    const span = Math.max(s.vsize, s.rawSize);
    if (rva >= s.va && rva < s.va + span) {
      const delta = rva - s.va;
      if (delta < s.rawSize) {
        return s.rawOff + delta;
      }
    }
  }
  return null;
}

function readAsciiZ(buf: Buffer, offset: number, maxLen = 128): string {
  let out = '';
  for (let i = offset; i < buf.length && i < offset + maxLen; i++) {
    const b = buf[i];
    if (b === 0) break;
    if (b >= 32 && b <= 126) out += String.fromCharCode(b);
    else return '';
  }
  return out;
}

export function analyzeExeBuffer(fileName: string, buffer: Buffer): ExeAnalysisOutput {
  if (buffer.length < 128 || buffer.readUInt16LE(0) !== 0x5a4d) {
    throw new Error('Invalid Windows PE/EXE file: missing MZ DOS signature.');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const peOffset = buffer.readUInt32LE(0x3c);

  if (peOffset + 24 >= buffer.length || buffer.readUInt32LE(peOffset) !== 0x00004550) {
    throw new Error('Invalid PE header: missing PE\\0\\0 signature.');
  }

  const coffOffset = peOffset + 4;
  const machineCode = buffer.readUInt16LE(coffOffset);
  const numberOfSections = buffer.readUInt16LE(coffOffset + 2);
  const timestampSec = buffer.readUInt32LE(coffOffset + 4);
  const sizeOfOptionalHeader = buffer.readUInt16LE(coffOffset + 16);
  const characteristics = buffer.readUInt16LE(coffOffset + 18);

  const optOffset = coffOffset + 20;
  if (optOffset + sizeOfOptionalHeader > buffer.length || sizeOfOptionalHeader < 96) {
    throw new Error('Truncated or malformed PE Optional Header.');
  }

  const magic = buffer.readUInt16LE(optOffset);
  const isPe32Plus = magic === 0x020b;
  if (magic !== 0x010b && magic !== 0x020b) {
    throw new Error(`Unsupported PE Optional Header magic: 0x${magic.toString(16)}`);
  }

  const entryPointRva = buffer.readUInt32LE(optOffset + 16);
  const imageBase = isPe32Plus
    ? `0x${buffer.readBigUInt64LE(optOffset + 24).toString(16)}`
    : `0x${buffer.readUInt32LE(optOffset + 28).toString(16)}`;

  const subsystemCode = buffer.readUInt16LE(optOffset + 68);
  const dllCharacteristics = buffer.readUInt16LE(optOffset + 70);

  const dataDirOffset = optOffset + (isPe32Plus ? 112 : 96);
  const numDataDirs = isPe32Plus
    ? buffer.readUInt32LE(optOffset + 108)
    : buffer.readUInt32LE(optOffset + 92);

  let importTableRva = 0;
  let securityTableOffset = 0;
  let securityTableSize = 0;

  if (numDataDirs >= 2 && dataDirOffset + 16 <= optOffset + sizeOfOptionalHeader) {
    importTableRva = buffer.readUInt32LE(dataDirOffset + 8);
  }
  if (numDataDirs >= 5 && dataDirOffset + 40 <= optOffset + sizeOfOptionalHeader) {
    securityTableOffset = buffer.readUInt32LE(dataDirOffset + 32);
    securityTableSize = buffer.readUInt32LE(dataDirOffset + 36);
  }

  const sectionsOffset = optOffset + sizeOfOptionalHeader;
  const sections: PeSectionInfo[] = [];
  const rawSectionBounds: Array<{ va: number; vsize: number; rawOff: number; rawSize: number }> = [];

  for (let i = 0; i < Math.min(numberOfSections, 64); i++) {
    const secOff = sectionsOffset + i * 40;
    if (secOff + 40 > buffer.length) break;

    const name = buffer.subarray(secOff, secOff + 8).toString('utf8').replace(/\0/g, '').trim() || `SEC_${i}`;
    const virtualSize = buffer.readUInt32LE(secOff + 8);
    const virtualAddress = buffer.readUInt32LE(secOff + 12);
    const rawSize = buffer.readUInt32LE(secOff + 16);
    const rawOffset = buffer.readUInt32LE(secOff + 20);
    const secChars = buffer.readUInt32LE(secOff + 36);

    const flags: string[] = [];
    if (secChars & 0x00000020) flags.push('CODE');
    if (secChars & 0x00000040) flags.push('INIT_DATA');
    if (secChars & 0x20000000) flags.push('EXECUTE');
    if (secChars & 0x40000000) flags.push('READ');
    if (secChars & 0x80000000) flags.push('WRITE');

    const safeStart = Math.min(rawOffset, buffer.length);
    const safeEnd = Math.min(safeStart + rawSize, buffer.length);
    const entropy = computeShannonEntropy(buffer.subarray(safeStart, safeEnd));

    sections.push({
      name,
      virtualSize,
      virtualAddress: `0x${virtualAddress.toString(16)}`,
      rawSize,
      rawOffset,
      entropy,
      characteristics: flags,
    });
    rawSectionBounds.push({ va: virtualAddress, vsize: virtualSize, rawOff: rawOffset, rawSize });
  }

  // Parse Import Directory Table DLL names statically
  const importedDlls: string[] = [];
  if (importTableRva > 0) {
    const impFileOff = rvaToOffset(importTableRva, rawSectionBounds);
    if (impFileOff !== null) {
      for (let idx = 0; idx < 128; idx++) {
        const descOff = impFileOff + idx * 20;
        if (descOff + 20 > buffer.length) break;
        const nameRva = buffer.readUInt32LE(descOff + 12);
        const firstThunk = buffer.readUInt32LE(descOff + 16);
        if (nameRva === 0 && firstThunk === 0) break;
        const nameOff = rvaToOffset(nameRva, rawSectionBounds);
        if (nameOff !== null) {
          const dllName = readAsciiZ(buffer, nameOff);
          if (dllName) importedDlls.push(dllName);
        }
      }
    }
  }

  // Scan printable strings from capped slice (never executing!)
  const stringSample = buffer.subarray(0, Math.min(buffer.length, 1024 * 1024)).toString('latin1');
  const urlMatches = stringSample.match(/https?:\/\/[A-Za-z0-9.\-_/]{4,100}/g) ?? [];
  const apiMatches =
    stringSample.match(
      /\b(VirtualAlloc|VirtualProtect|WriteProcessMemory|CreateRemoteThread|LoadLibraryA|LoadLibraryW|GetProcAddress|RegOpenKeyEx|InternetOpen|WinHttpOpen|CryptEncrypt|ShellExecute)\b/g
    ) ?? [];
  const notableStrings = Array.from(new Set([...urlMatches.slice(0, 15), ...apiMatches.slice(0, 20)]));

  const aslr = Boolean(dllCharacteristics & 0x0040);
  const highEntropyVa = Boolean(dllCharacteristics & 0x0020);
  const depNx = Boolean(dllCharacteristics & 0x0100);
  const noSeh = Boolean(dllCharacteristics & 0x0400);
  const controlFlowGuard = Boolean(dllCharacteristics & 0x4000);
  const authenticodeSigned = securityTableOffset > 0 && securityTableSize > 0;

  const suspiciousIndicators: string[] = [];
  const findings: StaticFindingInput[] = [];

  if (!aslr) {
    suspiciousIndicators.push('ASLR (DYNAMIC_BASE) disabled in Optional Header');
    findings.push({
      title: 'Binary compiled without ASLR (DYNAMIC_BASE)',
      severity: 'medium',
      category: 'Binary Hardening',
      owaspRef: 'CWE-119 / Binary Exploit Mitigation',
      evidence: `DllCharacteristics = 0x${dllCharacteristics.toString(16)}`,
      remediation: 'Compile with /DYNAMICBASE linker flag to enable Address Space Layout Randomization.',
    });
  }

  if (!depNx) {
    suspiciousIndicators.push('DEP / NX_COMPAT mitigation disabled');
    findings.push({
      title: 'Binary compiled without DEP / NX_COMPAT',
      severity: 'medium',
      category: 'Binary Hardening',
      owaspRef: 'CWE-119 / Binary Exploit Mitigation',
      evidence: `DllCharacteristics = 0x${dllCharacteristics.toString(16)}`,
      remediation: 'Link binary with /NXCOMPAT to enforce non-executable data pages.',
    });
  }

  if (!authenticodeSigned) {
    suspiciousIndicators.push('No Authenticode digital signature table');
    findings.push({
      title: 'Unsigned PE executable (no Authenticode certificate table)',
      severity: 'low',
      category: 'Code Signing',
      owaspRef: 'Software Supply Chain Integrity',
      evidence: 'PE Security DataDirectory RVA/Size = 0',
      remediation: 'Sign production Windows binaries with a valid code-signing certificate using signtool.',
    });
  }

  for (const sec of sections) {
    if (sec.characteristics.includes('EXECUTE') && sec.characteristics.includes('WRITE')) {
      suspiciousIndicators.push(`Section ${sec.name} is both WRITABLE and EXECUTABLE (RWX)`);
      findings.push({
        title: `Writable & executable PE section (${sec.name})`,
        severity: 'high',
        category: 'Memory Protection',
        owaspRef: 'CWE-119 / W^X Violation',
        evidence: `Section ${sec.name} characteristics: ${sec.characteristics.join(', ')}`,
        remediation: 'Enforce W^X separation so code sections are read-only/execute and data sections are non-executable.',
      });
    }
    if (sec.entropy >= 7.2) {
      suspiciousIndicators.push(`High Shannon entropy (${sec.entropy}) in section ${sec.name} — possible packing or compression`);
      findings.push({
        title: `High-entropy PE section (${sec.name}: ${sec.entropy}/8.0)`,
        severity: 'info',
        category: 'Packing / Obfuscation Indicator',
        owaspRef: 'Static Binary Triage',
        evidence: `Section ${sec.name} raw size ${sec.rawSize} bytes has entropy ${sec.entropy}.`,
        remediation: 'Verify whether the binary uses an authorized packer/installer compression or obfuscated payload.',
      });
    }
  }

  const severityWeights = { critical: 25, high: 18, medium: 10, low: 4, info: 2 };
  const riskScore = Math.min(
    100,
    findings.reduce((sum, f) => sum + severityWeights[f.severity], 0)
  );

  return {
    fileName,
    sizeBytes: buffer.length,
    sha256,
    peFormat: {
      format: isPe32Plus ? 'PE32+ (64-bit)' : 'PE32 (32-bit)',
      machine: MACHINE_MAP[machineCode] ?? `Unknown (0x${machineCode.toString(16)})`,
      subsystem: SUBSYSTEM_MAP[subsystemCode] ?? `Subsystem ${subsystemCode}`,
      compileTimestamp: timestampSec > 0 ? new Date(timestampSec * 1000).toISOString() : 'Unknown',
      entryPointRva: `0x${entryPointRva.toString(16)}`,
      imageBase,
      numberOfSections,
      isDll: Boolean(characteristics & 0x2000),
    },
    securityMitigations: {
      aslr,
      highEntropyVa,
      depNx,
      controlFlowGuard,
      noSeh,
      authenticodeSigned,
      signatureSizeBytes: securityTableSize,
    },
    sections,
    importedDlls: Array.from(new Set(importedDlls)),
    notableStrings,
    suspiciousIndicators,
    findings,
    riskScore,
    summary: `Static PE inspection complete for ${fileName} (${isPe32Plus ? 'PE32+' : 'PE32'}, ${MACHINE_MAP[machineCode] ?? 'unknown arch'}). Analyzed ${sections.length} sections, ${importedDlls.length} imported DLLs, and ${findings.length} defensive findings.`,
    limitations: 'Static PE/COFF header, section entropy, and import table inspection only. Uploaded executables are never executed or emulated on the server.',
  };
}
