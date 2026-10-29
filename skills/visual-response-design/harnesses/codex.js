/* Codex / ChatGPT widget host adapter. Behavior matches renderer 1.0.0's built-in window.openai handling. */
(function () {
  var storagePrefix = 'visual-response:';
  var stateLimitBytes = 15000;
  function openai() { return window.openai; }
  function savedDraft(state) { return state && ((state.privateContent && state.privateContent.draft) || state.draft); }
  window.visualResponseHost = {
    id: 'codex',
    get capabilities() {
      var o = openai();
      return { submit: o && o.sendFollowUpMessage ? 'message' : 'none', persist: true, restore: true };
    },
    submit: function (m) {
      return Promise.resolve(openai().sendFollowUpMessage({ prompt: m.message, title: m.title })).then(function () { return {}; });
    },
    saveDraft: function (key, draft, context) {
      var o = openai();
      if (o && o.setWidgetState) {
        var data = { modelContent: context.modelContent, privateContent: { draft: draft } };
        if (new TextEncoder().encode(JSON.stringify(data)).length > stateLimitBytes) return { warning: 'draftTooLarge' };
        try { Promise.resolve(o.setWidgetState(data)).catch(function () {}); } catch (e) {}
        return;
      }
      if (!o) { try { localStorage.setItem(storagePrefix + key, JSON.stringify(draft)); } catch (e) {} }
    },
    loadDraft: function (key) {
      var o = openai();
      var saved = savedDraft(o && o.widgetState);
      if (saved && saved.key === key) return saved;
      if (!o) { try { return JSON.parse(localStorage.getItem(storagePrefix + key)); } catch (e) {} }
      return null;
    },
    onExternalDraft: function (fn) {
      var handler = function (e) { var saved = savedDraft(e.detail && e.detail.globals && e.detail.globals.widgetState); if (saved) fn(saved); };
      window.addEventListener('openai:set_globals', handler);
      return function () { window.removeEventListener('openai:set_globals', handler); };
    }
  };
})();
