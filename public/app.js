import {readTxt,readPptx} from '/office-text.js';
import {readDocx} from '/docx.js';
import {extractPdfText} from '/pdf-text.js';
import {translate,captureInterface,originalText} from '/i18n.js';
import * as pdfjs from '/vendor/pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
const $ = id => document.getElementById(id);
let language='ar';try{language=localStorage.getItem('warraq-language')==='en'?'en':'ar';}catch{}
const translateInterface=captureInterface();
const t=(text,values)=>translate(text,language,values);
let activeSources=[],lastError='';
let documentType='pdf';let sessionKey='';let pages=[],pdf=null,documentName='',history=[],config={mode:'demo'},busy=false,loadRevision=0,renderRevision=0;
function element(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(['answer-text','user-message'].includes(className)||tag==='p')e.dir='auto';if(text!==undefined)e.textContent=text;return e;}
function error(message){lastError=originalText(message);$('errorMessage').textContent=t(lastError);$('errorMessage').hidden=!message;}
function updateControls(){$('languageToggle').disabled=busy;const ready=pages.some(p=>p.text.trim());$('question').disabled=!ready||busy;$('sendButton').disabled=!ready||busy;$('removeDocument').disabled=busy;$('fileInput').disabled=busy;$('exportChat').disabled=!history.length||busy;$('clearChat').disabled=busy;$('composerHint').textContent=busy?t("جاري البحث في المستند…"):ready?(config.mode==='ai'?t("اسأل عن مستندك — بالعربي أو بالإنجليزي"):t("مقتطفات أصلية دون توليد AI")):t("ارفع مستندًا أولًا");}
const welcome=$('welcome');
function clearConversation(){history=[];$('messages').replaceChildren(welcome);welcome.hidden=false;showSources([]);error('');updateControls();}
async function releasePdf(){if(pdf){const old=pdf;pdf=null;await old.destroy();}}
function setDocument(name,newPages,type='pdf'){documentType=type;$('documentBadge').textContent=type.toUpperCase();documentName=name;pages=newPages;$('documentName').textContent=name;$('documentStats').textContent=t(documentType==='docx'?'{pages} قسم · {chars} حرف':documentType==='pptx'?'{pages} شريحة · {chars} حرف':documentType==='txt'?'{pages} جزء · {chars} حرف':'{pages} صفحة · {chars} حرف',{pages:pages.length,chars:pages.reduce((n,p)=>n+p.text.length,0).toLocaleString(language)});$('documentCard').hidden=false;clearConversation();updateControls();}
function showSources(sources){activeSources=sources;$('sourceCount').textContent=String(sources.length);$('sources').replaceChildren();if(!sources.length){const box=element('div','empty-sources');box.append(element('div',null,'▤'),element('h3',null,t("كل إجابة، إلها مرجع")),element('p',null,t("المقاطع وأرقام الصفحات تظهر هون بعد سؤالك، حتى تقدر تتأكد بنفسك.")));$('sources').append(box);return;}for(const s of sources){const card=element('article','source-card');const head=element('header');head.append(element('span',null,t(documentType==='docx'?'القسم {page}':documentType==='pptx'?'الشريحة {page}':documentType==='txt'?'الجزء {page}':'الصفحة {page}',{page:s.page})),element('span',null,'↗'));const open=element('button',null,t(documentType!=='pdf'?'افتح المصدر ←':'افتح الصفحة ←'));open.type='button';open.addEventListener('click',()=>openPage(s.page));card.append(head,element('p',null,s.text),open);$('sources').append(card);}}
async function openPage(number){const revision=++renderRevision;$('sourceDialogTitle').textContent=`${documentName} — ${t(documentType==='docx'?'القسم {page}':documentType==='pptx'?'الشريحة {page}':documentType==='txt'?'الجزء {page}':'الصفحة {page}',{page:number})}`;$('pageText').textContent=pages.find(p=>p.page===number)?.text||t("لم يتم استخراج نص من هذه الصفحة.");$('pageText').hidden=false;$('pdfCanvas').hidden=true;if(!$('sourceDialog').open)$('sourceDialog').showModal();if(!pdf)return;try{const page=await pdf.getPage(number);if(revision!==renderRevision)return;const viewport=page.getViewport({scale:1.3});const canvas=$('pdfCanvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;if(revision!==renderRevision)return;$('pageText').hidden=true;canvas.hidden=false;}catch{if(revision===renderRevision)$('pageText').hidden=false;}}
$('closeSource').addEventListener('click',()=>{renderRevision++;$('sourceDialog').close();});
$('sourceDialog').addEventListener('click',event=>{if(event.target===$('sourceDialog')){renderRevision++;$('sourceDialog').close();}});
async function loadFile(file){
 if(busy||!file)return;error('');
 if(/\.(doc|ppt)$/i.test(file.name)){error(t('حوّل الملفات القديمة إلى .docx أو .pptx أولًا.'));return;}
 if(!/\.(pdf|docx|txt|pptx)$/i.test(file.name)||file.size>20*1024*1024){error(t('اختر PDF أو DOCX أو TXT أو PPTX حجمه أقل من 20 MB.'));return;}
 const revision=++loadRevision;busy=true;updateControls();$('modeBadge').textContent=t('استخراج النص…');let candidate;
 try{
  const buffer=await file.arrayBuffer();
  if(!/\.pdf$/i.test(file.name)){
   const type=file.name.split('.').at(-1).toLowerCase();const extracted=type==='docx'?await readDocx(buffer):type==='pptx'?await readPptx(buffer):readTxt(buffer);if(revision!==loadRevision)return;await releasePdf();setDocument(file.name,extracted,type);
  }else{
   candidate=await pdfjs.getDocument({data:new Uint8Array(buffer),cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'}).promise;
   if(candidate.numPages>200)throw new Error(t('الحد الأقصى 200 صفحة. اختر ملفًا أصغر.'));
   const extracted=[];let total=0;
   for(let i=1;i<=candidate.numPages;i++){const page=await candidate.getPage(i),content=await page.getTextContent(),text=extractPdfText(content.items);total+=text.length;if(total>1000000||text.length>100000)throw new Error(t('النص المستخرج طويل جدًا. اختر ملفًا أصغر.'));extracted.push({page:i,text:text.trim()});$('modeBadge').textContent=t('قراءة الصفحة {page} / {total}',{page:i,total:candidate.numPages});}
   if(!extracted.some(p=>p.text.trim()))throw new Error(t('هذا PDF يحتوي على صور فقط. يلزم OCR أولًا؛ النسخة الحالية تدعم الملفات النصية.'));
   if(revision!==loadRevision){await candidate.destroy();candidate=null;return;}await releasePdf();pdf=candidate;candidate=null;setDocument(file.name,extracted,'pdf');
  }
  $('question').focus();
 }catch(e){if(candidate)await candidate.destroy();error(e.name==='PasswordException'?t('الملف محمي بكلمة مرور. استخدم نسخة غير محمية.'):e.message||t('تعذّر استخراج النص.'));}
 finally{busy=false;$('fileInput').value='';refreshMode();}
}
$('fileInput').addEventListener('change',e=>loadFile(e.target.files[0]));
$('dropZone').addEventListener('dragover',e=>{e.preventDefault();if(!busy)$('dropZone').classList.add('dragging');});
$('dropZone').addEventListener('dragleave',()=>$('dropZone').classList.remove('dragging'));
$('dropZone').addEventListener('drop',e=>{e.preventDefault();$('dropZone').classList.remove('dragging');loadFile(e.dataTransfer.files[0]);});
$('removeDocument').addEventListener('click',async()=>{++loadRevision;renderRevision++;await releasePdf();pages=[];documentName='';$('documentCard').hidden=true;clearConversation();});
$('clearChat').addEventListener('click',clearConversation);
document.querySelectorAll('[data-question]').forEach(button=>button.addEventListener('click',()=>{if(!pages.length){error(t("ارفع مستندًا أولًا."));return;}$('question').value=button.dataset.question;$('question').focus();}));
function addUser(text){welcome.hidden=true;const m=element('div','message');m.append(element('div','user-message',text));$('messages').append(m);return m;}
function addAnswer(result){const m=element('article','message');const head=element('div','message-head');head.append(element('span','avatar',''),element('span',null,t("ورّاق")),element('span',null,result.mode==='ai'?t("إجابة Gemini"):t("استخراج محلي")));m.append(head,element('div','answer-text',result.answer));const meta=element('div','message-meta');for(const s of result.sources.filter((s,i,list)=>list.findIndex(item=>item.page===s.page)===i)){const c=element('button','citation',t(documentType==='docx'?'قسم {page}':documentType==='pptx'?'شريحة {page}':documentType==='txt'?'جزء {page}':'ص {page}',{page:s.page}));c.type='button';c.addEventListener('click',()=>{showSources(result.sources);openPage(s.page);});meta.append(c);}meta.append(element('span',null,t('{seconds} ثانية',{seconds:(result.elapsedMs/1000).toFixed(1)})));if(result.sources.length){const show=element('button','citation',t("عرض مصادر هذه الإجابة"));show.type='button';show.addEventListener('click',()=>{showSources(result.sources);openPage(result.sources[0].page);});meta.append(show);}meta.append(element('span',null,t(result.searchMode==='hybrid'?'بحث بالمعنى والكلمات':'بحث بالكلمات')));if(result.searchFallback){const notice=element('span',null,'ⓘ');notice.title=t('البحث بالمعنى غير متاح حاليًا؛ استُخدم البحث بالكلمات.');meta.append(notice);}m.append(meta);$('messages').append(m);showSources(result.sources);return m;}
$('chatForm').addEventListener('submit',async e=>{e.preventDefault();const question=$('question').value.trim();if(!question||!pages.length||busy)return;error('');busy=true;updateControls();addUser(question);$('question').value='';const loading=element('div','message message-loading',t("ورّاق يبحث في صفحاتك…"));$('messages').append(loading);$('messages').scrollTop=$('messages').scrollHeight;try{const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','x-warraq-language':language},body:JSON.stringify({question,pages,mode:config.mode,key:sessionKey||undefined,language,documentType,history:history.slice(-4).map(h=>({question:h.question.slice(0,1000),answer:h.answer.slice(0,2000)}))}),signal:AbortSignal.timeout(55000)});const data=await response.json();if(!response.ok)throw new Error(data.error||t("تعذّر جلب الإجابة."));loading.remove();addAnswer(data);history.push({question,...data});}catch(e){loading.remove();error(e.name==='TimeoutError'?t("انتهت مهلة الطلب. حاول مرة أخرى."):e.message);$('question').value=question;}finally{busy=false;updateControls();$('messages').scrollTop=$('messages').scrollHeight;$('question').focus();}});
$('question').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chatForm').requestSubmit();}});
$('exportChat').addEventListener('click',()=>{const text=`${t('ورّاق')} — ${documentName}\n${new Date().toISOString()}\n\n`+history.map(h=>`${t('السؤال')}: ${h.question}\n${t('الوضع')}: ${h.mode==='ai'?'AI':t('استخراج محلي')}\n${t('الإجابة')}: ${h.answer}\n${t('المصادر')}: ${h.sources.map(s=>t(documentType==='docx'?'القسم {page}':documentType==='pptx'?'الشريحة {page}':documentType==='txt'?'الجزء {page}':'الصفحة {page}',{page:s.page})).join(', ')||t('لا توجد')}\n`).join('\n--------------------\n\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/plain;charset=utf-8'}));const link=element('a');link.href=url;link.download='warraq-conversation.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});

function refreshMode(){
 $('configureAI').hidden=Boolean(config.serverConfigured);
 $('modeBadge').textContent=config.mode==='ai'?t("Gemini مُعدّ"):t("بحث بالمقتطفات");
 updateControls();
}
$('configureAI').addEventListener('click',()=>{if(busy)return;$('geminiKey').value='';$('keyError').hidden=true;$('keyDialog').showModal();$('geminiKey').focus();});
$('closeKey').addEventListener('click',()=>$('keyDialog').close());
$('keyForm').addEventListener('submit',e=>{e.preventDefault();const key=$('geminiKey').value.trim();if(!/^[A-Za-z0-9_.-]{15,400}$/.test(key)||key.startsWith('sk-')){$('keyError').textContent=t("انسخ قيمة مفتاح Gemini من Google AI Studio فقط؛ مفتاح OpenAI لا يعمل هنا.");$('keyError').hidden=false;return;}sessionKey=key;config.mode='ai';$('geminiKey').value='';$('keyDialog').close();refreshMode();error('');});
$('forgetKey').addEventListener('click',()=>{sessionKey='';config.mode='demo';$('geminiKey').value='';$('keyDialog').close();refreshMode();});
try{const response=await fetch('/api/config');if(!response.ok)throw new Error();config=await response.json();refreshMode();}catch{error(t("تعذّر الاتصال بخادم التطبيق. أعد تحميل الصفحة أو راجع إعدادات النشر."));$('modeBadge').textContent=t("غير متصل");}updateControls();

function setLanguage(next){
 language=next;try{localStorage.setItem('warraq-language',language);}catch{}
 document.documentElement.lang=language;document.documentElement.dir=language==='en'?'ltr':'rtl';document.title=t('ورّاق — اسأل مستندك');translateInterface(language);
 $('languageToggle').textContent=language==='en'?'العربية':'English';$('languageToggle').setAttribute('aria-label',language==='en'?'التبديل إلى العربية':'Switch to English');
 $('languageToggle').disabled=busy;
 document.querySelectorAll('[data-question]').forEach(button=>{if(!button.dataset.originalQuestion)button.dataset.originalQuestion=button.dataset.question;button.dataset.question=t(button.dataset.originalQuestion);});
 if(history.length){const sources=activeSources;$('messages').replaceChildren();for(const turn of history){addUser(turn.question);addAnswer(turn);}showSources(sources);}
 else if($('messages').contains(welcome))welcome.hidden=false;
 if(pages.length)$('documentStats').textContent=t(documentType==='docx'?'{pages} قسم · {chars} حرف':documentType==='pptx'?'{pages} شريحة · {chars} حرف':documentType==='txt'?'{pages} جزء · {chars} حرف':'{pages} صفحة · {chars} حرف',{pages:pages.length,chars:pages.reduce((n,p)=>n+p.text.length,0).toLocaleString(language)});
 error(lastError);refreshMode();showSources(activeSources);
}
$('languageToggle').addEventListener('click',()=>{if(!busy)setLanguage(language==='ar'?'en':'ar');});
setLanguage(language);
