/**
 * Controlled Editing & Audited Event Recorder.
 * Stage 5 implementation for TELECOM_3D_reviwer.
 */

export class AuditLogger {
  constructor(projectModel = {}) {
    this.projectModel = projectModel;
    this.events = [];
    if (!this.projectModel.cables) {
      this.projectModel.cables = [];
    }
  }

  /**
   * Records a new proposed routing event.
   * STRICT INVARIANT: Does not modify this.projectModel.cables!
   * @param {Object} proposal
   * @returns {string} event_id
   */
  recordProposal({ prompt, intent, toolCall, previewResult }) {
    const eventId = `EVT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const event = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      request_prompt: String(prompt || ''),
      intent: intent || null,
      tool_calls: toolCall ? [toolCall] : [],
      validation_result: previewResult?.validation_result || null,
      proposed_cable: previewResult?.proposed_cable || null,
      can_apply: previewResult?.can_apply ?? false,
      user_decision: 'PENDING_REVIEW',
      user_decision_timestamp: null,
      user_notes: '',
      diff_summary: null
    };

    this.events.push(event);
    return eventId;
  }

  /**
   * Applies an approved proposal to project data.
   * STRICT INVARIANT: Requires explicit user action and valid validation results!
   * @param {string} eventId
   * @param {Object} options
   */
  applyProposal(eventId, options = {}) {
    const event = this.events.find(e => e.event_id === eventId);
    if (!event) {
      throw new Error(`Event '${eventId}' was not found in audit log.`);
    }

    if (event.user_decision === 'APPLIED') {
      throw new Error(`Event '${eventId}' has already been applied.`);
    }

    if (!event.can_apply || (event.validation_result && !event.validation_result.valid)) {
      throw new Error(`Cannot apply proposal '${eventId}': Hard engineering validation failed with critical errors.`);
    }

    const proposedCable = event.proposed_cable;
    if (!proposedCable) {
      throw new Error(`Proposal '${eventId}' does not contain valid cable geometry.`);
    }

    // Apply change to project model
    const committedCable = {
      ...proposedCable,
      status: 'COMMITTED',
      committed_at: new Date().toISOString()
    };

    // Replace existing cable with same tag or append
    const existingIdx = this.projectModel.cables.findIndex(c => c.tag === committedCable.tag || c.cable_id === committedCable.cable_id);
    let diffType = 'ADDED';
    if (existingIdx >= 0) {
      this.projectModel.cables[existingIdx] = committedCable;
      diffType = 'MODIFIED';
    } else {
      this.projectModel.cables.push(committedCable);
    }

    // Record decision in event
    event.user_decision = 'APPLIED';
    event.user_decision_timestamp = new Date().toISOString();
    event.user_notes = options.notes || 'Approved by Lead Telecom Engineer in 3D Preview';
    event.diff_summary = {
      type: diffType,
      cable_tag: committedCable.tag,
      total_length_m: committedCable.total_length_m,
      waypoint_count: committedCable.waypoints?.length || 0,
      route_segment_count: committedCable.route_segment_ids?.length || 0
    };

    return {
      ok: true,
      event_id: eventId,
      cable: committedCable,
      diff_summary: event.diff_summary
    };
  }

  /**
   * User rejects a proposal.
   */
  rejectProposal(eventId, reason = 'Rejected by user') {
    const event = this.events.find(e => e.event_id === eventId);
    if (!event) throw new Error(`Event '${eventId}' was not found.`);

    event.user_decision = 'REJECTED';
    event.user_decision_timestamp = new Date().toISOString();
    event.user_notes = reason;

    return { ok: true, event_id: eventId, status: 'REJECTED' };
  }

  getEvent(eventId) {
    return this.events.find(e => e.event_id === eventId) || null;
  }

  getHistory() {
    return [...this.events];
  }

  exportAuditLog() {
    return JSON.stringify({
      app: 'TELECOM_3D_REVIEWER',
      export_timestamp: new Date().toISOString(),
      total_events: this.events.length,
      events: this.events
    }, null, 2);
  }
}
