/**
 * ViewerBridge: Stable interface encapsulating minified 3D Reviewer variables.
 */
(function(global) {
  'use strict';

  global.ViewerBridge = {
    getState: function() { return (typeof se !== 'undefined') ? se : null; },
    getScene: function() { return (typeof Ui !== 'undefined') ? Ui : null; },
    getContextToken: function() { return (typeof Pr !== 'undefined') ? Pr : ''; },
    getRawProject: function() { return (typeof Wa !== 'undefined') ? Wa : null; },
    isEditable: function() { return (typeof Xa !== 'undefined') ? Xa : false; },

    toVec: function(pt) { return (typeof qu === 'function') ? qu(pt) : null; },
    makeLine: function(pts, color, width, opacity) {
      return (typeof Va === 'function') ? Va(pts, color, width, opacity) : null;
    },
    createSphere: function(radius, colorHex, emissiveIntensity) {
      if (typeof rr !== 'undefined' && typeof ar !== 'undefined' && typeof we !== 'undefined') {
        const geom = new rr(radius, 12, 12);
        const mat = new ar({ color: colorHex, emissive: colorHex, emissiveIntensity: emissiveIntensity || 0.5 });
        return new we(geom, mat);
      }
      return null;
    },
    createGroup: function() {
      return (typeof pn !== 'undefined') ? new pn() : null;
    },
    Vector3: (typeof P !== 'undefined') ? P : null,

    byId: function(id) {
      return (typeof ut === 'function') ? ut(id) : document.getElementById(id);
    }
  };
})(typeof window !== 'undefined' ? window : this);
