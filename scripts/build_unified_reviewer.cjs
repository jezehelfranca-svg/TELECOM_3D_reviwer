const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

// 1. Ensure engine bundle is up to date
require('./bundle_engine.cjs');

// 2. Read base HTML and modular assets
const baseHtml = fs.readFileSync(path.join(root, 'src/viewer/viewer_base.html'), 'utf8');
const needleCss = fs.readFileSync(path.join(root, 'src/needle/browser/needle_panel.css'), 'utf8');
const needlePanelHtml = fs.readFileSync(path.join(root, 'src/needle/browser/needle_panel.html'), 'utf8');
const inspectorButtons = fs.readFileSync(path.join(root, 'src/needle/browser/inspector_buttons.js'), 'utf8');
const engineBundle = fs.readFileSync(path.join(root, 'build/engine.bundle.js'), 'utf8');
const viewerBridge = fs.readFileSync(path.join(root, 'src/needle/browser/viewer_bridge.js'), 'utf8');
const needleClient = fs.readFileSync(path.join(root, 'src/needle/browser/needle_client.js'), 'utf8');

// Combine logic
const combinedLogic = `
// =============================================================================
// TELECOM ENGINE BUNDLE (Deterministic Solver, Rules, Validator, Assistant)
// =============================================================================
${engineBundle}

// =============================================================================
// VIEWER BRIDGE (Encapsulating Minified Three.js / Viewer Variables)
// =============================================================================
${viewerBridge}

// =============================================================================
// NEEDLE CLIENT (In-App Agent Loop, Real Tool Calling & Commit Gate)
// =============================================================================
${needleClient}
`;

// 3. Verify markers exist exactly once
const markers = [
  '<!--NEEDLE:STYLES-->',
  '<!--NEEDLE:PANEL-->',
  '/*NEEDLE:INSPECTOR_BUTTONS*/',
  '/*NEEDLE:LOGIC*/'
];

for (const m of markers) {
  const count = baseHtml.split(m).length - 1;
  if (count !== 1) {
    throw new Error(`Build invariant failed: marker ${m} found ${count} times (expected 1) in viewer_base.html`);
  }
}

// 4. Splice assets into markers
let finalHtml = baseHtml
  .replace('<!--NEEDLE:STYLES-->', `<style>\n${needleCss}\n</style>`)
  .replace('<!--NEEDLE:PANEL-->', needlePanelHtml)
  .replace('/*NEEDLE:INSPECTOR_BUTTONS*/', inspectorButtons)
  .replace('/*NEEDLE:LOGIC*/', combinedLogic);

// Verify no markers remain
for (const m of markers) {
  if (finalHtml.includes(m)) {
    throw new Error(`Build invariant failed: marker ${m} was not replaced in final HTML`);
  }
}

// 5. Extract script tags and validate JS syntax via vm.Script
const sStart = finalHtml.indexOf('<script>') + '<script>'.length;
const sEnd = finalHtml.lastIndexOf('</script>');
if (sStart === -1 || sEnd === -1 || sEnd <= sStart) {
  throw new Error('Build invariant failed: Could not isolate script block in final HTML');
}
const scriptText = finalHtml.slice(sStart, sEnd);

try {
  new vm.Script(scriptText);
  console.log('✔ JavaScript syntax verification PASSED (0 syntax errors)');
} catch (err) {
  console.error('✖ JavaScript syntax error in generated bundle:');
  console.error(err);
  process.exit(1);
}

const isCheckOnly = process.argv.includes('--check');
if (isCheckOnly) {
  console.log('✔ Build check PASSED. No files modified.');
  process.exit(0);
}

// 6. Write Telecom_3D_Reviewer_App.html and index.html
const targetApp = path.join(root, 'Telecom_3D_Reviewer_App.html');
const targetIndex = path.join(root, 'index.html');

fs.writeFileSync(targetApp, finalHtml, 'utf8');
fs.writeFileSync(targetIndex, finalHtml, 'utf8');

console.log(`✔ Successfully built Telecom_3D_Reviewer_App.html (${finalHtml.length.toLocaleString()} bytes)`);
console.log(`✔ Successfully synced index.html (${finalHtml.length.toLocaleString()} bytes)`);
