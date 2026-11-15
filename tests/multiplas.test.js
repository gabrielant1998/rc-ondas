// Verificação das regras de configuração por tipo sem dependência de navegador.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const initial=html.match(/const MULTI_DEF=(\{[^;]+\});/)[1];
const helper=html.slice(html.indexOf('function multiOnda('),html.indexOf('const isRT='));
const changes=html.slice(html.indexOf('function remChange('),html.indexOf('function remWave('));
const context={S:{cfg:{multi:JSON.parse(initial)}},ty:'Vários artigos',calls:[],encodeURIComponent,
 rem:(f,msg)=>{context.calls.push({msg});return f()},mut:(url,method,body)=>{context.calls.push({url,method,body});return true}};
vm.createContext(context);vm.runInContext(helper+changes,context);
assert.equal(context.multiOnda('Pacote do mesmo'),true);
assert.equal(context.multiOnda('Maiores/Pesados'),true);
assert.equal(context.multiOnda('Retrabalho'),true);
assert.equal(context.multiOnda('Vários artigos'),false);
context.S.cfg.multi['Vários artigos']=true;assert.equal(context.multiOnda('Vários artigos'),true);
context.S.cfg.multi['Maiores/Pesados']=false;assert.equal(context.multiOnda('Maiores/Pesados'),false);
context.remChange({target:{dataset:{multi:'Vários artigos'},id:'',value:'on',checked:true}});
assert.equal(context.calls[1].body.multiplas_no_lancamento,true);
assert.equal(context.calls[1].url,'/rest/v1/tipos_onda?nome=eq.V%C3%A1rios%20artigos');
context.remChange({target:{dataset:{multi:'Maiores/Pesados'},id:'',value:'on',checked:false}});
assert.equal(context.calls[3].body.multiplas_no_lancamento,false);
console.log('Configuração por tipo: padrões, ativação, desativação e envio ao servidor verificados.');
