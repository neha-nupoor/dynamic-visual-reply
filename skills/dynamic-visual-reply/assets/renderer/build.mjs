import {build,transform} from 'esbuild';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
// Bundle hashes identify builds; draftVersion changes only when saved drafts become incompatible.
const draftVersion='1.0.0';
mkdirSync(join(root,'dist'),{recursive:true});
const result=await build({absWorkingDir:root,entryPoints:['src/index.jsx'],bundle:true,minify:true,format:'iife',target:'es2022',outfile:'renderer.js',write:false,jsxFactory:'h',jsxFragment:'Fragment',legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}});
// Oat is scoped to the widget and its variables are namespaced so it cannot shadow host palette variables.
const oat=readFileSync(join(root,'node_modules/@knadh/oat/oat.min.css'),'utf8')
  .replace(/:root\b/g,':scope').replace(/--[a-zA-Z_][\w-]*/g,name=>'--oat-'+name.slice(2));
const localCss=result.outputFiles.find(file=>file.path.endsWith('.css')).text;
const css=(await transform(`@scope ([data-dynamic-visual-reply-root]){${oat}}\n${localCss}`,{loader:'css',minify:true,target:'es2022',legalComments:'eof'})).code;
// One self-contained JS file serves embedded Codex and Claude views, including all CSS.
const sheet=JSON.stringify(css).replace(/</g,'\\u003c');
const script=`(()=>{const style=document.createElement('style');style.dataset.dynamicVisualReplyStyles='';style.textContent=${sheet};document.head.appendChild(style)})();\n`;
const bytes=Buffer.from(script+result.outputFiles.find(file=>file.path.endsWith('.js')).text);
writeFileSync(join(root,'dist/renderer.js'),bytes);
// Keep in step with the adapter imports in src/index.jsx; render.mjs selects the matching adapter by name.
const adapters=['codex','claude-inline','browser-local'];
const manifest={draftVersion,sha256:createHash('sha256').update(bytes).digest('hex'),sri:'sha384-'+createHash('sha384').update(bytes).digest('base64'),bytes:bytes.length,views:['table','cards','form','kanban','flow'],adapters};
writeFileSync(join(root,'dist/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const notices=[];
for(const name of ['@knadh/oat','preact']){
  const dir=join(root,'node_modules',name);
  for(const filename of ['LICENSE','license','LICENSE.md','LICENSE.txt']){
    try{notices.push(`${name}\n${readFileSync(join(dir,filename),'utf8')}\n`);break;}catch{}
  }
}
writeFileSync(join(root,'dist/THIRD_PARTY_NOTICES.txt'),notices.join('\n---\n'));
console.log(JSON.stringify({bytes:bytes.length,sha256:manifest.sha256,draftVersion}));
