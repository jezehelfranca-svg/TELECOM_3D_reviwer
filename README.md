# Telecom MTO 3D Reviewer ? Experimental Architecture

> **Deterministic Graph Cable Routing, Formal Rule Validator & Needle Intent Assistant with Interactive 3D Preview**

This repository contains the experimental implementation of the **Hybrid Needle + Deterministic Router + Hard-Rule Validator** architecture for industrial Telecom, Security, and PAGA systems design.

---

## ??? Architectural Core Principles

```
???????????????????????????????????????????????????????????????
? 1. Needle Intent & Tool Layer                               ?
?    ? Natural language understanding (offline / local)       ?
?    ? Converts prompts to structured intent & topologies     ?
?    ? Calls read-only tools (find_objects, preview_route)    ?
?    ? STRICT INVARIANT: Cannot mutate project state directly ?
???????????????????????????????????????????????????????????????
                               ?
                               ?
???????????????????????????????????????????????????????????????
? 2. Deterministic Graph Routing Engine                       ?
?    ? Constrained 3D spatial graph of corridors & sleeves    ?
?    ? Orthogonal tapping, branch conduits & vertical drops   ?
?    ? PAGA Class A loop pathfinding & panel return           ?
?    ? Exact compounding vertical lengths: L_vert = ?|?z|     ?
???????????????????????????????????????????????????????????????
                               ?
                               ?
???????????????????????????????????????????????????????????????
? 3. Hard Engineering Rule Validator                          ?
?    ? Machine-readable rule library (NFPA, IBC, IEC, AGSA)   ?
?    ? Rejects arbitrary wall exits without sleeves           ?
?    ? Rejects open ground-level corridor routing (<0.5m)     ?
?    ? Enforces containment system compatibility & separation ?
???????????????????????????????????????????????????????????????
                               ?
                               ?
???????????????????????????????????????????????????????????????
? 4. Interactive 3D Preview & Controlled Editing Gate         ?
?    ? Three.js WebGL viewport with glowing proposed curves   ?
?    ? 3D violation callout pins at exact spatial breach coordinates
?    ? Strict 2-Step Gate: Proposal ? Validation ? User Apply  ?
?    ? Audited event recording of every decision & diff       ?
???????????????????????????????????????????????????????????????
```

---

## ?? Implementation Plan & Stages

### Stage 1: The Canonical Wiring Contract (`src/contract/`)
- **JSON Schema:** [`src/contract/wiring_contract.json`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/src/contract/wiring_contract.json)
- **JavaScript Models & Enums:** [`src/contract/contract_definitions.js`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/src/contract/contract_definitions.js)
- Covers 10 canonical entities:
  1. `Device`: Coordinates, mounting elevation, cable entry elevation, network group (A/B).
  2. `Panel`: Cabinets, junction boxes, edge switches, MDF/IDF racks.
  3. `Cable`: Waypoints, horizontal/vertical length arithmetic, voltage class, topology.
  4. `Containment`: Ladder trays, conduits, duct banks, fill ratio (<=40% RSGC).
  5. `RouteSegment`: Corridor containments, branch conduits, wall penetration segments.
  6. `ElevationTransition`: Vertical risers, drops, and stanchions.
  7. `WallPenetration`: Fire compartment boundaries, sleeve diameter, approved systems.
  8. `TopologyTypes`: `CLASS_A_LOOP`, `RADIAL`, `STAR`, `DAISY_CHAIN`, `MULTIDROP`.
  9. `ValidationFinding`: Severity, rule ID, spatial violation coordinates, remediation.
  10. `ConfidenceAndEvidence`: Confidence scoring (0-100%), rationale, drawing citations.

### Stage 2: Formal Rule Library & Deterministic Graph Solver
- **Rule Library:** [`src/validator/rules.js`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/src/validator/rules.js)
  - `PAGA-CLASS-A-001`: Outbound and return continuity to originating cabinet.
  - `PWR-SEP-001`: Segregation of power from signal (prohibited from sharing small branch conduits).
  - `CTRL-P2P-001`: Point-to-point and multidrop terminal relationships.
  - `FO-BEND-STAR-001`: Fibre optic bend radius limits and redundant star paths.
  - `CCTV-DATA-001`: Device-to-switch path, 90m channel limit, approved containment.
  - `SPK-ZONE-001`: Zone hierarchy, amplifier channel capacity, elevation adherence.
  - `WALL-PENETRATION-001`: Strict wall crossing validation (rejects unapproved penetrations).
  - `ELEV-TRANSITION-001`: Rejects unapproved elevation changes without vertical risers/drops.
  - `ELEV-GROUND-BAN-001`: Rejects open ground-level routing (<0.5m AGL) in corridors.
  - `CONT-SUITABILITY-001`: System suitability and 40% conduit fill checks.
  - `ROUTE-CONTINUITY-001`: Unbroken segment chain and exact terminal snapping.
- **Deterministic Solver:** [`src/engine/route_solver.js`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/src/engine/route_solver.js)
  - Constrained 3D Dijkstra/A* pathfinding.
  - Automatic orthogonal tapping and corridor subdivision.
  - Compounding 3D vertical allowances: $L_{\text{vert}} = \sum |\Delta z|$.
- **Engineering Validator:** [`src/validator/route_validator.js`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/src/validator/route_validator.js)
  - 2D/3D geometric intersection algorithms detecting unauthorized wall breaches.

### Stage 3: Preview-Only Needle Assistant (`src/needle/`)
- **Assistant & Parser:** [`src/needle/needle_assistant.js`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/src/needle/needle_assistant.js)
- Implements 6 structured tools:
  1. `find_objects({ query, system, category })`
  2. `inspect_device({ device_tag })` / `inspect_object({ id_or_tag })`
  3. `find_approved_containment({ near_point, system, elevation_m })`
  4. `preview_route(promptOrIntent)` ? **Preview-only, zero side effects**
  5. `preview_elevation_change({ route_id, from_elev, to_elev, riser_location })`
  6. `explain_rule_violation({ finding_id, rule_id })`

### Stage 4 & 5: 3D Viewport Integration & Controlled Editing Gate
- **Interactive Offline HTML:** [`Telecom_3D_Reviewer_App.html`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/Telecom_3D_Reviewer_App.html) / [`index.html`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/index.html)
- **Three.js Scene Controller:** [`src/viewer/three_viewer_controller.js`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/src/viewer/three_viewer_controller.js)
- **Audit Logger:** [`src/recorder/audit_logger.js`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/src/recorder/audit_logger.js)
- **2-Step Apply Gate:**
  `Needle proposal ? validator ? 3D preview ? user Apply ? saved edit`
- Proposals cannot bypass the user confirmation gate.

### Stage 6: Automated Test Suite (`tests/`)
- **Test Runner:** [`tests/run_all_tests.js`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/tests/run_all_tests.js)
- **34 automated assertions across 10 scenarios:**
  1. Valid PAGA Class A loop requests (panel return).
  2. Power and control cable requests (segregation & P2P).
  3. Singlemode fibre star routes through fire sleeves.
  4. CCTV data routes through outdoor corridors at 4.5m.
  5. Requests with missing elevations (safe defaults & calibrated confidence).
  6. Requests with ambiguous destinations (clarification flags).
  7. Requests that attempt invalid wall exits (strict rejection).
  8. Requests that incorrectly route cables at ground level (strict rejection).
  9. Proposal invariance (project state never mutates without user Apply).
  10. Audit log export integrity and event history.

### Stage 7: Teams Copilot Adapter (`src/copilot/`)
- **Copilot Adapter:** [`src/copilot/copilot_adapter.js`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/src/copilot/copilot_adapter.js)
- **REST Server:** [`src/copilot/server.js`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/src/copilot/server.js)
- Formats Microsoft Teams Adaptive Cards with 3D deep-links and validation summaries.

---

## ?? Quick Start Guide

### 1. Run Automated Test Suite
```bash
npm test
```
*(Runs all 34 contract, solver, and validator assertions)*

### 2. Run End-to-End Simulation
```bash
npm run demo
```
*(Executes full user journey from natural language prompt to 3D preview, validation, and controlled commit)*

### 3. Launch Local Reviewer Web Server
```bash
npm start
```
*(Starts REST bridge and hosts the 3D Reviewer at http://localhost:3000)*

### 4. Standalone Offline Browser Operation
Double-click [`Telecom_3D_Reviewer_App.html`](file:///d:/Projects/AGSA/TELECOM_3D_reviwer/Telecom_3D_Reviewer_App.html) in Windows Explorer to open the application directly in Chrome or Edge with zero network connectivity required.

---

## ?? License
Apache-2.0. Copyright (c) 2026 AGSA Telecom Systems.
