/**
 * Comprehensive Automated Test Suite.
 * Stage 6 implementation for TELECOM_3D_reviwer.
 */

import { createMockPlantModel } from '../demo/mock_plant_model.js';
import { NeedleAssistant, NeedleIntentParser } from '../src/needle/needle_assistant.js';
import { DeterministicRouteValidator } from '../src/validator/route_validator.js';
import { AuditLogger } from '../src/recorder/audit_logger.js';
import { TopologyTypes, CableTypes } from '../src/contract/contract_definitions.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${message}`);
  }
}

console.log('================================================================');
console.log('  RUNNING TELECOM 3D REVIEWER CONTRACT & RULE VALIDATION TESTS  ');
console.log('================================================================\n');

const plantModel = createMockPlantModel();
const assistant = new NeedleAssistant(plantModel);
const auditLogger = new AuditLogger(plantModel);

// -------------------------------------------------------------
// Test 1: Valid PAGA Class A Loop Request
// -------------------------------------------------------------
console.log('[Scenario 1] Valid PAGA Class A Loop Request');
{
  const prompt = 'Route Class A PAGA audio loop from PAGA-CAB-A to SPK-104 at 4.0m elevation';
  const preview = assistant.preview_route(prompt);
  const eventId = auditLogger.recordProposal({ prompt, intent: preview.intent, previewResult: preview });

  assert(preview.mode === 'PREVIEW_ONLY', 'Assistant operates in PREVIEW_ONLY mode');
  assert(preview.intent.topology === TopologyTypes.CLASS_A_LOOP, 'Extracted topology is CLASS_A_LOOP');
  assert(preview.proposed_cable.destination_id === preview.proposed_cable.source_id, 'Class A loop returns to originating cabinet ID');
  assert(preview.validation_result.valid === true, 'Validation passes without errors');
  assert(preview.can_apply === true, 'Can apply is true');

  // Verify controlled editing gate
  const applyRes = auditLogger.applyProposal(eventId);
  assert(applyRes.ok === true, 'Proposal successfully applied upon user confirmation');
  assert(plantModel.cables.length === 1, 'Committed cable added to project model after apply');
}

// -------------------------------------------------------------
// Test 2: Power and Control Cable Requests (Segregation & P2P)
// -------------------------------------------------------------
console.log('\n[Scenario 2] Power and Control Cable Requests');
{
  const pwrPrompt = 'Route power cable from PWR-VFD-01 to CONTROL_ROOM at 1.5m elevation';
  const parsed = NeedleIntentParser.parseRequest(pwrPrompt);
  assert(parsed.intent.cable_type === CableTypes.POWER_LV, 'Identified cable type POWER_LV');

  const ctrlPrompt = 'Route control interlock cable from CTRL-VALVE-01 to CONTROL_ROOM at 4.2m elevation';
  const ctrlPreview = assistant.preview_route(ctrlPrompt);
  assert(ctrlPreview.intent.cable_type === CableTypes.CONTROL, 'Identified cable type CONTROL');
  assert(ctrlPreview.proposed_cable.waypoints.length > 2, 'Generated valid control route waypoints');
}

// -------------------------------------------------------------
// Test 3: Fibre Star and Daisy-Chain Requests
// -------------------------------------------------------------
console.log('\n[Scenario 3] Fibre Star and Daisy-Chain Requests');
{
  const foPrompt = 'Route singlemode fibre optic backbone star cable from CCTV-021 to CONTROL_ROOM';
  const foPreview = assistant.preview_route(foPrompt);
  assert(foPreview.intent.cable_type === CableTypes.FO_SM, 'Identified FO_SM singlemode fibre');
  assert(foPreview.intent.topology === TopologyTypes.STAR, 'Identified STAR topology');
  assert(foPreview.can_apply === true, 'Fibre star route passes validation through approved penetration');
}

// -------------------------------------------------------------
// Test 4: CCTV Data Route
// -------------------------------------------------------------
console.log('\n[Scenario 4] CCTV Data Route');
{
  const cctvPrompt = 'Route the CCTV cable from CCTV-021 to the control room through the outdoor corridor at 4.5 m elevation';
  const cctvPreview = assistant.preview_route(cctvPrompt);
  assert(cctvPreview.intent.source === 'CCTV-021', 'Source is CCTV-021');
  assert(cctvPreview.intent.destination === 'THE_CONTROL_ROOM' || cctvPreview.intent.destination === 'CONTROL_ROOM', 'Destination is CONTROL_ROOM');
  assert(cctvPreview.intent.elevation_m === 4.5, 'Elevation is 4.5m');
  assert(cctvPreview.intent.cable_type === CableTypes.CCTV_DATA, 'Cable type is CCTV_DATA');
  assert(cctvPreview.can_apply === true, 'CCTV route through approved penetration succeeds');
}

// -------------------------------------------------------------
// Test 5: Requests with Missing Elevations
// -------------------------------------------------------------
console.log('\n[Scenario 5] Requests with Missing Elevations');
{
  const missingElevPrompt = 'Route CCTV cable from CCTV-002 to SW-SEC-01';
  const parsed = NeedleIntentParser.parseRequest(missingElevPrompt);
  assert(parsed.intent.elevation_m === 4.2, 'Falls back to standard overhead containment elevation (4.2m)');
  assert(parsed.confidence < 0.9, 'Confidence score adjusted due to missing explicit elevation');
}

// -------------------------------------------------------------
// Test 6: Requests with Ambiguous Destinations
// -------------------------------------------------------------
console.log('\n[Scenario 6] Requests with Ambiguous Destinations');
{
  const ambigPrompt = 'Route cable from CCTV-021';
  const parsed = NeedleIntentParser.parseRequest(ambigPrompt);
  assert(parsed.intent.destination === 'UNKNOWN_DESTINATION', 'Flags missing destination');
  assert(parsed.confidence <= 0.7, 'Confidence appropriately discounted');

  const preview = assistant.preview_route(parsed.intent);
  assert(preview.can_apply === false, 'Cannot apply route with unknown destination');
  assert(preview.validation_result.findings.length > 0, 'Produces validation finding for missing destination');
}

// -------------------------------------------------------------
// Test 7: Requests that Attempt Invalid Wall Exits (Strict Rejection)
// -------------------------------------------------------------
console.log('\n[Scenario 7] Requests that Attempt Invalid Wall Exits');
{
  const validator = new DeterministicRouteValidator(plantModel);
  // Construct an illegal cable directly penetrating Exterior Wall at Y=2.0 (approved sleeve is at Y=15.0)
  const illegalWallCrossingCable = {
    cable_id: 'CBL-ILLEGAL-WALL-01',
    tag: 'CBL-ILLEGAL-WALL-01',
    system: 'CCTV',
    cable_type: CableTypes.CCTV_DATA,
    source_id: 'dev-cctv-002',
    destination_id: 'dev-cctv-021',
    topology: TopologyTypes.STAR,
    waypoints: [
      { x: 12.0, y: 2.0, z: 4.2 },
      { x: 28.0, y: 2.0, z: 4.2 } // Crosses X=25 wall at Y=2.0! No penetration exists here!
    ],
    route_segment_ids: []
  };

  const valResult = validator.validateCandidateRoute(illegalWallCrossingCable);
  assert(valResult.valid === false, 'Validator strictly rejects route crossing wall without sleeve');
  const wallFinding = valResult.findings.find(f => f.rule_id === 'WALL-PENETRATION-001');
  assert(wallFinding !== undefined, 'WALL-PENETRATION-001 violation emitted');
  assert(wallFinding.severity === 'error', 'Wall penetration finding is severity ERROR');
}

// -------------------------------------------------------------
// Test 8: Requests that Incorrectly Route Cables at Ground Level
// -------------------------------------------------------------
console.log('\n[Scenario 8] Requests that Incorrectly Route Cables at Ground Level');
{
  const validator = new DeterministicRouteValidator(plantModel);
  // Construct a cable running along open ground (Z=0.1m) in outdoor corridor
  const groundRouteCable = {
    cable_id: 'CBL-GROUND-ERR-01',
    tag: 'CBL-GROUND-ERR-01',
    system: 'CCTV',
    cable_type: CableTypes.CCTV_DATA,
    source_id: 'dev-cctv-002',
    destination_id: 'dev-cctv-021',
    topology: TopologyTypes.STAR,
    waypoints: [
      { x: 12.0, y: 5.0, z: 3.5 },
      { x: 15.0, y: 5.0, z: 0.1 }, // Ground level! Prohibited!
      { x: 20.0, y: 5.0, z: 0.1 },
      { x: 32.0, y: 15.0, z: 4.5 }
    ],
    route_segment_ids: []
  };

  const valResult = validator.validateCandidateRoute(groundRouteCable);
  assert(valResult.valid === false, 'Validator strictly rejects open ground-level routing');
  const groundFinding = valResult.findings.find(f => f.rule_id === 'ELEV-GROUND-BAN-001');
  assert(groundFinding !== undefined, 'ELEV-GROUND-BAN-001 violation emitted');
}

// -------------------------------------------------------------
// Test 9: Invariant Check - Proposal NEVER Directly Modifies Project
// -------------------------------------------------------------
console.log('\n[Scenario 9] Invariant: Proposal Never Bypasses Apply Gate');
{
  const baselineCableCount = plantModel.cables.length;
  const prompt = 'Route CCTV cable from CCTV-002 to SW-SEC-01';
  const preview = assistant.preview_route(prompt);
  const eventId = auditLogger.recordProposal({ prompt, intent: preview.intent, previewResult: preview });

  assert(plantModel.cables.length === baselineCableCount, 'Project model cables unchanged after preview_route');

  // User decides to discard proposal
  const rejectRes = auditLogger.rejectProposal(eventId, 'Discarded in preview');
  assert(rejectRes.ok === true, 'Proposal rejected cleanly');
  assert(plantModel.cables.length === baselineCableCount, 'Project model remains unchanged after rejection');
}

// -------------------------------------------------------------
// Test 10: Audit Log Export Integrity
// -------------------------------------------------------------
console.log('\n[Scenario 10] Audit Log Export Integrity');
{
  const exported = JSON.parse(auditLogger.exportAuditLog());
  assert(exported.total_events === auditLogger.events.length, 'Audit log accurately reports recorded event count');
  assert(exported.events[0].request_prompt.length > 0, 'Audit log contains full prompt and intent history');
}

console.log('\n================================================================');
console.log(`  TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
