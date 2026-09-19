/**
 * Formal machine-readable engineering rule library.
 * Stage 2 implementation for TELECOM_3D_reviwer.
 */

export const FormalRuleLibrary = [
  {
    rule_id: "PAGA-CLASS-A-001",
    system: "PAGA",
    topology: "CLASS_A_LOOP",
    name: "PAGA Class A Loop Continuity & Panel Return",
    description: "Class A loudspeaker loops must originate from and return to the exact same originating amplifier/cabinet (PAGA-CAB-A or PAGA-CAB-B). All segments must be continuous without unapproved wall crossings.",
    requirements: [
      "route must return to originating panel",
      "all segments must be continuous",
      "no unapproved wall crossing",
      "corridor elevation must be maintained",
      "open ground-level routing is prohibited",
      "last-mile connection via dedicated branch conduit"
    ],
    severity: "error",
    standards_reference: "AGSA-PAGA-DES-001, NFPA 72 Class A, IEC 60849"
  },
  {
    rule_id: "PWR-SEP-001",
    system: "POWER",
    topology: "RADIAL",
    name: "Power Separation and Containment Segregation",
    description: "Power cables (LV/HV) must maintain physical segregation from ELV telecom, CCTV data, and PAGA audio circuits (minimum 300 mm clearance or metallic divider barrier). Never share branch conduits.",
    requirements: [
      "radial or point-to-point topology strictly verified",
      "separation from ELV signal cables >= 300mm unless metallic divider present",
      "prohibited from sharing small branch conduits with CCTV/PAGA",
      "voltage class must be documented"
    ],
    severity: "error",
    standards_reference: "IEC 60364-5-52, BS 7671, AGSA-ELEC-SEP-003"
  },
  {
    rule_id: "CTRL-P2P-001",
    system: "CONTROL",
    topology: "POINT_TO_POINT",
    name: "Control Circuit Terminal Relationship & Integrity",
    description: "Control wiring must connect to declared junction box or marshalling panel terminals with explicit node coordinates.",
    requirements: [
      "point-to-point or multidrop integrity verified",
      "panel/device terminal relationship strictly matched",
      "intermediate junction boxes registered in route graph"
    ],
    severity: "error",
    standards_reference: "ISA-5.4, AGSA-CTRL-SPEC-002"
  },
  {
    rule_id: "FO-BEND-STAR-001",
    system: "FO",
    topology: "STAR",
    name: "Fibre Optic Topology, Redundancy and Bend Restrictions",
    description: "Fibre backbone circuits require structured star or redundant ring paths. Minimum dynamic bend radius (20x outer diameter) and dedicated optical containment are enforced.",
    requirements: [
      "star, daisy chain, or redundant ring topology verified",
      "core count, optical type (SM/MM), and bend restrictions maintained",
      "protected containment (innerduct/conduit/trunking) required",
      "redundant paths must not share common unsegmented tray"
    ],
    severity: "error",
    standards_reference: "TIA-568.3-D, ISO/IEC 11801"
  },
  {
    rule_id: "CCTV-DATA-001",
    system: "CCTV",
    topology: "STAR",
    name: "CCTV Data Star Network & Edge Switch Reach",
    description: "CCTV IP cameras must route point-to-point star to an authorized field edge PoE switch or rack room IDF/MDF. Containment must be approved for data signals.",
    requirements: [
      "star or structured network topology",
      "device-to-switch path within 90m channel limit without repeater",
      "approved containment for CCTV_DATA",
      "outdoor runs require UV-resistant and ingress-protected containment"
    ],
    severity: "error",
    standards_reference: "ISO/IEC 11801, IEEE 802.3bt, AGSA-CCTV-DES-004"
  },
  {
    rule_id: "SPK-ZONE-001",
    system: "PAGA",
    topology: "LOOP_OR_RADIAL",
    name: "Speaker Zone Order and Amplifier Return",
    description: "Speakers must follow designated zone groupings. Elevation transitions to ceiling/stanchion mountings must be explicitly detailed.",
    requirements: [
      "loop or zoned radial hierarchy verified",
      "zone assignment consistency across devices",
      "amplifier return required for Class A circuits",
      "speaker elevation adherence (e.g. +4.0m ceiling, +5.0m switchgear, +2.0m cellar)"
    ],
    severity: "error",
    standards_reference: "AGSA-PAGA-STD-005, BS 5839-8"
  },
  {
    rule_id: "WALL-PENETRATION-001",
    system: "ALL",
    topology: "ALL",
    name: "Strict Wall Crossing and Boundary Containment Verification",
    description: "No cable or containment route may cross a building wall, fire compartment, or perimeter barrier without passing through an explicit, approved wall penetration sleeve.",
    requirements: [
      "route must not exit or enter building walls at arbitrary unapproved points",
      "fire-rated sleeve penetration required at compartment boundaries",
      "drawing reference and sleeve diameter must be verified"
    ],
    severity: "error",
    standards_reference: "NFPA 101, IBC Section 714, AGSA-CIV-PEN-001"
  },
  {
    rule_id: "ELEV-TRANSITION-001",
    system: "ALL",
    topology: "ALL",
    name: "Approved Vertical Riser / Drop Continuity",
    description: "A cable or corridor cannot step in elevation without an explicit vertical riser, drop, or approved stanchion transition segment.",
    requirements: [
      "elevation changes must be bridged by vertical riser or drop",
      "no diagonal open-air elevation jumps",
      "vertical allowance length must be accumulated in cable length"
    ],
    severity: "error",
    standards_reference: "AGSA-TELE-CAD-001, §20.2 Containment Invariant"
  },
  {
    rule_id: "ELEV-GROUND-BAN-001",
    system: "ALL",
    topology: "ALL",
    name: "Open Ground-Level Routing Prohibition",
    description: "Routing cables along open ground or floor level (< 0.5m AGL) in corridors or walkways without dedicated underground trench, duct bank, or concrete encasement is strictly prohibited.",
    requirements: [
      "ground level (< 0.5m) corridor routing prohibited",
      "outdoor cables must maintain corridor overhead elevation (>= 4.2m) or buried trench (<= -0.8m)",
      "stanchion transitions must be protected in rigid steel conduit"
    ],
    severity: "error",
    standards_reference: "OSHA 1910.305, NEC 300.5, AGSA-SAFETY-BOD-012"
  },
  {
    rule_id: "CONT-SUITABILITY-001",
    system: "ALL",
    topology: "ALL",
    name: "Containment System Compatibility & Fill Ratio",
    description: "The cable system type must be explicitly listed in the traversed containment's allowed_systems. Conduit fill must not exceed 40%, and tray fill must not exceed 50%.",
    requirements: [
      "cable type in containment allowed_systems",
      "RSGC conduit fill <= 40% (27.8mm bore area = 606.99 mm²)",
      "tray fill <= 50%",
      "group A and group B cables must not mix in the same branch conduit"
    ],
    severity: "error",
    standards_reference: "NEC Chapter 9 Table 1, AGSA-CONT-CALC-002"
  },
  {
    rule_id: "ROUTE-CONTINUITY-001",
    system: "ALL",
    topology: "ALL",
    name: "Route Graph Path Continuity",
    description: "Every cable route must form an unbroken chain of connected segments from source device/panel to destination device/panel.",
    requirements: [
      "points[0] snaps exactly to source device",
      "points[last] snaps exactly to destination device",
      "no disconnected vertices or gaps exceeding drafting tolerance",
      "containment corridor jumping prohibited"
    ],
    severity: "error",
    standards_reference: "AGSA-P2P-CAD-001 §4"
  }
];

export function getRuleById(ruleId) {
  return FormalRuleLibrary.find(r => r.rule_id === ruleId) || null;
}

export function getRulesForSystem(system) {
  return FormalRuleLibrary.filter(r => r.system === 'ALL' || r.system === system);
}
