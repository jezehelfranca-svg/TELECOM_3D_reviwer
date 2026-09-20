import '../build/engine.bundle.js';

const TelecomEngine = globalThis.TelecomEngine;

console.log('Testing build/engine.bundle.js...');

if (!TelecomEngine) throw new Error('TelecomEngine is undefined');
if (!TelecomEngine.DeterministicRouteSolver) throw new Error('Missing DeterministicRouteSolver');
if (!TelecomEngine.DeterministicRouteValidator) throw new Error('Missing DeterministicRouteValidator');
if (!TelecomEngine.FormalRuleLibrary || TelecomEngine.FormalRuleLibrary.length !== 11) {
  throw new Error(`FormalRuleLibrary must have 11 rules, found: ${TelecomEngine.FormalRuleLibrary?.length}`);
}
if (!TelecomEngine.NeedleAssistant) throw new Error('Missing NeedleAssistant');
if (!TelecomEngine.NeedleIntentParser) throw new Error('Missing NeedleIntentParser');
if (!TelecomEngine.buildProjectModelFromViewerState) throw new Error('Missing buildProjectModelFromViewerState');
if (!TelecomEngine.projectModelHash) throw new Error('Missing projectModelHash');

console.log('  [PASS] All core TelecomEngine exports verified');

// Test running an inference and validation through TelecomEngine
const parsed = TelecomEngine.NeedleIntentParser.parseRequest('Route CCTV cable from CCTV-021 to CONTROL_ROOM at 4.5m');
if (parsed.intent.source !== 'CCTV-021') throw new Error(`Expected source CCTV-021, got ${parsed.intent.source}`);
if (parsed.intent.cable_type !== 'CCTV_DATA') throw new Error(`Expected CCTV_DATA, got ${parsed.intent.cable_type}`);
console.log('  [PASS] NeedleIntentParser in bundle parsed request correctly');

// Test DeterministicRouteValidator in bundle
const validator = new TelecomEngine.DeterministicRouteValidator({});
const valRes = validator.validateCandidateRoute({
  cable_id: 'c1',
  source_id: 'UNKNOWN_SRC',
  destination_id: 'UNKNOWN_DST',
  cable_type: 'CCTV_DATA',
  waypoints: []
});
if (valRes.valid !== false) throw new Error('Expected invalid route with unknown endpoints');
if (!valRes.skipped_rules || valRes.skipped_rules.length === 0) throw new Error('Expected skipped_rules in valRes');
console.log(`  [PASS] DeterministicRouteValidator in bundle correctly evaluated (passed: ${valRes.passed_rules.length}, skipped: ${valRes.skipped_rules.length}, findings: ${valRes.findings.length})`);

console.log('Engine bundle verification SUCCEEDED!');
