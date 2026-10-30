/* Local browser adapter: saves feedback through serve.mjs's /api/feedback when served on loopback. */
(function () {
  var storagePrefix = 'dynamic-visual-reply:';
  var legacyStoragePrefix = 'visual-response:';
  var served = /^https?:$/.test(location.protocol) && (location.hostname === '127.0.0.1' || location.hostname === 'localhost');
  // Registered by id so the renderer bundle can carry this adapter; a page may still set window.dynamicVisualReplyHost to override.
  (window.dynamicVisualReplyHosts = window.dynamicVisualReplyHosts || {})['browser-local'] = {
    id: 'browser-local',
    capabilities: { submit: served ? 'save' : 'none', persist: true, restore: true },
    submit: function (m) {
      return fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: m.feedback, message: m.message })
      }).then(function (response) {
        return response.json().then(function (result) {
          if (!response.ok) throw new Error(result.error || 'Feedback save failed');
          return { detail: result.path };
        });
      });
    },
    saveDraft: function (key, draft) {
      try { localStorage.setItem(storagePrefix + key, JSON.stringify(draft)); } catch (e) {}
    },
    loadDraft: function (key) {
      try { return JSON.parse(localStorage.getItem(storagePrefix + key) || localStorage.getItem(legacyStoragePrefix + key)); } catch (e) { return null; }
    }
  };
})();
