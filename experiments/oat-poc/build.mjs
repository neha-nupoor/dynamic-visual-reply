import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const dist=join(root,'dist');
mkdirSync(dist,{recursive:true});
await build({absWorkingDir:root,entryPoints:['src/index.jsx'],bundle:true,minify:true,format:'iife',target:'es2022',outfile:join(dist,'preview.js'),jsxFactory:'h',jsxFragment:'Fragment',legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}});
const js=readFileSync(join(dist,'preview.js'),'utf8');
const css=readFileSync(join(dist,'preview.css'),'utf8');
const template=readFileSync(join(root,'fragment.html'),'utf8');
for(const [name,settings] of Object.entries({'oat-components':{appearance:'light',compact:false},'oat-light':{appearance:'light',compact:true},'oat-dark':{appearance:'dark',compact:true}})){
  const fragment=template.replace('/* OAT_STYLES */',()=>css).replace('/* OAT_SETTINGS */',()=>JSON.stringify(settings)).replace('/* OAT_SCRIPT */',()=>js);
  writeFileSync(join(dist,name+'.html'),fragment);
  writeFileSync(join(dist,name+'-page.html'),'<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oat preview</title><style>body{margin:0;padding:20px;background:#e9ebee} @media(max-width:480px){body{padding:8px}}</style></head><body>'+fragment+'</body></html>');
}
const sizes={javascript:{raw:Buffer.byteLength(js),gzip:gzipSync(js).length},css:{raw:Buffer.byteLength(css),gzip:gzipSync(css).length},total:{raw:Buffer.byteLength(js+css),gzip:gzipSync(js+css).length}};
writeFileSync(join(dist,'sizes.json'),JSON.stringify(sizes,null,2)+'\n');
const notices=['@knadh/oat','preact'].map(name=>{const dir=join(root,'node_modules',name);const license=['LICENSE','license','LICENSE.md'].find(file=>{try{readFileSync(join(dir,file));return true}catch{return false}});return name+'\n'+(license?readFileSync(join(dir,license),'utf8'):'MIT; see package repository')});
writeFileSync(join(dist,'THIRD_PARTY_NOTICES.txt'),notices.join('\n---\n'));
console.log(JSON.stringify({dist:resolve(dist),...sizes}));
