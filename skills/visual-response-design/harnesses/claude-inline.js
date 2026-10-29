/* Claude app inline widget adapter: Send to chat calls the widget's global sendPrompt(). */
(function () {
  var storagePrefix = 'visual-response:';
  window.visualResponseHost = {
    id: 'claude-inline',
    get capabilities() {
      return { submit: typeof window.sendPrompt === 'function' ? 'message' : 'none', persist: false, restore: false };
    },
    submit: function (m) {
      window.sendPrompt(m.message);
      return Promise.resolve({});
    },
    saveDraft: function (key, draft) {
      try { localStorage.setItem(storagePrefix + key, JSON.stringify(draft)); } catch (e) {}
    },
    loadDraft: function (key) {
      try { return JSON.parse(localStorage.getItem(storagePrefix + key)); } catch (e) { return null; }
    }
  };
})();
