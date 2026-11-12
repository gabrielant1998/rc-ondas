// Testes das regras de gestão sem depender de navegador ou banco remoto.
process.env.TZ='America/Sao_Paulo';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('/* ===================== GESTÃO OPERACIONAL'),html.indexOf('function mgHistory('));
const ctx={console,Date,Map,Set,Number,Math,ON:false,me:null,OPSALL:{},GN:{},S:{ops:[],waves:[],metas:{},cfg:{gap:30,tol:15,turnos:{1:{ini:7,fim:16},2:{ini:16,fim:23}}}},
 $:s=>ctx.fields[s],fields:{'#iPer':{value:'1'},'#day':{value:''}},restricted:()=>false,myG:()=>'',inView:()=>true,
 dk:t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')},
 turnoOf:o=>ctx.S.cfg.turnos[o.t===2?2:1]};
vm.createContext(ctx);vm.runInContext(source,ctx);
const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);yesterday.setHours(0,0,0,0);const day=ctx.dk(yesterday);ctx.fields['#day'].value=day;
const ana={m:'CL001',n:'Ana',t:1,g:'A'},bruno={m:'CL002',n:'Bruno',t:1,g:'A'},carla={m:'CL003',n:'Carla',t:2,g:'A'};
ctx.S.ops=[ana,bruno,carla];ctx.S.metas={A:1200};ctx.MT=()=>ctx.S.metas;
const wave=(op,h,m=0)=>({op,gal:'A',ts:new Date(day+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00').getTime(),st:0,qty:10});
ctx.S.waves=[wave('CL001',10),wave('CL001',16,30),wave('CL001',16,45)];
let data=ctx.mgData();
assert.equal(ctx.mgStatus(ana,day,data.byOpDay.get(day+'|CL001'),data),'Bipou');
assert.equal(ctx.mgStatus(bruno,day,[],data),'Falta: sem bipagem (conferir)');
assert.equal(ctx.mgStatus(carla,day,[],data),'Sem operação identificada');
assert.equal(ctx.mgExtra(ana,day,data.byOpDay.get(day+'|CL001')).ms,15*60000);
assert.equal(ctx.mgExtra(ana,day,[wave('CL001',16,30)]).ms,0);
assert.equal(ctx.mgExtra(ana,day,[wave('CL001',17),wave('CL001',18)]).ms,0);
assert.equal(ctx.mgReference(ana,data),1200);
ctx.S.waves.push(wave('CL002',11));data=ctx.mgData();assert.equal(ctx.mgReference(ana,data),600);assert.equal(ctx.mgReference(bruno,data),600);
const future=new Date();future.setDate(future.getDate()+2);const futureKey=ctx.dk(future);assert.equal(ctx.mgStatus(bruno,futureKey,[],data),'Aguardando turno');
const later={...bruno,criado:future.toISOString()};assert.equal(ctx.mgStatus(later,day,[],data),'Fora do cadastro');
console.log('Regras de presença, turno, hora extra e divisão da meta: 10 verificações passaram.');
