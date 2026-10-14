import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hybridRetrieve,clearVectorCache,contextualQuery,fuseRanks,completeContext} from '../lib/search.mjs';
import {retrieve,demoAnswer,answerLanguage} from '../lib/rag.mjs';
import {answerQuestion} from '../lib/service.mjs';
import {translate} from '../public/i18n.js';
const pages=[{page:1,text:'The order can be split into three monthly installments.'},{page:2,text:'The shop sells blue cotton shirts.'}];
function embeddingFetch(calls,fail=false){return async(url,options)=>{
 calls.push({url,body:JSON.parse(options.body),headers:options.headers});
 if(fail)return {ok:false,status:429};
 const requests=JSON.parse(options.body).requests;
 return {ok:true,json:async()=>({embeddings:requests.map(r=>({values:r.content.parts[0].text.includes('blue')?[0,1]:[1,0]}))})};
};}
test('semantic search finds a cross-language passage with no shared words',async()=>{
 clearVectorCache();assert.equal(retrieve(pages,'بقدر أقسّط الطلب؟').length,0);
 const calls=[];const result=await hybridRetrieve(pages,'بقدر أقسّط الطلب؟',{key:'fake-gemini-one',fetch:embeddingFetch(calls)});
 assert.equal(result.searchMode,'hybrid');assert.equal(result.chunks[0].page,1);
 assert.ok(calls.every(c=>!c.url.includes('fake-gemini-one')&&!JSON.stringify(c.body).includes('fake-gemini-one')));
 assert.ok(calls.every(c=>c.headers['x-goog-api-key']==='fake-gemini-one'));
});
test('warm vector cache skips re-indexing but is isolated by document and key',async()=>{
 clearVectorCache();const calls=[];const options={key:'fake-cache-one',fetch:embeddingFetch(calls)};
 await hybridRetrieve(pages,'Can I split the purchase?',options);
 const first=calls.length;
 await hybridRetrieve(pages,'How many installments?',options);
 assert.equal(calls.length-first,1);
 const second=calls.length;
 await hybridRetrieve(pages,'How many installments?',{...options,key:'fake-cache-two'});
 assert.equal(calls.length-second,2);
 const third=calls.length;
 await hybridRetrieve([{page:1,text:'An unrelated account with private content.'}],'Account',options);
 assert.equal(calls.length-third,2);
});
test('embedding quota failure retains keyword search without inventing a semantic result',async()=>{
 clearVectorCache();const result=await hybridRetrieve([{page:1,text:'Refunds are available within fourteen days.'}],'refund',{key:'fake-quota',fetch:embeddingFetch([],true)});
 assert.equal(result.searchMode,'keyword');assert.equal(result.searchFallback,'quota');assert.equal(result.chunks[0].page,1);
});
test('malformed embedding vectors fall back safely',async()=>{
 clearVectorCache();const result=await hybridRetrieve(pages,'order',{key:'fake-malformed',fetch:async()=>({ok:true,json:async()=>({embeddings:[{values:[null,1]}]})})});
 assert.equal(result.searchMode,'keyword');assert.equal(result.chunks[0].page,1);
});
test('Arabic paraphrases and English aliases work in extractive search',()=>{
 const doc=[{page:1,text:'تكلفة الشحن عشرون شيكل.'},{page:2,text:'سياسة استرداد المبلغ: يمكن الإرجاع خلال أربعة عشر يومًا.'}];
 assert.equal(retrieve(doc,'بقدر ارجع المنتج؟')[0].page,2);
 assert.equal(retrieve(doc,'What is the shipping cost?')[0].page,1);
});
test('short follow-ups retain prior topic while explicit new questions remain independent',()=>{
 const history=[{question:'Can I return my order?',answer:'Returns are accepted.'}];
 assert.match(contextualQuery('How long do I have?',history),/return my order/);
  assert.match(contextualQuery('How many are there?',history),/return my order/);
 assert.equal(contextualQuery('What is the shipping cost?',history),'What is the shipping cost?');
 assert.match(contextualQuery('طيب كم يوم؟',[{question:'هل يمكن استرداد المبلغ؟',answer:'نعم.'}]),/استرداد/);
});
test('rank fusion prefers page diversity without discarding same-page evidence',()=>{
 const a=Array.from({length:8},(_,i)=>({id:'a'+i,page:1,text:'a'})),b=[{id:'b',page:2,text:'b'}];
 const result=fuseRanks(a,[...b,...a]);assert.ok(result.some(c=>c.id==='b'));assert.equal(result.length,8);assert.ok(result.filter(c=>c.page===1).length>2);
});
test('small document context retains facts beyond the first two chunks of one page',()=>{
 const chunks=Array.from({length:5},(_,i)=>({id:'p1-'+i*780,page:1,text:'text '.repeat(170)+(i===4?'Employment dates: 2020–2024':'')}));
 const result=completeContext(chunks,chunks.slice(0,2));assert.equal(result.length,5);assert.match(result.at(-1).text,/2020–2024/);
});
test('long document context includes neighboring chunks for boundary-spanning facts',()=>{
 const chunks=Array.from({length:24},(_,i)=>({id:'p1-'+i*780,page:1,text:'x'.repeat(900)}));
 const result=completeContext(chunks,[chunks[12]]);assert.ok(result.some(c=>c.id===chunks[11].id));assert.ok(result.some(c=>c.id===chunks[13].id));
});
test('English not-found responses and validation errors are localized',async()=>{
 assert.match(demoAnswer([],'What is the weather?').answer,/could not find/);
 assert.equal(answerLanguage('هل يمكن؟','en'),'ar');assert.equal(answerLanguage('Can I?','ar'),'en');
 await assert.rejects(answerQuestion({language:'en',question:'',pages:[]}),/Enter a question/);
 assert.equal(translate('الصفحة {page}','en',{page:7}),'Page 7');
});
test('conversation history is bounded and not accepted as source evidence',async()=>{
 await assert.rejects(answerQuestion({mode:'demo',question:'order',pages,history:Array(5).fill({question:'a',answer:'b'})}),/سجل/);
 let generation;
 const fetchImpl=async(url,options)=>{
  if(url.includes('batchEmbedContents'))return embeddingFetch([])(url,options);
  generation=JSON.parse(options.body);
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({answer:'Three installments.',sourceIds:['p1-0'],notFound:false})}]}}]})};
 };
 const result=await answerQuestion({mode:'ai',language:'en',key:'fake-history-gemini',question:'How many are there?',pages,history:[{question:'Can I pay in installments?',answer:'An earlier answer.'}]},{env:{},fetchImpl});
 assert.equal(result.searchMode,'hybrid');
 const prompt=JSON.parse(generation.contents[0].parts[0].text);assert.equal(prompt.history.length,1);
 assert.match(generation.systemInstruction.parts[0].text,/History and standaloneQuestion are context only/);
 assert.match(generation.systemInstruction.parts[0].text,/Answer in English/);
});
