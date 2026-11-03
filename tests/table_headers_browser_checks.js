async page => {
  const base = new URL('.', page.url()).href;
  const fixtures = (await (await page.request.get(base + 'manifest.json')).json()).filter(f => f.view === 'table');
  const results = [];
  for (const width of [320, 375, 736]) {
    await page.setViewportSize({width, height: 900});
    for (const f of fixtures) {
      await page.goto(base + f.name + '?header-check=' + Date.now());
      const app = page.locator('.vr-app');
      await app.waitFor();
      const geometry = await app.evaluate(root => {
        const headers = [...root.querySelectorAll('thead th')].map(header => {
          const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
          const brokenWords = [];
          for (let text; (text = walker.nextNode());) {
            for (const match of text.textContent.matchAll(/[\p{L}\p{N}]+/gu)) {
              const range = document.createRange();
              range.setStart(text, match.index); range.setEnd(text, match.index + match[0].length);
              if (range.getClientRects().length > 1) brokenWords.push(match[0]);
            }
          }
          return {label: header.textContent.trim(), width: header.getBoundingClientRect().width, brokenWords};
        });
        const wrap = root.querySelector('.vr-table-wrap');
        return {headers, pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          tableScrolls: wrap.scrollWidth > wrap.clientWidth + 1};
      });
      const broken = geometry.headers.filter(h => h.brokenWords.length);
      if (broken.length) throw Error('Split header words at ' + width + 'px in ' + f.name + ': ' + JSON.stringify(broken));
      if (geometry.pageOverflow) throw Error('Page overflow: ' + f.name + '/' + width);
      if (!f.readOnly && width <= 375 && !geometry.tableScrolls) throw Error('Review columns were compressed instead of scrolling');
      await app.getByRole('button', {name: /^Name/}).click();
      if (await app.locator('thead th[aria-sort="ascending"],thead th[aria-sort="descending"]').count() !== 1) throw Error('Header sort failed');
      results.push({width, harness: f.harness, readOnly: f.readOnly, ...geometry});
    }
  }
  return {checks: results.length, widths: [320, 375, 736], splitWords: 0, pageOverflow: false, nativeBridges: false};
}
