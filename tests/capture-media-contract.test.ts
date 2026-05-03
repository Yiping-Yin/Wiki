import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('capture renderer uses provider iframe embeds with source fallbacks', () => {
  const source = read('app/loom-render/capture/page.tsx');

  assert.match(source, /renderProviderVideoCard/);
  assert.match(source, /providerEmbedURL/);
  assert.match(source, /providerThumbnailURL/);
  assert.match(source, /https:\/\/i\.ytimg\.com\/vi/);
  assert.match(source, /data-provider-thumb="true"/);
  // Tier 2 (2026-05-02): provider iframes are click-to-load — they
  // do NOT mount on page-load. The legacy direct-iframe path was
  // retired because YouTube error pages can call parent.scrollTo
  // via allow-same-origin during silent page load. The thumbnail
  // button + click-to-load handler replaces it; AstProviderEmbedBlock
  // mounts the iframe in React only after user click.
  assert.match(source, /const iframeFrame = ''/);
  assert.match(source, /const frame = iframeFrame \|\| thumbnailFallback/);
  assert.doesNotMatch(source, /const frame = thumb\s*\?/);
  assert.match(source, /loom-embed-card video embedded/);
  assert.match(source, /loom-provider-embed-frame/);
  assert.match(source, /loom-provider-embed/);
  assert.match(source, /allowFullScreen|allowfullscreen/);
  assert.match(source, /strict-origin-when-cross-origin/);
  assert.match(source, /sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"/);
  assert.match(source, /loom-embed-card-link::after/);
  assert.match(source, /content: none !important/);
  assert.match(source, /loom-media-fallback video/);
  // Two-mode messaging for canvas-recording downgrades: distinguishes
  // "the recording itself failed" (kept the legacy "Animation
  // unavailable" kicker) from "the save pipeline lost the file"
  // (transient `loom://media/...` persisted into body — surfaces a
  // recoverable Re-capture CTA so the user has an action). V7 fix.
  assert.match(source, /Animation unavailable/);
  assert.match(source, /Recording was not saved/);
  assert.match(source, /Use the Re-capture button at the top of this page to retry/);
  assert.match(source, /Re-capture to save playable media/);
  assert.match(source, /max-width: min\(100%, 48rem\)/);
  assert.match(source, /loom-media-fallback\.video\.compact/);
  assert.match(source, /MIN_PLAYABLE_CANVAS_BYTES = 2 \* 1024/);
  assert.match(source, /AbortController/);
  assert.match(source, /blob\.size < MIN_PLAYABLE_CANVAS_BYTES/);
  assert.match(source, /requiresVerifiedCanvas/);
  assert.match(source, /dataset\.loomCanvasProbe = 'pending'/);
  assert.match(source, /video\.style\.visibility = 'hidden'/);
  assert.match(source, /recording is empty/);
  assert.match(source, /recording could not be verified/);
  assert.doesNotMatch(source, /controller\.signal\.aborted \|\| !video\.isConnected \|\| video\.readyState > 0/);
  assert.match(source, /youtube-nocookie\.com\/embed/);
  assert.match(source, /player\.vimeo\.com\/video/);
  assert.match(source, /player\.bilibili\.com\/player\.html/);
  assert.match(source, /const EXTENSION_RESOURCE_HINT = 'macos-app\/Loom\/LoomWebExtension\/Resources'/);
  assert.match(source, /const \[recaptureModalOpen, setRecaptureModalOpen\] = useState\(false\)/);
  assert.match(source, /const onReCapture = \(\) =>/);
  assert.match(source, /onClick=\{onReCapture\}/);
  assert.match(source, /Loading the parent LoomWebExtension folder will fail because manifest\.json is inside Resources/);
  assert.match(source, /Copy extension path/);
  assert.match(source, /className="primary" onClick=\{onOpenSource\}/);
});

test('capture renderer plays saved canvas video files directly and keeps blob hydration for legacy bins', () => {
  const source = read('app/loom-render/capture/page.tsx');

  assert.ok(
    source.includes("const isSavedVideoFile = /\\.(webm|mp4|m4v|mov)(?:[?#]|$)/i.test(src);"),
    'saved canvas recordings must detect durable video sidecars by extension',
  );
  assert.match(source, /video\.src = src/);
  assert.match(source, /if \(isSavedVideoFile\) \{/);
  assert.match(source, /return/);
  assert.ok(
    source.indexOf('video.src = src') < source.indexOf('fetch(src'),
    'saved video sidecars must use direct loom:// playback before the legacy fetch/blob path',
  );
  assert.match(source, /const mediaObjectUrls: string\[\] = \[\]/);
  assert.match(source, /URL\.createObjectURL\(blob\)/);
  assert.match(source, /video\.src = objectUrl/);
  assert.match(source, /video\.autoplay = true/);
  assert.match(source, /video\.muted = true/);
  assert.match(source, /video\.loop = true/);
  assert.match(source, /video\.playsInline = true/);
  assert.match(source, /void video\.play\(\)\.catch/);
  assert.match(source, /mediaObjectUrls\.forEach\(\(url\) => URL\.revokeObjectURL\(url\)\)/);
});

test('CaptureAST video blocks preserve canvas recording semantics when regenerated', () => {
  const source = read('app/loom-render/capture/page.tsx');

  assert.match(source, /function canvasRecordingVideoAttrs\(block: CaptureAstBlock\): string/);
  assert.match(source, /data-canvas-id/);
  assert.match(source, /data-loom-capture-kind="canvas"/);
  assert.match(source, /autoplay muted loop playsinline/);
  assert.match(source, /canvasRecordingVideoAttrs\(block\)/);
});

test('web capture stages direct animated images and videos as media sidecars', () => {
  const source = read('macos-app/Loom/LoomWebExtension/Resources/content.js');
  const pickFromImgStart = source.indexOf('function pickFromImg');
  const animatedSrcStart = source.indexOf('const animatedSrc', pickFromImgStart);
  const srcsetStart = source.indexOf('const srcset', pickFromImgStart);

  assert.match(source, /const pendingRemoteMedia = new Map\(\)/);
  assert.match(source, /function stageRemoteMedia/);
  assert.match(source, /async function fetchPendingRemoteMedia/);
  assert.match(source, /function canvasLooksVisuallyBlank/);
  assert.match(source, /function canvasShouldForceRecording/);
  assert.match(source, /const forceRecording = canvasShouldForceRecording\(node\)/);
  assert.match(source, /if \(!forceRecording && canvasLooksVisuallyBlank\(node\)\) \{/);
  assert.match(source, /queueElementScreenshot\(node, out, 'canvas', elementScreenshotAlt\(node, 'canvas'\)\)/);
  assert.match(source, /setLabel\('\.\.\.'\)/);
  assert.match(source, /node\.currentSrc/);
  assert.match(source, /data-gifsrc/);
  assert.match(source, /const animatedSrc =\s*[\s\S]*data-gifsrc[\s\S]*data-animated-src[\s\S]*if \(animatedSrc\) return absUrl\(animatedSrc\)/);
  assert.ok(pickFromImgStart >= 0);
  assert.ok(animatedSrcStart > pickFromImgStart);
  assert.ok(srcsetStart > animatedSrcStart);
  assert.match(source, /function providerFromElement/);
  assert.match(source, /tag === 'lite-youtube'/);
  assert.match(source, /emitProviderEmbed\(out, provider, href/);
  assert.match(source, /data-youtube-id/);
  assert.match(source, /image\/gif/);
  assert.match(source, /video\/mp4;codecs=avc1\.42E01E/);
  assert.match(source, /video\/webm/);
  assert.ok(
    source.indexOf("'video/mp4;codecs=avc1.42E01E'") < source.indexOf("'video/webm;codecs=vp9'"),
    'canvas recordings must prefer Reader-playable H.264 MP4 before VP9 WebM',
  );
  assert.match(source, /video-source/);
  assert.match(source, /RECORDING_MAX_BYTES = 2 \* 1024 \* 1024/);
  assert.match(source, /RECORDING_MIN_BYTES = 2 \* 1024/);
  assert.match(source, /RECORDING_MIN_CANVAS_AREA = 2048/);
  assert.match(source, /blob\.size < RECORDING_MIN_BYTES/);
  assert.match(source, /function canvasIsTooSmallToRecord/);
  assert.match(source, /data-loom-force-recording/);
  assert.match(source, /if \(!forceRecording && canvasIsTooSmallToRecord\(node\)\)/);
  assert.doesNotMatch(source, /if \(sel\) return sel/);
  assert.match(source, /phase === 'media'/);
  assert.match(source, /saving', progress\.count, 'remote media attachment/);
});

test('canvas recording selects MIME by constructing MediaRecorder, not support probes alone', () => {
  const source = read('macos-app/Loom/LoomWebExtension/Resources/content.js');
  const helperStart = source.indexOf('function createCanvasMediaRecorder');
  const recordStart = source.indexOf('function recordCanvas');

  assert.ok(helperStart >= 0, 'canvas recorder factory must exist');
  assert.ok(recordStart > helperStart, 'recordCanvas must use the recorder factory');
  assert.match(source, /function canvasRecorderCandidates\(\)/);
  assert.match(source, /function createCanvasMediaRecorder\(stream\)/);
  assert.match(source, /for \(const requestedMime of canvasRecorderCandidates\(\)\)/);
  assert.match(source, /new MediaRecorder\(stream, \{/);
  assert.match(source, /actualMime: recorder\.mimeType \|\| requestedMime/);
  assert.match(source, /canvas recorder mime selected/);
  assert.match(source, /canvas recorder mime rejected/);
  assert.match(source, /canvas recorder using browser default MIME/);
  assert.doesNotMatch(source, /const mime = pickRecorderMime\(\);\s*if \(!mime\) return settle\(null\);\s*const recorder = new MediaRecorder\(stream, \{/);
});

test('native capture refuses malformed clipboard and empty web payloads', () => {
  const captureSheet = read('macos-app/Loom/Sources/CaptureSheet.swift');
  const rootView = read('macos-app/Loom/Sources/LoomMinimalRootView.swift');

  assert.match(captureSheet, /var hasSubstantiveCaptureContent: Bool/);
  assert.match(captureSheet, /Pasteboard handoff: decodeJSON failed; refusing fallback for clipboard transport/);
  assert.doesNotMatch(captureSheet, /falling through to URL strategies/);
  assert.match(captureSheet, /case emptyCapture/);
  assert.match(captureSheet, /static func hasSubstantiveContent\(_ payload: CapturePayload\) -> Bool/);
  assert.match(captureSheet, /guard hasSubstantiveContent\(payload\) else \{\s*throw Failure\.emptyCapture\s*\}/);
  assert.match(captureSheet, /guard !entry\.trimmingCharacters\(in: \.whitespacesAndNewlines\)\.isEmpty else \{\s*throw Failure\.emptyCapture\s*\}/);
  assert.match(rootView, /guard payload\.hasSubstantiveCaptureContent else/);
  assert.match(rootView, /Capture payload was empty\. Re-capture from the page\./);
});

test('web capture waits for dynamic canvas paint before readback and recording', () => {
  const source = read('macos-app/Loom/LoomWebExtension/Resources/content.js');
  const payloadStart = source.indexOf('async function capturePagePayload');
  const extractStart = source.indexOf('let body = extractMainContent()', payloadStart);
  const settleBeforeExtract = source.lastIndexOf('await waitForDynamicCanvasPaint(ctrl)', extractStart);
  const recordingStart = source.indexOf('const recordings = await recordPendingCanvases(ctrl)', extractStart);
  const settleBeforeRecording = source.lastIndexOf('await waitForDynamicCanvasPaint(ctrl)', recordingStart);
  const visibleTabStart = source.indexOf('async function captureVisibleTabElementScreenshot');
  const sendMessageStart = source.indexOf("type: 'capture-visible-tab'", visibleTabStart);
  const settleBeforeVisibleTab = source.lastIndexOf('await waitForDynamicCanvasPaint(ctrl, node)', sendMessageStart);

  assert.match(source, /const CANVAS_CAPTURE_SETTLE_MS = 500/);
  assert.match(source, /async function waitForDynamicCanvasPaint\(ctrl, node\)/);
  assert.match(source, /await waitForPaintFrame\(\)/);
  assert.match(source, /setTimeout\(resolve, CANVAS_CAPTURE_SETTLE_MS\)/);
  assert.match(source, /function nodeHasCanvas\(node\)/);
  assert.ok(settleBeforeExtract > payloadStart, 'reader extraction must wait for page canvases before sync readback');
  assert.ok(settleBeforeRecording > extractStart, 'canvas recording must wait after extraction before captureStream');
  assert.ok(settleBeforeVisibleTab > visibleTabStart, 'visible-tab element screenshots must wait after scrolling the element into view');
});

test('web capture defaults to rich reader plus interactive snapshot evidence', () => {
  const source = read('macos-app/Loom/LoomWebExtension/Resources/content.js');

  assert.match(source, /async function captureReaderWithSnapshotPayload\(onProgress, preserveJS = true, ctrl\)/);
  assert.match(source, /const payload = await captureReaderWithSnapshotPayload\(undefined\)/);
  assert.match(source, /click = Reader \+ Snapshot \(dynamic evidence\)/);
  assert.match(source, /plain L\s+→ Reader \+ interactive Snapshot/);
  assert.match(source, /shift\+L\s+→ Reader \+ static Snapshot/);
  assert.match(source, /cmd\+L \(or ctrl\)\s+→ Reader \+ Snapshot\+JS/);
  assert.match(source, /const wantsSnapshotJS = !!\(e && \(e\.metaKey \|\| e\.ctrlKey\)\)/);
  assert.match(source, /const wantsStaticSnapshot = !!\(e && e\.shiftKey && !wantsSnapshotJS\)/);
  assert.match(source, /const preserveSnapshotJS = !wantsStaticSnapshot/);
  assert.match(source, /await captureReaderWithSnapshotPayload\(onProgress, preserveSnapshotJS, ctrl\)/);
  assert.match(source, /root\.setAttribute\('data-preserve-js', 'true'\)/);
  assert.match(source, /root\.setAttribute\('data-loom-snapshot-mode', 'interactive'\)/);
});

test('reader embeds snapshot-backed visual blocks only when per-resource anchors exist', () => {
  const source = read('app/loom-render/capture/page.tsx');
  const snapshotPage = read('app/loom-render/snapshot/page.tsx');

  assert.match(source, /const SNAPSHOT_BACKED_KINDS = \['canvas', 'composite-media', 'structured-visual', 'svg'\]/);
  assert.match(source, /function annotateSnapshotBackedMedia\(html: string, snapshotHref: string\): string/);
  assert.match(source, /function markSnapshotPreviewMedia\(mediaTag: string\): string/);
  assert.match(source, /function snapshotTargetFromMediaTag\(tag: string\): string/);
  assert.match(source, /function targetedSnapshotHref\(snapshotHref: string, snapshotTarget: string\): string/);
  assert.match(source, /loom-interactive-snapshot/);
  assert.match(source, /data-loom-interactive-snapshot="true"/);
  assert.match(source, /data-loom-snapshot-target=/);
  // 2026-05-03 reader-native interactive snapshot embed. Known
  // interactive visual assemblies mount directly in the reader as a
  // targeted snapshot iframe, while ordinary/static visual captures
  // stay as preview media with a secondary snapshot link.
  assert.match(source, /function shouldInlineSnapshotRegion\(mediaTag: string\): boolean/);
  assert.match(source, /function shouldInlineSnapshotRegionMeta\(kind: string, label: string\): boolean/);
  assert.match(source, /data-loom-interactive-snapshot-mode="inline-target"/);
  assert.match(source, /loom-inline-snapshot-frame/);
  assert.match(source, /data-loom-snapshot-loaded="inline"/);
  assert.match(source, /loom:snapshot-wheel/);
  assert.match(source, /window\.scrollBy/);
  assert.match(source, /mode === 1 \? 16/);
  assert.match(source, /data-loom-interactive-snapshot-mode="preview-link"/);
  assert.doesNotMatch(source, /class="loom-snapshot-load"/);
  assert.doesNotMatch(source, /data-loom-snapshot-href=/);
  assert.match(snapshotPage, /const snapshotSandbox = snapshotPreservesJS/);
  assert.match(source, /url\.searchParams\.set\('embed', '1'\)/);
  assert.match(source, /url\.searchParams\.set\('target', snapshotTarget\)/);
  assert.match(source, /const inlineRegion = !!liveHref && shouldInlineSnapshotRegion\(mediaTag\)/);
  assert.match(source, /const videoOnlyParagraph = new RegExp/);
  assert.match(source, /const bareVideo = new RegExp/);
  assert.match(source, /<video\\\\b/);
  assert.match(source, /data-loom-snapshot-preview-media/);
  assert.match(source, /Snapshot preview/);
  assert.match(source, /Open interactive snapshot/);
  assert.match(source, /data-loom-interactive-snapshot-mode="preview-link"/);
  assert.match(source, /data-loom-capture-kind/);
  assert.match(source, /snapshotHref/);
  assert.doesNotMatch(source, /Static still frame/);
  assert.doesNotMatch(source, /annotateStaticStillFrames/);
  assert.match(source, /function ArticleBodyWithImages\(\{ source, snapshotHref = '' \}/);
  assert.match(source, /function CaptureAstArticle\(\{ ast, fallbackSource, snapshotHref = '' \}/);
  // Tier 2 (2026-05-02): ArticleBodyWithImages is now the markdown
  // fallback path inside CaptureAstArticle (used when AST blocks
  // are absent) plus the per-prose-block renderer inside
  // AstProseBlock. Either invocation site satisfies the contract
  // that snapshotHref is forwarded.
  assert.match(source, /<ArticleBodyWithImages source=\{[\w$]+\} snapshotHref=\{snapshotHref\} \/>/);
});

test('web capture assigns stable snapshot targets to visual regions and carries them through CaptureAST', () => {
  const extensionScript = read('macos-app/Loom/LoomWebExtension/Resources/content.js');
  const captureSheet = read('macos-app/Loom/Sources/CaptureSheet.swift');
  const capturePage = read('app/loom-render/capture/page.tsx');

  assert.match(extensionScript, /let snapshotTargetSeq = 0/);
  assert.match(extensionScript, /function ensureSnapshotTarget\(node, kind\)/);
  assert.match(extensionScript, /data-loom-snapshot-target/);
  assert.match(extensionScript, /ensureSnapshotTarget\(node, 'svg'\)/);
  assert.match(extensionScript, /ensureSnapshotTarget\(node, 'canvas'\)/);
  assert.match(extensionScript, /const snapshotTarget = ensureSnapshotTarget\(node, kind\)/);
  assert.match(extensionScript, /pendingElementScreenshots\.set\(id, \{ node, kind, alt: alt \|\| elementScreenshotAlt\(node, kind\), snapshotTarget \}\)/);
  assert.match(extensionScript, /pendingCanvasRecordings\.set\(id, \{ node, snapshotTarget \}\)/);
  assert.match(extensionScript, /data-loom-snapshot-target="\$\{escapeAttr\(snapshotTarget\)\}"/);
  assert.match(extensionScript, /function snapshotTargetFromMarkup\(text\)/);
  assert.match(extensionScript, /const snapshotTarget = snapshotTargetFromMarkup\(text\)/);
  assert.match(extensionScript, /function withSnapshotTarget\(block, snapshotTarget\)/);
  assert.match(extensionScript, /withSnapshotTarget\(\{ kind: 'visualAssembly'/);

  assert.match(captureSheet, /struct CaptureASTBlock: Codable/);
  assert.match(captureSheet, /var snapshotTarget: String\?/);

  assert.match(capturePage, /interface CaptureAstBlock/);
  assert.match(capturePage, /snapshotTarget\?: string/);
  assert.match(capturePage, /data-loom-snapshot-target/);
});

test('capture AST preserves snapshot-backed visual image roles before generic images', () => {
  const extensionScript = read('macos-app/Loom/LoomWebExtension/Resources/content.js');
  const capturePage = read('app/loom-render/capture/page.tsx');

  const parserStart = extensionScript.indexOf('function mediaBlockFromMarkdown');
  const roleBranch = extensionScript.indexOf("data-loom-capture-kind", parserStart);
  const genericImageBranch = extensionScript.indexOf('const imgMatch =', parserStart);

  assert.ok(parserStart >= 0, 'mediaBlockFromMarkdown must exist');
  assert.ok(roleBranch > parserStart, 'snapshot-backed visual role branch must exist');
  assert.ok(genericImageBranch > parserStart, 'generic image branch must exist');
  assert.ok(
    roleBranch < genericImageBranch,
    'snapshot-backed visual images must be classified before the generic image branch'
  );

  assert.match(capturePage, /block\.kind === 'visualAssembly'/);
  assert.match(capturePage, /data-loom-capture-kind="\$\{escapeAttr\(block\.mediaRole \|\| 'structured-visual'\)\}"/);
});

test('snapshot route supports targeted embed mode without rendering the whole page inline', () => {
  const snapshotPage = read('app/loom-render/snapshot/page.tsx');

  assert.match(snapshotPage, /const target = params\.get\('target'\) \|\| ''/);
  assert.match(snapshotPage, /const targetEmbedMode = embedMode && target\.length > 0/);
  assert.match(snapshotPage, /function buildTargetedSnapshotSrcDoc\(html: string, target: string\)/);
  assert.match(snapshotPage, /data-loom-snapshot-target/);
  assert.match(snapshotPage, /const LOOM_RESTORABLE_HOVER_STATES/);
  assert.match(snapshotPage, /frame-active/);
  assert.match(snapshotPage, /board-active/);
  assert.match(snapshotPage, /power-active/);
  assert.match(snapshotPage, /data-active/);
  assert.match(snapshotPage, /function isolateTargetDocument\(node\)/);
  assert.match(snapshotPage, /data-loom-target-stage/);
  assert.match(snapshotPage, /data-loom-target-content/);
  assert.match(snapshotPage, /position: absolute !important/);
  assert.match(snapshotPage, /closest\('astro-island'\)/);
  assert.match(snapshotPage, /function setRestorableHoverState\(root, className\)/);
  assert.match(snapshotPage, /function alignTargetContent\(stage\)/);
  assert.match(snapshotPage, /function installWheelProxy\(\)/);
  assert.match(snapshotPage, /window\.addEventListener\('wheel'/);
  assert.match(snapshotPage, /event\.preventDefault\(\)/);
  assert.match(snapshotPage, /type: 'loom:snapshot-wheel'/);
  assert.match(snapshotPage, /lastReportedHeight/);
  assert.match(snapshotPage, /snapshotHeightRef/);
  assert.match(snapshotPage, /data-loom-state-controls/);
  assert.match(snapshotPage, /data-loom-snapshot-target-active/);
  assert.match(snapshotPage, /document\.documentElement\.classList\.add\('loom-target-mode'\)/);
  assert.match(snapshotPage, /document\.body\.classList\.add\('loom-target-mode'\)/);
  assert.match(snapshotPage, /isolateTargetDocument\(node\)/);
  assert.match(snapshotPage, /window\.setTimeout\(applyTargetMode, 120\)/);
  assert.match(snapshotPage, /window\.setTimeout\(applyTargetMode, 700\)/);
  assert.match(snapshotPage, /const snapshotSrcDoc = useMemo/);
  assert.match(snapshotPage, /srcDoc=\{snapshotSrcDoc\}/);
  assert.match(snapshotPage, /target-mode/);
  assert.doesNotMatch(snapshotPage, /srcDoc=\{payload\.html \|\| ''\}/);
  assert.doesNotMatch(snapshotPage, /data-loom-target-hidden-sibling/);
  assert.doesNotMatch(snapshotPage, /pointer-events: none !important/);
});

test('web capture setup points users at the manifest-owning extension folder', () => {
  const capturesView = read('macos-app/Loom/Sources/CapturesView.swift');

  assert.match(capturesView, /private var extensionResourcesPath: String/);
  assert.match(capturesView, /LoomWebExtension\.appex/);
  assert.match(capturesView, /appendingPathComponent\("Resources"\)/);
  assert.match(capturesView, /manifest\.json/);
  assert.match(capturesView, /extensionInstallCard/);
  assert.match(capturesView, /Do not choose the parent LoomWebExtension folder/);
  assert.match(capturesView, /The bookmarklet is a fallback, not the rich-media path/);
});

test('web capture preserves class-styled inline SVG presentation', () => {
  const source = read('macos-app/Loom/LoomWebExtension/Resources/content.js');

  assert.match(source, /const SVG_PRESENTATION_PROPS = \[/);
  assert.match(source, /function inlineSvgPresentationStyles\(source, clone\)/);
  assert.match(source, /window\.getComputedStyle\(sourceEl\)/);
  assert.match(source, /cloneEl\.setAttribute\(prop, value\)/);
  assert.match(source, /fill-opacity/);
  assert.match(source, /stroke-width/);
  assert.match(source, /font-family/);
  assert.match(source, /function svgIsSelfContainedForReader\(clone\)/);
  assert.match(source, /svgHasEmbeddedStyleForClass\(clone\)/);
  assert.match(source, /const SVG_LAYOUT_STYLE_PROPS = new Set/);
  assert.match(source, /function stripSvgReaderLayout\(source, clone\)/);
  assert.match(source, /height:96%/);
  assert.match(source, /data-loom-inline-svg/);
  assert.match(source, /inlineSvgPresentationStyles\(node, cloned\)/);
  assert.match(source, /stripSvgReaderLayout\(node, cloned\)/);
  assert.match(source, /html\.length > 40000/);
  assert.match(source, /!svgIsSelfContainedForReader\(cloned\)/);
  assert.match(source, /captureElementScreenshot\(node, out, 'svg'\)/);
});

test('web capture preserves composite SVG and canvas visual blocks as one resource', () => {
  const source = read('macos-app/Loom/LoomWebExtension/Resources/content.js');

  assert.match(source, /const pendingElementScreenshots = new Map\(\)/);
  assert.match(source, /function shouldWalkLiveDOMForMedia\(root\)/);
  assert.match(source, /if \(shouldWalkLiveDOMForMedia\(semantic\)\) \{\s*return htmlToMarkdown\(semantic\);/);
  assert.match(source, /async function preparePageForCapture\(ctrl\)/);
  assert.match(source, /await preparePageForCapture\(ctrl\)/);
  assert.match(source, /function isCompositeMediaBlock\(node\)/);
  assert.match(source, /function queueElementScreenshot\(node, out, kind, alt\)/);
  assert.match(source, /function cloneElementForScreenshot\(source\)/);
  assert.match(source, /function inlineComputedStylesForScreenshot\(source, clone\)/);
  assert.match(source, /function replaceCloneCanvasesWithImages\(source, clone\)/);
  assert.match(source, /\.\.\.\(\(source\.tagName \|\| ''\)\.toLowerCase\(\) === 'canvas' \? \[source\] : \[\]\)/);
  assert.match(source, /\.\.\.\(\(clone\.tagName \|\| ''\)\.toLowerCase\(\) === 'canvas' \? \[clone\] : \[\]\)/);
  assert.match(source, /function captureVisibleTabElementScreenshot\(node, kind, alt, ctrl\)/);
  assert.match(source, /type: 'capture-visible-tab'/);
  assert.match(source, /data-loom-capture-source="visible-tab"/);
  assert.match(source, /function stageDataURLMedia\(dataUrl, role, mimeFallback\)/);
  assert.match(source, /role: role \|\| 'element-screenshot'/);
  assert.match(source, /const stagedSrc = stageDataURLMedia\(dataUrl, `\$\{kind\}-screenshot`, 'image\/jpeg'\)/);
  assert.match(source, /function captureElementScreenshotAsync\(node, kind, alt, ctrl\)/);
  assert.match(source, /function capturePendingElementScreenshots\(ctrl\)/);
  assert.match(source, /function applyElementScreenshots\(body, screenshots\)/);
  assert.match(source, /handleCompositeMediaBlock\(node, out\)/);
  assert.match(source, /isCompositeMediaBlock\(node\)/);
  assert.match(source, /parentRect\.width >= 240/);
  assert.match(source, /parentRect\.height >= 120/);
  assert.match(source, /clone\.setAttribute\("data-loom-capture-kind", "composite-media"\)/);
  assert.match(source, /phase: 'element-screenshots'/);
  assert.match(source, /applyElementScreenshots\(body, elementScreenshots\)/);
  assert.match(source, /stageDataURLMedia\(dataUrl, `\$\{kind\}-screenshot`, 'image\/jpeg'\)/);
  assert.doesNotMatch(source, /\*\[\$\{kind\} screenshot too large — view at source URL\]\*/);

  const background = read('macos-app/Loom/LoomWebExtension/Resources/background.js');
  assert.match(background, /captureVisibleTabDataURL/);
  assert.match(background, /captureVisibleTab/);
  assert.match(background, /const usePromiseCapture = typeof browser !== 'undefined'/);
  assert.match(background, /if \(usePromiseCapture\) \{/);
  assert.doesNotMatch(background, /const result = [\s\S]*captureVisibleTab[\s\S]*if \(result && typeof result\.then/);
  assert.match(background, /message\.type === 'capture-visible-tab'/);
});

test('media sidecar rewrites also update CaptureAST before reader render', () => {
  const captureSheet = read('macos-app/Loom/Sources/CaptureSheet.swift');
  const capturePage = read('app/loom-render/capture/page.tsx');

  assert.match(captureSheet, /payload\.captureAST = applyMediaSubstitutions\(to: payload\.captureAST, map: substitutions\)/);
  assert.match(captureSheet, /private static func applyMediaSubstitutions\(\s*to ast: CaptureAST\?,\s*map: \[String: String\]\s*\) -> CaptureAST\?/);
  assert.match(captureSheet, /copy\.markdown = applyMediaSubstitutions\(markdown, map: map\)/);
  assert.match(captureSheet, /copy\.url = applyMediaSubstitutions\(url, map: map\)/);

  assert.match(capturePage, /function hasUnresolvedMediaPlaceholder\(source: string\): boolean/);
  assert.match(capturePage, /\/\\bloom:\\\/\\\/media\\\/\[A-Za-z0-9_-\]\+\/\.test\(source\)/);
  assert.match(capturePage, /if \(rendered && !hasUnresolvedMediaPlaceholder\(rendered\)\) return rendered/);
  assert.match(capturePage, /return fallbackSource/);
});

test('web capture preserves section labels and CSS-driven visual modules', () => {
  const source = read('macos-app/Loom/LoomWebExtension/Resources/content.js');
  const renderer = read('app/loom-render/capture/page.tsx');

  assert.match(source, /function readableNodeText\(node\)/);
  assert.match(source, /querySelectorAll\('style, script, template, noscript'\)/);
  assert.match(source, /querySelectorAll\('input, textarea'\)/);
  assert.match(source, /function visualBlockLabel\(node, allowFallback = true\)/);
  assert.match(source, /function isHeadingTag\(tag\)/);
  assert.match(source, /function emitHeading\(node, out\)/);
  assert.match(source, /function containsSemanticHeading\(node\)/);
  assert.match(source, /if \(containsSemanticHeading\(node\)\) return false/);
  assert.match(source, /heading\.parentElement === node \|\| tag === 'section'/);
  assert.match(source, /heading\.closest && heading\.closest\('figure, figcaption'\)/);
  assert.match(source, /function visualCaptureNode\(node\)/);
  assert.match(source, /function emitVisualBlockLabel\(node, out\)/);
  assert.match(source, /function isStandaloneVisualLabel\(node\)/);
  assert.match(source, /node\.matches\('\.uppercase, \[class\*="uppercase"\], \[class\*="tracking"\]'\)/);
  assert.match(source, /loom-capture-eyebrow/);
  assert.match(source, /function isStructuredVisualBlock\(node\)/);
  assert.match(source, /astro-island/);
  assert.match(source, /const captureNode = visualCaptureNode\(node\)/);
  assert.match(source, /const looksLikeAstroCanvas = tag === 'astro-island' && canvasCount >= 1/);
  assert.match(source, /function primaryRecordableCanvasForVisual\(node\)/);
  assert.match(source, /function handleDynamicCanvasVisualBlock\(node, out\)/);
  assert.match(source, /const panelStylingCount =\s*[\s\S]*node\.matches\(panelSelector\)[\s\S]*node\.querySelectorAll\(panelSelector\)\.length/);
  assert.match(source, /const looksLikeLabeledPanel = !!label && panelStylingCount >= 2/);
  assert.match(source, /pixel\\s\+font\\s\+comparison\|font\\s\+comparison/);
  assert.match(source, /function handleStructuredVisualBlock\(node, out\)/);
  assert.match(source, /if \(tag === 'astro-island' && handleDynamicCanvasVisualBlock\(node, out\)\) return/);
  assert.match(source, /ensureSnapshotTarget\(node, 'structured-visual'\)/);
  assert.match(source, /canvas\.setAttribute\('data-loom-snapshot-target', snapshotTarget\)/);
  assert.match(source, /handleCanvas\(canvas, out\)/);
  assert.match(source, /isStructuredVisualBlock\(node\)/);
  assert.match(source, /if \(isHeadingTag\(tag\)\) \{\s*emitHeading\(node, out\);\s*return;\s*\}/);
  assert.match(source, /tag === 'input' \|\| tag === 'textarea'/);
  assert.match(renderer, /\.loom-capture-article h1 \{/);
  assert.match(renderer, /border-top: 0\.5px solid color-mix\(in srgb, var\(--thread\) 36%, var\(--hair\)\)/);
  assert.match(renderer, /\.loom-capture-article \.loom-capture-eyebrow/);
  assert.match(renderer, /letter-spacing: 0\.16em/);
});

test('capture detail and snapshot reader require real snapshot files and keep provider embeds', () => {
  const capturePage = read('app/loom-render/capture/page.tsx');
  const snapshotPage = read('app/loom-render/snapshot/page.tsx');
  const schemeHandler = read('macos-app/Loom/Sources/LoomURLSchemeHandler.swift');

  assert.match(schemeHandler, /newestSnapshotFilename\(in: fileURL\.deletingLastPathComponent\(\)\)/);
  assert.match(schemeHandler, /out\["snapshotFilename"\] = snap/);
  assert.match(capturePage, /snapshotFilename\?: string/);
  assert.match(capturePage, /const hasSnapshot = typeof snapshotFilename === 'string' && snapshotFilename\.length > 0/);
  assert.match(capturePage, /const snapshotHref = useMemo/);
  assert.match(capturePage, /filename: snapshotFilename/);
  assert.match(capturePage, /href=\{snapshotHref\}/);
  assert.match(capturePage, /\{hasSnapshot && \(/);
  assert.doesNotMatch(capturePage, /window\.open\(`loom:\/\/bundle\/loom-render\/snapshot/);
  assert.match(snapshotPage, /const decode = \(s: string \| null\) => s \|\| ''/);
  assert.match(snapshotPage, /const readerHref = useMemo/);
  assert.match(snapshotPage, /const onOpenInReader = useCallback/);
  assert.match(snapshotPage, /window\.location\.href = readerHref/);
  assert.match(snapshotPage, /iframe/);
  assert.match(snapshotPage, /const snapshotPreservesJS = useMemo/);
  assert.match(snapshotPage, /const snapshotSandbox = snapshotPreservesJS/);
  assert.match(snapshotPage, /'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation'/);
  assert.match(snapshotPage, /sandbox=\{snapshotSandbox\}/);
  assert.doesNotMatch(snapshotPage, /sandbox="allow-same-origin allow-scripts"/);
  assert.doesNotMatch(snapshotPage, /function transformReaderMediaMarkers/);
  assert.doesNotMatch(snapshotPage, /renderReaderProviderCard/);
  assert.match(capturePage, /renderProviderVideoCard/);
  assert.match(capturePage, /loom-embed kind="\(youtube\|vimeo\|bilibili\)"/);
  assert.match(capturePage, /providerEmbedURL/);
  assert.match(capturePage, /loom-provider-embed-frame/);
});

test('native media writer preserves playable file extensions and mime types', () => {
  const captureSheet = read('macos-app/Loom/Sources/CaptureSheet.swift');
  const schemeHandler = read('macos-app/Loom/Sources/LoomURLSchemeHandler.swift');

  assert.match(captureSheet, /split\(separator: ";"/);
  assert.match(captureSheet, /case "video\/webm":\s+return "webm"/);
  assert.match(captureSheet, /case "video\/quicktime":\s+return "mov"/);
  assert.match(captureSheet, /func fileExtension\(for data: Data\?\) -> String/);
  assert.match(captureSheet, /sniffedFileExtension\(from: data\)/);
  assert.match(captureSheet, /case "image\/webp":\s+return "webp"/);
  assert.match(schemeHandler, /case "webm":\s+return "video\/webm"/);
  assert.match(schemeHandler, /case "bin":\s*\n\s*if let sniffed = sniffedMimeType\(for: url\)/);
  assert.match(schemeHandler, /case "gif":\s+return "image\/gif"/);
  assert.match(schemeHandler, /case "webp":\s+return "image\/webp"/);
  assert.match(schemeHandler, /resolveManagedContent\(rootID: rootID, rest: rest, fileManager: fileManager\)/);
  assert.match(schemeHandler, /LoomFileStore\.rootURL/);
  assert.match(schemeHandler, /trimmed\.hasPrefix\("sub\/"\)/);
  assert.match(schemeHandler, /"Accept-Ranges": "bytes"/);
  assert.match(schemeHandler, /Self\.byteRange\(from: urlSchemeTask\.request\.value\(forHTTPHeaderField: "Range"\), contentLength: data\.count\)/);
  assert.match(schemeHandler, /statusCode: 206/);
  assert.match(schemeHandler, /headers\["Content-Range"\] = "bytes \\\(range\.start\)-\\\(range\.end\)\/\\\(data\.count\)"/);
  assert.match(schemeHandler, /statusCode: 416/);
  assert.match(schemeHandler, /headers\["Content-Range"\] = "bytes \*\/\\\(data\.count\)"/);
});

test('native capture reader keeps wheel scrolling alive over media-heavy pages', () => {
  const captureWebView = read('macos-app/Loom/Sources/CaptureWebView.swift');

  assert.match(captureWebView, /private var scrollWheelMonitor: Any\?/);
  assert.match(captureWebView, /NSEvent\.addLocalMonitorForEvents\(matching: \.scrollWheel\)/);
  assert.match(captureWebView, /event\.window === window/);
  assert.match(captureWebView, /CaptureWebView\.isCaptureDetailPath\(current\.path\)/);
  assert.match(captureWebView, /event\.modifierFlags\.intersection\(\[\.command, \.control\]\)\.isEmpty/);
  assert.match(captureWebView, /webView\.bounds\.contains\(point\)/);
  assert.match(captureWebView, /abs\(event\.scrollingDeltaY\) >= abs\(event\.scrollingDeltaX\)/);
  assert.match(captureWebView, /guard let scrollView = CaptureWebView\.firstScrollView\(in: webView\) else \{ return event \}/);
  assert.match(captureWebView, /let before = scrollView\.contentView\.bounds\.origin/);
  assert.match(captureWebView, /scrollView\.scrollWheel\(with: event\)/);
  assert.match(captureWebView, /let moved = abs\(after\.x - before\.x\) > 0\.5 \|\| abs\(after\.y - before\.y\) > 0\.5/);
  assert.match(captureWebView, /return moved \? nil : event/);
  assert.match(captureWebView, /NSEvent\.removeMonitor\(scrollWheelMonitor\)/);
  assert.match(captureWebView, /scrollView\.hasVerticalScroller = true/);
  assert.match(captureWebView, /scrollView\.verticalScrollElasticity = \.allowed/);
  assert.match(captureWebView, /attachScrollWheelMonitor\(to: webView\)/);
});

test('reader-mode trimming preserves short technical content and fenced code', () => {
  const captureSheet = read('macos-app/Loom/Sources/CaptureSheet.swift');

  assert.match(captureSheet, /var shouldPreserveWebCaptureStructure: Bool/);
  assert.match(captureSheet, /sourceURL != nil \|\| captureAST != nil \|\| webDiagnostics != nil/);
  assert.match(captureSheet, /splitIntoParagraphs\(_ text: String, keepAllByDefault: Bool = false\)/);
  assert.match(captureSheet, /keepAllByDefault: payload\.shouldPreserveWebCaptureStructure/);
  assert.match(captureSheet, /keepAllByDefault \|\| protectedByCodeFence/);
  assert.match(captureSheet, /var seenCounts: \[String: Int\] = \[:\]/);
  assert.match(captureSheet, /let isDuplicate = seenCount > 0/);
  assert.match(captureSheet, /let protectedByCodeFence = wasInsideCodeFence \|\| isInsideCodeFence \|\| containsCodeFence/);
  assert.match(captureSheet, /static func isTechnicalShortContent/);
  assert.match(captureSheet, /trimmed\.hasPrefix\("#"\)/);
  assert.match(captureSheet, /trimmed == "---" \|\| trimmed == "\*\*\*" \|\| trimmed == "___"/);
  assert.match(captureSheet, /range\(of: #"/);
  assert.match(captureSheet, /options: \.regularExpression/);
  assert.match(captureSheet, /lowercased\.hasPrefix\("npm install "\)/);
  assert.match(captureSheet, /lowercased\.contains\("documentation"\)/);
  assert.doesNotMatch(captureSheet, /let isDuplicate = \(counts\[chunk\] \?\? 0\) > 1/);
});

test('embedded snapshot route can be mounted inside the reader without side-by-side chrome', () => {
  const snapshotPage = read('app/loom-render/snapshot/page.tsx');

  assert.match(snapshotPage, /const embedMode = params\.get\('embed'\) === '1'/);
  assert.match(snapshotPage, /loom-snapshot-embed-shell/);
  assert.match(snapshotPage, /if \(embedMode && payload\)/);
  assert.match(snapshotPage, /className="snapshot"/);
  assert.match(snapshotPage, /srcDoc=\{snapshotSrcDoc\}/);
  assert.match(snapshotPage, /sandbox=\{snapshotSandbox\}/);
  assert.match(snapshotPage, /onLoad=\{onIframeLoad\}/);
});

test('web capture routing is deterministic and remembers the chosen root', () => {
  const captureSheet = read('macos-app/Loom/Sources/CaptureSheet.swift');
  const minimalRoot = read('macos-app/Loom/Sources/LoomMinimalRootView.swift');

  assert.match(captureSheet, /preferredRootID: UUID\? = nil/);
  assert.match(captureSheet, /lastWebCaptureRootDefaultsKey = "loom\.capture\.web\.last-root-id"/);
  assert.match(captureSheet, /static func rememberWebCaptureRoot/);
  assert.match(captureSheet, /private static func webCaptureRootID/);
  assert.match(captureSheet, /ContentRootStore\.loadAll\(\)/);
  assert.doesNotMatch(captureSheet, /allActiveURLs\.keys\.first/);
  assert.match(minimalRoot, /preferredWebCaptureRootID\(\)/);
  assert.match(minimalRoot, /resolveForWebCapture\(\s*payload,\s*preferredRootID:/);
  assert.match(captureSheet, /CaptureAnchorResolver\.rememberWebCaptureRoot\(rootID\)/);
  assert.match(captureSheet, /case \.inbox\(let rootID, _\) = toSave\.anchor, toSave\.sourceURL != nil/);
  assert.doesNotMatch(captureSheet, /return web\.selection\s*\n\s*\}\s*\n\s*return web\.body/);
});

test('captures index falls back to Loom-managed store without touching source folders', () => {
  const capturesView = read('macos-app/Loom/Sources/CapturesView.swift');
  const schemeHandler = read('macos-app/Loom/Sources/LoomURLSchemeHandler.swift');

  assert.match(capturesView, /static func rootsForCaptureScan/);
  assert.match(capturesView, /let stored = ContentRootStore\.loadAll\(\)/);
  assert.match(capturesView, /if !stored\.isEmpty \{ return stored \}/);
  assert.match(capturesView, /LoomFileStore\.rootURL/);
  assert.match(capturesView, /externalFolderBookmark: nil/);
  assert.match(capturesView, /never the user's authoritative source folders/);
  assert.match(schemeHandler, /let roots = CapturesIndex\.rootsForCaptureScan\(\)/);
});

test('captures index never shows hidden capture metadata in row previews', () => {
  const capturesView = read('macos-app/Loom/Sources/CapturesView.swift');

  assert.match(capturesView, /Hidden Loom-owned metadata belongs to the capture file/);
  assert.match(capturesView, /#"\(\?s\)<!--\.\*\?-->"#/);
  assert.match(capturesView, /stripMarkdownChrome\(snippetSrc\)/);
});

test('capture entry slicing ignores article h3 headings inside a saved capture', () => {
  const capturesView = read('macos-app/Loom/Sources/CapturesView.swift');
  const schemeHandler = read('macos-app/Loom/Sources/LoomURLSchemeHandler.swift');

  assert.match(capturesView, /static func isCaptureHeadingLine/);
  assert.match(capturesView, /static func looksLikeCaptureEyebrow/);
  assert.match(capturesView, /\\d\{4\}-\\d\{2\}-\\d\{2\}\\s\+\\d\{2\}:\\d\{2\}/);
  assert.match(capturesView, /if isCaptureHeadingLine\(lines, at: idx\)/);
  assert.match(capturesView, /CapturesIndex\.isCaptureHeadingLine\(lines, at: k\)/);
  assert.match(schemeHandler, /CapturesIndex\.isCaptureHeadingLine\(lines, at: k\)/);
});

test('mixed captures with numbered links still use the article renderer', () => {
  const schemeHandler = read('macos-app/Loom/Sources/LoomURLSchemeHandler.swift');

  assert.match(schemeHandler, /private static func isPrimarilyListCapture/);
  assert.match(schemeHandler, /parsedItemCount >= 3/);
  assert.match(schemeHandler, /trimmed\.hasPrefix\("<!-- loom-embed"\)/);
  assert.match(schemeHandler, /localizedCaseInsensitiveContains\("<img"\)/);
  assert.match(schemeHandler, /localizedCaseInsensitiveContains\("<video"\)/);
  assert.match(schemeHandler, /isPrimarilyListCapture\(readerBody, parsedItemCount: listItems\.count\) \? "list" : "article"/);
});

test('capture renderer repairs bad media and wrapped code without breaking the reading surface', () => {
  const source = read('app/loom-render/capture/page.tsx');

  assert.match(source, /repairLeakedCodeFences\(transformMediaMarkers\(body\)\)/);
  assert.doesNotMatch(source, /height: '100vh', overflowY: 'auto'/);
  assert.match(source, /payload\.items && payload\.items\.length > 0/);
  assert.match(source, /const eyebrow = usp\.get\('eyebrow'\) \|\| ''/);
  assert.match(source, /return `\$\{root\}\/\$\{sub\}\/\$\{title\}\/\$\{eyebrow\}`/);
  assert.match(source, /function repairLeakedCodeFences/);
  assert.match(source, /const openingFence = \(line: string\) => line\.match/);
  assert.ok(source.includes("line.match(/^(```+|~~~+)\\s*(\\S*)\\s*$/)"));
  assert.match(source, /fenceLineCount >= 2/);
  assert.match(source, /isMarkdownFenceLang/);
  assert.match(source, /imageLooksVisuallyBlank/);
  assert.match(source, /empty canvas frame/);
  assert.match(source, /downgradeProviderThumbnail/);
  assert.match(source, /thumbnail load failed/);
  assert.match(source, /isProviderThumb[\s\S]*downgradeProviderThumbnail\(img, 'thumbnail load failed'\)/);
  assert.match(source, /dataset\.providerThumb === 'true'/);
  assert.match(source, /@media \(max-width: 760px\)[\s\S]*shape-gallery \.loom-img-gallery[\s\S]*margin-left: 0/);
  assert.match(source, /loom-media-fallback image compact/);
  assert.match(source, /const SVG_ROOT_LAYOUT_STYLE_PROPS = new Set/);
  assert.match(source, /function repairInlineSvgArtifacts/);
  assert.match(source, /preflightInlineSvgArtifacts\(out\)/);
  assert.match(source, /function historicalSvgHTMLNeedsFallback/);
  assert.match(source, /function svgHasEmbeddedStyleForClass/);
  assert.match(source, /function svgHTMLHasEmbeddedStyleForClass/);
  assert.match(source, /stripSvgRootLayoutForReader/);
  assert.match(source, /historicalSvgNeedsFallback/);
  assert.doesNotMatch(source, /data-loom-inline-svg['"]?\) === 'true'\) return false/);
  assert.doesNotMatch(source, /data-loom-inline-svg\\s\*=/);
  assert.match(source, /source page SVG styles were not saved/);
  assert.match(source, /loom-media-fallback image compact svg/);
  assert.match(source, /SVG_ROOT_LAYOUT_ATTRIBUTES\.forEach/);
  assert.match(source, /white-space: pre-wrap/);
  assert.match(source, /overflow-wrap: anywhere/);
  assert.match(source, /\.loom-capture-article svg[\s\S]*height: auto !important/);
  assert.match(source, /\.loom-capture-article svg[\s\S]*max-height: 22rem !important/);
  assert.doesNotMatch(source, /white-space: pre;\n\s+color: var\(--fg\)/);
  assert.doesNotMatch(source, /\.replace\(\s*\/\\\+\/g,\s*' '\s*\)/);
});

test('web capture routing never falls back to broad or source-mutating paths', () => {
  const schemeHandler = read('macos-app/Loom/Sources/LoomURLSchemeHandler.swift');
  const capturesView = read('macos-app/Loom/Sources/CapturesView.swift');
  const contentRootStore = read('macos-app/Loom/Sources/ContentRootStore.swift');
  const captureSheet = read('macos-app/Loom/Sources/CaptureSheet.swift');

  assert.match(schemeHandler, /guard let body = sliceEntry/);
  assert.match(schemeHandler, /return \["error": "capture entry not found"\]/);
  assert.match(schemeHandler, /private static func sliceEntry\(in full: String, heading: String, eyebrow: String\) -> String\?/);
  assert.doesNotMatch(schemeHandler, /guard let start = startIdx else \{ return full \}/);
  assert.match(capturesView, /guard let start = startIdx else \{\s*return ""\s*\}/);
  assert.match(contentRootStore, /copyExternalLoomMDIntoStoreIfMissing/);
  assert.match(contentRootStore, /copyItem\(at: externalLoomMD, to: storeLoomMD\)/);
  assert.doesNotMatch(contentRootStore, /removeItem\(at: externalLoomMD\)/);
  assert.doesNotMatch(contentRootStore, /moveItem\(at: externalLoomMD/);
  assert.match(captureSheet, /let pageBody = web\.body\.trimmingCharacters/);
  assert.match(captureSheet, /if !pageBody\.isEmpty \{ return web\.body \}/);
});

test('macOS app registers the loom URL scheme for browser capture handoff', () => {
  const infoPlist = read('macos-app/Loom/Info.plist');
  const appDelegate = read('macos-app/Loom/Sources/LoomApp.swift');
  const extensionScript = read('macos-app/Loom/LoomWebExtension/Resources/background.js');
  const manifest = JSON.parse(read('macos-app/Loom/LoomWebExtension/Resources/manifest.json'));

  assert.match(infoPlist, /<key>CFBundleURLTypes<\/key>/);
  assert.match(infoPlist, /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>loom<\/string>/);
  assert.match(infoPlist, /<string>com\.yinyiping\.loom<\/string>/);
  assert.match(appDelegate, /setEventHandler\(/);
  assert.match(appDelegate, /url\.host == "capture"/);
  assert.match(extensionScript, /loom:\/\/capture\?via=clipboard/);
  assert.ok(manifest.permissions.includes('clipboardWrite'));
});

test('browser handoff has a DOM clipboard fallback for large media payloads', () => {
  const extensionScript = read('macos-app/Loom/LoomWebExtension/Resources/content.js');

  assert.match(extensionScript, /function tryExecCommandClipboardWrite\(json\)/);
  assert.match(extensionScript, /document\.execCommand\('copy'\)/);
  assert.match(extensionScript, /method: 'execCommand'/);
});

test('web capture payload includes compact extension diagnostics', () => {
  const extensionScript = read('macos-app/Loom/LoomWebExtension/Resources/content.js');
  const captureSheet = read('macos-app/Loom/Sources/CaptureSheet.swift');

  assert.match(extensionScript, /function buildLoomExtensionDiagnostics\(payload, transport\)/);
  assert.match(extensionScript, /ext\.runtime\.getManifest\(\)/);
  assert.match(extensionScript, /manifestName: manifest\.name/);
  assert.match(extensionScript, /manifestVersion: manifest\.version/);
  assert.match(extensionScript, /extensionId: \(ext && ext\.runtime && ext\.runtime\.id\) \|\| ''/);
  assert.match(extensionScript, /captureUrl: payload\.url \|\| location\.href/);
  assert.match(extensionScript, /capturedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(extensionScript, /bodyLength: body\.length/);
  assert.match(extensionScript, /bodyWordCount: countWords\(body\)/);
  assert.match(extensionScript, /mediaAttachmentCount: mediaAttachments\.length/);
  assert.match(extensionScript, /mediaAttachmentRoleCounts: countMediaRoles\(mediaAttachments\)/);
  assert.match(extensionScript, /payloadByteCount: measurePayloadBytes\(payload\)/);
  assert.match(extensionScript, /transportMethod: transport\.method/);
  assert.match(extensionScript, /clipboardWarnings: transport\.warnings/);
  assert.match(extensionScript, /payload\.loomExtension = buildLoomExtensionDiagnostics\(payload, \{\s*method: 'pending'/);
  assert.match(extensionScript, /payload\.loomExtension = buildLoomExtensionDiagnostics\(payload, \{\s*method: attempt\.method/);
  assert.match(extensionScript, /payload\.loomExtension = buildLoomExtensionDiagnostics\(payload, \{\s*method: 'urlFallback'/);
  assert.match(extensionScript, /payload\.loomExtension = buildLoomExtensionDiagnostics\(payload, \{\s*method: 'failed'/);
  assert.match(captureSheet, /struct CaptureExtensionDiagnostics: Codable/);
  assert.match(captureSheet, /var webDiagnostics: CaptureExtensionDiagnostics\? = nil/);
  assert.match(captureSheet, /case url, title, selection, description, siteName, body, snapshotHtml, mediaAttachments, captureAst, loomExtension/);
  assert.match(captureSheet, /payload\.webDiagnostics = web\.loomExtension/);
  assert.match(captureSheet, /loom-capture-diagnostics:/);
  assert.match(captureSheet, /text = text\.replacingOccurrences\(of: "--", with: "\\\\u002d\\\\u002d"\)/);
});

test('web capture carries a typed CaptureAST from extension to native reader', () => {
  const extensionScript = read('macos-app/Loom/LoomWebExtension/Resources/content.js');
  const captureSheet = read('macos-app/Loom/Sources/CaptureSheet.swift');
  const schemeHandler = read('macos-app/Loom/Sources/LoomURLSchemeHandler.swift');
  const capturePage = read('app/loom-render/capture/page.tsx');

  assert.match(extensionScript, /function buildCaptureCensus/);
  assert.match(extensionScript, /function buildCaptureAst/);
  assert.match(extensionScript, /captureAst/);
  assert.match(extensionScript, /version:\s*1/);
  assert.match(extensionScript, /sectionHeadings/);
  assert.match(extensionScript, /kind:\s*'section'/);
  assert.match(extensionScript, /kind:\s*'heading'/);
  assert.match(extensionScript, /kind:\s*'providerEmbed'/);
  assert.match(extensionScript, /kind:\s*'visualAssembly'/);

  assert.match(captureSheet, /struct CaptureAST: Codable/);
  assert.match(captureSheet, /struct CaptureASTBlock: Codable/);
  assert.match(captureSheet, /var captureAST: CaptureAST\? = nil/);
  assert.match(captureSheet, /var captureASTFilename: String\? = nil/);
  assert.match(captureSheet, /case url, title, selection, description, siteName, body, snapshotHtml, mediaAttachments, captureAst, loomExtension/);
  assert.match(captureSheet, /payload\.captureAST = web\.captureAst/);
  assert.match(captureSheet, /writeCaptureAST\(payload: &working, alongside: target\)/);
  assert.match(captureSheet, /Loom-capture-ast-/);
  assert.match(captureSheet, /loom-capture-ast:/);

  assert.match(schemeHandler, /extractCaptureASTFilename/);
  assert.match(schemeHandler, /readCaptureASTSidecar/);
  assert.match(schemeHandler, /out\["captureAst"\] = captureAst/);

  assert.match(capturePage, /interface CaptureAst/);
  assert.match(capturePage, /captureAst\?: CaptureAst/);
  assert.match(capturePage, /<CaptureAstArticle/);
  assert.match(capturePage, /data-loom-capture-ast/);
});

test('web capture classifies dynamic media before screenshot fallback', () => {
  const extensionScript = read('macos-app/Loom/LoomWebExtension/Resources/content.js');
  const capturePage = read('app/loom-render/capture/page.tsx');

  assert.match(extensionScript, /function classifyCaptureMedia/);
  assert.match(extensionScript, /kind:\s*'video'/);
  assert.match(extensionScript, /kind:\s*'gif'/);
  assert.match(extensionScript, /kind:\s*'image'/);
  assert.match(extensionScript, /kind:\s*'providerEmbed'/);
  assert.match(extensionScript, /kind:\s*'visualAssembly'/);
  assert.match(extensionScript, /never downgrade dynamic media to screenshots/);
  assert.match(extensionScript, /captureCensus/);

  assert.match(capturePage, /renderCaptureAstBlock/);
  assert.match(capturePage, /providerEmbedToMarkdown/);
  assert.match(capturePage, /mediaBlockToMarkdown/);
});

test('web capture postmortem remains part of the golden-case acceptance gate', () => {
  const goldenCase = read('docs/process/WEB_CAPTURE_GOLDEN_CASE_2026-04-29.md');
  const postmortem = read('docs/process/WEB_CAPTURE_POSTMORTEM_2026-04-30.md');

  assert.match(goldenCase, /WEB_CAPTURE_POSTMORTEM_2026-04-30\.md/);
  assert.match(goldenCase, /screenshot-like visual similarity is not enough/);
  assert.match(postmortem, /Typed Capture Contract First/);
  assert.match(postmortem, /CaptureAST/);
  assert.match(postmortem, /Never Downgrade Dynamic Media/);
  assert.match(postmortem, /Source Authority Is Immutable/);
  assert.match(postmortem, /After Three Failed Patch Cycles, Stop and Reframe/);
});

test('xcodegen app target embeds the Safari capture extension', () => {
  const project = read('macos-app/Loom/project.yml');

  assert.match(project, /LoomWebExtension:\s*\n\s+type: app-extension/);
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER: com\.yinyiping\.loom\.LoomWebExtension/);
  assert.match(project, /path: LoomWebExtension\/Resources/);
  assert.match(project, /target: LoomWebExtension/);
});
