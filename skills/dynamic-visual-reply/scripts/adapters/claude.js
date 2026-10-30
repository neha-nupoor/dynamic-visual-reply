/* Claude app inline widget adapter: Send to chat calls the widget's global sendPrompt(). */
(function () {
  var storagePrefix = 'dynamic-visual-reply:';
  var legacyStoragePrefix = 'visual-response:';
  // Hosts may declare sendPrompt as a script-level global that is not a window property, so check both.
  function bridge() {
    if (typeof sendPrompt === 'function') return sendPrompt;
    return typeof window.sendPrompt === 'function' ? window.sendPrompt : null;
  }
  // Registered by id so the renderer bundle can carry this adapter; a page may still set window.dynamicVisualReplyHost to override.
  (window.dynamicVisualReplyHosts = window.dynamicVisualReplyHosts || {})['claude-inline'] = {
    id: 'claude-inline',
    get capabilities() {
      return { submit: bridge() ? 'message' : 'none', persist: false, restore: false };
    },
    submit: function (m) {
      var send = bridge();
      if (!send) return Promise.reject(new Error('sendPrompt is not available in this widget.'));
      return Promise.resolve(send(m.message)).then(function () { return {}; });
    },
    saveDraft: function (key, draft) {
      try { localStorage.setItem(storagePrefix + key, JSON.stringify(draft)); } catch (e) {}
    },
    loadDraft: function (key) {
      try { return JSON.parse(localStorage.getItem(storagePrefix + key) || localStorage.getItem(legacyStoragePrefix + key)); } catch (e) { return null; }
    }
  };
})();
