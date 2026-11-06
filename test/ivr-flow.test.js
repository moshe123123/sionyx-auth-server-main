const Module = require('module');
const assert = require('assert');
// ---- in-memory fake Firebase
const db = {
  organizations: { sionov:{users:{uid1:{phoneNumber:'0501234567'}}}, orgB:{users:{uid1:{phoneNumber:'0501234567'}, uid2:{phoneNumber:'0521234567'}}}, orgC:{users:{}} },
  users: {}
};
const authUsers = { '0501234567@sionyx.app':'uid1', '0521234567@sionyx.app':'uid2', '0551234567@sionyx.app':'uid3' };
const passwords = {}; let failUpdate = false;
const get = (path) => path.split('/').filter(Boolean).reduce((o,k)=> (o==null?undefined:o[k]), db);
const setAt = (path, val, merge) => { const ks=path.split('/').filter(Boolean); let o=db; ks.slice(0,-1).forEach(k=>{o[k]=o[k]||{};o=o[k];}); const last=ks[ks.length-1]; o[last]= merge? {...(o[last]||{}),...val}: val; };
const ref = (path) => ({
  once: async()=>({val:()=>get(path)===undefined?null:get(path)}),
  set: async v=>setAt(path,v), update: async v=>setAt(path,v,true),
  push: async v=>setAt(path+'/'+Math.random().toString(36).slice(2), v),
});
const fakeAdmin = {
  apps:[], initializeApp(){this.apps.push(1)}, credential:{cert:()=>({})},
  database:()=>({ref}),
  auth:()=>({
    getUserByEmail: async e=>{ if(authUsers[e]) return {uid:authUsers[e]}; const x=new Error('nf'); x.code='auth/user-not-found'; throw x; },
    updateUser: async (uid,{password})=>{ if(failUpdate) throw new Error('boom'); passwords[uid]=password; }
  }),
  app:()=>({options:{credential:{getAccessToken: async()=>({access_token:'t'})}}})
};
let handler;
const fakeAxios = { get: async ()=>({data:{sionov:true,orgB:true,orgC:true}}) };
const origLoad = Module._load;
Module._load = function(req,...a){
  if(req==='firebase-admin') return fakeAdmin;
  if(req==='axios') return fakeAxios;
  if(req==='yemot-router2') return { YemotRouter: ()=>({ get:(p,h)=>{handler=h;}, }) };
  if(req==='express'){ const e=()=>({use(){},get(){},post(){},listen(){}}); e.json=()=>()=>{}; return e; }
  return origLoad.call(this,req,...a);
};
process.env.FIREBASE_DATABASE_URL='https://x.firebaseio.com'; process.env.PORT='0';
require('../index.js');
const calls=[];
const mkCall=(phone,digit)=>({phone, read: async(msgs)=>{ calls.push(msgs.map(m=>m.data).join(' ')); return calls.length&&digit; }});
// call.read first returns the digit chosen; later reads return ''
const run = async (phone,digit)=>{ calls.length=0; let first=true; const call={phone, read: async(msgs)=>{ calls.push(msgs.map(m=>m.data).join(' ')); if(first){first=false;return digit;} return ''; }}; await handler(call); return [...calls]; };
(async()=>{
  // verify across orgs
  let out = await run('0501234567','1');
  assert(out.some(t=>t.includes('אומת בהצלחה')), 'verify ok msg');
  assert.strictEqual(db.organizations.sionov.users.uid1.phoneVerified,true);
  assert.strictEqual(db.organizations.orgB.users.uid1.phoneVerified,true);
  assert.strictEqual(db.organizations.orgB.users.uid2.phoneVerified,undefined,'other user untouched');
  assert.strictEqual(db.phoneVerifications['0501234567'].uid,'uid1');
  assert.deepStrictEqual(db.phoneVerifications['0501234567'].orgIds.sort(),['orgB','sionov']);
  // +972 caller id format
  db.organizations.orgB.users.uid1.phoneVerified=false;
  out = await run('972501234567','1'); assert.strictEqual(db.organizations.orgB.users.uid1.phoneVerified,true,'972 format');
  // partial number must NOT match someone else (old endsWith bug)
  out = await run('1234567','1'); assert(out.some(t=>t.includes('לא נמצא')),'partial number not matched');
  // account exists in Auth but in no org
  out = await run('0551234567','1'); assert(out.some(t=>t.includes('לא נמצא')),'no org record');
  // reset
  out = await run('0501234567','2');
  assert(/^\d{8}$/.test(passwords.uid1),'8-digit password set');
  assert(out.some(t=>t.includes('הסיסמה החדשה')),'speaks password');
  assert(!JSON.stringify(db).includes(passwords.uid1),'password never stored in DB');
  assert(db.passwordResetLog.uid1,'audit log written');
  await run('0501234567','2'); await run('0501234567','2');
  out = await run('0501234567','2'); assert(out.some(t=>t.includes('יותר מדי')),'4th reset rate-limited');
  // update failure must not read a password
  failUpdate=true; out = await run('0521234567','2');
  assert(out.every(t=>!t.includes('הסיסמה החדשה')),'no password spoken on failure'); assert(out.some(t=>t.includes('שגיאה')));
  console.log('ALL AUTH-SERVER CHECKS PASSED');
  process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
