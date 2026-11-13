// Testes das regras de gestão sem depender de navegador ou banco remoto.
process.env.TZ='America/Sao_Paulo';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('/* ===================== GESTÃO OPERACIONAL'),html.indexOf('function mgHistory('));
const ctx={console,Date,Map,Set,Number,Math,GAP:()=>30,ON:false,me:null,OPSALL:{},GN:{},S:{ops:[],waves:[],metas:{},cfg:{gap:30,tol:15,turnos:{1:{ini:7,fim:16},2:{ini:16,fim:23}}}},
 $:s=>ctx.fields[s],fields:{'#iPer':{value:'1'},'#day':{value:''}},restricted:()=>false,myG:()=>'',inView:()=>true,
 dk:t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')},
 turnoOf:o=>ctx.S.cfg.turnos[o.t===2?2:1]};
vm.createContext(ctx);vm.runInContext(source,ctx);
vm.runInContext("let TH={},PRS={},PBX={};",ctx);
const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);yesterday.setHours(0,0,0,0);const day=ctx.dk(yesterday);ctx.fields['#day'].value=day;
const ana={m:'CL001',n:'Ana',t:1,g:'A'},bruno={m:'CL002',n:'Bruno',t:1,g:'A'},carla={m:'CL003',n:'Carla',t:2,g:'A'};
ctx.S.ops=[ana,bruno,carla];ctx.S.metas={A:1200};ctx.MT=()=>ctx.S.metas;
const wave=(op,h,m=0)=>({op,gal:'A',ts:new Date(day+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00').getTime(),st:0,qty:10});
ctx.S.waves=[wave('CL001',10),wave('CL001',16,30),wave('CL001',16,45)];
let data=ctx.mgData();
assert.equal(ctx.mgStatus(ana,day,data.byOpDay.get(day+'|CL001'),data),'Bipou');
assert.equal(ctx.mgStatus(bruno,day,[],data),'Pendente de conferência');
assert.equal(ctx.mgStatus(carla,day,[],data),'Sem operação identificada');
assert.equal(ctx.mgExtra(ana,day,data.byOpDay.get(day+'|CL001')).ms,15*60000);
assert.equal(ctx.mgExtra(ana,day,[wave('CL001',16,30)]).ms,0);
assert.equal(ctx.mgExtra(ana,day,[wave('CL001',17),wave('CL001',18)]).ms,0);
assert.equal(ctx.mgReference(ana,data),1200);
ctx.S.waves.push(wave('CL002',11));data=ctx.mgData();assert.equal(ctx.mgReference(ana,data),600);assert.equal(ctx.mgReference(bruno,data),600);
const future=new Date();future.setDate(future.getDate()+2);const futureKey=ctx.dk(future);assert.equal(ctx.mgStatus(bruno,futureKey,[],data),'Aguardando turno');
const later={...bruno,criado:future.toISOString()};assert.equal(ctx.mgStatus(later,day,[],data),'Fora do cadastro');
// turno por pessoa: mudança feita hoje não altera os dias anteriores
const realTurno=html.slice(html.indexOf('function turnoOf('),html.indexOf('function isOT('));
vm.runInContext(realTurno,ctx);
const cida={id:'op-cida',m:'CL004',n:'Cida',t:1,ini:7,fim:15,g:'A'};
ctx.hist={'op-cida':[{c:'inicio',a:6,n:7,e:'x@y.z',t:new Date('2026-11-10T10:00:00').getTime()},{c:'fim',a:14,n:15,e:'x@y.z',t:new Date('2026-11-12T10:00:00').getTime()}]};
vm.runInContext('TH=hist',ctx);
assert.deepEqual({...ctx.turnoOf(cida,'2026-11-09')},{ini:6,fim:14});
assert.deepEqual({...ctx.turnoOf(cida,'2026-11-11')},{ini:7,fim:14});
assert.deepEqual({...ctx.turnoOf(cida,'2026-11-13')},{ini:7,fim:15});
assert.deepEqual({...ctx.turnoOf({id:'sem',t:1})},{...ctx.S.cfg.turnos[1]});
// registros de presença: nada é calculado sozinho; baixa para a contagem individual
const setGlob=(name,val)=>vm.runInContext(name+'='+JSON.stringify(val),ctx);
const bru={...bruno,id:'op-br'};
setGlob('PRS',{'op-br':[{id:'r1',t:'atestado',i:day,f:day,o:'',e:'g@x.z'}]});setGlob('PBX',{});
assert.equal(ctx.mgStatus(bru,day,[],ctx.mgData()),'Atestado');
setGlob('PRS',{'op-br':[{id:'r2',t:'declaracao',i:day,f:day,hi:'07:00',hf:'08:00',o:'',e:'g@x.z'}]});
assert.equal(ctx.mgStatus(bru,day,[],ctx.mgData()),'Declaração');
setGlob('PRS',{'op-br':[{id:'r3',t:'falta',i:day,f:day,o:'',e:'g@x.z'}]});
assert.equal(ctx.mgStatus(bru,day,[],ctx.mgData()),'Falta injustificada');
assert.equal(ctx.mgStatus(bru,day,[{ts:Date.now(),qty:1,ty:'Vários artigos'}],ctx.mgData()),'Falta injustificada · bipou (conferir)');
setGlob('PRS',{'op-br':[{id:'r4',t:'folga',i:'2000-01-01',f:'2000-01-02',o:'',e:'g@x.z'}]});
assert.equal(ctx.mgStatus(bru,day,[],ctx.mgData()),'Pendente de conferência');
// baixa às 12:00 do dia: ondas depois desse horário saem da contagem individual, mas continuam no total da equipe
ctx.S.ops.find(o=>o.m==='CL001').id='op-ana';setGlob('PRS',{});setGlob('PBX',{['op-ana|'+day]:{id:'b1',saida:new Date(day+'T12:00:00').getTime()}});
const antes=new Date(day+'T11:00:00').getTime(),depois=new Date(day+'T13:00:00').getTime();
ctx.S.waves=[{id:'w1',op:'CL001',gal:'A',ts:antes,qty:5,ty:'Vários artigos',st:0,fin:antes},{id:'w2',op:'CL001',gal:'A',ts:depois,qty:7,ty:'Vários artigos',st:0,fin:depois}];
const dataBaixa=ctx.mgData();
assert.equal((dataBaixa.byOpDay.get(day+'|CL001')||[]).length,1);
assert.equal(dataBaixa.waves.length,2);
console.log('Regras de presença, turno, baixa e divisão da meta: verificações passaram.');
