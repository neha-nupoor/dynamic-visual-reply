async page => {
  const base = new URL('.', page.url()).href;
  const fixtures = await (await page.request.get(base + 'manifest.json')).json();
  const reference = new Map(), results = [];
  const check = (ok, message) => { if (!ok) throw Error(message); };
  for (const width of [680, 390]) {
    await page.setViewportSize({width, height: 900});
    for (const f of fixtures) {
      await page.goto(base + f.name);
      const app = page.locator('.vr-app');
      await app.waitFor();
      const shape = await app.evaluate(root => {
        const main = root.querySelector('.vr-table-wrap,.vr-grid,.vr-readonly-fields,.vr-flow,.vr-stack');
        const rect = element => {
          const b = element.getBoundingClientRect(), origin = root.getBoundingClientRect();
          return [b.x - origin.x, b.y - origin.y, b.width, b.height].map(n => Math.round(n * 10) / 10);
        };
        return {text: main.innerText, boxes: [main, ...main.children].map(rect), appearance: root.dataset.appearance};
      });
      const key = [width, f.view, f.readOnly].join('/');
      if (!reference.has(key)) reference.set(key, shape);
      check(JSON.stringify(shape) === JSON.stringify(reference.get(key)), 'Layout mismatch: ' + f.name + '/' + width);
      if (f.readOnly) {
        check(await app.locator('.vr-actions,.vr-feedback,.vr-item-feedback,textarea').count() === 0, 'Review controls in report');
        check(Object.values(await page.evaluate(() => window.calls)).every(n => n === 0), 'Read-only host call');
      } else {
        if (f.view === 'table') {
          await app.getByRole('button', {name: 'Select visible', exact: true}).click();
          await app.getByRole('button', {name: 'Next page', exact: true}).click();
        } else if (f.view === 'cards') await app.getByRole('button', {name: 'Choose inline', exact: true}).click();
        else if (f.view === 'flow') await app.locator('.vr-flow-controls button').last().click();
        await app.locator('.vr-actions button').click();
        check((await page.evaluate(() => window.calls.submit)) === 1, 'Batch submission failed');
        const envelope = await page.evaluate(() => window.feedback);
        check(envelope.view === f.view, 'Feedback view changed');
        if (f.view === 'table') check(envelope.selectedIds.length === 2, 'Selection lost across pages');
      }
      results.push({width, ...f});
    }
  }
  return {checks: results.length, matchingLayouts: reference.size, widths: [680, 390], fixtures: fixtures.length, nativeBridges: false};
}
