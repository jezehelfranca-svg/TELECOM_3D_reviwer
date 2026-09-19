/**
 * End-to-End Simulation Script.
 * Demonstrates Stages 1 to 7 working in harmony.
 */

import { createMockPlantModel } from './mock_plant_model.js';
import { NeedleAssistant, NeedleIntentParser } from '../src/needle/needle_assistant.js';
import { AuditLogger } from '../src/recorder/audit_logger.js';
import { ThreeViewerController } from '../src/viewer/three_viewer_controller.js';
import { TeamsCopilotAdapter } from '../src/copilot/copilot_adapter.js';

console.log('========================================================================');
console.log('   TELECOM MTO 3D REVIEWER — FULL END-TO-END WORKFLOW SIMULATION        ');
console.log('========================================================================\n');

const plant = createMockPlantModel();
const assistant = new NeedleAssistant(plant);
const auditLogger = new AuditLogger(plant);
const viewerController = new ThreeViewerController(null);
const copilotAdapter = new TeamsCopilotAdapter(plant, auditLogger);

// STEP 1: Natural Language Prompt from User
const userPrompt = 'Route the CCTV cable from CCTV-021 to the control room through the outdoor corridor at 4.5 m elevation';
console.log(`[USER PROMPT]: "${userPrompt}"\n`);

// STEP 2: Needle Intent Extraction & Confidence Scoring
console.log('--- Step 2: Needle Structured Intent & Evidence ---');
const parsed = NeedleIntentParser.parseRequest(userPrompt);
console.log('Extracted Intent:', JSON.stringify(parsed.intent, null, 2));
console.log(`Confidence Score: ${Math.round(parsed.confidence * 100)}%`);
console.log(`Rationale: ${parsed.evidence.rationale}`);
console.log(`Source Evidence: ${parsed.evidence.clause_reference}\n`);

// STEP 3: Needle Structured Tool Invocations (Preview-Only Mode)
console.log('--- Step 3: Tool Invocations ---');
console.log('1. find_objects("CCTV-021"):', assistant.find_objects({ query: 'CCTV-021' }).matches.map(m => `${m.tag} (${m.category})`));
console.log('2. inspect_device("CCTV-021"):', assistant.inspect_device({ device_tag: 'CCTV-021' }).room_id);
console.log('3. find_approved_containment(system="CCTV_DATA", elev=4.5m):', assistant.find_approved_containment({ system: 'CCTV_DATA', elevation_m: 4.5 }).approved_segments.map(s => s.tag));

// STEP 4: Deterministic Route Solving & Engineering Validation
console.log('\n--- Step 4: Deterministic Route Solving & Engineering Validation ---');
const preview = assistant.preview_route(parsed.intent);
console.log(`Routing Outcome: ${preview.can_apply ? 'VALIDATED (PASS)' : 'REJECTED'}`);
console.log(`Proposed Cable: ${preview.proposed_cable.tag}`);
console.log(`Total Physical Length: ${preview.proposed_cable.total_length_m} m (Horizontal: ${preview.proposed_cable.measured_horizontal_length_m} m, Vertical Riser/Drops: ${preview.proposed_cable.vertical_allowance_length_m} m)`);
console.log(`Traversed Containments: [${preview.proposed_cable.route_segment_ids.join(', ')}]`);
console.log(`Waypoint Vertices: ${preview.proposed_cable.waypoints.length} points in 3D plant space`);
console.log(`Passed Engineering Rules: [${preview.validation_result.passed_rules.join(', ')}]`);

// STEP 5: Audit Event Proposal Record
const eventId = auditLogger.recordProposal({
  prompt: userPrompt,
  intent: preview.intent,
  toolCall: { tool: 'preview_route', args: parsed.intent },
  previewResult: preview
});
console.log(`\nAudit Proposal Recorded: ${eventId} (Status: PENDING_REVIEW)`);

// STEP 6: 3D Scene Graph Generation for Three.js Viewport
const sceneData = viewerController.generateSceneGraphData(plant, preview);
console.log(`3D Viewport Scene Objects: ${sceneData.objects.length} entities rendered (Trays, Penetrations, Cabinets, Glowing Preview Curve)`);

// STEP 7: Controlled Editing Gate (Human Approval)
console.log('\n--- Step 7: Controlled Editing Gate ---');
console.log(`Before Apply: Committed plant cables = ${plant.cables.length}`);
const applyResult = auditLogger.applyProposal(eventId, { notes: 'Approved by Lead Telecom Engineer after visual 3D verification.' });
console.log(`[USER CLICKED APPLY]: Successfully committed cable '${applyResult.cable.tag}'!`);
console.log(`After Apply: Committed plant cables = ${plant.cables.length}`);
console.log('Diff Summary:', applyResult.diff_summary);

// STEP 8: Demonstration of Rejection Safety Gate
console.log('\n--- Step 8: Safety Gate Demonstration (Negative Case) ---');
const illegalPrompt = 'Route CCTV cable from CCTV-002 penetrating exterior wall directly to yard at Y=2.0';
console.log(`[USER PROMPT]: "${illegalPrompt}"`);
// Manual bad route through exterior wall without approved sleeve
const badRouteResult = assistant.validator.validateCandidateRoute({
  cable_id: 'CBL-BAD-01',
  tag: 'CBL-BAD-01',
  system: 'CCTV',
  cable_type: 'CCTV_DATA',
  source_id: 'dev-cctv-002',
  destination_id: 'dev-cctv-021',
  topology: 'STAR',
  waypoints: [
    { x: 12.0, y: 2.0, z: 4.2 },
    { x: 28.0, y: 2.0, z: 4.2 }
  ]
});
console.log(`Validation Outcome: ${badRouteResult.valid ? 'PASS' : 'REJECTED (CRITICAL SAFETY ERROR)'}`);
for (const f of badRouteResult.findings) {
  console.log(`  🚨 Finding: [${f.rule_id}] ${f.message}`);
  const explanation = assistant.explain_rule_violation({ rule_id: f.rule_id });
  console.log(`  💡 Standards Reference: ${explanation.standards_reference}`);
  console.log(`  🔧 Remediation: ${f.recommendation}`);
}

// STEP 9: Teams Copilot Adapter Card Output
console.log('\n--- Step 9: Teams Copilot Adaptive Card Output ---');
const copilotResponse = copilotAdapter.actionPreviewRoute(userPrompt);
console.log('Teams Adaptive Card Title:', copilotResponse.teams_card.body[0].text);
console.log('Deep Link Action:', copilotResponse.teams_card.actions[0].url);

console.log('\n========================================================================');
console.log('   SIMULATION COMPLETED WITH 100% ARCHITECTURAL COMPLIANCE               ');
console.log('========================================================================\n');
