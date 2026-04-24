#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDir = path.join(repoRoot, '.app-store', 'screenshots');
const maxScreenshotBytes = 1_500_000;
const minScreenshotBytes = 120_000;
const expectedWidth = 2880;
const expectedHeight = 1800;
const maxAppNameChars = 30;
const maxSubtitleChars = 30;
const maxKeywordsChars = 100;
const maxPromotionalTextChars = 170;
const maxDescriptionChars = 4000;
const expectedScreenshots = [
  '01-library.jpg',
  '02-home.jpg',
  '03-draft.jpg',
  '04-patterns.jpg',
  '05-frontispiece.jpg',
];

const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function expectIncludes(source, needle, label) {
  if (!source.includes(needle)) fail(`${label} must include ${needle}`);
}

function expectMatch(source, pattern, label) {
  if (!pattern.test(source)) fail(`${label} did not match ${pattern}`);
}

function expectNoMatch(source, pattern, label) {
  if (pattern.test(source)) fail(`${label} must not match ${pattern}`);
}

function jpegSize(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('not a JPEG file');
  }

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }

  throw new Error('could not find JPEG SOF marker');
}

function checkAppStoreCopy() {
  const copy = read('docs/app-store-copy.md');
  expectIncludes(copy, 'Bundle ID: `com.yinyiping.loom`', 'App Store copy');
  expectIncludes(copy, 'Subtitle: A screen that replaces paper', 'App Store copy');
  expectIncludes(copy, '28 characters', 'App Store copy');
  expectIncludes(copy, 'Privacy Policy URL: `https://yiping-yin.github.io/Wiki/privacy.html`', 'App Store copy');
  expectIncludes(copy, 'Support URL: `https://yiping-yin.github.io/Wiki/support.html`', 'App Store copy');
  expectIncludes(copy, 'Default screenshot format: JPEG', 'App Store copy');
  for (const label of ['Library', 'Home', 'S\u014dan', 'Patterns', 'Frontispiece']) {
    expectIncludes(copy, `- ${label}:`, 'App Store screenshot plan');
  }
  expectNoMatch(copy, /Knowledge docs:/, 'App Store screenshot plan');

  const appName = copy.match(/^- Name: (.+)$/m)?.[1]?.trim() ?? '';
  const subtitle = copy.match(/^- Subtitle: (.+)$/m)?.[1]?.trim() ?? '';
  const keywords = copy.match(/## Keywords\s+([\s\S]*?)(?=\n## |$)/)?.[1]?.trim().split('\n')[0]?.trim() ?? '';
  const promotionalText = copy.match(/## Promotional Text[\s\S]*?```\n([\s\S]*?)\n```/)?.[1]?.trim() ?? '';
  const description = copy.match(/## Description\s+([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() ?? '';

  if (appName.length > maxAppNameChars) {
    fail(`App Store name is too long: ${appName.length} characters > ${maxAppNameChars}`);
  }
  if (subtitle.length > maxSubtitleChars) {
    fail(`App Store subtitle is too long: ${subtitle.length} characters > ${maxSubtitleChars}`);
  }
  if (keywords.length > maxKeywordsChars) {
    fail(`App Store keywords are too long: ${keywords.length} characters > ${maxKeywordsChars}`);
  }
  if (promotionalText.length > maxPromotionalTextChars) {
    fail(`App Store promotional text is too long: ${promotionalText.length} characters > ${maxPromotionalTextChars}`);
  }
  if (description.length > maxDescriptionChars) {
    fail(`App Store description is too long: ${description.length} characters > ${maxDescriptionChars}`);
  }
}

function checkPackageScripts() {
  const pkg = JSON.parse(read('package.json'));
  if (pkg.scripts?.['app:screenshots'] !== 'node scripts/app-store-screenshots.mjs') {
    fail('package.json app:screenshots must run scripts/app-store-screenshots.mjs');
  }
  if (pkg.scripts?.['app:preflight'] !== 'node scripts/app-store-preflight.mjs') {
    fail('package.json app:preflight must run scripts/app-store-preflight.mjs');
  }
  if (pkg.scripts?.['app:package'] !== 'node scripts/package-loom-app.mjs') {
    fail('package.json app:package must run scripts/package-loom-app.mjs');
  }
  if (pkg.scripts?.['app:archive'] !== 'npm run build && node scripts/build-static-export.mjs && node scripts/archive-loom-app.mjs') {
    fail('package.json app:archive must build, static-export, and run scripts/archive-loom-app.mjs');
  }
  if (pkg.scripts?.['app:archive:store'] !== 'npm run build && node scripts/build-static-export.mjs && node scripts/archive-loom-app.mjs --store') {
    fail('package.json app:archive:store must build, static-export, and run scripts/archive-loom-app.mjs --store');
  }
  if (pkg.scripts?.['app:export:store'] !== 'node scripts/export-loom-app-store.mjs') {
    fail('package.json app:export:store must run scripts/export-loom-app-store.mjs');
  }
}

function checkArchiveExportFlow() {
  const archiveScript = read('scripts/archive-loom-app.mjs');
  const exportScript = read('scripts/export-loom-app-store.mjs');
  const exportOptions = read('macos-app/Loom/ExportOptions-AppStore.plist');

  expectIncludes(archiveScript, '-archivePath', 'archive script');
  expectIncludes(archiveScript, 'LOOM_APPLE_TEAM_ID', 'archive script');
  expectIncludes(archiveScript, 'CODE_SIGN_IDENTITY=-', 'archive script');
  expectIncludes(archiveScript, 'Apple Distribution', 'archive script');
  expectIncludes(archiveScript, 'LOOM_ALLOW_PROVISIONING_UPDATES', 'archive script');
  expectIncludes(exportScript, '-exportArchive', 'export script');
  expectIncludes(exportScript, 'LOOM_APPLE_TEAM_ID', 'export script');
  expectIncludes(exportScript, 'ExportOptions-AppStore.plist', 'export script');
  expectIncludes(exportOptions, '<string>app-store-connect</string>', 'ExportOptions-AppStore.plist');
  expectIncludes(exportOptions, '<string>export</string>', 'ExportOptions-AppStore.plist');
  expectIncludes(exportOptions, '<string>automatic</string>', 'ExportOptions-AppStore.plist');
  expectMatch(exportOptions, /<key>manageAppVersionAndBuildNumber<\/key>\s*<false\/>/, 'ExportOptions-AppStore.plist');
  expectMatch(exportOptions, /<key>stripSwiftSymbols<\/key>\s*<true\/>/, 'ExportOptions-AppStore.plist');
}

function checkScreenshots() {
  if (!fs.existsSync(screenshotDir)) {
    fail(`screenshot output is missing: ${path.relative(repoRoot, screenshotDir)}`);
    return;
  }

  const files = fs.readdirSync(screenshotDir)
    .filter((name) => /\.(?:png|jpe?g)$/i.test(name))
    .sort();
  const expected = expectedScreenshots.join(', ');
  const actual = files.join(', ');
  if (actual !== expected) {
    fail(`screenshots must be exactly ${expected}; got ${actual || '(none)'}`);
  }

  for (const name of expectedScreenshots) {
    const file = path.join(screenshotDir, name);
    if (!fs.existsSync(file)) continue;
    const buffer = fs.readFileSync(file);
    if (buffer.length < minScreenshotBytes) {
      fail(`${name} appears blank or under-rendered: ${buffer.length} bytes < ${minScreenshotBytes}`);
    }
    if (buffer.length > maxScreenshotBytes) {
      fail(`${name} is too large: ${buffer.length} bytes > ${maxScreenshotBytes}`);
    }
    try {
      const { width, height } = jpegSize(buffer);
      if (width !== expectedWidth || height !== expectedHeight) {
        fail(`${name} must be ${expectedWidth}x${expectedHeight}; got ${width}x${height}`);
      }
    } catch (err) {
      fail(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function checkNoFinderDuplicateFiles(relativeDir) {
  const dir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(dir)) return;
  const duplicates = fs.readdirSync(dir)
    .filter((name) => /\s[0-9]+\.[^.]+$/.test(name))
    .sort();
  for (const duplicate of duplicates) {
    fail(`${relativeDir} contains Finder duplicate artifact: ${duplicate}`);
  }
}

function checkMacStoreConfig() {
  const project = read('macos-app/Loom/project.yml');
  const infoPlist = read('macos-app/Loom/Info.plist');
  const xcodeProject = read('macos-app/Loom/Loom.xcodeproj/project.pbxproj');
  const entitlements = read('macos-app/Loom/Loom.entitlements');
  const privacyManifest = read('macos-app/Loom/Resources/PrivacyInfo.xcprivacy');
  const privacyPage = read('public/privacy.html');
  const supportPage = read('public/support.html');

  expectIncludes(project, 'PRODUCT_BUNDLE_IDENTIFIER: com.yinyiping.loom', 'project.yml');
  expectIncludes(project, 'MARKETING_VERSION: "1.0.0"', 'project.yml');
  expectIncludes(project, 'CURRENT_PROJECT_VERSION: "1"', 'project.yml');
  expectIncludes(project, 'ENABLE_HARDENED_RUNTIME: YES', 'project.yml');
  expectIncludes(project, 'INFOPLIST_KEY_LSApplicationCategoryType: "public.app-category.education"', 'project.yml');
  expectIncludes(project, 'INFOPLIST_KEY_LSApplicationSecondaryCategoryType: "public.app-category.reference"', 'project.yml');
  expectIncludes(xcodeProject, 'CODE_SIGN_ENTITLEMENTS = Loom.entitlements;', 'generated Xcode project');
  expectIncludes(xcodeProject, 'ENABLE_HARDENED_RUNTIME = YES;', 'generated Xcode project');
  expectMatch(infoPlist, /<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/, 'Info.plist');
  expectMatch(infoPlist, /<key>CFBundleVersion<\/key>\s*<string>\$\(CURRENT_PROJECT_VERSION\)<\/string>/, 'Info.plist');
  expectMatch(infoPlist, /<key>LSApplicationCategoryType<\/key>\s*<string>public\.app-category\.education<\/string>/, 'Info.plist');
  expectMatch(project, /com\.apple\.security\.app-sandbox:\s*true/, 'project.yml entitlements');
  expectMatch(project, /com\.apple\.security\.network\.client:\s*true/, 'project.yml entitlements');
  expectNoMatch(project, /com\.apple\.security\.network\.server:\s*true/, 'project.yml entitlements');

  expectMatch(entitlements, /<key>com\.apple\.security\.app-sandbox<\/key>\s*<true\/>/, 'Loom.entitlements');
  expectMatch(entitlements, /<key>com\.apple\.security\.network\.client<\/key>\s*<true\/>/, 'Loom.entitlements');
  expectMatch(entitlements, /<key>com\.apple\.security\.files\.user-selected\.read-write<\/key>\s*<true\/>/, 'Loom.entitlements');
  expectNoMatch(entitlements, /com\.apple\.security\.network\.server/, 'Loom.entitlements');
  expectNoMatch(entitlements, /com\.apple\.security\.get-task-allow/, 'Loom.entitlements');

  expectMatch(privacyManifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/, 'PrivacyInfo.xcprivacy');
  expectIncludes(privacyManifest, 'NSPrivacyAccessedAPICategoryUserDefaults', 'PrivacyInfo.xcprivacy');
  expectIncludes(privacyManifest, 'NSPrivacyAccessedAPICategoryFileTimestamp', 'PrivacyInfo.xcprivacy');
  expectIncludes(privacyManifest, 'NSPrivacyCollectedDataTypeOtherUserContent', 'PrivacyInfo.xcprivacy');

  expectIncludes(privacyPage, 'com.yinyiping.loom', 'public privacy page');
  expectIncludes(privacyPage, 'Last updated 2026-04-24', 'public privacy page');
  expectIncludes(privacyPage, 'There is no Loom analytics service', 'public privacy page');
  expectIncludes(privacyPage, '/support.html', 'public privacy page');

  expectIncludes(supportPage, 'Loom Support', 'public support page');
  expectIncludes(supportPage, 'com.yinyiping.loom', 'public support page');
  expectIncludes(supportPage, 'https://github.com/Yiping-Yin/Wiki/issues', 'public support page');
  expectIncludes(supportPage, '/privacy.html', 'public support page');
  expectIncludes(supportPage, 'Last updated 2026-04-24', 'public support page');

  checkNoFinderDuplicateFiles('macos-app/Loom/Assets.xcassets/AppIcon.appiconset');
}

checkPackageScripts();
checkArchiveExportFlow();
checkAppStoreCopy();
checkScreenshots();
checkMacStoreConfig();

if (failures.length > 0) {
  console.error(`App Store preflight failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`OK: App Store preflight passed with ${expectedScreenshots.length} JPEG screenshots at ${expectedWidth}x${expectedHeight}.`);
