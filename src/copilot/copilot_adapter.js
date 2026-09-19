/**
 * Microsoft Teams Copilot Adapter & Action Bridge.
 * Stage 7 implementation for TELECOM_3D_reviwer.
 */

import { NeedleIntentParser, NeedleAssistant } from '../needle/needle_assistant.js';
import { getRuleById, FormalRuleLibrary } from '../validator/rules.js';

export class TeamsCopilotAdapter {
  constructor(projectModel, auditLogger) {
    this.projectModel = projectModel;
    this.auditLogger = auditLogger;
    this.assistant = new NeedleAssistant(projectModel);
  }

  /**
   * Main dispatch entry point for Teams Copilot actions.
   */
  async handleCopilotAction(actionName, parameters = {}) {
    switch (actionName) {
      case 'routeCableIntent':
      case 'parseCableIntent':
        return this.actionParseIntent(parameters.prompt || parameters.query);

      case 'previewCableRoute':
        return this.actionPreviewRoute(parameters.prompt || parameters.intent);

      case 'explainRule':
        return this.actionExplainRule(parameters.rule_id);

      case 'listViolations':
        return this.actionListRules();

      case 'getProjectInventory':
        return this.actionGetInventory();

      default:
        throw new Error(`Unknown Copilot action: '${actionName}'`);
    }
  }

  actionParseIntent(prompt) {
    const parsed = NeedleIntentParser.parseRequest(prompt);
    return {
      status: 'SUCCESS',
      parsed_intent: parsed.intent,
      confidence: parsed.confidence,
      evidence: parsed.evidence,
      teams_card: this.createIntentAdaptiveCard(parsed)
    };
  }

  actionPreviewRoute(promptOrIntent, customEvidence = null) {
    const preview = this.assistant.preview_route(promptOrIntent, customEvidence);
    let eventId = null;
    if (this.auditLogger) {
      eventId = this.auditLogger.recordProposal({
        prompt: typeof promptOrIntent === 'string' ? promptOrIntent : JSON.stringify(promptOrIntent),
        intent: preview.intent,
        previewResult: preview
      });
    }

    return {
      status: preview.can_apply ? 'VALIDATED_PREVIEW' : 'VALIDATION_FAILED',
      event_id: eventId,
      can_apply: preview.can_apply,
      preview,
      teams_card: this.createPreviewAdaptiveCard(preview, eventId)
    };
  }

  actionExplainRule(ruleId) {
    const rule = getRuleById(ruleId);
    if (!rule) return { status: 'NOT_FOUND', message: `Rule '${ruleId}' not found.` };
    return {
      status: 'SUCCESS',
      rule,
      teams_card: {
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: `Rule: ${rule.rule_id} - ${rule.name}`, weight: 'Bolder', size: 'Medium' },
          { type: 'TextBlock', text: rule.description, wrap: true },
          { type: 'TextBlock', text: `Governing Reference: ${rule.standards_reference}`, isSubtle: true }
        ]
      }
    };
  }

  actionListRules() {
    return {
      total_rules: FormalRuleLibrary.length,
      rules: FormalRuleLibrary.map(r => ({ id: r.rule_id, name: r.name, severity: r.severity, system: r.system }))
    };
  }

  actionGetInventory() {
    return {
      device_count: this.projectModel.devices?.length || 0,
      panel_count: this.projectModel.panels?.length || 0,
      containment_segment_count: this.projectModel.routeSegments?.length || 0,
      approved_penetration_count: this.projectModel.penetrations?.length || 0,
      committed_cable_count: this.projectModel.cables?.length || 0
    };
  }

  createIntentAdaptiveCard(parsed) {
    return {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        { type: 'TextBlock', text: '📡 Telecom MTO Intent Extracted', weight: 'Bolder', size: 'Medium' },
        {
          type: 'FactSet',
          facts: [
            { title: 'Operation', value: parsed.intent.operation },
            { title: 'Cable Type', value: parsed.intent.cable_type },
            { title: 'Source', value: parsed.intent.source },
            { title: 'Destination', value: parsed.intent.destination },
            { title: 'Elevation', value: `${parsed.intent.elevation_m} m AGL` },
            { title: 'Confidence', value: `${Math.round(parsed.confidence * 100)}%` }
          ]
        }
      ]
    };
  }

  createPreviewAdaptiveCard(preview, eventId) {
    const isValid = preview.can_apply;
    const cable = preview.proposed_cable;
    return {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: isValid ? '✅ Validated Cable Route Proposal' : '❌ Route Rejected by Engineering Validator',
          weight: 'Bolder',
          size: 'Medium',
          color: isValid ? 'Good' : 'Attention'
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Cable Tag', value: cable?.tag || 'N/A' },
            { title: 'Total Length', value: cable ? `${cable.total_length_m} m (${cable.measured_horizontal_length_m}m horiz + ${cable.vertical_allowance_length_m}m vert)` : 'N/A' },
            { title: 'Topology', value: preview.intent?.topology || 'STAR' },
            { title: 'Status', value: isValid ? 'READY FOR USER APPROVAL' : 'REJECTED' }
          ]
        },
        {
          type: 'TextBlock',
          text: isValid
            ? 'Review the 3D model in Telecom MTO before committing this change.'
            : `Violations: ${preview.validation_result?.findings?.map(f => f.message).join(' | ') || preview.error}`,
          wrap: true,
          isSubtle: true
        }
      ],
      actions: [
        {
          type: 'Action.OpenUrl',
          title: '🌐 Open 3D Route Preview',
          url: `http://localhost:3000?previewEventId=${eventId || ''}`
        }
      ]
    };
  }
}
