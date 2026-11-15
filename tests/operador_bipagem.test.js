// Reproduz um leitor que envia cada caractere e Enter sem aguardar a interface.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.indexOf('const nrm=t=>'),html.indexOf('function qtyOk()'))+
 html.slice(html.indexOf('$("#n1").onclick='),html.indexOf('$("#b2").onclick='));
const input={value:'',setAttribute(){},focus(){}},list={innerHTML:''},button={click(){this.onclick()}};
const el={'#opIn':input,'#opSug':list,'#n1':button,'#s1':{classList:{contains:()=>false}}};
const context={ON:true,S:{ops:[{m:'CL024',n:'ANA LUCIA',id:'id-ana'},{m:'CL022',n:'ISABELLA C',id:'id-isabella'}]},
 document:{addEventListener(){}},$:(s)=>el[s],$$:()=>[],setTimeout:()=>0,esc:s=>String(s),av:()=>'',toast:s=>{context.message=s},track:()=>{},
 goStep:n=>{context.step=n},step:0,message:''};
context.opOf=c=>context.S.ops.find(o=>o.m===c);context.curOp=()=>context.findOp(input.value);
vm.createContext(context);vm.runInContext(html.slice(html.indexOf('function findOp('),html.indexOf('function opOf(')),context);vm.runInContext(src,context);
const type=text=>{input.value='';input.oninput();for(const c of text){input.value+=c;input.oninput()}};
const key=k=>input.onkeydown({key:k,preventDefault(){}});
type('CL022');key('Enter');
assert.equal(input.value,'CL022','O Enter do leitor não pode trocar CL022 por uma sugestão anterior');assert.equal(context.step,2);
assert.equal(context.mesmoOperador(context.opOf('CL022')),true,'seleção registra o ID correto');
context.S.ops=context.S.ops.map(o=>o.m==='CL022'?{...o,id:'outra-pessoa',n:'Outra pessoa'}:o);
assert.equal(context.mesmoOperador(context.opOf('CL022')),false,'código reaproveitado deve impedir o salvamento');
context.S.ops=[{m:'CL001',n:'ANA LUCIA',id:'1'},{m:'CL002',n:'ANA MARIA',id:'2'}];context.step=0;context.message='';type('ANA');key('Enter');
assert.equal(context.step,0,'nome ambíguo não escolhe automaticamente a primeira pessoa');assert.match(context.message,/mais de uma pessoa/);
key('ArrowDown');key('Enter');assert.equal(input.value,'CL001');assert.equal(context.step,2,'a opção escolhida pelo teclado é respeitada');
context.S.ops=[{m:'CL001',n:'ANA',id:'1'},{m:'CL002',n:'ANA MARIA',id:'2'}];context.step=0;type('ANA');key('Enter');
assert.equal(input.value,'CL001','um nome completo exato tem prioridade');
context.S.ops=[{m:'CL001',n:'CL022',id:'nome'},{m:'CL022',n:'PESSOA CERTA',id:'codigo'}];assert.equal(context.findOp('CL022').id,'codigo','código exato tem prioridade sobre um nome igual ao código');
context.S.ops=[{m:'CL001',n:'ANA',id:'1'},{m:'CL002',n:'ANA MARIA',id:'2'}];
context.step=0;type('ANA');key('ArrowDown');key('ArrowDown');key('Enter');assert.equal(input.value,'CL002','a opção escolhida com as setas deve prevalecer sobre o nome exato');
const mapSrc=html.slice(html.indexOf('function atualizarIdentidadeOnda('),html.indexOf('/* traz cadastros e, para gestor',html.indexOf('function atualizarIdentidadeOnda(')));
const mapCtx={OPSALL:{antigo:{id:'antigo',codigo:'CL014',nome:'JAIME',excluido_em:'2026-11-13'},novo:{id:'novo',codigo:'CL014',nome:'JACIARA',excluido_em:null}}};
vm.createContext(mapCtx);vm.runInContext(mapSrc,mapCtx);
const antiga=mapCtx.atualizarIdentidadeOnda({oid:'antigo',op:'CL014',opn:'JAIME',srv:1});
assert.equal(antiga.op,'CL014~antigo','uma onda antiga não pode contar para o novo dono do código');assert.equal(antiga.opn,'JAIME');
const atual=mapCtx.atualizarIdentidadeOnda({oid:'novo',op:'CL014',opn:'JACIARA',srv:1});assert.equal(atual.op,'CL014');
const omitida=mapCtx.atualizarIdentidadeOnda({oid:'missing',op:'CL014',opn:'JAIME',srv:1});assert.notEqual(omitida.op,'CL014');
console.log('Bipagem rápida, nomes ambíguos, troca de cadastro e histórico por ID: verificações passaram.');
