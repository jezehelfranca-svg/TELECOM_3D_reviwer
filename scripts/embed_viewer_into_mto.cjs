const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appHtmlPath = path.join(root, 'Telecom_3D_Reviewer_App.html');
const expHtmlPath = path.join(root, 'Telecom_MTO_Lite_Experimental.html');

if (!fs.existsSync(appHtmlPath)) {
  throw new Error('Telecom_3D_Reviewer_App.html not found. Run build first.');
}
if (!fs.existsSync(expHtmlPath)) {
  throw new Error('Telecom_MTO_Lite_Experimental.html not found.');
}

const appHtml = fs.readFileSync(appHtmlPath, 'utf8');

/**
 * Encodes raw HTML into an inner JavaScript double-quoted string literal
 * that is safely nested inside an outer ES6 template literal (`...`).
 */
function encodeToMtoTemplateLiteral(html) {
  // Step 1: Escape as standard double-quoted JS string (escapes \ -> \\, " -> \", \n, \r)
  let inner = JSON.stringify(html).slice(1, -1);
  
  // Step 2: Escape < to \u003c to prevent breaking enclosing HTML <script> tags
  inner = inner.replace(/</g, '\\u003c');
  
  // Step 3: Escape for the outer ES6 template literal (`...`)
  // Double every backslash so that when the outer template literal is evaluated:
  // \\ -> \
  // \\" -> \"
  // \\\\ -> \\
  // \\n -> \n
  // \\u003c -> \u003c
  inner = inner.replace(/\\/g, '\\\\');
  
  // Escape backticks so they don't prematurely terminate the outer `...` template literal
  inner = inner.replace(/`/g, '\\`');
  
  // Escape ${ so they are not evaluated as template expressions by the outer template literal
  inner = inner.replace(/\$\{/g, '\\${');
  
  return inner;
}

console.log('Encoding Telecom_3D_Reviewer_App.html into MTO template literal...');
const encoded = encodeToMtoTemplateLiteral(appHtml);
console.log(`✔ Encoded ${appHtml.length.toLocaleString()} bytes into ${encoded.length.toLocaleString()} bytes`);

let expTxt = fs.readFileSync(expHtmlPath, 'utf8');

// 1. Locate MTO_THREEJS_REVIEW_HTML definition
const markerStart = 'MTO_THREEJS_REVIEW_HTML = "';
const pStart = expTxt.indexOf(markerStart);
if (pStart === -1) {
  throw new Error('Could not find MTO_THREEJS_REVIEW_HTML in Telecom_MTO_Lite_Experimental.html');
}

const quoteStart = pStart + markerStart.length;

// Find closing quote before NEEDLE_3D_REVIEW_HTML or TELECOM_MTO_THREEJS_REVIEW_V1
let quoteEnd = -1;
const needleMarker = 'const NEEDLE_3D_REVIEW_HTML';
const needlePos = expTxt.indexOf(needleMarker, quoteStart);

if (needlePos !== -1) {
  quoteEnd = expTxt.lastIndexOf('";', needlePos);
} else {
  const v1Marker = '// TELECOM_MTO_THREEJS_REVIEW_V1';
  const v1Pos = expTxt.indexOf(v1Marker, quoteStart);
  if (v1Pos !== -1) {
    quoteEnd = expTxt.lastIndexOf('";', v1Pos);
  }
}

if (quoteEnd === -1 || quoteEnd <= quoteStart) {
  // Fallback search
  const qEnd1 = expTxt.indexOf('";\n', quoteStart);
  const qEnd2 = expTxt.indexOf('";\r\n', quoteStart);
  if (qEnd1 !== -1 && qEnd2 !== -1) quoteEnd = Math.min(qEnd1, qEnd2);
  else quoteEnd = qEnd1 !== -1 ? qEnd1 : qEnd2;
}

if (quoteEnd === -1 || quoteEnd <= quoteStart) {
  throw new Error('Could not reliably find closing "; for MTO_THREEJS_REVIEW_HTML');
}

console.log(`Replacing MTO_THREEJS_REVIEW_HTML slice from ${quoteStart} to ${quoteEnd} (old size: ${(quoteEnd - quoteStart).toLocaleString()} bytes)...`);

// Splice new encoded 3D viewer HTML
expTxt = expTxt.slice(0, quoteStart) + encoded + expTxt.slice(quoteEnd);
console.log('✔ Replaced MTO_THREEJS_REVIEW_HTML with updated Needle 3D Reviewer');

// 2. Ensure NEEDLE_3D_REVIEW_HTML alias is present
if (!expTxt.includes('const NEEDLE_3D_REVIEW_HTML = MTO_THREEJS_REVIEW_HTML;')) {
  const afterQuote = quoteStart + encoded.length + '";'.length;
  expTxt = expTxt.slice(0, afterQuote) + '\r\n        const NEEDLE_3D_REVIEW_HTML = MTO_THREEJS_REVIEW_HTML;' + expTxt.slice(afterQuote);
  console.log('✔ Added NEEDLE_3D_REVIEW_HTML alias');
}

// 3. Replace frame.src = 'Telecom_3D_Reviewer_App.html' with frame.srcdoc = NEEDLE_3D_REVIEW_HTML;
const oldFrameSrc = "frame.src = 'Telecom_3D_Reviewer_App.html';";
const newFrameSrc = "frame.srcdoc = NEEDLE_3D_REVIEW_HTML;";

if (expTxt.includes(oldFrameSrc)) {
  expTxt = expTxt.replace(oldFrameSrc, newFrameSrc);
  console.log('✔ Switched frame.src to frame.srcdoc = NEEDLE_3D_REVIEW_HTML (eliminating null origin sandbox trap)');
} else if (expTxt.includes(newFrameSrc)) {
  console.log('✔ frame.srcdoc = NEEDLE_3D_REVIEW_HTML already in place');
} else {
  console.warn('⚠ Could not locate frame.src loader in Telecom_MTO_Lite_Experimental.html');
}

// 4. Also ensure window.mtoOpen3DReview is exported on window so onclick="mtoOpen3DReview()" works
if (!expTxt.includes('window.mtoOpen3DReview = mtoOpen3DReview;')) {
  const openFnMarker = 'function mtoOpen3DReview() {';
  const openPos = expTxt.indexOf(openFnMarker);
  if (openPos !== -1) {
    expTxt = expTxt.replace(openFnMarker, 'window.mtoOpen3DReview = mtoOpen3DReview;\nfunction mtoOpen3DReview() {');
    console.log('✔ Exported window.mtoOpen3DReview to global window for button onclick handlers');
  }
}

fs.writeFileSync(expHtmlPath, expTxt, 'utf8');
console.log(`✔ Successfully embedded 3D viewer into Telecom_MTO_Lite_Experimental.html (${expTxt.length.toLocaleString()} bytes)`);
