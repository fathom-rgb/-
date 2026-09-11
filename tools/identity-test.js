const assert=require('node:assert/strict');
for(const f of ['core','actions','events_junior','events_senior','beats','endings'])require('../js/data/'+f+'.js');
require('../js/engine.js');const U=globalThis.UNISIM;
for(const gender of ['woman','man','nonbinary','unspecified'])for(const orientation of ['women','men','nonbinary','any','none']){
 const st=U.newGame({gender,orientation});assert.equal(st.meta.gender,gender);assert.equal(st.meta.orientation,orientation);
 if(orientation!=='any'&&orientation!=='none')assert.equal(st.meta.crushGender,{women:'woman',men:'man',nonbinary:'nonbinary'}[orientation]);
 const loaded=U.deserialize(U.serialize(st));assert.deepEqual(loaded.meta,st.meta);
 if(orientation==='none')for(let run=0;run<5;run++){
  const s=U.newGame({gender,orientation});let v=U.start(s),steps=0;
  while(!s.over&&steps++<500){if(v.type==='action'){const a=v.actions[Math.floor(Math.random()*v.actions.length)];v=U.chooseAction(s,a.id);}else if(v.type==='beat'||v.type==='event'){const opts=v.options.filter(x=>x.enabled);assert.ok(opts.length);v=U.chooseOption(s,v.type,opts[Math.floor(Math.random()*opts.length)].idx);}else break;assert.equal(s.couple,false);assert.equal(s.crushMet,false);assert.equal(s.love,0);}
  assert.ok(s.over,'Non-romance playthrough finishes');
 }
}
const old=JSON.parse(U.serialize(U.newGame({})));delete old.meta.gender;delete old.meta.orientation;delete old.meta.crushGender;assert.ok(U.view(U.deserialize(JSON.stringify(old))));
console.log('PASS: 20 identity combinations, save round trips, old save loading, 20 non-romance playthroughs');
