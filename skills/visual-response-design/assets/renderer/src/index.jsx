import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider,GlobalStyles,Box,Button,Card,CardContent,Checkbox,Chip,FormControlLabel,MenuItem,Slider,Table,TableBody,TableCell,TableHead,TableRow,TableSortLabel,TextField,Typography} from '@mui/material';
import {cssVariables,merge,neutral,readJson,resolvePalette,responseTheme} from './design-system.mjs';
// Named imports let the bundler keep only these keys of defaults.json, not distribution settings such as the theme.
import {copy as defaultCopy,feedback as defaultFeedback} from '../../../config/defaults.json';
import {Player} from '@remotion/player';
import {useCurrentFrame,interpolate} from 'remotion';
// Built-in adapters register themselves by id. Some hosts don't run a page's inline scripts, so they can't rely on injection.
import '../../../harnesses/codex.js';
import '../../../harnesses/claude-inline.js';
import '../../../harnesses/claude-artifact.js';
import '../../../harnesses/browser-local.js';

const mount=document.querySelector('[data-visual-response-root]');
const spec=JSON.parse(document.querySelector('[data-visual-response-spec]').textContent);
// Theme, wording and harness settings arrive as data so one bundle serves every theme and host.
const tokens=merge(neutral,readJson('[data-visual-response-theme]')||{});
const config=readJson('[data-visual-response-config]')||{};
const copy=merge(defaultCopy,config.copy||{});
const prompts=merge(defaultFeedback,config.feedback||{});
const appearance=spec.appearance||config.appearance||tokens.appearance||'light';
const key=spec.stateKey;
const safeUrl=value=>typeof value==='string'&&/^https?:\/\//i.test(value)?value:undefined;
const t=(path,vars={})=>String(path.split('.').reduce((value,part)=>value?.[part],copy)??path).replace(/\{(\w+)\}/g,(_,name)=>vars[name]??'');
const storageKey='visual-response:'+key;
// An explicit window.visualResponseHost wins, then the built-in adapter the page config names; without either, copy/export still work.
const staticHost={id:'static',capabilities:{submit:'none',persist:true,restore:true},
  saveDraft(_,draft){try{localStorage.setItem(storageKey,JSON.stringify(draft))}catch{}},
  loadDraft(){try{return JSON.parse(localStorage.getItem(storageKey))}catch{return null}}};
const host=window.visualResponseHost||(config.adapter&&window.visualResponseHosts?.[config.adapter])||staticHost;
const submitMode=()=>host.capabilities?.submit||'none';
const frameCount=Math.round(tokens.motion.secondsPerStage*tokens.motion.fps);
const loaded=(()=>{try{return host.loadDraft?.(key)}catch{return null}})();
const pendingDraft=loaded&&typeof loaded.then==='function'?loaded:null;

function initial(saved){
  saved=saved?.key===key?saved:{};
  const valid=new Set([...(spec.rows||[]),...(spec.nodes||[])].map(item=>item.id)),fieldIds=new Set((spec.fields||[]).map(field=>field.id));
  const ids=value=>Array.isArray(value)?value.filter(id=>valid.has(id)):[];
  const keep=(value,allowed)=>Object.fromEntries(Object.entries(value&&typeof value==='object'?value:{}).filter(([id])=>allowed.has(id)));
  return {key,selected:ids(saved.selected),reviewed:ids(saved.reviewed),notes:keep(saved.notes,valid),edits:keep(saved.edits,valid),stages:keep(saved.stages,valid),fields:keep(saved.fields,fieldIds),options:keep(saved.options,fieldIds),comment:typeof saved.comment==='string'?saved.comment:''};
}
const text=value=>value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
// An explicit data-theme or data-mode on the page root (set by Claude artifacts and widgets) wins over the OS preference.
const prefersDark=()=>{const root=document.documentElement.dataset,chosen=root.theme||root.mode;return chosen==='dark'||(chosen!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)};

function Motion({nodes,palette,reduced}){
  const frame=useCurrentFrame();
  const count=nodes.length, active=Math.min(count-1,Math.floor(frame/frameCount));
  const progress=reduced?active:interpolate(frame,[0,(count-1)*frameCount],[0,count-1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const {surface:bg,text:fg,divider:line,accent,selected:soft}=palette;
  const [width,height]=tokens.motion.canvas,spacing=(width-80)/count, nodeWidth=spacing-18;
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={nodes.map(n=>n.title).join(' → ')}>
    <rect width={width} height={height} fill={bg}/>
    <line x1={40+spacing/2} y1="135" x2={40+spacing*(count-.5)} y2="135" stroke={line} strokeWidth="3"/>
    {nodes.map((n,i)=><g key={n.id}><rect x={49+spacing*i} y="45" width={nodeWidth} height="160" rx={tokens.radius.surface} fill={i===active?soft:bg} stroke={i===active?accent:line}/><text x={40+spacing*(i+.5)} y="95" textAnchor="middle" fill={accent} fontSize={tokens.motion.numberSize} fontFamily={tokens.fontFamily}>{i+1}</text><foreignObject x={54+spacing*i} y="110" width={nodeWidth-10} height="90"><div xmlns="http://www.w3.org/1999/xhtml" style={{fontSize:tokens.motion.labelSize,fontFamily:tokens.fontFamily,color:fg,textAlign:'center',overflowWrap:'anywhere'}}>{n.title}</div></foreignObject></g>)}
    <line x1={40+spacing/2} y1={height-40} x2={40+spacing*(count-.5)} y2={height-40} stroke={line} strokeWidth="3"/>
    <circle cx={40+spacing*(progress+.5)} cy={height-40} r="10" fill={accent}/>
  </svg>;
}

function App(){
  const [draft,setDraft]=useState(()=>initial(pendingDraft?null:loaded)),[query,setQuery]=useState(''),[filter,setFilter]=useState(''),[sort,setSort]=useState({key:spec.columns?.[0]?.key||'id',ascending:true}),[page,setPage]=useState(0),[bulk,setBulk]=useState(''),[receipt,setReceipt]=useState(t('status.draft')),[customMessage,setCustomMessage]=useState(null),[preview,setPreview]=useState(false),[showColumns,setShowColumns]=useState(false),[columns,setColumns]=useState(spec.columns?.map(c=>c.key)||[]),[schemeDark,setSchemeDark]=useState(prefersDark),[frame,setFrame]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[busy,setBusy]=useState(false);
  const inlineCompact=spec.resolvedPresentation?.mode==='inline';
  const history=useRef([]),hasEdits=useRef(false),player=useRef(null),latest=useRef(draft),messageRef=useRef(null),feedbackRef=useRef(null);
  latest.current=draft;
  const rowMap=new Map((spec.rows||[]).map(row=>[row.id,row]));
  const rows=(spec.rows||[]).map(row=>({...row,...draft.edits[row.id]}));
  const nodes=spec.nodes||[];
  const {dark,c}=resolvePalette(tokens,appearance,config.hostPalette,mount,schemeDark);
  const theme=responseTheme(tokens,c,dark);
  const mode=submitMode();
  useEffect(()=>{if(appearance!=='system'&&appearance!=='host')return;const q=matchMedia('(prefers-color-scheme: dark)'),change=()=>setSchemeDark(prefersDark()),observer=new MutationObserver(change);q.addEventListener('change',change);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-mode','class']});return()=>{q.removeEventListener('change',change);observer.disconnect()}},[]);
  useEffect(()=>{if(!pendingDraft)return;let live=true;pendingDraft.then(saved=>{if(live&&!hasEdits.current&&saved?.key===key)setDraft(initial(saved))}).catch(()=>{});return()=>{live=false}},[]);
  useEffect(()=>host.onExternalDraft?.(saved=>{if(!hasEdits.current&&saved?.key===key)setDraft(initial(saved))}),[]);
  useEffect(()=>{const p=player.current;if(!p)return;const update=e=>setFrame(e.detail.frame),play=()=>setPlaying(true),stop=()=>setPlaying(false);p.addEventListener('frameupdate',update);p.addEventListener('play',play);p.addEventListener('pause',stop);p.addEventListener('ended',stop);return()=>{p.removeEventListener('frameupdate',update);p.removeEventListener('play',play);p.removeEventListener('pause',stop);p.removeEventListener('ended',stop)}},[]);
  function values(){return {selectedIds:draft.selected,items:[...new Set([...draft.selected,...Object.keys(draft.notes).filter(id=>draft.notes[id]),...Object.keys(draft.edits),...Object.keys(draft.stages)])].filter(id=>rowMap.has(id)||nodes.some(n=>n.id===id)).map(id=>({id,label:rowMap.get(id)?.title||rowMap.get(id)?.name||nodes.find(n=>n.id===id)?.title||id,selected:draft.selected.includes(id),instruction:draft.notes[id]||'',changes:draft.edits[id]||{},...(draft.stages[id]?{stage:draft.stages[id]}:{})})),reviewedIds:draft.reviewed,fields:(spec.fields||[]).map(f=>({id:f.id,value:draft.fields[f.id]??f.value??'',...(f.options?{options:(draft.options[f.id]||f.options)}:{})})),comment:draft.comment};}
  function payload(){return {schemaVersion:1,viewId:spec.viewId,view:spec.view,revision:spec.revision||1,...values(),source:{harness:host.id||'static',theme:tokens.name,rendererVersion:__RENDERER_VERSION__}};}
  function message(){
    if(customMessage!=null)return customMessage;
    const request=spec.feedbackPrompt||(spec.view==='form'?prompts.formPrompt:prompts.defaultPrompt),feedback=payload();
    if(prompts.messageFormat==='compact')return JSON.stringify({request,feedback});
    if(prompts.messageFormat!=='summary')return JSON.stringify({request,feedback},null,2);
    // A readable line for the chat bubble, then the full envelope on one line for the agent to parse.
    const labels=feedback.items.filter(i=>i.selected).map(i=>i.label),shown=labels.slice(0,5).join(', ')+(labels.length>5?' '+t('summary.more',{count:labels.length-5}):'');
    const notes=feedback.items.filter(i=>i.instruction).length,answered=feedback.fields.filter(f=>f.value!==''&&f.value!=null).length;
    const parts=[labels.length?t('summary.selected',{labels:shown}):spec.view==='form'?'':t('summary.nothing'),notes&&t('summary.instructions',{count:notes}),feedback.reviewedIds.length&&t('summary.reviewed',{count:feedback.reviewedIds.length}),answered&&t('summary.answers',{count:answered}),feedback.comment&&t('summary.comment')].filter(Boolean);
    return `${request}\n${parts.join(' · ')}\n\n${t('summary.data')} ${JSON.stringify(feedback)}`;
  }
  function persist(next){
    const modelContent={viewId:spec.viewId,view:spec.view,selectedIds:next.selected,notes:next.notes,edits:next.edits,stages:next.stages,fields:next.fields,options:next.options,comment:next.comment};
    const warn=result=>{if(result?.warning)setReceipt(t('status.'+result.warning))};
    try{const result=host.saveDraft?.(key,next,{viewId:spec.viewId,view:spec.view,modelContent});if(result&&typeof result.then==='function')result.then(warn,()=>{});else warn(result)}catch{}
  }
  function update(next,undo=true){hasEdits.current=true;if(undo){history.current.push(draft);if(history.current.length>20)history.current.shift()}setDraft(next);setCustomMessage(null);setReceipt(t('status.edited'));persist(next)}
  function assign(group,id,value){update({...draft,[group]:{...draft[group],[id]:value}})}
  function toggle(id){update({...draft,selected:draft.selected.includes(id)?draft.selected.filter(x=>x!==id):[...draft.selected,id]})}
  function mark(id){update({...draft,reviewed:draft.reviewed.includes(id)?draft.reviewed.filter(x=>x!==id):[...draft.reviewed,id]})}
  function undo(){const prior=history.current.pop();if(prior)update(prior,false)}
  const field=(label,value,onChange,props={})=><TextField label={label} value={value} onChange={e=>onChange(e.target.value)} {...props} slotProps={{inputLabel:{shrink:true},...(props.select?{select:{displayEmpty:true}}:{}),...props.slotProps}}/>;
  function itemFeedback(id){return <Box sx={{display:'grid',gap:inlineCompact?.5:1,mt:inlineCompact?0:1}}>{field(t('instruction'),draft.notes[id]||'',value=>assign('notes',id,value),{multiline:true,minRows:inlineCompact?1:2,fullWidth:true,slotProps:{htmlInput:{'aria-label':t('instruction')+' for '+id}}})}<FormControlLabel label={t('reviewed')} control={<Checkbox size="small" sx={inlineCompact?{py:0}:undefined} checked={draft.reviewed.includes(id)} onChange={()=>mark(id)}/>}/></Box>}
  function showPreview(){setPreview(true);if(feedbackRef.current)feedbackRef.current.open=true;}
  async function submit(){
    if(busy)return;
    setBusy(true);
    try{
      if(mode==='message'||mode==='save'){
        const result=await host.submit({message:message(),feedback:payload(),title:spec.title||'Send batch feedback'});
        setReceipt(result?.receipt?t('status.'+result.receipt):mode==='message'?t('status.submitted'):result?.detail?t('status.savedTo',{path:result.detail}):t('status.saved'));
      }else{showPreview();setReceipt(t('status.unavailable'));}
    }catch{showPreview();setReceipt(t('status.failed'));}
    finally{setBusy(false)}
  }
  async function copyMessage(){showPreview();try{await navigator.clipboard.writeText(message());setReceipt(t('status.copied'))}catch{setReceipt(t('status.copyUnavailable'))}}
  function exportFeedback(){const blob=new Blob([JSON.stringify({feedback:payload(),message:message()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=spec.viewId+'-feedback.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setReceipt(t('status.exported'));}
  const submitLabel=busy?t('submit.busy'):mode==='message'?t('submit.message'):mode==='save'?(spec.view==='form'?t('submit.saveForm'):t('submit.save')):t('submit.none');
  const feedbackLabel=mode==='message'?t('feedbackSubmit.message'):mode==='save'?t('feedbackSubmit.save'):t('feedbackSubmit.none');
  let content;
  if(spec.view==='table'){
    const matched=rows.filter(row=>(!filter||text(row[spec.filterKey])===filter)&&(!query||JSON.stringify(row).toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>{const av=a[sort.key],bv=b[sort.key];const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:text(av).localeCompare(text(bv),undefined,{numeric:true});return sort.ascending?cmp:-cmp});
    const size=spec.pageSize||20,last=Math.max(0,Math.ceil(matched.length/size)-1),current=Math.min(page,last),visible=matched.slice(current*size,(current+1)*size);
    content=<><Box sx={{display:'flex',gap:1,flexWrap:'wrap',alignItems:'center',mb:2}}>{field(t('table.search'),query,value=>{setQuery(value);setPage(0)},{sx:{flex:1,minWidth:160}})}{spec.filterKey&&field(t('table.filter')+' '+spec.filterKey,filter,value=>{setFilter(value);setPage(0)},{select:true,sx:{minWidth:140},children:[<MenuItem key="all" value="">{t('table.all')}</MenuItem>,...[...new Set(rows.map(r=>text(r[spec.filterKey])))].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)]})}<Button onClick={()=>setShowColumns(!showColumns)}>{t('table.columns')}</Button><Chip size="small" label={draft.selected.length+' '+t('table.selectedCount')}/></Box>
      {showColumns&&<Box sx={{display:'flex',flexWrap:'wrap'}}>{spec.columns.map(col=><FormControlLabel key={col.key} label={col.label} control={<Checkbox size="small" checked={columns.includes(col.key)} onChange={(_,checked)=>setColumns(checked?[...columns,col.key]:columns.filter(k=>k!==col.key))}/>}/>)}</Box>}
      <Box sx={{display:'flex',gap:1,flexWrap:'wrap',mb:1}}><Button variant="outlined" onClick={()=>update({...draft,selected:[...new Set([...draft.selected,...visible.map(r=>r.id)])]})}>{t('table.selectVisible')}</Button><Button variant="outlined" onClick={()=>update({...draft,selected:draft.selected.filter(id=>!visible.some(r=>r.id===id))})}>{t('table.deselectVisible')}</Button>{matched.length>size&&<Button onClick={()=>update({...draft,selected:[...new Set([...draft.selected,...matched.map(r=>r.id)])]})}>{t('table.selectAllMatches',{count:matched.length})}</Button>}</Box>
      <Box sx={{overflowX:'auto'}}><Table size="small" aria-label={spec.title}><TableHead><TableRow><TableCell>{t('table.selectColumn')}</TableCell>{spec.columns.filter(col=>columns.includes(col.key)).map(col=><TableCell key={col.key} align={col.type==='number'?'right':'left'}><TableSortLabel active={sort.key===col.key} direction={sort.ascending?'asc':'desc'} onClick={()=>setSort({key:col.key,ascending:sort.key===col.key?!sort.ascending:true})}>{col.label}</TableSortLabel></TableCell>)}<TableCell>{t('table.feedbackColumn')}</TableCell></TableRow></TableHead><TableBody>{visible.map(row=><TableRow key={row.id} selected={draft.selected.includes(row.id)}><TableCell><Checkbox size="small" checked={draft.selected.includes(row.id)} onChange={()=>toggle(row.id)} slotProps={{input:{'aria-label':t('select')+' '+row.id}}}/></TableCell>{spec.columns.filter(col=>columns.includes(col.key)).map(col=><TableCell key={col.key} align={col.type==='number'?'right':'left'} sx={col.type==='number'?{fontVariantNumeric:'tabular-nums'}:{}}>{col.editable?field(col.label,text(row[col.key]),value=>assign('edits',row.id,{...draft.edits[row.id],[col.key]:col.type==='number'&&value!==''?Number(value):value}),{type:col.type==='number'?'number':'text',sx:{minWidth:110}}):text(row[col.key])}</TableCell>)}<TableCell sx={{minWidth:190}}>{itemFeedback(row.id)}</TableCell></TableRow>)}</TableBody></Table></Box>
      {!matched.length&&<Typography sx={{py:2}}>{t('table.empty')}</Typography>}
      {(!inlineCompact||last>0)&&<Box sx={{display:'flex',gap:1,alignItems:'center',flexWrap:'wrap',mt:2}}><Typography variant="body2">{t('table.page',{page:current+1,pages:last+1,count:matched.length})}</Typography><Button disabled={current===0} onClick={()=>setPage(current-1)}>{t('table.previous')}</Button><Button disabled={current===last} onClick={()=>setPage(current+1)}>{t('table.next')}</Button></Box>}
      {(!inlineCompact||draft.selected.length>1)&&<Box sx={{display:'flex',gap:1,alignItems:'center',flexWrap:'wrap',mt:2}}>{field(t('table.sharedInstruction'),bulk,setBulk,{sx:{flex:1,minWidth:190},multiline:true,minRows:1})}<Button variant="outlined" disabled={!draft.selected.length||!bulk.trim()} onClick={()=>{const notes={...draft.notes};draft.selected.forEach(id=>notes[id]=[notes[id],bulk].filter(Boolean).join('\n'));update({...draft,notes});setBulk('')}}>{t('table.applyToSelected')}</Button></Box>}</>;
  }else if(spec.view==='cards'){
    content=<Box sx={{display:'grid',gridTemplateColumns:`repeat(auto-fit,minmax(min(100%,${tokens.layout.cardMinWidth}px),1fr))`,gap:2}}>{rows.map(row=><Card key={row.id} sx={{borderColor:draft.selected.includes(row.id)?'primary.main':'divider',bgcolor:draft.selected.includes(row.id)?'action.selected':'background.paper'}}><CardContent><Typography fontWeight={600}>{row.title||row.name||row.id}</Typography>{row.recommended&&<Chip label={t('recommended')} color="primary" size="small" sx={{my:1}}/>}<Typography variant="body1" sx={{mt:1}}>{row.summary}</Typography>{row.details&&<details style={{marginTop:10}}><summary>{t('moreDetail')}</summary><Typography variant="body2" sx={{mt:1,whiteSpace:'pre-wrap'}}>{text(row.details)}</Typography></details>}{safeUrl(row.source)&&<Button component="a" href={row.source} target="_blank" rel="noreferrer">{t('source')}</Button>}{itemFeedback(row.id)}<Button aria-pressed={draft.selected.includes(row.id)} variant={draft.selected.includes(row.id)?'contained':'outlined'} onClick={()=>toggle(row.id)}>{draft.selected.includes(row.id)?t('selected'):row.actionLabel||t('select')}</Button></CardContent></Card>)}</Box>;
  }else if(spec.view==='kanban'){
    const stages=spec.stages||['To review','In progress','Done'];
    content=<Box sx={{display:'grid',gridTemplateColumns:`repeat(auto-fit,minmax(min(100%,${tokens.layout.cardMinWidth}px),1fr))`,gap:1.5}}>{stages.map(stage=><Box key={stage} sx={{bgcolor:'background.paper',border:'1px solid',borderColor:'divider',borderRadius:tokens.radius.surface+'px',p:1.5}}><Typography fontWeight={600} sx={{mb:1}}>{stage} · {rows.filter(r=>(draft.stages[r.id]||r.stage||stages[0])===stage).length}</Typography>{rows.filter(r=>(draft.stages[r.id]||r.stage||stages[0])===stage).map(row=><Card key={row.id} sx={{mb:1}}><CardContent><Typography fontWeight={600} sx={{mb:1}}>{row.title||row.name||row.id}</Typography>{field(t('kanban.stage'),draft.stages[row.id]||row.stage||stages[0],value=>assign('stages',row.id,value),{select:true,fullWidth:true,children:stages.map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)})}{itemFeedback(row.id)}</CardContent></Card>)}</Box>)}</Box>;
  }else if(spec.view==='form'){
    content=<Box sx={{display:'grid',gap:2}}>{(spec.fields||[]).map(f=>{
      const value=draft.fields[f.id]??f.value??'';
      if(f.type==='checkbox')return <FormControlLabel key={f.id} label={f.label} control={<Checkbox checked={!!value} onChange={(_,v)=>assign('fields',f.id,v)}/>}/>;
      if(f.type==='multiselect'){const options=draft.options[f.id]||f.options;return <Box key={f.id}><Typography fontWeight={600} sx={{mb:1}}>{f.label}</Typography>{options.map(o=><Box key={o.id} sx={{display:'flex',gap:1,alignItems:'center',mb:1}}><Checkbox checked={!!o.selected} onChange={(_,selected)=>assign('options',f.id,options.map(x=>x.id===o.id?{...x,selected}:x))} slotProps={{input:{'aria-label':'Include '+o.id}}}/>{field(t('form.editableOption'),o.label,label=>assign('options',f.id,options.map(x=>x.id===o.id?{...x,label}:x)),{fullWidth:true,slotProps:{htmlInput:{'aria-label':'Option '+o.id}}})}</Box>)}</Box>}
      return field(f.label,value,v=>assign('fields',f.id,f.type==='number'&&v!==''?Number(v):v),{key:f.id,fullWidth:true,type:f.type==='number'?'number':'text',multiline:f.type==='textarea',minRows:f.type==='textarea'?3:undefined,select:f.type==='select',children:f.type==='select'?f.options.map(o=><MenuItem key={o.id} value={o.id}>{o.label}</MenuItem>):undefined,helperText:f.help});
    })}</Box>;
  }else if(spec.view==='flow'){
    const active=spec.motion?Math.min(nodes.length-1,Math.floor(frame/frameCount)):Math.min(nodes.length-1,frame);
    const [canvasWidth,canvasHeight]=tokens.motion.canvas;
    content=<>
      {spec.motion?<Player ref={player} component={Motion} inputProps={{nodes,palette:c,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}} durationInFrames={nodes.length*frameCount} fps={tokens.motion.fps} compositionWidth={canvasWidth} compositionHeight={canvasHeight} style={{width:'100%',borderRadius:tokens.radius.surface}} autoPlay={false} loop={false} controls={false} clickToPlay={false} playbackRate={speed} moveToBeginningWhenEnded={false} numberOfSharedAudioTags={0}/>:<Box sx={{display:'grid',gridTemplateColumns:`repeat(auto-fit,minmax(min(100%,${tokens.layout.flowMinWidth}px),1fr))`,gap:1}}>{nodes.map((node,i)=><Box key={node.id} sx={{p:2,border:'1px solid',borderColor:active===i?'primary.main':'divider',borderRadius:tokens.radius.surface+'px',bgcolor:active===i?'action.selected':'background.paper'}}><Typography color="primary.main">{i+1} {i<nodes.length-1?'→':''}</Typography><Typography fontWeight={600}>{node.title}</Typography></Box>)}</Box>}
      <Box sx={{display:'flex',gap:1,flexWrap:'wrap',my:1.5}}>{nodes.map((node,i)=><Button key={node.id} aria-pressed={active===i} variant={active===i?'contained':'outlined'} onClick={()=>{if(spec.motion){player.current?.pause();player.current?.seekTo(i*frameCount)}else setFrame(i)}}>{node.title}</Button>)}</Box><Typography>{nodes[active]?.detail}</Typography>
      {spec.motion&&<><Box sx={{display:'flex',gap:1,alignItems:'center',flexWrap:'wrap',my:1}}><Button variant="contained" onClick={e=>{const p=player.current;if(playing)p?.pause();else{if(p?.getCurrentFrame()>=nodes.length*frameCount-1)p.seekTo(0);p?.play(e)}}}>{playing?t('flow.pause'):t('flow.play')}</Button><Button onClick={()=>{player.current?.pause();player.current?.seekTo(0)}}>{t('flow.replay')}</Button>{field(t('flow.speed'),speed,v=>setSpeed(Number(v)),{select:true,sx:{minWidth:85},children:[.5,1,2].map(v=><MenuItem key={v} value={v}>{v}×</MenuItem>)})}</Box><Slider aria-label={t('flow.timeline')} value={frame} min={0} max={nodes.length*frameCount-1} onChange={(_,v)=>{player.current?.pause();player.current?.seekTo(v)}}/></>}{nodes[active]&&itemFeedback(nodes[active].id)}
    </>;
  }
  return <ThemeProvider theme={theme}><GlobalStyles styles={{'[data-visual-response-root]':{...cssVariables(tokens,c),colorScheme:dark?'dark':'light',fontFamily:tokens.fontFamily,lineHeight:tokens.type.lineHeight},'[data-visual-response-root] *':{boxSizing:'border-box',overflowWrap:'anywhere'},'[data-visual-response-root] summary':{cursor:'pointer',minHeight:tokens.control.minHeight,display:'list-item',alignContent:'center',fontSize:tokens.type.small,fontWeight:600,color:theme.palette.text.secondary},'[data-visual-response-root] summary:focus-visible':{outline:`${tokens.control.focusWidth}px solid ${theme.palette.primary.main}`,outlineOffset:tokens.control.focusOffset},'@media (prefers-reduced-motion: reduce)':{'[data-visual-response-root] *, [data-visual-response-root] *::before, [data-visual-response-root] *::after':{transition:'none !important',animation:'none !important'}}}}/><Box sx={{bgcolor:'background.paper',color:'text.primary',border:'1px solid',borderColor:'divider',borderRadius:tokens.radius.surface+'px',p:inlineCompact?tokens.layout.inlinePadding+'px':{xs:tokens.layout.contentPaddingCompact+'px',sm:tokens.layout.contentPadding+'px'},maxWidth:tokens.layout.maxWidth,mx:'auto',fontFamily:'typography.fontFamily'}}><Box sx={{display:'flex',gap:1,justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',mb:2}}><Typography component="h2" variant="h6" sx={{fontSize:inlineCompact?tokens.type.inlineTitle:{xs:tokens.type.titleCompact,sm:tokens.type.title}}}>{spec.title||spec.view}</Typography>{copy.badge&&<Chip size="small" label={t('badge')}/>}</Box>{(spec.context?.goal||spec.context?.next)&&<Box sx={{mb:2}}>{spec.context.goal&&<Typography variant="body2"><strong>{t('goal')}</strong> {spec.context.goal}</Typography>}{spec.context.next&&<Typography variant="body2"><strong>{t('next')}</strong> {spec.context.next}</Typography>}</Box>}{content}<Box sx={{mt:2,display:'flex',gap:1,alignItems:'center',flexWrap:'wrap'}}><Button variant="contained" disabled={busy} onClick={submit}>{submitLabel}</Button></Box><Box sx={{mt:2,pt:2,borderTop:'1px solid',borderColor:'divider'}}><details ref={feedbackRef} open={!inlineCompact}><summary style={{marginBottom:inlineCompact?0:12}}>{t('feedbackSection')}</summary>{field(t('generalInstruction'),draft.comment,v=>update({...draft,comment:v}),{fullWidth:true,multiline:true,minRows:2})}<Box sx={{display:'flex',gap:1,flexWrap:'wrap',my:1.5}}><Button variant="outlined" disabled={busy} onClick={submit}>{feedbackLabel}</Button><Button variant="outlined" onClick={()=>setPreview(!preview)}>{preview?t('hidePreview'):t('preview')}</Button><Button onClick={copyMessage}>{t('copy')}</Button><Button onClick={exportFeedback}>{t('export')}</Button><Button disabled={!history.current.length} onClick={undo}>{t('undo')}</Button></Box>{preview&&<><Typography variant="body2" sx={{mb:1}}>{t('previewNote')}</Typography>{field(t('editableMessage'),message(),setCustomMessage,{fullWidth:true,multiline:true,minRows:5,inputRef:messageRef})}<Button onClick={()=>{messageRef.current?.focus();messageRef.current?.select();setReceipt(t('status.selectedText'))}}>{t('selectMessage')}</Button></>}</details><Typography role="status" color="text.secondary" variant="body2" sx={{mt:1}}>{receipt}</Typography></Box></Box></ThemeProvider>;
}
createRoot(mount).render(<App/>);
