// Cliente Supabase simulado en memoria (persistido en localStorage del navegador de prueba)
(function(){
const K='__mockdb';
const S=JSON.parse(localStorage.getItem(K)||'null')||{users:[],session:null,t:{},n:0};
const save=()=>localStorage.setItem(K,JSON.stringify(S));
const uid=()=>'00000000-0000-4000-8000-'+String(++S.n).padStart(12,'0');
const T=n=>S.t[n]||(S.t[n]=[]);
window.__mock={S,calls:[],offline:false,missing:(localStorage.getItem('__missing')||'').split(',').filter(Boolean)};
function cmp(a,b){return a<b?-1:a>b?1:0}
function builder(tabla){
  const q={op:'select',f:[],ord:null,rng:null,payload:null,opts:null,sel:'*'};
  const b={
    select(s){q.sel=s||'*';return b}, insert(p){q.op='insert';q.payload=p;return b},
    upsert(p,o){q.op='upsert';q.payload=p;q.opts=o;return b}, update(p){q.op='update';q.payload=p;return b},
    delete(){q.op='delete';return b}, eq(c,v){q.f.push(r=>r[c]===v);return b},
    in(c,v){q.f.push(r=>v.includes(r[c]));return b}, order(c){q.ord=c;return b},
    range(a,z){q.rng=[a,z];return b}, limit(n){q.rng=[0,n-1];return b},
    then(res,rej){return run().then(res,rej)}
  };
  async function run(){
    if(window.__mock.offline) return {data:null,error:{message:'Failed to fetch'}};
    if(window.__mock.missing.includes(tabla)) return {data:null,error:{code:'PGRST205',message:"Could not find the table 'public."+tabla+"' in the schema cache"}};
    window.__mock.calls.push(q.op+':'+tabla);
    const rows=T(tabla); const m=r=>q.f.every(f=>f(r));
    if(q.op==='select'){
      let out=rows.filter(m).map(r=>({...r}));
      if(tabla==='miembros'&&/academias\(/.test(q.sel)) out.forEach(r=>{const a=T('academias').find(x=>x.id===r.academia_id);r.academias=a?{nombre:a.nombre}:null});
      // visibilidad de padres: solo el jugador vinculado
      const u=S.session&&S.session.user.id; const esTutor=T('tutores').filter(x=>x.user_id===u);
      const esStaff=T('miembros').some(x=>x.user_id===u);
      if(!esStaff&&esTutor.length&&['jugadores','equipos','partidos','entrenos','ejercicios','evaluaciones','partido_stats','evaluacion_resultados','asistencias','academias'].includes(tabla)){
        const js=esTutor.map(x=>x.jugador_id); const J=T('jugadores').filter(j=>js.includes(j.id)); const eqs=J.map(j=>j.equipo_id);
        out=out.filter(r=> tabla==='jugadores'?js.includes(r.id): tabla==='equipos'?eqs.includes(r.id): tabla==='academias'?true:
          ['partidos','entrenos','ejercicios','evaluaciones'].includes(tabla)?eqs.includes(r.equipo_id):
          tabla==='partido_stats'||tabla==='evaluacion_resultados'||tabla==='asistencias'?js.includes(r.jugador_id):true);
      }
      if(q.ord) out.sort((a,b)=>cmp(a[q.ord],b[q.ord]));
      if(q.rng) out=out.slice(q.rng[0],q.rng[1]+1);
      return {data:out,error:null};
    }
    const pl=[].concat(q.payload||[]);
    if(q.op==='insert'){ pl.forEach(p=>rows.push({...p})); save(); return {data:null,error:null}; }
    if(q.op==='upsert'){ pl.forEach(p=>{const i=rows.findIndex(r=>r.id===p.id); if(i>=0) rows[i]={...rows[i],...p}; else rows.push({...p})}); save(); return {data:null,error:null}; }
    if(q.op==='update'){ rows.filter(m).forEach(r=>Object.assign(r,q.payload)); save(); return {data:null,error:null}; }
    if(q.op==='delete'){ S.t[tabla]=rows.filter(r=>!m(r)); save(); return {data:null,error:null}; }
  }
  return b;
}
async function rpc(n,a){
  if(window.__mock.offline) return {data:null,error:{message:'Failed to fetch'}};
  const u=S.session.user.id;
  if(n==='crear_academia'){const cod=T('codigos_alta').find(x=>x.codigo===String(a.p_codigo||'').trim().toUpperCase()&&!x.usado);if(!cod)return{data:null,error:{message:'Código de alta inválido o vencido'}};cod.usado=true;const id=uid();T('academias').push({id,nombre:a.p_nombre});T('miembros').push({academia_id:id,user_id:u,rol:'director',nombre:S.session.user.email});save();return{data:id,error:null}}
  if(n==='crear_invitacion'){const c=Math.random().toString(16).slice(2,14).toUpperCase().padEnd(12,'A');T('invitaciones').push({codigo:c,...a,usado:false});save();return{data:c,error:null}}
  if(n==='canjear_invitacion'){
    const inv=T('invitaciones').find(x=>x.codigo===String(a.p_codigo).trim().toUpperCase()&&!x.usado);
    if(!inv) return {data:null,error:{message:'Código inválido o vencido'}};
    inv.usado=true;
    if(inv.p_tipo==='entrenador'){T('miembros').push({academia_id:inv.p_academia,user_id:u,rol:'entrenador',nombre:S.session.user.email});if(inv.p_equipo)T('equipo_entrenadores').push({equipo_id:inv.p_equipo,user_id:u,academia_id:inv.p_academia})}
    else T('tutores').push({user_id:u,jugador_id:inv.p_jugador,academia_id:inv.p_academia});
    save();return{data:null,error:null}}
  if(n==='anonimizar_jugador'){const j=T('jugadores').find(x=>x.id===a.p_jugador);if(j){j.nombre='Jugador anónimo';j.tel=null;j.estado='baja'}save();return{data:null,error:null}}
  if(n==='exportar_ficha'){const j=T('jugadores').find(x=>x.id===a.p_jugador);return{data:{jugador:j,partidos:[]},error:null}}
  if(n==='actualizar_contacto_tutor'){return{data:null,error:null}}
  return {data:null,error:{message:'rpc desconocida '+n}};
}
const listeners=[];
const auth={
  async getSession(){return{data:{session:S.session}}},
  onAuthStateChange(f){listeners.push(f);return{data:{subscription:{unsubscribe(){}}}}},
  async signUp({email,password}){ if(S.users.some(x=>x.email===email)) return{data:null,error:{message:'User already registered'}};
    const user={id:uid(),email,password};S.users.push(user);S.session={user:{id:user.id,email}};save();return{data:{session:S.session,user:S.session.user},error:null}},
  async signInWithPassword({email,password}){const u=S.users.find(x=>x.email===email&&x.password===password);
    if(!u) return{data:null,error:{message:'Invalid login credentials'}};S.session={user:{id:u.id,email}};save();return{data:{session:S.session},error:null}},
  async signOut(){S.session=null;save();return{error:null}},
  async resetPasswordForEmail(){return{error:null}}, async updateUser(){return{error:null}}
};
window.supabase={createClient(){return{from:builder,rpc,auth}}};
})();
