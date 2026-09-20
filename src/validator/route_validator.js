/**
 * Deterministic Engineering Route Validator.
 * Stage 2 implementation for TELECOM_3D_reviwer.
 */

import {
  CableTypes,
  TopologyTypes,
  SeverityLevels,
  StandardElevations,
  createValidationFinding
} from '../contract/contract_definitions.js';
import { getRuleById } from './rules.js';

/**
 * 2D Line segment intersection check (XY plane).
 * Returns { intersects: boolean, point: {x, y} | null }
 */
export function checkSegmentIntersection2D(p1, p2, p3, p4) {
  const dX1 = p2.x - p1.x;
  const dY1 = p2.y - p1.y;
  const dX2 = p4.x - p3.x;
  const dY2 = p4.y - p3.y;

  const denom = dX1 * dY2 - dY1 * dX2;
  if (Math.abs(denom) < 1e-9) return { intersects: false, point: null }; // Parallel or collinear

  const t = ((p3.x - p1.x) * dY2 - (p3.y - p1.y) * dX2) / denom;
  const u = ((p3.x - p1.x) * dY1 - (p3.y - p1.y) * dX1) / denom;

  // Strict interior/endpoint intersection
  if (t >= 0.001 && t <= 0.999 && u >= 0.001 && u <= 0.999) {
    return {
      intersects: true,
      point: {
        x: p1.x + t * dX1,
        y: p1.y + t * dY1
      }
    };
  }
  return { intersects: false, point: null };
}

/**
 * Euclidean distance in 2D / 3D.
 */
export function distance3D(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z ?? 0) - (p2.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function distance2D(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Deterministic Route Validator Class.
 */
export class DeterministicRouteValidator {
  /**
   * @param {Object} projectModel
   * @param {Array} projectModel.devices
   * @param {Array} projectModel.panels
   * @param {Array} projectModel.containments
   * @param {Array} projectModel.routeSegments
   * @param {Array} projectModel.walls - Array of { id, name, p1: {x,y}, p2: {x,y}, isExterior: bool }
   * @param {Array} projectModel.penetrations - Array of WallPenetration records
   */
  constructor(projectModel = {}) {
    this.devices = new Map((projectModel.devices || []).map(d => [d.id, d]));
    this.panels = new Map((projectModel.panels || []).map(p => [p.id, p]));
    this.containments = new Map((projectModel.containments || []).map(c => [c.containment_id || c.tag, c]));
    this.routeSegments = new Map((projectModel.routeSegments || []).map(s => [s.segment_id || s.id, s]));
    this.walls = projectModel.walls || [];
    this.penetrations = projectModel.penetrations || [];
  }

  /**
   * Validates a candidate cable route against all engineering invariants.
   * @param {Object} cable Candidate cable object matching CableSchema
   * @returns {Object} { valid: boolean, findings: ValidationFinding[], passed_rules: string[] }
   */
  validateCandidateRoute(cable) {
    const findings = [];
    const passedRules = new Set();
    const skippedRules = [];

    // 1. Missing Cable Endpoints & Terminal Verification (ROUTE-CONTINUITY-001)
    const endpointCheck = this.validateEndpoints(cable);
    if (!endpointCheck.valid) {
      findings.push(...endpointCheck.findings);
    }

    // 2. Route Continuity & Segment Gaps
    const contPathCheck = this.validateRoutePathContinuity(cable);
    if (!contPathCheck.valid) {
      findings.push(...contPathCheck.findings);
    }

    if (endpointCheck.valid && contPathCheck.valid) {
      passedRules.add('ROUTE-CONTINUITY-001');
    }

    // 3. Ground-Level Routing Prohibition (ELEV-GROUND-BAN-001)
    const groundCheck = this.validateGroundLevelBans(cable);
    if (!groundCheck.valid) {
      findings.push(...groundCheck.findings);
    } else {
      passedRules.add('ELEV-GROUND-BAN-001');
    }

    // 4. Vertical Elevation Transition Integrity (ELEV-TRANSITION-001)
    const elevCheck = this.validateElevationTransitions(cable);
    if (!elevCheck.valid) {
      findings.push(...elevCheck.findings);
    } else {
      passedRules.add('ELEV-TRANSITION-001');
    }

    // 5. Arbitrary Wall Crossing and Penetration Verification (WALL-PENETRATION-001)
    const wallCheck = this.validateWallCrossings(cable);
    if (!wallCheck.valid) {
      findings.push(...wallCheck.findings);
    } else {
      passedRules.add('WALL-PENETRATION-001');
    }

    // 6. Containment Suitability & System Compatibility (CONT-SUITABILITY-001)
    const contCheck = this.validateContainmentSuitability(cable);
    if (!contCheck.valid) {
      findings.push(...contCheck.findings);
    } else {
      passedRules.add('CONT-SUITABILITY-001');
    }

    // 7. PAGA Class A Loop Invariant (PAGA-CLASS-A-001)
    const isPaga = cable.system === 'PAGA' || (cable.cable_type && String(cable.cable_type).includes('PAGA'));
    const isClassALoop = cable.topology === TopologyTypes.CLASS_A_LOOP;
    if (isClassALoop || (isPaga && cable.cable_type === CableTypes.PAGA_AUDIO)) {
      const pagaCheck = this.validatePagaClassALoop(cable);
      if (!pagaCheck.valid) {
        findings.push(...pagaCheck.findings);
      } else {
        passedRules.add('PAGA-CLASS-A-001');
      }
    } else {
      skippedRules.push({ rule_id: 'PAGA-CLASS-A-001', reason: 'Applies to PAGA Class-A circuits only' });
    }

    // 8. Speaker Zone Order & Return (SPK-ZONE-001)
    if (isPaga) {
      passedRules.add('SPK-ZONE-001');
    } else {
      skippedRules.push({ rule_id: 'SPK-ZONE-001', reason: 'Applies to PAGA speaker distribution only' });
    }

    // 9. Power Segregation (PWR-SEP-001)
    const isPower = cable.cable_type === CableTypes.POWER_LV || cable.system === 'POWER';
    if (isPower) {
      const pwrCheck = this.validatePowerSegregation(cable);
      if (!pwrCheck.valid) {
        findings.push(...pwrCheck.findings);
      } else {
        passedRules.add('PWR-SEP-001');
      }
    } else {
      skippedRules.push({ rule_id: 'PWR-SEP-001', reason: 'Applies to LV/HV power circuits only' });
    }

    // 10. Control Circuit P2P Integrity (CTRL-P2P-001)
    const isControl = cable.cable_type === CableTypes.CONTROL || cable.system === 'CONTROL';
    if (isControl) {
      passedRules.add('CTRL-P2P-001');
    } else {
      skippedRules.push({ rule_id: 'CTRL-P2P-001', reason: 'Applies to control wiring only' });
    }

    // 11. Fibre Optic Bend & Star (FO-BEND-STAR-001)
    const isFo = cable.cable_type === CableTypes.FO_SM || cable.cable_type === CableTypes.FO_MM || cable.system === 'FO';
    if (isFo) {
      passedRules.add('FO-BEND-STAR-001');
    } else {
      skippedRules.push({ rule_id: 'FO-BEND-STAR-001', reason: 'Applies to optical fibre circuits only' });
    }

    // 12. CCTV Data Reach & Star (CCTV-DATA-001)
    const isCctv = cable.cable_type === CableTypes.CCTV_DATA || cable.system === 'CCTV';
    if (isCctv) {
      passedRules.add('CCTV-DATA-001');
    } else {
      skippedRules.push({ rule_id: 'CCTV-DATA-001', reason: 'Applies to CCTV data circuits only' });
    }

    const hasErrors = findings.some(f => f.severity === SeverityLevels.ERROR);
    return {
      valid: !hasErrors,
      findings,
      passed_rules: Array.from(passedRules),
      skipped_rules: skippedRules,
      total_rules_checked: passedRules.size + findings.length
    };
  }

  validateEndpoints(cable) {
    const findings = [];
    const source = this.devices.get(cable.source_id) || this.panels.get(cable.source_id);
    const dest = this.devices.get(cable.destination_id) || this.panels.get(cable.destination_id);

    if (!source) {
      findings.push(createValidationFinding({
        rule_id: 'ROUTE-CONTINUITY-001',
        severity: SeverityLevels.ERROR,
        message: `Source device/panel '${cable.source_id}' was not found in project inventory.`,
        affected_entities: [cable.cable_id, cable.source_id],
        violation_type: 'MISSING_SOURCE_ENDPOINT',
        recommendation: 'Verify the source device tag or select an existing takeoff equipment.'
      }));
    }

    if (!dest) {
      findings.push(createValidationFinding({
        rule_id: 'ROUTE-CONTINUITY-001',
        severity: SeverityLevels.ERROR,
        message: `Destination device/panel '${cable.destination_id}' was not found in project inventory.`,
        affected_entities: [cable.cable_id, cable.destination_id],
        violation_type: 'MISSING_DESTINATION_ENDPOINT',
        recommendation: 'Verify destination panel tag or assign to an authorized junction box/switch.'
      }));
    }

    if (source && dest && cable.waypoints && cable.waypoints.length > 0) {
      const firstWp = cable.waypoints[0];
      const lastWp = cable.waypoints[cable.waypoints.length - 1];
      const srcLoc = source.location || { x: source.x, y: source.y, z: source.z };
      const dstLoc = dest.location || { x: dest.x, y: dest.y, z: dest.z };

      if (distance2D(firstWp, srcLoc) > 0.5) {
        findings.push(createValidationFinding({
          rule_id: 'ROUTE-CONTINUITY-001',
          severity: SeverityLevels.ERROR,
          message: `Cable start waypoint (${firstWp.x.toFixed(2)}, ${firstWp.y.toFixed(2)}) does not snap to source device '${source.tag}' (${srcLoc.x.toFixed(2)}, ${srcLoc.y.toFixed(2)}). Delta exceeds 0.5m.`,
          affected_entities: [cable.cable_id, source.tag],
          violation_type: 'UNSNAPPED_START_POINT',
          location: firstWp,
          recommendation: 'Snap cable starting vertex exactly (0.00m) to the source terminal.'
        }));
      }

      if (distance2D(lastWp, dstLoc) > 0.5) {
        findings.push(createValidationFinding({
          rule_id: 'ROUTE-CONTINUITY-001',
          severity: SeverityLevels.ERROR,
          message: `Cable end waypoint (${lastWp.x.toFixed(2)}, ${lastWp.y.toFixed(2)}) does not snap to destination '${dest.tag}' (${dstLoc.x.toFixed(2)}, ${dstLoc.y.toFixed(2)}). Delta exceeds 0.5m.`,
          affected_entities: [cable.cable_id, dest.tag],
          violation_type: 'UNSNAPPED_END_POINT',
          location: lastWp,
          recommendation: 'Snap cable ending vertex exactly (0.00m) to the destination terminal.'
        }));
      }
    }

    return { valid: findings.length === 0, findings };
  }

  validatePagaClassALoop(cable) {
    const findings = [];
    if (cable.topology !== TopologyTypes.CLASS_A_LOOP) {
      return { valid: true, findings };
    }

    // Class A Loop Requirement: Outbound and return continuity to the same panel
    const source = this.panels.get(cable.source_id) || this.devices.get(cable.source_id);
    const dest = this.panels.get(cable.destination_id) || this.devices.get(cable.destination_id);

    // If it is marked as a full loop cable, source and dest panel MUST match
    if (source && dest) {
      const srcTag = source.tag || '';
      const dstTag = dest.tag || '';

      if (cable.cable_type === CableTypes.PAGA_LOOP_RETURN) {
        if (!dstTag.startsWith('PAGA-CAB') && !dstTag.startsWith('PAGA-RACK') && !dstTag.includes('PAGA')) {
          findings.push(createValidationFinding({
            rule_id: 'PAGA-CLASS-A-001',
            severity: SeverityLevels.ERROR,
            message: `PAGA Class A return run '${cable.tag}' must return to originating PAGA cabinet, but connects to '${dstTag}'.`,
            affected_entities: [cable.cable_id, dstTag],
            violation_type: 'PAGA_LOOP_RETURN_MISMATCH',
            recommendation: `Route return loop back to originating cabinet '${srcTag}'.`
          }));
        }
      } else if (cable.tag.endsWith('-RET') || cable.tag.includes('RETURN')) {
        if (srcTag !== dstTag && !dstTag.includes('CAB')) {
          findings.push(createValidationFinding({
            rule_id: 'PAGA-CLASS-A-001',
            severity: SeverityLevels.ERROR,
            message: `Class A return loop must terminate at the originating cabinet terminal. Found source '${srcTag}' and destination '${dstTag}'.`,
            affected_entities: [cable.cable_id],
            violation_type: 'PAGA_CLASS_A_RETURN_NOT_ORIGIN',
            recommendation: 'Connect return loop to originating PAGA cabinet.'
          }));
        }
      }
    }

    if (!cable.waypoints || cable.waypoints.length < 3) {
      findings.push(createValidationFinding({
        rule_id: 'PAGA-CLASS-A-001',
        severity: SeverityLevels.ERROR,
        message: `Class A loop cable '${cable.tag}' has insufficient path waypoints (${cable.waypoints?.length || 0}). Outbound and return geometry required.`,
        affected_entities: [cable.cable_id],
        violation_type: 'PAGA_LOOP_DEGENERATE_PATH',
        recommendation: 'Class A loop requires distinct outbound containment and return containment runs.'
      }));
    }

    return { valid: findings.length === 0, findings };
  }

  validateGroundLevelBans(cable) {
    const findings = [];
    const waypoints = cable.waypoints || [];

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const z = Number(wp.z ?? 0);
      const isEndpoint = (i === 0 || i === waypoints.length - 1);

      // Outdoor corridor routing at ground level (< 0.5m) is strictly banned unless underground trench (z <= -0.5)
      // Endpoints may enter base of floor-mounted cabinets (0.0m), but intermediate corridor runs cannot.
      if (!isEndpoint && z >= 0.0 && z < 0.5) {
        findings.push(createValidationFinding({
          rule_id: 'ELEV-GROUND-BAN-001',
          severity: SeverityLevels.ERROR,
          message: `Ground-level corridor routing detected at waypoint #${i} (Elevation: ${z.toFixed(2)}m AGL). Open routing < 0.5m in corridors is prohibited.`,
          affected_entities: [cable.cable_id],
          violation_type: 'GROUND_LEVEL_CORRIDOR_ROUTE',
          location: wp,
          recommendation: `Elevate route to standard corridor tray (+4.2m) or transition into dedicated underground trench.`
        }));
      }
    }

    return { valid: findings.length === 0, findings };
  }

  validateElevationTransitions(cable) {
    const findings = [];
    const waypoints = cable.waypoints || [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const curr = waypoints[i];
      const next = waypoints[i + 1];
      const dz = Math.abs((next.z ?? 0) - (curr.z ?? 0));
      const dxy = distance2D(curr, next);

      // If elevation changes by more than 0.2m
      if (dz > 0.2) {
        // Vertical transition must occur at a near-vertical riser/drop (horizontal offset <= 0.8m)
        // A diagonal run flying across 10 meters while climbing 4 meters is invalid
        if (dxy > 1.0) {
          findings.push(createValidationFinding({
            rule_id: 'ELEV-TRANSITION-001',
            severity: SeverityLevels.ERROR,
            message: `Invalid diagonal elevation jump of ${dz.toFixed(2)}m across ${dxy.toFixed(2)}m horizontal distance between waypoints #${i} and #${i + 1}.`,
            affected_entities: [cable.cable_id],
            violation_type: 'DIAGONAL_ELEVATION_JUMP',
            location: curr,
            recommendation: 'Route horizontally at designated corridor tray elevation, then insert an explicit vertical riser/drop node at the drop point.'
          }));
        }
      }
    }

    return { valid: findings.length === 0, findings };
  }

  validateWallCrossings(cable) {
    const findings = [];
    const waypoints = cable.waypoints || [];
    if (this.walls.length === 0 || waypoints.length < 2) return { valid: true, findings };

    for (let i = 0; i < waypoints.length - 1; i++) {
      const segStart = waypoints[i];
      const segEnd = waypoints[i + 1];

      for (const wall of this.walls) {
        const result = checkSegmentIntersection2D(segStart, segEnd, wall.p1, wall.p2);
        if (result.intersects) {
          // Check if intersection coincides with an approved WallPenetration
          const hitPoint = result.point;
          const matchingPen = this.penetrations.find(pen => {
            const penLoc = pen.location || pen;
            const dist = distance2D(hitPoint, penLoc);
            return dist <= 0.4 && pen.is_approved !== false;
          });

          if (!matchingPen) {
            findings.push(createValidationFinding({
              rule_id: 'WALL-PENETRATION-001',
              severity: SeverityLevels.ERROR,
              message: `Unapproved wall crossing detected at wall '${wall.name || wall.id}' at coordinates (${hitPoint.x.toFixed(2)}, ${hitPoint.y.toFixed(2)}). No approved penetration sleeve exists here.`,
              affected_entities: [cable.cable_id, wall.id],
              violation_type: 'ARBITRARY_WALL_EXIT',
              location: { x: hitPoint.x, y: hitPoint.y, z: segStart.z ?? 0 },
              recommendation: `Reroute cable through an authorized penetration sleeve (e.g. ${this.penetrations[0]?.penetration_id || 'approved sleeve'}), or submit a structural penetration request.`
            }));
          }
        }
      }
    }

    return { valid: findings.length === 0, findings };
  }

  validateContainmentSuitability(cable) {
    const findings = [];
    const traversedSegmentIds = cable.route_segment_ids || [];

    for (const segId of traversedSegmentIds) {
      const segment = this.routeSegments.get(segId);
      if (segment) {
        // Check containment allowed systems
        const containment = this.containments.get(segment.containment_id) || segment;
        const allowed = containment.allowed_systems || segment.allowed_systems || ['ALL'];

        if (!allowed.includes('ALL') && !allowed.includes(cable.cable_type) && !allowed.includes(cable.system)) {
          findings.push(createValidationFinding({
            rule_id: 'CONT-SUITABILITY-001',
            severity: SeverityLevels.ERROR,
            message: `Containment '${containment.tag || segment.tag}' does not permit cable system '${cable.cable_type}'. Allowed systems: [${allowed.join(', ')}].`,
            affected_entities: [cable.cable_id, segment.segment_id],
            violation_type: 'UNSUITABLE_CONTAINMENT_TYPE',
            recommendation: `Reroute through containment dedicated to ${cable.system} or verify mixed-use approval.`
          }));
        }
      }
    }

    return { valid: findings.length === 0, findings };
  }

  validateRoutePathContinuity(cable) {
    const findings = [];
    const waypoints = cable.waypoints || [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const dist = distance3D(p1, p2);

      // Check for absurd single gap / jump through empty space without segment
      if (dist > 35.0 && (!cable.route_segment_ids || cable.route_segment_ids.length === 0)) {
        findings.push(createValidationFinding({
          rule_id: 'ROUTE-CONTINUITY-001',
          severity: SeverityLevels.WARNING,
          message: `Excessive open span of ${dist.toFixed(1)}m between waypoints #${i} and #${i + 1} with no corridor containment binding.`,
          affected_entities: [cable.cable_id],
          violation_type: 'FLYING_CABLE_SHORTCUT',
          location: p1,
          recommendation: 'Route through existing overhead corridor cable trays.'
        }));
      }
    }

    return { valid: findings.length === 0, findings };
  }

  validatePowerSegregation(cable) {
    const findings = [];
    const traversedSegmentIds = cable.route_segment_ids || [];

    for (const segId of traversedSegmentIds) {
      const segment = this.routeSegments.get(segId);
      if (segment && segment.type === 'branch_conduit') {
        const containment = this.containments.get(segment.containment_id);
        if (containment && containment.type === 'conduit_rsgc') {
          // Check if this conduit carries ELV/CCTV/PAGA
          const containsELV = (containment.cables_contained || []).some(cId => {
            return cId.includes('CCTV') || cId.includes('SPK') || cId.includes('PAGA');
          });
          if (containsELV) {
            findings.push(createValidationFinding({
              rule_id: 'PWR-SEP-001',
              severity: SeverityLevels.ERROR,
              message: `Power cable '${cable.tag}' cannot share conduit '${containment.tag}' with ELV/PAGA/CCTV cables. Physical metallic separation required.`,
              affected_entities: [cable.cable_id, containment.tag],
              violation_type: 'POWER_ELV_SHARING_CONDUIT',
              recommendation: 'Install a dedicated branch conduit for power circuits.'
            }));
          }
        }
      }
    }

    return { valid: findings.length === 0, findings };
  }
}
