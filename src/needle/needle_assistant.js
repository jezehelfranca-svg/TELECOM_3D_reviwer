/**
 * Needle Intent Assistant & Preview-Only Tool Execution Layer.
 * Stage 3 implementation for TELECOM_3D_reviwer.
 */

import {
  CableTypes,
  TopologyTypes,
  StandardElevations,
  createValidationFinding
} from '../contract/contract_definitions.js';
import { getRuleById, FormalRuleLibrary } from '../validator/rules.js';
import { DeterministicRouteSolver } from '../engine/route_solver.js';
import { DeterministicRouteValidator } from '../validator/route_validator.js';

export class NeedleIntentParser {
  /**
   * Converts natural language user request into structured intent.
   * Patterned after Needle constrained extraction and confidence scoring.
   * @param {string} prompt
   * @returns {Object} { intent, confidence, evidence }
   */
  static parseRequest(prompt) {
    const text = String(prompt || '').trim();
    const upper = text.toUpperCase();

    // 1. Detect Operation
    let operation = 'route_cable';
    if (upper.includes('INSPECT') || upper.includes('FIND') || upper.includes('WHERE IS')) {
      operation = 'inspect_object';
    } else if (upper.includes('ELEVATION') && (upper.includes('CHANGE') || upper.includes('RAISE') || upper.includes('LOWER'))) {
      operation = 'change_elevation';
    } else if (upper.includes('EXPLAIN') || upper.includes('VIOLATION') || upper.includes('RULE')) {
      operation = 'explain_rule';
    }

    // 2. Detect Cable Type within the cable descriptor clause (prior to 'from')
    const cableClause = text.split(/\bfrom\b/i)[0];
    let cableType = CableTypes.CCTV_DATA;

    if (/\b(FIBRE|FIBER|OPTIC|FO)\b/i.test(cableClause)) {
      cableType = /\bMM\b/i.test(cableClause) ? CableTypes.FO_MM : CableTypes.FO_SM;
    } else if (/\b(PAGA|SPEAKER|AUDIO|SPK)\b/i.test(cableClause)) {
      cableType = /\b(RETURN|RET)\b/i.test(cableClause) ? CableTypes.PAGA_LOOP_RETURN : CableTypes.PAGA_AUDIO;
    } else if (/\b(POWER|230V|110V|400V|LV|FEEDER)\b/i.test(cableClause)) {
      cableType = CableTypes.POWER_LV;
    } else if (/\b(INTERLOCK|INSTRUMENT|VALVE|CONTROL)\b/i.test(cableClause)) {
      cableType = CableTypes.CONTROL;
    } else if (/\b(CCTV|CAMERA|DATA|LAN|CAT6|ETHERNET)\b/i.test(cableClause)) {
      cableType = CableTypes.CCTV_DATA;
    } else {
      if (/\b(FIBRE|FIBER|OPTIC)\b/i.test(text)) cableType = CableTypes.FO_SM;
      else if (/\b(PAGA|SPEAKER)\b/i.test(text)) cableType = CableTypes.PAGA_AUDIO;
      else if (/\bPOWER\b/i.test(text)) cableType = CableTypes.POWER_LV;
    }
    
    // 3. Extract Source
    let source = '';
    const srcMatch = text.match(/from\s+([A-Za-z0-9\-_]+)/i) || text.match(/source\s*[:=]\s*([A-Za-z0-9\-_]+)/i);
    if (srcMatch) {
      source = srcMatch[1].toUpperCase();
    } else {
      // Look for known device prefixes
      const devMatch = text.match(/\b(CCTV-\d+|SPK-\d+|PAGA-CAB-[AB]|JB-[A-Z0-9]+|HSS-\d+)\b/i);
      if (devMatch) source = devMatch[1].toUpperCase();
    }

    // 4. Extract Destination
    let destination = '';
    const dstMatch = text.match(/to\s+([A-Za-z0-9\-_ ]+?)(?=\s+(?:through|via|at|with|using)|$)/i) || text.match(/destination\s*[:=]\s*([A-Za-z0-9\-_]+)/i);
    if (dstMatch) {
      destination = dstMatch[1].trim().toUpperCase().replace(/\s+/g, '_');
    }

    // 5. Extract Preferred Path
    let preferredPath = '';
    const pathMatch = text.match(/(?:through|via)\s+(?:the\s+)?([A-Za-z0-9\-_ ]+?)(?=\s+(?:at|with|using|to)|$)/i);
    if (pathMatch) {
      preferredPath = pathMatch[1].trim().toUpperCase().replace(/\s+/g, '_');
    }

    // 6. Extract Elevation
    let elevation_m = null;
    const elevMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\s+elevation/i) || text.match(/elevation\s*(?:of|at|[:=])?\s*(\d+(?:\.\d+)?)\s*m?/i);
    if (elevMatch) {
      elevation_m = parseFloat(elevMatch[1]);
    } else if (upper.includes('GROUND') || upper.includes('FLOOR')) {
      elevation_m = 0.0;
    }

    // 7. Detect Topology
    let topology = TopologyTypes.STAR;
    if (upper.includes('CLASS A') || upper.includes('CLASS_A') || upper.includes('LOOP') || cableType === CableTypes.PAGA_AUDIO) {
      topology = TopologyTypes.CLASS_A_LOOP;
    } else if (upper.includes('RADIAL')) {
      topology = TopologyTypes.RADIAL;
    } else if (upper.includes('DAISY') || upper.includes('CHAIN')) {
      topology = TopologyTypes.DAISY_CHAIN;
    }

    // Confidence Calculation
    let confidence = 0.35;
    const reasons = [];

    if (source) { confidence += 0.25; reasons.push('Identified source ' + source); }
    else { reasons.push('Missing explicit source'); }

    if (destination) { confidence += 0.25; reasons.push('Identified destination ' + destination); }
    else { reasons.push('Missing explicit destination'); }

    if (elevation_m !== null) { confidence += 0.15; reasons.push('Explicit elevation ' + elevation_m + 'm declared'); }
    else { reasons.push('Implicit elevation used'); }

    confidence = Math.min(1.0, Math.max(0.1, Number(confidence.toFixed(2))));

    const intent = {
      operation,
      cable_type: cableType,
      source: source || 'UNKNOWN_SOURCE',
      destination: destination || 'UNKNOWN_DESTINATION',
      preferred_path: preferredPath || 'DEFAULT_CONTAINMENT',
      elevation_m: elevation_m !== null ? elevation_m : StandardElevations.OVERHEAD_CONTAINMENT,
      topology
    };

    const evidence = {
      confidence_score: confidence,
      rationale: reasons.join('; '),
      source_document: 'TELECOM_MTO_WORKSPACE',
      drawing_number: 'DWG-TEL-001',
      clause_reference: 'AGSA Design Basis §2 / Master Skill V5.0'
    };

    return { intent, confidence, evidence };
  }
}

export class NeedleAssistant {
  /**
   * @param {Object} projectModel
   */
  constructor(projectModel = {}) {
    this.projectModel = projectModel;
    this.solver = new DeterministicRouteSolver(projectModel);
    this.validator = new DeterministicRouteValidator(projectModel);
  }

  /**
   * Tool 1: find_objects
   */
  find_objects({ query, system, category } = {}) {
    const q = (query || '').toUpperCase();
    const results = [];

    for (const d of (this.projectModel.devices || [])) {
      const matchQ = !q || d.tag.toUpperCase().includes(q) || d.category?.toUpperCase().includes(q);
      const matchSys = !system || d.system === system;
      const matchCat = !category || d.category === category;
      if (matchQ && matchSys && matchCat) {
        results.push({ type: 'device', id: d.id, tag: d.tag, system: d.system, category: d.category, location: d.location });
      }
    }

    for (const p of (this.projectModel.panels || [])) {
      const matchQ = !q || p.tag.toUpperCase().includes(q);
      const matchSys = !system || p.system === system;
      if (matchQ && matchSys) {
        results.push({ type: 'panel', id: p.id, tag: p.tag, system: p.system, panelType: p.type, location: p.location });
      }
    }

    for (const s of (this.projectModel.routeSegments || [])) {
      if (q && (s.segment_id?.toUpperCase().includes(q) || s.tag?.toUpperCase().includes(q))) {
        results.push({ type: 'segment', id: s.segment_id, tag: s.tag, elevation: s.elevation_m, allowedSystems: s.allowed_systems });
      }
    }

    return { total: results.length, matches: results };
  }

  /**
   * Tool 2: inspect_object / inspect_device
   */
  inspect_object({ id_or_tag } = {}) {
    const key = String(id_or_tag || '').trim().toUpperCase();
    const obj = this.solver.findObject(key);
    if (!obj) {
      return { found: false, message: `Object '${id_or_tag}' was not found in project database.` };
    }
    return {
      found: true,
      id: obj.id,
      tag: obj.tag,
      system: obj.system,
      category: obj.category || obj.type,
      location: obj.location,
      cable_entry_elevation_m: obj.cable_entry_elevation_m ?? obj.top_elevation_m,
      mounting_elevation_m: obj.mounting_elevation_m ?? obj.base_elevation_m,
      network_group: obj.network_group || 'SHARED',
      room_id: obj.room_id || 'General'
    };
  }

  inspect_device({ device_tag } = {}) {
    return this.inspect_object({ id_or_tag: device_tag });
  }

  /**
   * Tool 3: find_approved_containment
   */
  find_approved_containment({ near_point, system, elevation_m } = {}) {
    const results = [];
    const sys = system || 'CCTV_DATA';
    for (const seg of (this.projectModel.routeSegments || [])) {
      const allowed = seg.allowed_systems || ['ALL'];
      if (allowed.includes('ALL') || allowed.includes(sys)) {
        let matchesElev = true;
        if (elevation_m !== undefined && elevation_m !== null) {
          matchesElev = Math.abs((seg.elevation_m ?? 0) - elevation_m) <= 0.5;
        }
        if (matchesElev) {
          results.push({
            segment_id: seg.segment_id,
            tag: seg.tag,
            elevation_m: seg.elevation_m,
            type: seg.type,
            outdoor: seg.outdoor,
            allowed_systems: allowed
          });
        }
      }
    }
    return { count: results.length, approved_segments: results };
  }

  /**
   * Tool 4: preview_route (Preview-Only Mode)
   * Calculates path and validates it. DOES NOT MODIFY PROJECT DATA!
   */
  preview_route(intentOrPrompt, customEvidence = null) {
    let parsedIntent;
    let evidence;

    if (typeof intentOrPrompt === 'string') {
      const parsed = NeedleIntentParser.parseRequest(intentOrPrompt);
      parsedIntent = parsed.intent;
      evidence = parsed.evidence;
    } else {
      parsedIntent = intentOrPrompt;
      evidence = {
        confidence_score: 0.95,
        rationale: 'Direct structured intent invocation',
        source_document: 'TELECOM_MTO_ASSISTANT',
        drawing_number: 'DWG-TEL-001'
      };
    }

    try {
      // 1. Deterministic Route Calculation
      const proposedCable = this.solver.calculateRoute(parsedIntent);

      // 2. Deterministic Rule Validation
      const validationResult = this.validator.validateCandidateRoute(proposedCable);

      return {
        mode: 'PREVIEW_ONLY',
        can_apply: validationResult.valid,
        intent: parsedIntent,
        evidence,
        proposed_cable: proposedCable,
        validation_result: validationResult,
        user_action_required: 'Review proposed 3D path and click Apply to commit changes.'
      };
    } catch (err) {
      return {
        mode: 'PREVIEW_ONLY',
        can_apply: false,
        intent: parsedIntent,
        evidence,
        error: err.message,
        validation_result: {
          valid: false,
          findings: [createValidationFinding({
            rule_id: 'ROUTE-CONTINUITY-001',
            severity: 'error',
            message: err.message,
            violation_type: 'ROUTING_FAILURE'
          })],
          passed_rules: []
        }
      };
    }
  }

  /**
   * Tool 5: preview_elevation_change
   */
  preview_elevation_change({ route_id, from_elev, to_elev, riser_location } = {}) {
    const deltaZ = Math.abs(to_elev - from_elev);
    const loc = riser_location || { x: 0, y: 0 };
    return {
      mode: 'PREVIEW_ONLY',
      route_id,
      from_elev,
      to_elev,
      delta_z_m: deltaZ,
      riser_location: loc,
      transition_type: to_elev > from_elev ? 'vertical_riser' : 'vertical_drop',
      conduit_spec: '32mm RSGC Conduit with standard threaded couplings',
      recommendation: `Insert vertical transition node at (${loc.x}, ${loc.y}) spanning ${from_elev}m to ${to_elev}m.`
    };
  }

  /**
   * Tool 6: explain_rule_violation
   */
  explain_rule_violation({ finding_id, rule_id } = {}) {
    const rule = getRuleById(rule_id);
    if (!rule) {
      return {
        found: false,
        rule_id,
        explanation: `Rule ${rule_id} is a project-specific constraint.`
      };
    }
    return {
      found: true,
      rule_id: rule.rule_id,
      name: rule.name,
      description: rule.description,
      requirements: rule.requirements,
      standards_reference: rule.standards_reference,
      remediation_guidance: `Ensure that candidate path strictly conforms to all requirements listed in ${rule.standards_reference}.`
    };
  }
}
