
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {zipFixture} from './helpers/zip-fixture.mjs';
import {zipEntries,zipText,wordSections} from '../public/docx.js';
import {readTxt} from '../public/office-text.js';import {extractPdfText} from '../public/pdf-text.js';
import {reviewAnswer,compactEvidence,rerankEvidence,needsReview} from '../lib/quality.mjs';
import {answerQuestion} from '../lib/service.mjs';import {clearAnswerCache} from '../lib/answer-cache.mjs';import {clearVectorCache} from '../lib/search.mjs';
function reply(value){return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]})};}
test('evidence compaction removes repeated overlap without losing text or source identity',()=>{
 const text='abcdefghij'.repeat(120),chunks=[{id:'p1-0',page:1,text:text.slice(0,900)},{id:'p1-780',page:1,text:text.slice(780)}];
 const result=compactEvidence(chunks);assert.equal(result.length,1);assert.equal(result[0].text,text);assert.equal(result[0].id,'p1-0');
});
test('reranking prioritizes direct evidence and simple questions avoid expensive review',()=>{
 const ranked=rerankEvidence('shipping cost',[{id:'a',page:1,text:'General introduction'},{id:'b',page:2,text:'Shipping cost\nShipping costs 20 dollars.'}]);assert.equal(ranked[0].id,'b');
 assert.equal(needsReview('What is the return policy?',{answer:'Fourteen days.'}),false);assert.equal(needsReview('Calculate the total',{answer:'46 USD'}),true);
});
test('review corrects an arithmetic error using valid cited evidence',async()=>{
 const result=await reviewAnswer({answer:'100 USD',sourceIds:['p1-0'],notFound:false},[{id:'p1-0',page:1,text:'3 notebooks at 12 USD and 2 pens at 5 USD.'}],'Calculate total',{key:'fake-review',model:'test',answerLanguage:'en',fetch:async()=>reply({status:'corrected',answer:'46 USD: 3 × 12 + 2 × 5.',sourceIds:['p1-0'],notFound:false,nextQuery:''})});
 assert.equal(result.verification,'corrected');assert.match(result.answer,/46/);
});
test('review cannot accept an invented citation or claim success after quota failure',async()=>{
 const original={answer:'Original answer',sourceIds:['p1-0'],notFound:false},chunks=[{id:'p1-0',page:1,text:'Evidence'}];
 const bad=await reviewAnswer(original,chunks,'Compare',{key:'fake',model:'test',fetch:async()=>reply({status:'supported',answer:'Wrong',sourceIds:['fake-id'],notFound:false,nextQuery:''})});assert.equal(bad.verification,'unavailable');assert.equal(bad.answer,'Original answer');
 const quota=await reviewAnswer(original,chunks,'Compare',{key:'fake',model:'test',fetch:async()=>({ok:false,status:429})});assert.equal(quota.verification,'unavailable');
});
test('direct answers use one generation call; an identical repeat uses no provider calls',async()=>{
 clearAnswerCache();clearVectorCache();let calls=0;
 const fetchImpl=async(url,options)=>{calls++;if(url.includes('batchEmbedContents'))return {ok:true,json:async()=>({embeddings:JSON.parse(options.body).requests.map(()=>({values:[1,0]}))})};return reply({answer:'Fourteen days.',sourceIds:['p1-0'],notFound:false});};
 const data={mode:'ai',language:'en',key:'fake-efficient-key',question:'What is the return policy?',pages:[{page:1,text:'Returns accepted within fourteen days.'}]};
 const first=await answerQuestion(data,{env:{},fetchImpl});assert.equal(first.usage.generationRequests,1);const previous=calls;
 const cached=await answerQuestion(data,{env:{},fetchImpl});assert.equal(calls,previous);assert.equal(cached.usage.cacheHit,true);assert.equal(cached.usage.generationRequests,0);assert.equal(cached.sources[0].text,data.pages[0].text);
 await answerQuestion({...data,pages:[{page:1,text:'A different document.'}]},{env:{},fetchImpl});assert.ok(calls>previous);
});
test('complex answers use an independent review and keep its corrected result',async()=>{
 clearAnswerCache();clearVectorCache();
 const fetchImpl=async(url,options)=>{const body=JSON.parse(options.body);if(url.includes('batchEmbedContents'))return {ok:true,json:async()=>({embeddings:body.requests.map(()=>({values:[1,0]}))})};if(body.systemInstruction.parts[0].text.startsWith('Independently'))return reply({status:'corrected',answer:'46 USD.',sourceIds:['p1-0'],notFound:false,nextQuery:''});return reply({answer:'100 USD.',sourceIds:['p1-0'],notFound:false});};
 const result=await answerQuestion({mode:'ai',language:'en',key:'fake-complex-key',question:'Calculate the total',documentType:'docx',pages:[{page:1,text:'3 items at 12 USD; 2 items at 5 USD.'}]},{env:{},fetchImpl});assert.match(result.answer,/46/);assert.equal(result.verification,'corrected');assert.equal(result.usage.generationRequests,2);
});
test('Word ZIP reader supports deflate and rejects invalid or oversized archives',async()=>{
 const zip=zipFixture({'word/document.xml':'<document>مرحبا</document>'}),entries=zipEntries(zip);assert.equal(await zipText(zip,entries.get('word/document.xml')),'<document>مرحبا</document>');
 assert.throws(()=>zipEntries(Buffer.from('not a zip')));await assert.rejects(zipText(zip,{...entries.get('word/document.xml'),size:9*1024*1024}));
});
test('TXT encoding and numbered sections preserve table rows without invented page numbers',()=>{
 const parts=readTxt(new TextEncoder().encode('Item\tQuantity\nNotebook\t3'));assert.match(parts[0].text,/Notebook\t3/);assert.equal(parts[0].page,1);
 const utf16=Buffer.concat([Buffer.from([255,254]),Buffer.from('Hello','utf16le')]);assert.equal(readTxt(utf16)[0].text,'Hello');
 assert.ok(wordSections(['x'.repeat(5900),'row | price | quantity']).every(p=>p.text.length<=6000));
});
test('PDF extraction groups table cells by visual row and column',()=>{
 const item=(str,x,y,width=30)=>({str,width,height:10,transform:[10,0,0,10,x,y]});
 const text=extractPdfText([item('3',200,700),item('Notebook',20,700,70),item('12',300,700),item('Quantity',200,740,50),item('Item',20,740),item('Price',300,740)]);
 assert.equal(text,'Item | Quantity | Price\nNotebook | 3 | 12');
});
test('installed app uses Warraq and real PNG icon sizes for iPhone and manifest',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));assert.equal(manifest.name,'Warraq');assert.equal(manifest.short_name,'Warraq');assert.equal(manifest.display,'standalone');
 const apple=await readFile(new URL('../public/apple-touch-icon.png',import.meta.url));assert.equal(apple.readUInt32BE(16),180);assert.equal(apple.readUInt32BE(20),180);
 for(const size of [192,512]){const png=await readFile(new URL('../public/icons/icon-'+size+'.png',import.meta.url));assert.equal(png.readUInt32BE(16),size);}
});

test('insufficient evidence triggers one broader pass rather than accepting an unsupported answer',async()=>{
 clearAnswerCache();clearVectorCache();let answers=0,firstIds,secondIds;
 const fetchImpl=async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url.includes('batchEmbedContents'))return {ok:true,json:async()=>({embeddings:body.requests.map(()=>({values:[1,0]}))})};
  const payload=JSON.parse(body.contents[0].parts[0].text);
  if(body.systemInstruction.parts[0].text.startsWith('Independently'))return reply({status:'supported',answer:'The document contains the requested details.',sourceIds:[payload.excerpts[0].id],notFound:false,nextQuery:''});
  answers++;if(answers===1){firstIds=payload.excerpts.map(c=>c.id);return reply({answer:'',sourceIds:[],notFound:true});}
  secondIds=payload.excerpts.map(c=>c.id);return reply({answer:'The document contains the requested details.',sourceIds:[payload.excerpts[0].id],notFound:false});
 };
 const pages=Array.from({length:40},(_,i)=>({page:i+1,text:'General information about this document. '.repeat(25)}));
 const result=await answerQuestion({mode:'ai',language:'en',key:'fake-retry-case-key',question:'What details are listed?',pages},{env:{},fetchImpl});
 assert.equal(result.searchPasses,2);assert.ok(secondIds.some(id=>!firstIds.includes(id)));assert.equal(result.verification,'supported');assert.equal(result.usage.generationRequests,3);
});

test('Office decompression rejects forged output sizes and needs no native decompression stream',async()=>{
 const archive=zipFixture({'document.xml':'A'.repeat(200000)}),entry=zipEntries(archive).get('document.xml');
 const native=globalThis.DecompressionStream;
 try{globalThis.DecompressionStream=undefined;assert.equal((await zipText(archive,entry)).length,200000);await assert.rejects(zipText(archive,{...entry,size:10}));await assert.rejects(zipText(archive,{...entry,size:200001}));}finally{globalThis.DecompressionStream=native;}
});
