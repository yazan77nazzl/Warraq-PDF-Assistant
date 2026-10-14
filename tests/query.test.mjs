import {test} from 'node:test';import assert from 'node:assert/strict';
import {planQuery} from '../lib/query.mjs';
test('colloquial follow-up is rewritten with context and bilingual search terms',async()=>{
 let sent;
 const plan=await planQuery('كم معه خبره',[{question:'What is this document about?',answer:'A software engineer resume.'}],{key:'fake-query-key',model:'test',fetch:async(url,options)=>{
  assert.ok(!url.includes('fake-query-key'));sent=JSON.parse(options.body);
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({standaloneQuestion:'كم سنة من الخبرة المهنية يمتلك صاحب السيرة الذاتية؟',searchQuery:'professional experience employment start end dates سنوات الخبرة الوظائف التواريخ'})}]}}]})};
 }});
 assert.equal(plan.queryRewritten,true);assert.match(plan.searchQuery,/كم معه خبره/);assert.match(plan.searchQuery,/employment/);
 assert.match(sent.systemInstruction.parts[0].text,/never answer/);assert.equal(JSON.parse(sent.contents[0].parts[0].text).history.length,1);
 assert.ok(!JSON.stringify(sent).includes('fake-query-key'));
});
test('query planning failures safely fall back without leaking credentials',async()=>{
 const result=await planQuery('What about its cost?',[{question:'Shipping',answer:'Earlier answer'}],{key:'private-test-key',model:'test',fetch:async()=>{throw new Error('private-test-key');}});
 assert.equal(result.queryRewritten,false);assert.match(result.searchQuery,/Shipping/);assert.ok(!JSON.stringify(result).includes('private-test-key'));
});
