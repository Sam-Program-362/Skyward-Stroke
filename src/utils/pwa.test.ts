import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateWebAppManifest,
  shouldPassThroughFetch,
  getInstallPlatformInfo,
} from './pwa';

test('public/manifest.webmanifest is valid JSON and satisfies Android PWA installability criteria', () => {
  const manifestPath = path.resolve(process.cwd(), 'public/manifest.webmanifest');
  assert.equal(fs.existsSync(manifestPath), true, 'public/manifest.webmanifest must exist');

  const rawText = fs.readFileSync(manifestPath, 'utf-8');
  const parsed = JSON.parse(rawText);
  const validation = validateWebAppManifest(parsed);

  assert.equal(validation.valid, true, `Manifest validation errors: ${validation.errors.join(', ')}`);
  assert.equal(validation.has192, true);
  assert.equal(validation.has512, true);
  assert.equal(validation.hasMaskable512, true);
  assert.equal(parsed.display, 'standalone');
  assert.equal(parsed.start_url, '/');
  assert.equal(parsed.prefer_related_applications, false);

  // Verify every referenced icon file exists in public/
  for (const icon of parsed.icons) {
    const relPath = icon.src.replace(/^\//, '');
    const fullPath = path.resolve(process.cwd(), 'public', relPath);
    assert.equal(fs.existsSync(fullPath), true, `Referenced icon /${relPath} must exist in public/`);
  }
});

test('public/sw.js and public/apple-touch-icon.png exist and match pass-through PWA architecture', () => {
  const swPath = path.resolve(process.cwd(), 'public/sw.js');
  const appleIconPath = path.resolve(process.cwd(), 'public/apple-touch-icon.png');
  const svgIconPath = path.resolve(process.cwd(), 'public/icon.svg');

  assert.equal(fs.existsSync(swPath), true);
  assert.equal(fs.existsSync(appleIconPath), true);
  assert.equal(fs.existsSync(svgIconPath), true);

  const swContent = fs.readFileSync(swPath, 'utf-8');
  assert.equal(swContent.includes('self.skipWaiting()'), true);
  assert.equal(swContent.includes('self.clients.claim()'), true);
  assert.equal(swContent.includes("url.pathname.startsWith('/api/')"), true);
});

test('shouldPassThroughFetch mirrors /sw.js pass-through rules', () => {
  const origin = 'https://example.com';
  assert.equal(shouldPassThroughFetch('GET', 'https://example.com/', origin), true);
  assert.equal(shouldPassThroughFetch('GET', 'https://example.com/icon-192.png', origin), true);
  assert.equal(shouldPassThroughFetch('POST', 'https://example.com/api/save', origin), false);
  assert.equal(shouldPassThroughFetch('GET', 'https://example.com/api/data', origin), false);
  assert.equal(shouldPassThroughFetch('GET', 'https://example.com/login', origin), false);
  assert.equal(shouldPassThroughFetch('GET', 'https://other.com/file.js', origin), false);
});

test('getInstallPlatformInfo distinguishes standalone, native prompt, Android, iOS, and desktop', () => {
  const standalone = getInstallPlatformInfo('Mozilla/5.0 (Linux; Android 14)', true, false);
  assert.equal(standalone.kind, 'installed-standalone');

  const promptReady = getInstallPlatformInfo('Mozilla/5.0 (Linux; Android 14)', false, true);
  assert.equal(promptReady.kind, 'prompt-ready');
  assert.equal(promptReady.canPromptDirectly, true);

  const ios = getInstallPlatformInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', false, false);
  assert.equal(ios.kind, 'ios-safari');

  const androidManual = getInstallPlatformInfo('Mozilla/5.0 (Linux; Android 14; Pixel 8)', false, false);
  assert.equal(androidManual.kind, 'android-browser');
});
