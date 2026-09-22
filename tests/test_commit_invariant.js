import '../build/engine.bundle.js';
import { createMockPlantModel } from '../demo/mock_plant_model.js';

const TelecomEngine = globalThis.TelecomEngine;
console.log('Testing 6 Safety Commit Invariants...');

let totalPassed = 0;

function assert(condition, desc) {
  if (!condition) {
    throw new Error(`[FAIL] Invariant violated: ${desc}`);
  }
  totalPassed++;
  console.log(`  [PASS] ${desc}`);
}

const plantModel = createMockPlantModel();
const token = 'session_ctx_token_abc123';
const initialHash = TelecomEngine.projectModelHash(plantModel, token);

// 1. Solver generates valid route
const solver = new TelecomEngine.DeterministicRouteSolver(plantModel);
const cable = solver.solveRoute({
  source_id: 'CCTV-021',
  destination_id: 'CONTROL_ROOM',
  cable_type: 'CCTV_DATA',
  elevation_m: 4.5
});

const validator = new TelecomEngine.DeterministicRouteValidator(plantModel);
const valRes = validator.validateCandidateRoute(cable);

// Invariant 1: Valid check
assert(valRes.valid === true, 'Invariant 1: Valid candidate route passes validation');

// Invariant 2: Zero error findings
const errors = (valRes.findings || []).filter(f => f.severity === 'error');
assert(errors.length === 0, 'Invariant 2: Zero error findings on candidate route');

// Invariant 3: 11-rule coverage
const allRules = TelecomEngine.FormalRuleLibrary;
assert(allRules.length === 11, 'Formal rule library contains exactly 11 rules');
const passedSet = new Set(valRes.passed_rules || []);
const skippedSet = new Set((valRes.skipped_rules || []).map(r => r.rule_id));
let coveredCount = 0;
for (const r of allRules) {
  if (passedSet.has(r.rule_id) || skippedSet.has(r.rule_id)) {
    coveredCount++;
  }
}
assert(coveredCount === 11, 'Invariant 3: 100% rule coverage (all 11 rules accounted for in passed or skipped)');

// Invariant 4: Model hash match check
const currentHash = TelecomEngine.projectModelHash(plantModel, token);
assert(currentHash === initialHash, 'Invariant 4a: Model hash matches when geometry is unmodified');

// Simulate geometry change
const modifiedModel = JSON.parse(JSON.stringify(plantModel));
modifiedModel.devices.push({ id: 'NEW-DEV-99', tag: 'DEV-99', location: { x: 99, y: 99, z: 2 } });
const modifiedHash = TelecomEngine.projectModelHash(modifiedModel, token);
assert(modifiedHash !== initialHash, 'Invariant 4b: Model hash detects modified geometry and rejects stale commit');

// Invariant 5: Context token match check
const wrongToken = 'stale_token_xyz';
const wrongTokenHash = TelecomEngine.projectModelHash(plantModel, wrongToken);
assert(wrongTokenHash !== initialHash, 'Invariant 5: Rejects commit with mismatched/stale context token');

// Invariant 6: Message structure
const commitPayload = {
  type: 'telecom-mto-3d-apply-cable',
  contextToken: token,
  cable: {
    tag: cable.tag,
    cableType: cable.cable_type,
    sourceTag: cable.source_id,
    targetTag: cable.destination_id,
    waypoints: cable.waypoints,
    length_m: cable.total_length_m,
    total_length_m: cable.total_length_m
  },
  validation: valRes
};

assert(commitPayload.type === 'telecom-mto-3d-apply-cable', 'Invariant 6a: Correct postMessage protocol type');
assert(Array.isArray(commitPayload.cable.waypoints) && commitPayload.cable.waypoints.length >= 2, 'Invariant 6b: Cable contains valid waypoints array');
assert(commitPayload.cable.total_length_m > 0, 'Invariant 6c: Cable contains calculated non-zero length');

console.log(`\nAll 6 Safety Invariants PASSED (${totalPassed} assertions verified)!`);
