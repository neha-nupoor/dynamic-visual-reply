// Supply the renderer's table/cards/form HTML fragments as the second argument.
async (page, fragments) => {
  const errors = [], results = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [736, 320]) for (const colorScheme of ['light', 'dark']) {
    await page.setViewportSize({width, height:900});
    await page.emulateMedia({colorScheme});
    for (const [view, html] of Object.entries(fragments)) {
      await page.setContent(html);
      const app = page.locator('.vr-app');
      await app.waitFor();
      if (view === 'table') {
        await app.getByRole('button', {name:/^Component/}).click();
        if (await app.locator('thead th[aria-sort="descending"]').count() !== 1) throw Error('Sort failed');
        await app.getByRole('checkbox', {name:'Select demo-table', exact:true}).check();
        if (!(await app.locator('.vr-toolbar .vr-badge').innerText()).includes('1 selected')) throw Error('Selection failed');
      } else if (view === 'cards') {
        const choose = app.locator('.vr-card-actions button').first();
        if (await choose.getAttribute('aria-pressed') !== 'true') await choose.click();
        if (await choose.getAttribute('aria-pressed') !== 'true') throw Error('Card selection failed');
        await app.locator('.vr-card details').first().evaluate(element => { element.open = true; });
        if (!(await app.locator('.vr-card details p').first().isVisible())) throw Error('Details hidden');
      } else {
        await app.getByLabel('Label', {exact:true}).fill('Edited preview');
        await app.getByLabel('Detail', {exact:true}).selectOption('detailed');
        await app.getByLabel('Include source links', {exact:true}).uncheck();
        if (await app.getByLabel('Label', {exact:true}).inputValue() !== 'Edited preview') throw Error('Form edit failed');
        if (await app.getByLabel('Detail', {exact:true}).inputValue() !== 'detailed') throw Error('Form select failed');
        if (await app.getByLabel('Include source links', {exact:true}).isChecked()) throw Error('Checkbox edit failed');
      }
      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1))
        throw Error('Page overflow: ' + view + '/' + width);
      results.push({view,width,colorScheme});
    }
  }
  if (errors.length) throw Error(JSON.stringify(errors));
  return {checks:results.length, results, errors, nativeSubmissionVerified:false};
}
