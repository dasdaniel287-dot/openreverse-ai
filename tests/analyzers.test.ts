import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { isBlockedIpAddress, validatePublicTargetUrl } from '../server/middleware/ssrfGuard.ts';
import { analyzeApkBuffer } from '../server/analyzers/apkAnalyzer.ts';
import { analyzeExeBuffer } from '../server/analyzers/exeAnalyzer.ts';
import { analyzeSourceFiles } from '../server/analyzers/codeAnalyzer.ts';
import { analyzeOpenApiSpec } from '../server/analyzers/apiAnalyzer.ts';
import { runSecurityAndDependencyAudit } from '../server/analyzers/securityAnalyzer.ts';

test('SSRF Guard blocks private, loopback, and cloud metadata addresses', async () => {
  assert.equal(isBlockedIpAddress('127.0.0.1'), true);
  assert.equal(isBlockedIpAddress('10.0.0.5'), true);
  assert.equal(isBlockedIpAddress('172.16.10.1'), true);
  assert.equal(isBlockedIpAddress('192.168.1.1'), true);
  assert.equal(isBlockedIpAddress('169.254.169.254'), true);
  assert.equal(isBlockedIpAddress('::1'), true);
  assert.equal(isBlockedIpAddress('fe80::1'), true);
  assert.equal(isBlockedIpAddress('8.8.8.8'), false);

  await assert.rejects(() => validatePublicTargetUrl('http://127.0.0.1:8080/admin'));
  await assert.rejects(() => validatePublicTargetUrl('http://localhost:3000'));
  await assert.rejects(() => validatePublicTargetUrl('http://169.254.169.254/latest/meta-data'));
  await assert.rejects(() => validatePublicTargetUrl('file:///etc/passwd'));
});

test('APK Analyzer inspects synthetic APK archive statically without execution', async () => {
  const zip = new JSZip();
  zip.file(
    'AndroidManifest.xml',
    'com.example.openreverse android.permission.INTERNET android.permission.CAMERA com.example.MainActivity usesCleartextTraffic'
  );
  zip.file('classes.dex', Buffer.from('dex\n035\0https://api.example.com/v1 okhttp3'));
  zip.file('META-INF/CERT.SF', 'Signature-Version: 1.0');
  const buf = await zip.generateAsync({ type: 'nodebuffer' });

  const result = await analyzeApkBuffer('sample.apk', buf);
  assert.equal(result.fileName, 'sample.apk');
  assert.equal(result.packageInfo.dexFiles.length, 1);
  assert.ok(result.permissions.some((p) => p.name === 'android.permission.CAMERA' && p.protectionLevel === 'dangerous'));
  assert.ok(result.components.activities.includes('com.example.MainActivity'));
  assert.equal(result.sdkInfo.flags.usesCleartextTraffic, true);
});

test('EXE / PE Analyzer parses synthetic PE32+ header and detects missing mitigations', () => {
  const buf = Buffer.alloc(512);
  // DOS Header MZ + e_lfanew = 0x80
  buf.writeUInt16LE(0x5a4d, 0);
  buf.writeUInt32LE(0x80, 0x3c);
  // PE\0\0
  buf.writeUInt32LE(0x00004550, 0x80);
  // COFF header: Machine x64 (0x8664), 1 section, SizeOfOptionalHeader 0xF0
  buf.writeUInt16LE(0x8664, 0x84);
  buf.writeUInt16LE(1, 0x86);
  buf.writeUInt32LE(1700000000, 0x88);
  buf.writeUInt16LE(0xf0, 0x94);
  buf.writeUInt16LE(0x0022, 0x96);
  // Optional header PE32+ (0x020b)
  const opt = 0x98;
  buf.writeUInt16LE(0x020b, opt);
  buf.writeUInt32LE(0x1000, opt + 16); // EntryPoint
  buf.writeBigUInt64LE(0x140000000n, opt + 24); // ImageBase
  buf.writeUInt16LE(3, opt + 68); // Console CUI
  buf.writeUInt16LE(0x0000, opt + 70); // Missing ASLR/DEP flags intentionally
  buf.writeUInt32LE(16, opt + 108);
  // Section .text at opt + 0xF0
  const sec = opt + 0xf0;
  buf.write('.text', sec, 'utf8');
  buf.writeUInt32LE(64, sec + 8);
  buf.writeUInt32LE(0x1000, sec + 12);
  buf.writeUInt32LE(64, sec + 16);
  buf.writeUInt32LE(0x1a0, sec + 20);
  buf.writeUInt32LE(0x60000020, sec + 36);

  const result = analyzeExeBuffer('sample.exe', buf);
  assert.equal(result.peFormat.format, 'PE32+ (64-bit)');
  assert.equal(result.peFormat.machine, 'x64 (AMD64)');
  assert.equal(result.peFormat.subsystem, 'Windows Console (CUI)');
  assert.equal(result.securityMitigations.aslr, false);
  assert.equal(result.securityMitigations.depNx, false);
  assert.ok(result.findings.some((f) => f.title.includes('ASLR')));
});

test('Code Analyzer extracts functions, classes, dependencies, and findings', () => {
  const result = analyzeSourceFiles('demo', [
    {
      path: 'src/app.ts',
      content: `import express from 'express';\nexport class AppController {\n  handle() { return eval('1+1'); }\n}`,
    },
  ]);
  assert.equal(result.totalFiles, 1);
  assert.ok(result.languagesDetected.includes('typescript'));
  assert.ok(result.files[0].classes.includes('AppController'));
  assert.ok(result.dependencies.includes('express'));
  assert.ok(result.findings.some((f) => f.category === 'Code Injection Risk'));
  assert.ok(result.architecture.nodes.length >= 2);
});

test('API & Security Analyzers validate OpenAPI YAML and dependency advisories', () => {
  const apiRes = analyzeOpenApiSpec(
    `openapi: 3.0.0\ninfo:\n  title: Demo\n  version: 1.0.0\npaths:\n  /users:\n    post:\n      summary: Create\n      responses:\n        '201':\n          description: Created`
  );
  assert.equal(apiRes.endpoints.length, 1);
  assert.ok(apiRes.findings.some((f) => f.category === 'API Authentication'));

  const secRes = runSecurityAndDependencyAudit({
    targetLabel: 'pkg',
    manifestContent: JSON.stringify({ dependencies: { lodash: '4.17.19' } }),
  });
  assert.equal(secRes.dependencies.length, 1);
  assert.equal(secRes.dependencies[0].risk, 'high');
});
