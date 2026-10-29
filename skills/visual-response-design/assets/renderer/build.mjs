import {build} from 'esbuild';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
// version identifies the published bundle; draftVersion changes only when saved drafts become incompatible.
const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
const draftVersion='1.0.0';
mkdirSync(join(root,'dist'),{recursive:true});
await build({absWorkingDir:root,entryPoints:['src/index.jsx'],bundle:true,minify:true,format:'iife',target:'es2022',outfile:'dist/renderer.js',legalComments:'eof',define:{'process.env.NODE_ENV':'"production"','__RENDERER_VERSION__':JSON.stringify(version)}});
const bytes=readFileSync(join(root,'dist/renderer.js'));
// Keep in step with the adapter imports in src/index.jsx; render.py skips injecting these.
const adapters=['codex','claude-inline','claude-artifact','browser-local'];
const manifest={version,draftVersion,sha256:createHash('sha256').update(bytes).digest('hex'),sri:'sha384-'+createHash('sha384').update(bytes).digest('base64'),bytes:bytes.length,views:['table','cards','form','kanban','flow'],adapters};
writeFileSync(join(root,'dist/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const notices=[];
for(const name of ['react','react-dom','@mui/material','@emotion/react','@emotion/styled','remotion','@remotion/player']){
  const dir=join(root,'node_modules',name);
  for(const filename of ['LICENSE','LICENSE.md','LICENSE.txt']){
    try{notices.push(`${name}\n${readFileSync(join(dir,filename),'utf8')}\n`);break;}catch{}
  }
}
writeFileSync(join(root,'dist/THIRD_PARTY_NOTICES.txt'),notices.join('\n---\n'));
console.log(JSON.stringify({bytes:bytes.length,version,draftVersion}));
