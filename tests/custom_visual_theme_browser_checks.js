async page => {
  const frame = page.frameLocator('iframe');
  const root = frame.locator('[data-response-design-custom]');
  await root.waitFor();
  const checks = [];
  for (const width of [736, 320]) {
    await page.setViewportSize({width, height: 900});
    for (const [host, os] of [['light', 'dark'], ['dark', 'light'], ['light dark', 'light'], ['light dark', 'dark']]) {
      await page.emulateMedia({colorScheme: os});
      const expected = host === 'dark' || (host === 'light dark' && os === 'dark') ? 'dark' : 'light';
      await root.evaluate((element, scheme) => {
        const doc = element.ownerDocument;
        doc.documentElement.style.colorScheme = scheme.host;
        doc.documentElement.style.backgroundColor = scheme.expected === 'dark' ? '#181818' : '#ffffff';
        doc.body.style.backgroundColor = 'transparent';
      }, {host, expected});
      await frame.locator('#rd-request').selectOption('review');
      await frame.locator('details').evaluate(element => { element.open = true; });
      const result = await root.evaluate(async element => {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const rgb = value => value.match(/[\d.]+/g).map(Number);
        const luminance = c => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
          .reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
        const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
        const background = node => {
          for (let current = node; current; current = current.parentElement) {
            const value = rgb(getComputedStyle(current).backgroundColor);
            if (value.length === 3 || value[3] === 1) return value;
          }
          throw Error('No opaque backdrop for ' + node.tagName);
        };
        const selectors = ['h3', 'label', '#rd-prompt', '.rd-value', '.rd-kicker', '#rd-why', '.rd-cost span', '.rd-cost strong', '.rd-secondary', 'summary', 'pre', 'select'];
        const readings = selectors.flatMap(selector => [...element.querySelectorAll(selector)].map(node => ({
          selector, color: getComputedStyle(node).color,
          contrast: Math.round(contrast(rgb(getComputedStyle(node).color), background(node)) * 100) / 100
        })));
        return {scheme: getComputedStyle(element).colorScheme, readings,
          transparent: rgb(getComputedStyle(element).backgroundColor)[3] === 0,
          overflow: element.ownerDocument.documentElement.scrollWidth > element.ownerDocument.documentElement.clientWidth + 1,
          selected: element.querySelector('select').value, route: element.querySelector('#rd-result').textContent};
      });
      const bad = result.readings.filter(reading => reading.contrast < 4.5);
      if (bad.length || result.overflow || !result.transparent || result.scheme !== host)
        throw Error(JSON.stringify({width, host, os, bad, result}));
      if (result.selected !== 'review' || result.route !== 'Review table') throw Error('Theme change broke explorer interaction');
      checks.push({width, host, os, expected, minimumContrast: Math.min(...result.readings.map(r => r.contrast)), textNodes: result.readings.length});
    }
  }
  await page.setViewportSize({width:736,height:900});
  return {checks: checks.length, minimumContrast: Math.min(...checks.map(c => c.minimumContrast)), results: checks};
}
