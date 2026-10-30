import neutral from '../../../themes/neutral/theme.json';

export {neutral};

const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function merge(base,override){
  if(!isObject(override))return override===undefined?base:override;
  const out={...base};
  for(const [key,value] of Object.entries(override))out[key]=isObject(value)&&isObject(base?.[key])?merge(base[key],value):value;
  return out;
}

export function readJson(selector){
  const node=document.querySelector(selector);
  if(!node)return null;
  try{return JSON.parse(node.textContent)}catch{return null}
}

const colorPattern=/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i;
// Optional accent roles, as in Base Web's dark theme: a fill dark enough for white labels, an outline, and text on the
// selected tint. A palette that omits them uses `accent` (and `onAccent`) for every job.
const accentRoles=['accentFill','onAccentFill','accentBorder','onSelected'];
function completePalette(c){
  return {...c,accentFill:c.accentFill??c.accent,onAccentFill:c.onAccentFill??c.onAccent,accentBorder:c.accentBorder??c.accent,onSelected:c.onSelected??c.accent};
}
export function resolvePalette(tokens,appearance,hostPalette,element,prefersDark){
  const dark=appearance==='dark'||((appearance==='system'||appearance==='host')&&prefersDark);
  const base=tokens[dark?'dark':'light'];
  if(appearance!=='host'||!hostPalette)return {dark,c:completePalette(base)};
  const style=getComputedStyle(element);
  const c={...base};
  // A host accent replaces the theme's whole accent family, so the theme's split roles don't mix with host colors.
  if(hostPalette.accent)accentRoles.forEach(role=>{delete c[role]});
  for(const [role,variable] of Object.entries(hostPalette)){
    const value=style.getPropertyValue(variable).trim();
    if(colorPattern.test(value))c[role]=value;
  }
  return {dark,c:completePalette(c)};
}

export function cssVariables(tokens,c){
  const vars={};
  for(const [role,value] of Object.entries(c))vars['--vr-'+role.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())]=value;
  vars['--vr-font']=tokens.fontFamily;
  vars['--vr-radius-control']=tokens.radius.control+'px';
  vars['--vr-radius-surface']=tokens.radius.surface+'px';
  vars['--vr-control-height']=tokens.control.minHeight+'px';
  return vars;
}

export function rendererStyle(tokens,c,dark,inline){
  const px=value=>value+'px';
  const {type,control,radius,layout}=tokens;
  const [inputY,inputX]=control.inputPadding,[cellY,cellX]=tokens.table.cellPadding;
  return {
    ...cssVariables(tokens,c),colorScheme:dark?'dark':'light',
    '--oat-background':c.surface,'--oat-foreground':c.text,
    '--oat-card':c.inputFill||c.surface,'--oat-card-foreground':c.text,
    '--oat-primary':c.accentFill,'--oat-primary-foreground':c.onAccentFill,
    '--oat-secondary':c.hover,'--oat-secondary-foreground':c.text,
    '--oat-muted':c.hover,'--oat-muted-foreground':c.muted,
    '--oat-faint':c.hover,'--oat-accent':c.hover,
    '--oat-border':c.divider,'--oat-input':c.inputBorder||c.controlBorder,'--oat-ring':c.accentBorder,
    '--oat-danger':c.error,'--oat-success':c.success,'--oat-warning':c.warning,
    '--oat-font-sans':tokens.fontFamily,'--oat-text-regular':px(type.body),
    '--oat-text-7':px(type.small),'--oat-text-8':px(type.meta),
    '--oat-radius-small':px(radius.chip),'--oat-radius-medium':px(radius.control),'--oat-radius-large':px(radius.surface),
    '--oat-transition-fast':'150ms cubic-bezier(.4,0,.2,1)','--oat-transition':'200ms cubic-bezier(.4,0,.2,1)',
    '--vr-body':px(type.body),'--vr-small':px(type.small),'--vr-meta':px(type.meta),'--vr-leading':type.lineHeight,
    '--vr-title':px(inline?type.inlineTitle:type.title),'--vr-title-compact':px(inline?type.inlineTitle:type.titleCompact),
    '--vr-title-leading':type.titleLineHeight,'--vr-title-tracking':type.titleTracking,'--vr-section':px(type.section),
    '--vr-space':px(tokens.spacingUnit),'--vr-radius-chip':px(radius.chip),
    '--vr-max-width':px(layout.maxWidth),'--vr-card-min':px(layout.cardMinWidth),'--vr-flow-min':px(layout.flowMinWidth),
    '--vr-padding':px(inline?layout.inlinePadding:layout.contentPadding),
    '--vr-padding-compact':px(inline?layout.inlinePadding:layout.contentPaddingCompact),
    '--vr-surface-padding':px(layout.surfacePadding),'--vr-input-height':px(control.inputHeight),
    '--vr-input-padding':`${inputY}px ${inputX}px`,'--vr-cell-padding':`${cellY}px ${cellX}px`,
    '--vr-button-padding':`${control.paddingY}px ${control.paddingX}px`,
    '--vr-input-fill':c.inputFill||c.surface,'--vr-input-fill-active':c.inputFillActive||c.surface,
    '--vr-focus-width':px(control.focusWidth),'--vr-focus-offset':px(control.focusOffset),
  };
}
