const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const h=fs.readFileSync('index.html','utf8'),src=h.slice(h.indexOf('/* Painel público:'),h.indexOf('/* ===================== PAINEL (só produção)'));
const nodes={};let chart=[];const ctx={console,Date,Math,Array,TY:[['Itens Únicos','blue']],S:{metas:{A:100},gals:['A'],cfg:{gap:30}},MT:()=>({A:100}),
 $:k=>nodes[k]||(nodes[k]={innerHTML:'',textContent:''}),fmt:n=>String(Math.round(n)),mm:n=>String(n),
 barsSvg:a=>(chart=a,'gráfico'),hourWindow:()=>[0,23],GAP:()=>30,metaCheck:()=>{},chartH:a=>(chart=a,'gráfico'),peakTxt:()=>'pico',bars:()=>'',ico:()=>'',esc:s=>String(s)};
vm.createContext(ctx);vm.runInContext(src,ctx);
ctx.desenhaPainelPublico({total:30,ondas:2,pessoas:1,extra_un:0,extra_ondas:0,dur_n:0,horas:[{hora:9,qtd:30}],tipos:[{tipo:'Itens Únicos',qtd:30,ondas:2}],galpoes:[],dur_tipos:[]},'A','');
assert.equal(chart[9],30);assert.match(nodes['#kpis'].innerHTML,/30/);assert.match(nodes['#chT'].innerHTML,/Itens Únicos/);assert.match(nodes['#chT'].innerHTML,/30/);
console.log('Painel público: total, tipo e gráfico por hora verificados.');
