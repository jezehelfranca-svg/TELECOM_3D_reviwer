const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../build');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const root = path.resolve(__dirname, '..');
const files = [
  'src/contract/contract_definitions.js',
  'src/validator/rules.js',
  'src/engine/route_solver.js',
  'src/validator/route_validator.js',
  'src/needle/needle_assistant.js',
  'src/recorder/audit_logger.js',
  'src/adapter/viewer_project_adapter.js'
];

const bundleParts = [];
bundleParts.push('/**');
bundleParts.push(' * Telecom Engine Standalone Bundle');
bundleParts.push(' * Deterministic Route Solver, Formal Rule Library, Validator & Needle Assistant');
bundleParts.push(' */');
bundleParts.push('(function(global) {');
bundleParts.push("  'use strict';");

for (const relPath of files) {
  const fullPath = path.join(root, relPath);
  let src = fs.readFileSync(fullPath, 'utf8');

  // Remove import statements
  src = src.replace(/import\s+[^;]+?from\s+['"][^'"]+['"];?/g, '');
  src = src.replace(/import\s+['"][^'"]+['"];?/g, '');

  // Strip export keywords
  src = src.replace(/export\s+const\s+/g, 'const ');
  src = src.replace(/export\s+let\s+/g, 'let ');
  src = src.replace(/export\s+class\s+/g, 'class ');
  src = src.replace(/export\s+function\s+/g, 'function ');
  src = src.replace(/export\s+default\s+/g, '');

  bundleParts.push(`\n// --- Source: ${relPath} ---`);
  bundleParts.push(src.trim());
}

bundleParts.push(`
  const TelecomEngine = {
    // Contracts
    SystemTypes,
    CableTypes,
    TopologyTypes,
    ContainmentTypes,
    RouteSegmentTypes,
    SeverityLevels,
    StandardElevations,
    validateCoordinates,
    createDevice,
    createPanel,
    createContainment,
    createRouteSegment,
    createWallPenetration,
    createCable,
    createValidationFinding,

    // Rules
    FormalRuleLibrary,
    getRuleById,
    getRulesForSystem,

    // Validator
    DeterministicRouteValidator,
    checkSegmentIntersection2D,
    distance3D,
    distance2D,

    // Solver
    DeterministicRouteSolver,

    // Assistant & Parser
    NeedleAssistant,
    NeedleIntentParser,

    // Recorder
    AuditLogger,

    // Adapter & Hashing
    buildProjectModelFromViewerState,
    projectModelHash,
    sha256Sync,
    canonicalJson
  };

  global.TelecomEngine = TelecomEngine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TelecomEngine };
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
`);

const bundledCode = bundleParts.join('\n');
const outFile = path.join(outDir, 'engine.bundle.js');
fs.writeFileSync(outFile, bundledCode, 'utf8');
console.log('Engine bundle built successfully via CJS! Size: ' + bundledCode.length + ' bytes');
