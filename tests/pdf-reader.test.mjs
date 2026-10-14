import test from 'node:test';
import assert from 'node:assert/strict';
import {readPageText} from '../public/pdf-reader.js';
test('PDF reader works on streams without async iteration and preserves all chunks',async()=>{
 let released=false;const chunks=[{items:[{str:'First',hasEOL:true}]},{items:[{str:'Second',transform:[1,0,0,1,2,3]}]}];
 const page={streamTextContent:()=>({getReader:()=>({read:async()=>chunks.length?{done:false,value:chunks.shift()}:{done:true},releaseLock:()=>released=true})})};
 const result=await readPageText(page);assert.deepEqual(result.items.map(i=>i.str),['First','Second']);assert.equal(result.items[1].transform[4],2);assert.equal(released,true);
});
test('PDF reader cancels oversized text and always releases the stream',async()=>{
 let cancelled=false,released=false;const page={streamTextContent:()=>({getReader:()=>({read:async()=>({done:false,value:{items:[{str:'x'.repeat(100001)}]}}),cancel:async()=>cancelled=true,releaseLock:()=>released=true})})};
 await assert.rejects(readPageText(page),/طويل/);assert.equal(cancelled,true);assert.equal(released,true);
});
test('PDF reader preserves the original failure while releasing and cancelling',async()=>{
 let released=false;const failure=new Error('Broken PDF stream');const page={streamTextContent:()=>({getReader:()=>({read:async()=>{throw failure;},cancel:async()=>{throw new Error('cancel failed');},releaseLock:()=>released=true})})};
 await assert.rejects(readPageText(page),error=>error===failure);assert.equal(released,true);
});
