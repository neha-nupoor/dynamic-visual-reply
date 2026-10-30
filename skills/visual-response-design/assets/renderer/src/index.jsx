import {Fragment,h,render} from 'preact';
import {useEffect,useId,useRef,useState} from 'preact/hooks';
import {merge,neutral,readJson,resolvePalette,rendererStyle} from './design-system.mjs';
import './renderer.css';
// Named imports let the bundler keep only these keys of defaults.json, not distribution settings such as the theme.
import {copy as defaultCopy,feedback as defaultFeedback} from '../../../config/defaults.json';
// Built-in adapters register themselves by id. Some hosts don't run a page's inline scripts, so they can't rely on injection.
import '../../../harnesses/codex.js';
import '../../../harnesses/claude-inline.js';
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
// An explicit data-theme or data-mode on the page root (set by widget hosts) wins over the OS preference.
const prefersDark=()=>{const root=document.documentElement.dataset,chosen=root.theme||root.mode;return chosen==='dark'||(chosen!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)};

// Module-level native controls keep focus and label associations stable through edits.
function Field({label,value,onChange,options,multiline=false,minRows=1,helperText,hideLabel=false,inputRef,className='',...props}){
  const id=useId(),helpId=helperText?id+'-help':undefined;
  const control={...props,id,value:value??'',ref:inputRef,'aria-describedby':helpId};
  return <div class={'vr-field '+className}>
    <label class={hideLabel?'vr-sr-only':'vr-label'} htmlFor={id}>{label}</label>
    {options?<select {...control} onChange={event=>onChange(event.currentTarget.value)}>{options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select>
      :multiline?<textarea {...control} rows={minRows} onInput={event=>onChange(event.currentTarget.value)}/>
      :<input type="text" {...control} onInput={event=>onChange(event.currentTarget.value)}/>}
    {helperText&&<small id={helpId}>{helperText}</small>}
  </div>;
}
function Check({label,checked,onChange,ariaLabel}){
  return <label class="vr-check"><input type="checkbox" checked={checked} aria-label={ariaLabel} onChange={event=>onChange(event.currentTarget.checked)}/>{label}</label>;
}
function Button({variant='ghost',children,className='',...props}){
  return <button type="button" class={(variant==='primary'?'':variant==='outlined'?'outline':'ghost')+' '+className} {...props}>{children}</button>;
}

function App(){
  const [draft,setDraft]=useState(()=>initial(pendingDraft?null:loaded)),[query,setQuery]=useState(''),[filter,setFilter]=useState(''),[sort,setSort]=useState({key:spec.columns?.[0]?.key||'id',ascending:true}),[page,setPage]=useState(0),[bulk,setBulk]=useState(''),[receipt,setReceipt]=useState(t('status.draft')),[customMessage,setCustomMessage]=useState(null),[preview,setPreview]=useState(false),[showColumns,setShowColumns]=useState(false),[columns,setColumns]=useState(spec.columns?.map(c=>c.key)||[]),[hostAppearance,setHostAppearance]=useState(()=>({dark:prefersDark()})),[frame,setFrame]=useState(0),[busy,setBusy]=useState(false);
  const inlineCompact=spec.resolvedPresentation?.mode==='inline';
  const history=useRef([]),hasEdits=useRef(false),messageRef=useRef(null),feedbackRef=useRef(null);
  const rowMap=new Map((spec.rows||[]).map(row=>[row.id,row]));
  const rows=(spec.rows||[]).map(row=>({...row,...draft.edits[row.id]}));
  const nodes=spec.nodes||[];
  const {dark,c}=resolvePalette(tokens,appearance,config.hostPalette,mount,hostAppearance.dark);
  const mode=submitMode();
  useEffect(()=>{
    if(appearance!=='system'&&appearance!=='host')return;
    const media=matchMedia('(prefers-color-scheme: dark)');
    let frame=0;
    // Read inherited host colors after its stylesheet settles, including same-mode palette changes.
    const change=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>setHostAppearance({dark:prefersDark()}))};
    const observer=new MutationObserver(change);
    media.addEventListener('change',change);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-mode','class','style']});
    return()=>{cancelAnimationFrame(frame);media.removeEventListener('change',change);observer.disconnect()};
  },[]);
  useEffect(()=>{if(!pendingDraft)return;let live=true;pendingDraft.then(saved=>{if(live&&!hasEdits.current&&saved?.key===key)setDraft(initial(saved))}).catch(()=>{});return()=>{live=false}},[]);
  useEffect(()=>host.onExternalDraft?.(saved=>{if(!hasEdits.current&&saved?.key===key)setDraft(initial(saved))}),[]);
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
  const field=(label,value,onChange,props={})=><Field label={label} value={value} onChange={onChange} {...props}/>;
  function itemFeedback(id){return <div class="vr-item-feedback">
    {field(t('instruction'),draft.notes[id]||'',value=>assign('notes',id,value),{multiline:true,minRows:inlineCompact?1:2,'aria-label':t('instruction')+' for '+id})}
    <Check label={t('reviewed')} ariaLabel={t('reviewed')+' for '+id} checked={draft.reviewed.includes(id)} onChange={()=>mark(id)}/>
  </div>}
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
    const matched=rows.filter(row=>(!filter||text(row[spec.filterKey])===filter)&&(!query||JSON.stringify(row).toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>{
      const av=a[sort.key],bv=b[sort.key];
      const comparison=typeof av==='number'&&typeof bv==='number'?av-bv:text(av).localeCompare(text(bv),undefined,{numeric:true});
      return sort.ascending?comparison:-comparison;
    });
    const size=spec.pageSize||20,last=Math.max(0,Math.ceil(matched.length/size)-1),current=Math.min(page,last),visible=matched.slice(current*size,(current+1)*size);
    const visibleColumns=spec.columns.filter(col=>columns.includes(col.key));
    content=<>
      <div class="vr-row vr-toolbar">
        {field(t('table.search'),query,value=>{setQuery(value);setPage(0)},{type:'search',className:'vr-grow'})}
        {spec.filterKey&&field(t('table.filter')+' '+spec.filterKey,filter,value=>{setFilter(value);setPage(0)},
          {options:[{id:'',label:t('table.all')},...[...new Set(rows.map(row=>text(row[spec.filterKey])))].map(value=>({id:value,label:value}))]})}
        <Button aria-expanded={showColumns} onClick={()=>setShowColumns(!showColumns)}>{t('table.columns')}</Button>
        <span class="vr-badge" aria-live="polite">{draft.selected.length+' '+t('table.selectedCount')}</span>
      </div>
      {showColumns&&<div class="vr-row vr-table-actions">{spec.columns.map(col=><Check key={col.key} label={col.label} checked={columns.includes(col.key)} onChange={checked=>setColumns(checked?[...columns,col.key]:columns.filter(key=>key!==col.key))}/>)}</div>}
      <div class="vr-row vr-table-actions">
        <Button variant="outlined" onClick={()=>update({...draft,selected:[...new Set([...draft.selected,...visible.map(row=>row.id)])]})}>{t('table.selectVisible')}</Button>
        <Button variant="outlined" onClick={()=>update({...draft,selected:draft.selected.filter(id=>!visible.some(row=>row.id===id))})}>{t('table.deselectVisible')}</Button>
        {matched.length>size&&<Button onClick={()=>update({...draft,selected:[...new Set([...draft.selected,...matched.map(row=>row.id)])]})}>{t('table.selectAllMatches',{count:matched.length})}</Button>}
      </div>
      <div class="vr-table-wrap"><table aria-label={spec.title}>
        <thead><tr><th scope="col">{t('table.selectColumn')}</th>{visibleColumns.map(col=><th key={col.key} scope="col" class={col.type==='number'?'vr-number':undefined} aria-sort={sort.key===col.key?(sort.ascending?'ascending':'descending'):'none'}>
          <Button className="vr-sort" onClick={()=>setSort({key:col.key,ascending:sort.key===col.key?!sort.ascending:true})}>{col.label}{sort.key===col.key&&<span aria-hidden="true">{sort.ascending?' ↑':' ↓'}</span>}</Button>
        </th>)}<th scope="col">{t('table.feedbackColumn')}</th></tr></thead>
        <tbody>{visible.map(row=><tr key={row.id} class={draft.selected.includes(row.id)?'vr-selected':undefined}>
          <td><input class="vr-checkbox" type="checkbox" checked={draft.selected.includes(row.id)} aria-label={t('select')+' '+row.id} onChange={()=>toggle(row.id)}/></td>
          {visibleColumns.map(col=><td key={col.key} class={col.type==='number'?'vr-number':undefined}>{col.editable?
            field(col.label,text(row[col.key]),value=>assign('edits',row.id,{...draft.edits[row.id],[col.key]:col.type==='number'&&value!==''?Number(value):value}),{type:col.type==='number'?'number':'text',className:'vr-edit-cell','aria-label':col.label+' for '+row.id})
            :text(row[col.key])}</td>)}
          <td class="vr-feedback-cell">{itemFeedback(row.id)}</td>
        </tr>)}</tbody>
      </table></div>
      {!matched.length&&<p class="vr-empty">{t('table.empty')}</p>}
      {(!inlineCompact||last>0)&&<div class="vr-row vr-spaced"><p class="vr-muted">{t('table.page',{page:current+1,pages:last+1,count:matched.length})}</p><Button disabled={current===0} onClick={()=>setPage(current-1)}>{t('table.previous')}</Button><Button disabled={current===last} onClick={()=>setPage(current+1)}>{t('table.next')}</Button></div>}
      {(!inlineCompact||draft.selected.length>1)&&<div class="vr-row vr-spaced">
        {field(t('table.sharedInstruction'),bulk,setBulk,{className:'vr-grow',multiline:true,minRows:1})}
        <Button variant="outlined" disabled={!draft.selected.length||!bulk.trim()} onClick={()=>{const notes={...draft.notes};draft.selected.forEach(id=>notes[id]=[notes[id],bulk].filter(Boolean).join('\n'));update({...draft,notes});setBulk('')}}>{t('table.applyToSelected')}</Button>
      </div>}
    </>;
  }else if(spec.view==='cards'){
    content=<div class="vr-grid">{rows.map(row=><article key={row.id} class={'vr-card'+(draft.selected.includes(row.id)?' vr-selected':'')}>
      <h3>{row.title||row.name||row.id}</h3>
      {row.recommended&&<span class="vr-badge vr-recommended">{t('recommended')}</span>}
      <p>{row.summary}</p>
      {row.details&&<details><summary>{t('moreDetail')}</summary><p class="vr-pre-wrap">{text(row.details)}</p></details>}
      {safeUrl(row.source)&&<a class="vr-button button ghost" href={row.source} target="_blank" rel="noreferrer">{t('source')}</a>}
      {itemFeedback(row.id)}
      <div><Button aria-pressed={draft.selected.includes(row.id)} variant={draft.selected.includes(row.id)?'primary':'outlined'} onClick={()=>toggle(row.id)}>{draft.selected.includes(row.id)?t('selected'):row.actionLabel||t('select')}</Button></div>
    </article>)}</div>;
  }else if(spec.view==='kanban'){
    const stages=spec.stages||['To review','In progress','Done'];
    content=<div class="vr-grid">{stages.map(stage=><section key={stage} class="vr-column">
      <h3>{stage} · {rows.filter(row=>(draft.stages[row.id]||row.stage||stages[0])===stage).length}</h3>
      {rows.filter(row=>(draft.stages[row.id]||row.stage||stages[0])===stage).map(row=><article key={row.id} class="vr-card">
        <h3>{row.title||row.name||row.id}</h3>
        {field(t('kanban.stage'),draft.stages[row.id]||row.stage||stages[0],value=>assign('stages',row.id,value),{options:stages.map(value=>({id:value,label:value})),'aria-label':t('kanban.stage')+' for '+row.id})}
        {itemFeedback(row.id)}
      </article>)}
    </section>)}</div>;
  }else if(spec.view==='form'){
    content=<div class="vr-stack">{(spec.fields||[]).map(f=>{
      const value=draft.fields[f.id]??f.value??'';
      if(f.type==='checkbox')return <Check key={f.id} label={f.label} checked={!!value} onChange={checked=>assign('fields',f.id,checked)}/>;
      if(f.type==='multiselect'){
        const options=draft.options[f.id]||f.options;
        return <fieldset key={f.id} class="vr-options"><legend>{f.label}</legend>{options.map(option=><div key={option.id} class="vr-option">
          <input class="vr-checkbox" type="checkbox" checked={!!option.selected} aria-label={'Include '+option.id} onChange={event=>assign('options',f.id,options.map(item=>item.id===option.id?{...item,selected:event.currentTarget.checked}:item))}/>
          {field(t('form.editableOption'),option.label,label=>assign('options',f.id,options.map(item=>item.id===option.id?{...item,label}:item)),{className:'vr-grow',hideLabel:true,'aria-label':'Option '+option.id})}
        </div>)}</fieldset>;
      }
      return field(f.label,value,next=>assign('fields',f.id,f.type==='number'&&next!==''?Number(next):next),{key:f.id,type:f.type==='number'?'number':'text',multiline:f.type==='textarea',minRows:f.type==='textarea'?3:undefined,options:f.type==='select'?f.options:undefined,helperText:f.help});
    })}</div>;
  }else if(spec.view==='flow'){
    const active=Math.min(nodes.length-1,frame);
    content=<>
      <ol class="vr-flow">{nodes.map((node,index)=><li key={node.id} class={'vr-step'+(active===index?' vr-selected':'')} aria-current={active===index?'step':undefined}>
        <p class="vr-step-number">{index+1} {index<nodes.length-1?'→':''}</p><h3>{node.title}</h3>
      </li>)}</ol>
      <div class="vr-row vr-flow-controls">{nodes.map((node,index)=><Button key={node.id} aria-pressed={active===index} variant={active===index?'primary':'outlined'} onClick={()=>setFrame(index)}>{node.title}</Button>)}</div>
      <p>{nodes[active]?.detail}</p>
      {nodes[active]&&itemFeedback(nodes[active].id)}
    </>;
  }
  return <section class={'vr-app'+(inlineCompact?' vr-inline':'')} data-appearance={dark?'dark':'light'} style={rendererStyle(tokens,c,dark,inlineCompact)}>
    <header class="vr-header"><h2>{spec.title||spec.view}</h2>{copy.badge&&<span class="vr-badge">{t('badge')}</span>}</header>
    {(spec.context?.goal||spec.context?.next)&&<div class="vr-context">{spec.context.goal&&<p><strong>{t('goal')}</strong> {spec.context.goal}</p>}{spec.context.next&&<p><strong>{t('next')}</strong> {spec.context.next}</p>}</div>}
    {content}
    <div class="vr-row vr-actions"><Button variant="primary" disabled={busy} onClick={submit}>{submitLabel}</Button>{mode==='save'&&<p class="vr-muted">{t('localSubmitHelp')}</p>}</div>
    <div class="vr-feedback"><details ref={feedbackRef} open={!inlineCompact}>
      <summary>{t('feedbackSection')}</summary>
      {field(t('generalInstruction'),draft.comment,value=>update({...draft,comment:value}),{multiline:true,minRows:2})}
      <div class="vr-row vr-feedback-actions"><Button variant="outlined" disabled={busy} onClick={submit}>{feedbackLabel}</Button><Button variant="outlined" onClick={()=>setPreview(!preview)}>{preview?t('hidePreview'):t('preview')}</Button><Button onClick={copyMessage}>{t('copy')}</Button><Button onClick={exportFeedback}>{t('export')}</Button><Button disabled={!history.current.length} onClick={undo}>{t('undo')}</Button></div>
      {preview&&<div class="vr-stack"><p class="vr-muted">{t('previewNote')}</p>{field(t('editableMessage'),message(),setCustomMessage,{multiline:true,minRows:5,inputRef:messageRef})}<div><Button onClick={()=>{messageRef.current?.focus();messageRef.current?.select();setReceipt(t('status.selectedText'))}}>{t('selectMessage')}</Button></div></div>}
    </details><p class="vr-muted vr-receipt" role="status">{receipt}</p></div>
  </section>;
}
render(<App/>,mount);
