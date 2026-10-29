/* Claude Artifact adapter: submit writes a `batches` document; drafts live in each viewer's private data/users/<id>/ subtree. */
(function () {
  var storagePrefix = 'visual-response:';
  var dbPromise = null, uidPromise = null, writing = Promise.resolve(), timer = null;
  function capability(name) {
    return window.claude && window.claude.use ? window.claude.use(name) : Promise.resolve(null);
  }
  function db() { return dbPromise || (dbPromise = capability('db')); }
  function uid() {
    return uidPromise || (uidPromise = capability('user').then(function (u) { return u ? u.id() : null; }).catch(function () { return null; }));
  }
  function draftDoc(key) {
    return Promise.all([db(), uid()]).then(function (r) { return r[0] && r[1] ? r[0].collection('data/users/' + r[1]).doc('vr-' + key) : null; });
  }
  window.visualResponseHost = {
    id: 'claude-artifact',
    capabilities: { submit: 'save', persist: true, restore: true },
    submit: function (m) {
      return Promise.all([db(), uid()]).then(function (r) {
        if (!r[0]) throw new Error('Artifact storage is unavailable in this view.');
        return r[0].collection('batches').add({
          title: m.title, message: m.message, feedback: m.feedback,
          submittedAt: new Date().toISOString(), by: r[1] || null
        });
      }).then(function () { return {}; });
    },
    saveDraft: function (key, draft) {
      try { localStorage.setItem(storagePrefix + key, JSON.stringify(draft)); } catch (e) {}
      clearTimeout(timer);
      timer = setTimeout(function () {
        writing = writing.then(function () { return draftDoc(key); }).then(function (doc) {
          return doc ? doc.set({ draft: JSON.stringify(draft), savedAt: new Date().toISOString() }) : null;
        }).catch(function () {});
      }, 800);
    },
    loadDraft: function (key) {
      return draftDoc(key).then(function (doc) { return doc ? doc.get() : null; }).then(function (snap) {
        if (snap && snap.exists) return JSON.parse(snap.data().draft);
        try { return JSON.parse(localStorage.getItem(storagePrefix + key)); } catch (e) { return null; }
      }).catch(function () { return null; });
    }
  };
})();
