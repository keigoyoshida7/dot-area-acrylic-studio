/* Dot Area / Acrylic Ratio Studio — all lengths are stored in mm. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const PHI = Geometry.PHI, GOLD = 1 / PHI ** 2;
  const original = {W:1618,B:1618/PHI,D:1618/PHI,H:1000,w:1618*GOLD,b:1618/PHI*GOLD,d:1618/PHI*GOLD,ox:0,oz:0,t:5,density:1.19,baseLock:true,basePlanLock:true,topLock:true,includeBase:false,includeTop:false,showStone:true,baseElevation:0,filClearance:20,filStaging:true,filPose:'auto',filApplied:false,taper:GOLD,preset:'golden'};
  let state = {...original}, unit='mm', view='3d', faceId='front', yaw=-0.56, pitch=0.40, zoom=1, selectedEdge=null, model, isInvalid=false, displayBaseElevation=0;
  const factors={mm:1,cm:10,m:1000}, labels='ABCDEFGH';
  const STONE={width:500,height:300,depth:300};
  const stoneMesh=(()=>{
    const vertices=[],faces=[],count=12;
    const rings=[{y:0,x:.64,z:.62},{y:96,x:1,z:1},{y:214,x:.76,z:.73}];
    rings.forEach((ring,r)=>{
      for(let i=0;i<count;i++){
        const a=2*Math.PI*i/count;
        const rough=r===1?(i%3===0?1:.93+.025*Math.sin(i*2.1)):(.96+.04*Math.cos(i*1.7));
        vertices.push([Math.cos(a)*STONE.width/2*ring.x*rough,ring.y+(r===2?19*Math.sin(a+.6):r===1?12*Math.sin(a):0),Math.sin(a)*STONE.depth/2*ring.z*rough]);
      }
    });
    for(let r=0;r<rings.length-1;r++)for(let i=0;i<count;i++){
      const a=r*count+i,b=r*count+(i+1)%count,c=(r+1)*count+(i+1)%count,d=(r+1)*count+i;
      faces.push([a,b,c],[a,c,d]);
    }
    const peak=vertices.push([-28,STONE.height,17])-1;
    for(let i=0;i<count;i++)faces.push([2*count+i,2*count+(i+1)%count,peak]);
    faces.push(Array.from({length:count},(_,i)=>i));
    return {vertices,faces};
  })();
  const controlDefinitions=[
    ['W','W','底面の前幅',100,4000,1,'baseControls'],['B','B','底面の後幅',20,4000,1,'baseControls'],['D','D','底面の奥行',100,4000,1,'baseControls'],['H','H','垂直の高さ',50,3000,1,'baseControls'],
    ['w','w','上面の前幅',20,4000,1,'topControls'],['d','d','上面の奥行',20,4000,1,'topControls'],
    ['ox','x','左右のずれ',-1200,1200,1,'advancedControls'],['oz','z','前後のずれ',-1000,1000,1,'advancedControls'],['t','t','アクリル板厚',1,40,0.5,'advancedControls']
  ];
  let toastTimer,filResult=null;
  const fmt=(v,d=1)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
  const length=v=>fmt(v/factors[unit],unit==='m'?4:unit==='cm'?2:1);
  const exact=v=>Number(v.toFixed(6));
  const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
  function constrain(){if(state.baseLock)state.D=state.W/PHI;if(state.basePlanLock)state.B=state.W/PHI;if(state.topLock){state.w=state.W*state.taper;state.d=state.D*state.taper;}state.b=state.w-(state.W-state.B)*state.d/state.D;}
  function saveLocal(){if(isInvalid)return;try{localStorage.setItem('dot-area-acrylic-v2',JSON.stringify({version:2,state,unit}));}catch(_){}}
  function markCustom(){state.preset='custom';state.filApplied=false;}
  function buildControls(){
    controlDefinitions.forEach(([key,symbol,label,min,max,step,parent])=>{
      $(parent).insertAdjacentHTML('beforeend',`<div class="parameter" data-param="${key}"><div class="param-row"><label for="input-${key}"><small>${symbol}</small>${label}</label><div class="param-value"><input id="input-${key}" type="number" step="${step}" aria-label="${label}"><span class="control-unit">mm</span></div></div><input type="range" id="range-${key}" min="${min}" max="${max}" step="${step}" aria-label="${label}を調整"></div>`);
      $('input-'+key).addEventListener('input',event=>{
        const raw=event.target.value;
        if(raw.trim()===''||!Number.isFinite(Number(raw))){showError([label+'を数値で入力してください。']);return;}
        state[key]=Number(raw)*factors[unit];markCustom();constrain();update(key);
      });
      $('input-'+key).addEventListener('blur',()=>update());
      $('range-'+key).addEventListener('input',event=>{state[key]=Number(event.target.value);markCustom();constrain();update();});
    });
  }
  function syncControls(skip){
    controlDefinitions.forEach(([key,,,min,max,step])=>{
      const locked=(key==='D'&&state.baseLock)||(key==='B'&&state.basePlanLock)||((key==='w'||key==='d')&&state.topLock);
      const input=$('input-'+key),range=$('range-'+key);
      if(key!==skip)input.value=Number((state[key]/factors[unit]).toFixed(unit==='m'?6:unit==='cm'?4:3));
      input.step=step/factors[unit];input.disabled=range.disabled=locked;
      input.parentElement.classList.toggle('locked-number',locked);
      range.value=state[key];
      if(key==='w'||key==='B')range.max=state.W;if(key==='d')range.max=state.D;
      if(key==='ox'){const half=z=>state.W/2-(state.W-state.B)*(z+state.D/2)/(2*state.D);const max=Math.max(0,Math.min(half(state.oz-state.d/2)-state.w/2,half(state.oz+state.d/2)-state.b/2));range.min=-max;range.max=max;}
      if(key==='oz'){range.min=-(state.D-state.d)/2;range.max=(state.D-state.d)/2;}
    });
    document.querySelectorAll('.control-unit').forEach(el=>el.textContent=unit);
    if(skip!=='baseElevation')$('baseElevation').value=Number((state.baseElevation/10).toFixed(4));
    $('baseLock').checked=state.baseLock;$('basePlanLock').checked=state.basePlanLock;$('topLock').checked=state.topLock;
    $('includeBase').checked=state.includeBase;$('includeTop').checked=state.includeTop;
    $('openFil').classList.toggle('active',state.filApplied);
    $('openFil').setAttribute('aria-label',state.filApplied?'FILの上限候補を適用済み。搬入試算を開く':'FILの搬入寸法上限を試算する');
    syncStoneControls();
    $('derivedB').textContent=length(state.b)+' '+unit;
    $('taper').value=state.taper;$('taper').disabled=!state.topLock;
    $('taperValue').textContent=fmt(state.topLock?state.taper:state.w/state.W,6);
    $('density').value=state.density;
    document.querySelectorAll('[data-taper]').forEach(el=>{el.disabled=!state.topLock;el.classList.toggle('active',Math.abs(+el.dataset.taper-state.taper)<1e-6&&state.topLock);});
    document.querySelectorAll('[data-preset]').forEach(el=>el.classList.toggle('active',el.dataset.preset===state.preset));
    const descriptions={golden:'底面・上面の前幅／後幅をφに。上面は底面の1/φ²。',low:'底面・上面の黄金比を保ち、高さを前幅の1/φ²に。',source:'資料の幅・奥行・高さを仮設定。台形は今回の設計案。',free:'寸法を個別に指定。側板の平面を保つよう上面の後幅が連動。',slope325:'4本の斜辺と底面を32.5°に。黄金比の台形を保ち、高さと上面の前後位置を調整。',front325:'正面図の左右の斜線を底辺から32.5°に。底面・上面の黄金比と中心位置を保ちます。',fil:'FILの開口・展示室の条件から算出した上限候補。曲がり角・階段は未判定です。',custom:'寸法を調整中。チェックした比率と側板の平面を保ちます。'};
    $('presetDescription').textContent=descriptions[state.preset]||descriptions.custom;
    $('unitLabel').textContent=$('edgeUnit').textContent=unit;
  }
  function showError(errors){isInvalid=true;$('errors').hidden=false;$('errors').textContent=errors.join(' ');$('stageMeta').textContent='入力を確認してください · 図は前の有効な寸法';document.querySelectorAll('#exportSVG,#exportCSV,#saveConfig,#print,#copyHeightReply,#placementCeiling').forEach(el=>el.disabled=true);['elevationLower','elevationUpper','ceilingGap'].forEach(id=>$(id).textContent='—');$('elevationStatus').textContent='入力を確認してください';$('heightReply').value='寸法と設置高さの入力を確認してください。';}
  function update(skip){
    syncControls(skip);const check=Geometry.validate(state);
    if(!check.valid){showError(check.errors);if($('filDialog').open)renderFil();return;}
    try{Geometry.elevations(state,Transport.FIL.room.height);}catch(error){showError([error.message]);if($('filDialog').open)renderFil();return;}
    isInvalid=false;model=Geometry.calculate(state);displayBaseElevation=state.baseElevation;$('errors').hidden=!check.warnings.length;$('errors').textContent=check.warnings.join(' ');
    document.querySelectorAll('#exportSVG,#exportCSV,#saveConfig,#print,#copyHeightReply,#placementCeiling').forEach(el=>el.disabled=false);
    $('stageMeta').textContent=view==='panels'?'TRUE SIZE · 6 FACES':'6 FACES · 12 EDGES';
    draw();readout();ratios();slopeReadout();placementReadout();saveLocal();if($('filDialog').open)renderFil();
  }
  function placementReadout(){
    const e=Geometry.elevations(state,Transport.FIL.room.height),cm=value=>fmt(value/10,1);
    [['elevationLower',e.lower],['elevationUpper',e.upper],['ceilingGap',e.ceilingGap]].forEach(([id,value])=>$(id).innerHTML=cm(value)+'<small>cm</small>');
    $('ceilingGap').classList.toggle('placement-over',!e.fitsCeiling);
    $('elevationStatus').textContent=e.fitsCeiling?'天井高の範囲内（基準面）':'天井の高さを超えています';
    $('heightReply').value=`現在の試算では、下の面（底面）は床から${cm(e.lower)} cm、上の面（上面）は床から${cm(e.upper)} cmです。上下の面の間隔は${cm(e.height)} cmです。設置高さは検討値です。`+(!e.fitsCeiling?' この条件では天井高265 cmを超えるため、調整が必要です。':'');
    const sy=210/Math.max(e.ceilingHeight,e.upper,300),sx=Math.min(sy,300/Math.max(state.W,state.B)),y=value=>248-value*sy;
    const p=[[-state.W/2,e.lower],[state.W/2,e.lower],[state.ox+state.w/2,e.upper],[state.ox-state.w/2,e.upper]].map(v=>[225+v[0]*sx,y(v[1])]);
    let svg='<line x1="25" y1="248" x2="575" y2="248" class="elevation-floor"/><text x="28" y="270" class="elevation-label">床 0 cm</text>';
    svg+=`<line x1="25" y1="${y(e.ceilingHeight)}" x2="575" y2="${y(e.ceilingHeight)}" class="elevation-ceiling"/><text x="28" y="${y(e.ceilingHeight)-12}" class="elevation-label">FIL 天井 265 cm</text>`;
    svg+=`<polygon id="elevationAcrylic" data-lower-mm="${e.lower}" data-upper-mm="${e.upper}" points="${points(p)}" class="elevation-acrylic"/>`;
    if(state.showStone){const rock=[[-160,0],[-250,96],[-180,214],[-28,300],[180,214],[250,96],[160,0]].map(v=>[225+v[0]*sx,y(v[1])]);svg+=`<polygon id="elevationStone" data-floor-mm="0" data-height-mm="300" points="${points(rock)}" class="elevation-stone"/>`;}
    [['上面',e.upper,-10],['底面',e.lower,18]].forEach(([name,value,offset])=>{svg+=`<line x1="${Math.max(...p.map(v=>v[0]))+12}" y1="${y(value)}" x2="560" y2="${y(value)}" class="elevation-level"/><text x="560" y="${y(value)+offset}" text-anchor="end" class="elevation-value">${name} ${cm(value)} cm</text>`;});
    $('elevationDrawing').innerHTML=svg;
    $('elevationDrawing').setAttribute('aria-label',`床から底面${cm(e.lower)}センチ、上面${cm(e.upper)}センチ、天井265センチの立面図`);
  }
  function slopeReadout(){
    const sides=model.edges.filter(edge=>edge.kind==='side');
    $('slopeAngles').innerHTML=sides.map(edge=>`<div class="${Math.abs(edge.inclination-32.5)<1e-8?'at-target':''}"><span>${edge.id}</span><strong>${fmt(edge.inclination,2)}<small>°</small></strong></div>`).join('');
    const front=sides.filter(edge=>edge.id==='AE'||edge.id==='BF');
    $('slopeNote').textContent='正面図の投影角度：'+front.map(edge=>edge.id+' '+fmt(edge.frontInclination,2)+'°').join(' ／ ')+'。表示方向で斜線の見え方が変わります。';
  }
  function filOptions(){return {clearance:state.filClearance,staging:state.filStaging,pose:state.filPose};}
  function renderFil(){
    $('filClearance').value=state.filClearance;$('filStaging').checked=state.filStaging;$('filPose').value=state.filPose;
    $('filError').hidden=true;$('filResult').hidden=false;$('applyFil').disabled=false;
    try{
      if(isInvalid)throw Error('アクリルの寸法入力を確認してから試算してください。');
      filResult=Transport.calculate(state,filOptions());
      const best=filResult.best,shape=best.roomStanding;
      [['W',shape.width],['D',shape.depth],['H',shape.height]].forEach(([axis,value])=>{$('filMax'+axis).innerHTML=fmt(value,1)+'<em>mm</em>';$('filMax'+axis+'m').textContent=fmt(value/1000,4)+' m';});
      $('filScale').textContent='現在の形状 × '+fmt(best.scale,4);
      $('filPoseName').textContent=best.name;
      $('filTransportSize').textContent='搬入時：横 '+fmt(best.transport.width,1)+' × 縦 '+fmt(best.transport.height,1)+' × 進行方向 '+fmt(best.transport.depth,1)+' mm';
      $('filBinding').textContent=best.binding.map(limit=>limit.label).join('・');
      $('filOpeningRows').innerHTML=Transport.FIL.openings.map(opening=>`<tr class="${best.binding.some(limit=>limit.id.startsWith(opening.id+'-'))?'fil-binding':''}"><th>${esc(opening.name)}</th><td>${fmt(opening.width/1000,2)} × ${fmt(opening.height/1000,2)}</td><td>${fmt(opening.width-best.transport.width,1)} / ${fmt(opening.height-best.transport.height,1)} mm</td></tr>`).join('');
      $('filPoseRows').innerHTML='<div class="fil-pose-row fil-row-head"><span>搬入姿勢</span><span>幅 × 奥行 × 高さ（設置時・mm）</span></div>'+filResult.orientations.map(pose=>`<div class="fil-pose-row ${pose.id===best.id?'selected':''}"><span>${esc(pose.name)}</span><span>${fmt(pose.roomStanding.width,1)} × ${fmt(pose.roomStanding.depth,1)} × ${fmt(pose.roomStanding.height,1)}</span></div>`).join('');
    }catch(error){
      filResult=null;$('filResult').hidden=true;$('applyFil').disabled=true;$('filError').hidden=false;$('filError').textContent=error.message;
      $('filOpeningRows').innerHTML=Transport.FIL.openings.map(opening=>`<tr><th>${esc(opening.name)}</th><td>${fmt(opening.width/1000,2)} × ${fmt(opening.height/1000,2)}</td><td>—</td></tr>`).join('');
    }
  }
  function openFil(){renderFil();$('filDialog').showModal();}
  function filSettingsChanged(){if(state.filApplied)state.preset='custom';state.filApplied=false;syncControls();renderFil();saveLocal();}
  function applyFil(){
    renderFil();if(!filResult||isInvalid)return;
    state={...filResult.scaledState,preset:'fil',filApplied:true};constrain();selectedEdge=null;
    $('filDialog').close();update();toast('FILの条件内の上限候補を適用しました。旋回・階段は別途確認してください。');
  }
  function ratios(){
    const r=state.W/state.D,rp=state.W/state.B,rt=state.w/state.b,rw=state.w/state.W,rd=state.d/state.D;
    $('ratioBase').textContent=fmt(r,6);$('ratioPlan').textContent=fmt(rp,6);$('ratioTopPlan').textContent=fmt(rt,6);
    const note=r=>Math.abs(r/PHI-1)<1e-8?'φに一致':'φとの差 '+((r/PHI-1)*100>=0?'+':'')+fmt((r/PHI-1)*100,3)+'%';
    $('ratioBaseNote').textContent=note(r);$('ratioPlanNote').textContent=note(rp);$('ratioTopPlanNote').textContent=note(rt);
    $('ratioTop').textContent=Math.abs(rw-rd)<1e-8?fmt(rw,6):fmt(rw,3)+' / '+fmt(rd,3);
    $('ratioTopNote').textContent=Math.abs(rw-rd)>1e-8?'幅／奥行を別々に指定':Math.abs(rw-GOLD)<1e-8?'1/φ²に一致':Math.abs(rw-1/PHI)<1e-8?'1/φに一致':'上面と底面は相似';
  }
  const line=(a,b,cls='drawing-edge',extra='')=>`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="${cls}" ${extra}/>`;
  const text=(p,value,cls='drawing-dim',extra='')=>`<text x="${p[0]}" y="${p[1]}" text-anchor="middle" class="${cls}" ${extra}>${esc(value)}</text>`;
  const points=a=>a.map(p=>p[0]+','+p[1]).join(' ');
  function syncStoneControls(){
    $('showStone').checked=state.showStone;
    $('stoneStatus').textContent=state.showStone?'ON':'OFF';
    $('stoneSize').textContent='高さ '+length(STONE.height)+' × 幅 '+length(STONE.width)+' × 奥行 '+length(STONE.depth)+' '+unit;
    let outside=false;
    if(model&&state.showStone)outside=model.allFaces.filter(face=>displayBaseElevation===0||face.id!=='base').some(face=>{
      const origin=model.vertices[face.indices[0]];
      return stoneMesh.vertices.some(p=>face.normal.reduce((sum,n,i)=>sum+n*(p[i]-(i===1?displayBaseElevation:0)-origin[i]),0)>1e-6);
    });
    const plateOverlap=displayBaseElevation>0&&displayBaseElevation<STONE.height&&state.includeBase;
    $('stoneNote').textContent=plateOverlap?'底板と床置きの石が重なる可能性があります。':outside?displayBaseElevation>0?'床置きの石が側面・上面の範囲を超えています。':'石がアクリルの範囲を超えています。':displayBaseElevation>0?'石は展示室の床に固定。アクリルだけ設置高さを変更します。':'底面の中央に床置きした概形。石の寸法は固定です。';
    $('stoneNote').classList.toggle('stone-outside',plateOverlap||outside);
  }
  function drawStone(project){
    const projected=stoneMesh.vertices.map(project);
    const items=stoneMesh.faces.map(indices=>{
      const [a,b,c]=indices.slice(0,3).map(i=>stoneMesh.vertices[i]);
      const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
      let normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const centroid=indices.reduce((sum,i)=>sum.map((n,k)=>n+stoneMesh.vertices[i][k]/indices.length),[0,0,0]);
      if(normal.reduce((sum,n,i)=>sum+n*(centroid[i]-(i===1?130:0)),0)<0)normal=normal.map(n=>-n);
      const norm=Math.hypot(...normal)||1,light=[-.36,.85,-.38];
      const shade=Math.round(119+Math.max(0,normal.reduce((sum,n,i)=>sum+n/norm*light[i],0))*72);
      return {indices,depth:indices.reduce((sum,i)=>sum+projected[i][2]/indices.length,0),shade};
    }).sort((a,b)=>b.depth-a.depth);
    return `<g id="stoneObject" data-width-mm="500" data-height-mm="300" data-depth-mm="300" data-world-vertices="${esc(JSON.stringify(stoneMesh.vertices))}" aria-label="中央の石、高さ300 幅500 奥行300ミリメートル" pointer-events="none"><title>石の概形 — 高さ300 × 幅500 × 奥行300 mm</title>`+items.map(({indices,shade})=>`<polygon points="${points(indices.map(i=>projected[i]))}" fill="rgb(${shade},${shade-3},${shade-9})" stroke="#9f9c92" stroke-opacity=".16" stroke-width=".5" vector-effect="non-scaling-stroke"/>`).join('')+'</g>';
  }
  function dimension(a,b,value,offset=27,center=[450,335]){
    let dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy);if(n<1)return '';
    let nx=-dy/n,ny=dx/n;const m=[(a[0]+b[0])/2,(a[1]+b[1])/2];if((m[0]-center[0])*nx+(m[1]-center[1])*ny<0){nx=-nx;ny=-ny;}
    const u=[a[0]+nx*offset,a[1]+ny*offset],v=[b[0]+nx*offset,b[1]+ny*offset],mid=[(u[0]+v[0])/2+nx*12,(u[1]+v[1])/2+ny*12+4];
    return line(a,[u[0]+nx*5,u[1]+ny*5],'drawing-dimension-line')+line(b,[v[0]+nx*5,v[1]+ny*5],'drawing-dimension-line')+line(u,v,'drawing-dimension-line')+line([u[0]-nx*4-dx/n*3,u[1]-ny*4-dy/n*3],[u[0]+nx*4+dx/n*3,u[1]+ny*4+dy/n*3],'drawing-dimension-line')+line([v[0]-nx*4-dx/n*3,v[1]-ny*4-dy/n*3],[v[0]+nx*4+dx/n*3,v[1]+ny*4+dy/n*3],'drawing-dimension-line')+text(mid,value);
  }
  function draw(){
    if(!model)return;
    const geometryState=model.state;
    syncStoneControls();
    const mobile=window.innerWidth<=760;
    $('stage').classList.toggle('panel-view',view==='panels');
    $('drawing').setAttribute('viewBox',mobile?(view==='panels'?'0 65 900 1000':'80 35 740 610'):'0 0 900 690');
    const name={ '3d':'斜視図',front:'正面図',side:'右側面図',top:'平面図',panels:'6面の展開図'};
    if(isInvalid)$('stageMeta').textContent='入力を確認してください · 図は前の有効な寸法';
    $('viewName').textContent=name[view];$('viewHint').textContent=view==='3d'?'ドラッグして回転':view==='panels'?'6面の実形状 · 開口面も参考表示':'垂直投影 · 同じ寸法を別の方向から';$('zoomValue').textContent=Math.round(zoom*100)+'%';
    const showDims=$('showDims').checked,showVertices=$('showVertices').checked,showGuides=$('showGuides').checked,showAll=$('showAllEdges').checked;
    let svg='<defs><pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="#1b1b18" stroke-width=".6"/></pattern></defs>';
    if(showGuides)svg+='<rect x="45" y="68" width="810" height="540" fill="url(#grid)" opacity=".75"/>';
    if(view==='panels'){
      svg+=drawPanels(showDims,showVertices);$('drawing').innerHTML=svg;return;
    }
    const raw=p=>{
      if(view==='front')return [p[0],-p[1],p[2]];
      if(view==='side')return [-p[2],-p[1],p[0]];
      if(view==='top')return [p[0],p[2],-p[1]];
      const x=p[0]*Math.cos(yaw)+p[2]*Math.sin(yaw),depth=-p[0]*Math.sin(yaw)+p[2]*Math.cos(yaw);
      return [x,-p[1]*Math.cos(pitch)-depth*Math.sin(pitch),depth*Math.cos(pitch)-p[1]*Math.sin(pitch)];
    };
    const world=p=>[p[0],p[1]+displayBaseElevation,p[2]];
    const rawVertices=model.vertices.map(p=>raw(world(p)));
    const scene=rawVertices.concat(displayBaseElevation>0?[raw([0,0,0])]:[],displayBaseElevation>0&&state.showStone?stoneMesh.vertices.map(raw):[]),xs=scene.map(p=>p[0]),ys=scene.map(p=>p[1]);
    const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
    const scale=Math.min(640/(maxx-minx||1),410/(maxy-miny||1))*zoom;
    const cx=(minx+maxx)/2,cy=(miny+maxy)/2;
    const projectWorld=p=>{const r=raw(p);return [450+(r[0]-cx)*scale,333+(r[1]-cy)*scale,r[2]];};
    const project=p=>projectWorld(world(p));
    const p=model.vertices.map(project),center=[450,333];
    const direction=view==='front'?[0,0,1]:view==='side'?[-1,0,0]:view==='top'?[0,-1,0]:[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
    const visible=f=>f.normal.reduce((sum,v,i)=>sum+v*direction[i],0)<-1e-8;
    if(showGuides){
      svg+=line(project([0,0,0]),project([geometryState.ox,geometryState.H,geometryState.oz]),'drawing-guide','stroke-dasharray="4 6"');
      if(view==='top'){svg+=line(project([-geometryState.W*.6,0,0]),project([geometryState.W*.6,0,0]),'drawing-guide')+line(project([0,0,-geometryState.D*.6]),project([0,0,geometryState.D*.6]),'drawing-guide');}
      else if(view==='3d')svg+=line(project([-geometryState.W*.65,0,0]),project([geometryState.W*.65,0,0]),'drawing-guide')+line(project([0,0,-geometryState.D*.65]),project([0,0,geometryState.D*.65]),'drawing-guide');
      if(displayBaseElevation>0&&view!=='top'){const floorA=projectWorld([-geometryState.W*.65,0,0]),floorB=projectWorld([geometryState.W*.65,0,0]);svg+=line(floorA,floorB,'drawing-guide')+text([floorB[0],floorB[1]+20],'床 0 cm','drawing-small');}
    }
    model.allFaces.slice().sort((a,b)=>b.indices.reduce((n,i)=>n+p[i][2],0)-a.indices.reduce((n,i)=>n+p[i][2],0)).forEach(f=>{
      const fill=f.id===faceId&&visible(f)?'#ded8c4':'#d9d5c8';
      svg+=`<polygon data-select-face="${f.id}" points="${points(f.indices.map(i=>p[i]))}" fill="${fill}" fill-opacity="${f.id===faceId&&visible(f)?'.065':'.018'}" stroke="none" style="cursor:pointer"/>`;
    });
    if(state.showStone)svg+=drawStone(projectWorld);
    model.edges.forEach(e=>{
      const adjacent=model.allFaces.filter(f=>f.indices.includes(e.a)&&f.indices.includes(e.b));
      const hidden=!adjacent.some(visible);
      if(selectedEdge===e.id)svg+=line(p[e.a],p[e.b],'drawing-edge','style="stroke:#fff;stroke-width:3"');
      else svg+=line(p[e.a],p[e.b],hidden?'drawing-edge edge-hidden':'drawing-edge');
      svg+=line(p[e.a],p[e.b],'',`stroke="transparent" stroke-width="14" data-select-edge="${e.id}" style="cursor:pointer"><title>${e.id} · ${length(e.length)} ${unit}</title>`).replace('/>','</line>');
      if(showDims&&showAll){const mid=[(p[e.a][0]+p[e.b][0])/2,(p[e.a][1]+p[e.b][1])/2-10];svg+=text(mid,e.id+' '+length(e.length),'drawing-small');}
    });
    if(showVertices)model.vertices.forEach((_,i)=>{svg+=`<circle cx="${p[i][0]}" cy="${p[i][1]}" r="2.5" fill="#ddd"/>`+text([p[i][0]+(p[i][0]>450?13:-13),p[i][1]+(p[i][1]>333?18:-11)],labels[i],'drawing-vertex');});
    if(showDims&&!showAll){
      if(view==='3d'){svg+=dimension(p[0],p[1],'W '+length(geometryState.W),33,center)+dimension(p[1],p[2],'BC '+length(model.edges[1].length),30,center)+dimension(p[2],p[3],'B '+length(geometryState.B),25,center)+dimension(p[4],p[5],'w '+length(geometryState.w),25,center)+dimension(p[6],p[7],'b '+length(geometryState.b),24,center);const v0=project([-geometryState.W/2-150,0,-geometryState.D/2]),v1=project([-geometryState.W/2-150,geometryState.H,-geometryState.D/2]);svg+=dimension(v0,v1,'H '+length(geometryState.H),21,center);}
      if(view==='front'){svg+=dimension(p[0],p[1],length(geometryState.W),32,center)+dimension(p[4],p[5],length(geometryState.w),26,center);svg+=dimension(project([geometryState.W/2+120,0,-geometryState.D/2]),project([geometryState.W/2+120,geometryState.H,-geometryState.D/2]),'H '+length(geometryState.H),20,center);}
      if(view==='side'){svg+=dimension(p[1],p[2],length(geometryState.D),32,center)+dimension(p[5],p[6],length(geometryState.d),26,center);svg+=dimension(project([geometryState.W/2,0,-geometryState.D/2-120]),project([geometryState.W/2,geometryState.H,-geometryState.D/2-120]),'H '+length(geometryState.H),20,center);}
      if(view==='top'){svg+=dimension(p[0],p[1],'W '+length(geometryState.W),32,center)+dimension(p[2],p[3],'B '+length(geometryState.B),32,center)+dimension(p[4],p[5],'w '+length(geometryState.w),-24,center)+dimension(p[6],p[7],'b '+length(geometryState.b),-24,center);svg+=dimension(project([geometryState.W/2+80,0,-geometryState.D/2]),project([geometryState.W/2+80,0,geometryState.D/2]),'D '+length(geometryState.D),20,center);}
    }
    svg+=text([450,628],view==='top'?'底面・上面ともに台形 ／ Dは垂直の奥行':view==='3d'?'台形を底面・上面に持つ立体':'H は垂直高さ。側板の実寸高さは「斜高」。','drawing-small');
    $('drawing').innerHTML=svg;$('drawing').dataset.baseElevationMm=displayBaseElevation;
  }
  function drawPanels(dims,vertices){
    const mobile=window.innerWidth<=760,cols=mobile?2:3;
    let svg='';const maxWidth=Math.max(...model.allFaces.map(f=>f.bottom)),maxHeight=Math.max(...model.allFaces.map(f=>f.slantHeight));
    const s=Math.min((mobile?295:230)/maxWidth,165/maxHeight)*zoom;
    model.allFaces.forEach((f,i)=>{
      const col=i%cols,row=Math.floor(i/cols),cx=(mobile?250:163)+col*(mobile?400:287),cy=(mobile?235:245)+row*(mobile?315:260);
      const p=f.points2d.map(q=>[cx+(q[0]-f.bottom/2)*s,cy+(f.slantHeight/2-q[1])*s]);
      svg+=`<polygon data-select-face="${f.id}" points="${points(p)}" fill="#ded8c4" fill-opacity="${f.id===faceId?'.07':'.015'}" class="drawing-edge" style="cursor:pointer"/>`;
      const ref=f.id==='base'&&!state.includeBase||f.id==='top'&&!state.includeTop;
      svg+=text([cx,cy-(mobile?155:130)],f.name+(ref?'（参考）':''),'panel-label');
      if(dims){svg+=dimension(p[0],p[1],length(f.bottom),13,[cx,cy])+dimension(p[3],p[2],length(f.top),12,[cx,cy]);svg+=text([cx,cy+4],(f.id==='base'||f.id==='top'?'奥行 ':'斜高 ')+length(f.slantHeight),'drawing-small');}
      if(vertices)f.indices.forEach((v,j)=>svg+=text([p[j][0]+(j===0||j===3?-11:11),p[j][1]+(j<2?15:-10)],labels[v],'drawing-vertex'));
    });return svg;
  }
  function readout(){
    const f=model.allFaces.find(f=>f.id===faceId),isPlan=f.id==='base'||f.id==='top';$('faceTitle').textContent=f.name+'の台形';
    const count=model.faces.filter(other=>other.edgeLengths.every((v,i)=>Math.abs(v-f.edgeLengths[i])<1e-7)&&other.angles.every((v,i)=>Math.abs(v-f.angles[i])<1e-7)).length;
    $('faceCount').textContent=isPlan?(f.id==='base'?state.includeBase:state.includeTop)?'板に含む':'参考輪郭':'同形 '+count+'枚';
    document.querySelectorAll('[data-face]').forEach(el=>el.classList.toggle('active',el.dataset.face===faceId));
    const s=Math.min(200/f.bottom,98/f.slantHeight),p=f.points2d.map(q=>[130+(q[0]-f.bottom/2)*s,99+(f.slantHeight/2-q[1])*s]);
    $('faceDrawing').innerHTML=`<polygon points="${points(p)}" fill="#ded8c4" fill-opacity=".035" stroke="#b9b5a8" stroke-width=".9"/>`+f.indices.map((v,i)=>text([p[i][0]+(i===0||i===3?-10:10),p[i][1]+(i<2?12:-8)],labels[v],'drawing-vertex')).join('')+line([130,p[0][1]],[130,p[2][1]],'drawing-guide','stroke-dasharray="3 4"');
    const ms=[[isPlan?'前幅（下底）':'下底',f.bottom],[isPlan?'後幅（上底）':'上底',f.top],['左斜辺',f.edgeLengths[3]],['右斜辺',f.edgeLengths[1]],[isPlan?'奥行（台形の高さ）':'斜高（板の高さ）',f.slantHeight],['対角線 '+labels[f.indices[0]]+labels[f.indices[2]],f.diagonals[0]],['対角線 '+labels[f.indices[1]]+labels[f.indices[3]],f.diagonals[1]]];
    $('faceMeasures').innerHTML=ms.map(([name,value])=>`<div><dt>${name}</dt><dd>${length(value)}<small>${unit}</small></dd></div>`).join('')+`<div><dt>面積</dt><dd>${fmt(f.area/1e6,4)}<small>m²</small></dd></div>`+(isPlan?'':`<div><dt>鉛直からの傾き</dt><dd>${fmt(f.lean,2)}<small>°</small></dd></div>`);
    $('faceAngles').innerHTML=f.angles.map((a,i)=>`<div><span>${labels[f.indices[i]]}</span>${fmt(a,2)}°</div>`).join('');
    $('edgeTable').innerHTML=['bottom','top','side'].map((kind,i)=>`<div class="edge-group">${['底面の4辺','上面の4辺','側面の4辺'][i]}</div>`+model.edges.filter(e=>e.kind===kind).map(e=>`<div class="edge-row ${e.id===selectedEdge?'highlight':''}" data-edge="${e.id}" role="button" tabindex="0" aria-label="辺 ${e.id} ${length(e.length)} ${unit}"><span>${e.id}</span><span>${length(e.length)}</span></div>`).join('')).join('');
    $('jointTable').innerHTML='<div class="joint-row" style="color:#888;font-size:9px"><span>辺</span><span>二面角</span><span>留め角</span></div>'+model.allJoints.map(j=>`<div class="joint-row"><span>${j.id}</span><span>${fmt(j.angle,2)}</span><span>${fmt(j.bevel,2)}</span></div>`).join('');
    $('area').innerHTML=fmt(model.panelArea/1e6,3)+'<small>m²</small>';$('volume').innerHTML=fmt(model.volume/1e9,3)+'<small>m³</small>';$('mass').innerHTML=fmt(model.mass,2)+'<small>kg</small>';
    const countPlates=4+Number(state.includeBase)+Number(state.includeTop);$('areaLabel').textContent=countPlates+'枚の板の面積';$('massLabel').textContent=countPlates+'枚の板の概算重量';
  }
  function preset(type){
    state={...original,preset:type,showStone:state.showStone,baseElevation:state.baseElevation,filClearance:state.filClearance,filStaging:state.filStaging,filPose:state.filPose};
    if(type==='low')state.H=state.W*GOLD;
    if(type==='source'){state.baseLock=false;state.D=1000;}
    if(type==='free'){state.baseLock=false;state.basePlanLock=false;state.topLock=false;state.ox=100;state.oz=-60;}
    if(type==='slope325'||type==='front325')state=Geometry.slopePreset(state,type==='slope325'?'spatial':'front');
    constrain();selectedEdge=null;update();
  }
  function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportSVG(){
    if(isInvalid)return;
    const panels=model.allFaces.filter(f=>!['base','top'].includes(f.id)||f.id==='base'&&state.includeBase||f.id==='top'&&state.includeTop);
    const margin=70,gap=120,cols=2,wmax=Math.max(...panels.map(f=>Math.max(...f.points2d.map(p=>p[0]))-Math.min(...f.points2d.map(p=>p[0])))),hmax=Math.max(...panels.map(f=>f.slantHeight)),rows=Math.ceil(panels.length/cols);
    const width=2*wmax+3*margin,height=rows*hmax+(rows+1)*margin+rows*gap;
    let content=`<svg xmlns="http://www.w3.org/2000/svg" width="${exact(width)}mm" height="${exact(height)}mm" viewBox="0 0 ${exact(width)} ${exact(height)}"><title>Dot Area — ${panels.length} acrylic panel reference outlines, mm</title><desc>Exact reference-surface trapezoids. No thickness, joint or kerf allowance. Bottom front ${state.W}, rear ${state.B}, depth ${state.D} mm, height ${state.H} mm. Acrylic thickness assumption ${state.t} mm.</desc><g id="CUT_REFERENCE" fill="none" stroke="black" stroke-width="0.2">`;
    panels.forEach((f,i)=>{const minx=Math.min(...f.points2d.map(p=>p[0]));const x=margin+(i%cols)*(wmax+margin)-minx,y=margin+gap+Math.floor(i/cols)*(hmax+margin+gap);const p=f.points2d.map(q=>[exact(x+q[0]),exact(y+f.slantHeight-q[1])]);content+=`<polygon id="${f.id}" points="${points(p)}"/>`;});
    content+='</g><g id="ANNOTATIONS" fill="black" font-family="serif" font-size="14">';
    panels.forEach((f,i)=>{const x=margin+(i%cols)*(wmax+margin),y=margin+gap+Math.floor(i/cols)*(hmax+margin+gap);content+=`<text x="${x}" y="${y-25}">${f.name} ${f.indices.map(n=>labels[n]).join('')} | parallel bases ${exact(f.bottom)}, ${exact(f.top)}, perpendicular height ${exact(f.slantHeight)} mm</text>`;});
    content+='</g></svg>';download('Dot_Area_Acrylic_Panels_mm.svg',content,'image/svg+xml');toast('実寸SVGを書き出しました。板厚・接合・切りしろの補正は含みません。');
  }
  function exportCSV(){
    if(isInvalid)return;const rows=[['区分','対象','項目','数値','単位','備考']];
    const add=(section,target,item,value,units,note='')=>rows.push([section,target,item,typeof value==='number'?exact(value):value,units,note]);
    controlDefinitions.forEach(([k,,name])=>add('入力',k,name,state[k],'mm'));
    const placement=Geometry.elevations(state,Transport.FIL.room.height);
    [['底面',placement.lower],['上面',placement.upper]].forEach(([target,value])=>add('設置高さ',target,'床からの高さ',value/10,'cm','設置高さは検討値。板の基準面・板厚未補正'));
    add('設置高さ','天井','上面からの余裕',placement.ceilingGap/10,'cm','FIL天井高265 cm');
    add('連動寸法','b','上面の後幅',state.b,'mm','側板の平面を保つ連動値');
    add('入力','density','密度の仮定',state.density,'g/cm³','仮定値');
    add('比率','底面','前幅/後幅',state.W/state.B,'');add('比率','上面','前幅/後幅',state.w/state.b,'');add('比率','底面','前幅/奥行',state.W/state.D,'');add('比率','高さ','前幅/垂直高さ',state.W/state.H,'');add('比率','上面','上面前幅/底面前幅',state.w/state.W,'');add('比率','上面','上面奥行/底面奥行',state.d/state.D,'');
    model.edges.forEach(e=>add('全12辺',e.id,'長さ',e.length,'mm'));
    model.edges.filter(e=>e.kind==='side').forEach(e=>{add('斜辺の角度',e.id,'底面との角度',e.inclination,'°','立体の辺と水平面の角度');add('斜辺の角度',e.id,'正面投影の角度',e.frontInclination,'°','正面図での水平線との角度');});
    model.allFaces.forEach(f=>{const plan=['base','top'].includes(f.id),section=plan?'台形の平面':'側板';add(section,f.name,'下底',f.bottom,'mm');add(section,f.name,'上底',f.top,'mm');add(section,f.name,'左斜辺',f.edgeLengths[3],'mm');add(section,f.name,'右斜辺',f.edgeLengths[1],'mm');add(section,f.name,plan?'垂直奥行':'斜高',f.slantHeight,'mm');add(section,f.name,'上底左端のオフセット',f.topOffset,'mm');f.angles.forEach((a,i)=>add(section,f.name,labels[f.indices[i]]+'内角',a,'°'));f.diagonals.forEach((d,i)=>add(section,f.name,'対角線'+(i+1),d,'mm'));add(section,f.name,'面積',f.area/1e6,'m²');if(!plan){add(section,f.name,'鉛直からの傾き',f.lean,'°');add(section,f.name,'底面との内角',f.bottomDihedral,'°');}else add(section,f.name,'板として含める',f.id==='base'?String(state.includeBase):String(state.includeTop),'');});
    model.allJoints.forEach(j=>{add('接合',j.id,'二面角',j.angle,'°');add('接合',j.id,'均等留め角',j.bevel,'°','直角切断からの傾き。板厚補正なし。開口面の角度は板追加時の参考');});
    add('対角線','底面','対角線',model.bottomDiagonal,'mm');add('対角線','上面','対角線',model.topDiagonal,'mm');model.spaceDiagonals.forEach(d=>add('対角線',d.id,'空間対角線',d.length,'mm'));
    add('合計','4側板','面積',model.area/1e6,'m²');add('合計','選択した板','面積',model.panelArea/1e6,'m²');add('合計','囲まれる空間','体積',model.volume/1e9,'m³');add('合計','選択した板','概算材積',model.materialVolume/1e6,'L','面積×板厚。接合部を除く');add('合計','選択した板','概算重量',model.mass,'kg','面積×板厚×仮定密度');
    add('前提','元資料','寸法の解釈','幅1.618 / 奥行1 / 高さらしき1をmと仮定','','底面・上面の台形化は今回の設計案。板厚・接合補正を除く');
    if(state.filApplied){
      const fil=Transport.calculate(state,filOptions());
      add('FIL搬入試算','前提','経路全体','未判定','','旋回・階段・姿勢の持ち替えは未計算');add('FIL搬入試算','余白','片側余白',state.filClearance,'mm');add('FIL搬入試算','搬入姿勢','選択',fil.best.name,'');add('FIL搬入試算','ドア後の直進仮定','使用',String(state.filStaging),'');
      Transport.FIL.openings.forEach(opening=>{add('FIL実測メモ',opening.name,'幅',opening.width,'mm');add('FIL実測メモ',opening.name,'高さ',opening.height,'mm');});
      add('FIL実測メモ','直角の曲がり角','角から角',1500,'mm','旋回未判定。通過幅・半径としては扱わない');add('FIL実測メモ','対面の壁','ドアからの距離',1360,'mm');
      Object.entries(Transport.FIL.room).forEach(([key,value])=>add('FIL実測メモ','展示室',key,value,'mm'));
    }
    const csv='\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');download('Dot_Area_Acrylic_Dimensions.csv',csv,'text/csv;charset=utf-8');toast('全12辺・6面の台形寸法・角度をCSVに保存しました。');
  }
  function importState(data){
    if(![1,2].includes(data.version)||!data.state)throw Error('対応する設定ファイルではありません。');
    const next={...original};controlDefinitions.forEach(([key])=>{if(key==='B'&&data.version===1){next.B=data.state.W;return;}if(typeof data.state[key]!=='number'||!Number.isFinite(data.state[key]))throw Error('寸法の数値を確認してください。');next[key]=data.state[key];});
    if(typeof data.state.density!=='number'||!Number.isFinite(data.state.density))throw Error('密度を確認してください。');
    next.density=data.state.density;next.baseLock=data.state.baseLock===true;next.basePlanLock=data.version===2&&data.state.basePlanLock===true;next.topLock=data.state.topLock===true;next.includeBase=data.state.includeBase===true;next.includeTop=data.state.includeTop===true;next.taper=typeof data.state.taper==='number'?data.state.taper:GOLD;
    next.showStone=data.state.showStone!==false;
    next.baseElevation=data.state.baseElevation===undefined?0:data.state.baseElevation;
    Geometry.elevations(next,Transport.FIL.room.height);
    next.filClearance=data.state.filClearance===undefined?20:data.state.filClearance;next.filStaging=data.state.filStaging===undefined?true:data.state.filStaging;next.filPose=data.state.filPose===undefined?'auto':data.state.filPose;next.filApplied=data.state.filApplied===true;
    if(!Number.isFinite(next.taper)||next.taper<=0||next.taper>1)throw Error('上面の比率を確認してください。');
    if(next.baseLock)next.D=next.W/PHI;if(next.basePlanLock)next.B=next.W/PHI;if(next.topLock){next.w=next.W*next.taper;next.d=next.D*next.taper;}next.b=next.w-(next.W-next.B)*next.d/next.D;
    const check=Geometry.validate(next);if(!check.valid)throw Error(check.errors.join(' '));
    Transport.calculate({...next,baseElevation:0},{clearance:next.filClearance,staging:next.filStaging,pose:next.filPose});
    next.preset=['golden','source','low','free','slope325','front325','custom','fil'].includes(data.state.preset)?data.state.preset:'custom';state=next;unit=factors[data.unit]?data.unit:'mm';$('unit').value=unit;
  }
  buildControls();
  Transport.POSES.forEach(pose=>$('filPose').insertAdjacentHTML('beforeend',`<option value="${pose.id}">${esc(pose.name)}</option>`));
  try{const saved=localStorage.getItem('dot-area-acrylic-v2');if(saved)importState(JSON.parse(saved));}catch(_){}
  document.querySelectorAll('[data-preset]').forEach(el=>el.addEventListener('click',()=>preset(el.dataset.preset)));
  document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>{view=el.dataset.view;zoom=1;document.querySelectorAll('[data-view]').forEach(t=>{t.classList.toggle('active',t===el);t.setAttribute('aria-selected',String(t===el));});$('stageMeta').textContent=view==='panels'?'TRUE SIZE · 6 FACES':'6 FACES · 12 EDGES';draw();}));
  document.querySelectorAll('[data-face]').forEach(el=>el.addEventListener('click',()=>{faceId=el.dataset.face;draw();readout();}));
  document.querySelectorAll('[data-taper]').forEach(el=>el.addEventListener('click',()=>{state.taper=+el.dataset.taper;markCustom();constrain();update();}));
  $('taper').addEventListener('input',event=>{state.taper=Number(event.target.value);markCustom();constrain();update();});
  $('baseLock').addEventListener('change',event=>{state.baseLock=event.target.checked;markCustom();constrain();update();});
  $('basePlanLock').addEventListener('change',event=>{state.basePlanLock=event.target.checked;markCustom();constrain();update();});
  ['includeBase','includeTop'].forEach(id=>$(id).addEventListener('change',event=>{state[id]=event.target.checked;update();}));
  $('topLock').addEventListener('change',event=>{state.topLock=event.target.checked;if(state.topLock)state.taper=state.w/state.W;markCustom();constrain();update();});
  $('density').addEventListener('input',event=>{if(event.target.value===''){showError(['密度を入力してください。']);return;}state.density=Number(event.target.value);markCustom();update();});
  $('unit').addEventListener('change',event=>{unit=event.target.value;update();});
  ['showDims','showVertices','showGuides','showAllEdges'].forEach(id=>$(id).addEventListener('change',draw));
  $('showStone').addEventListener('change',event=>{state.showStone=event.target.checked;draw();if(!isInvalid)placementReadout();saveLocal();});
  function setPlacement(value){state.baseElevation=value;if(state.filApplied){state.filApplied=false;state.preset='custom';}update('baseElevation');}
  $('baseElevation').addEventListener('input',event=>{const raw=event.target.value.trim();if(raw===''||!Number.isFinite(Number(raw)*10)||Number(raw)<0){showError(['底面の設置高さを0以上の数値で入力してください。']);return;}setPlacement(Number(raw)*10);});
  $('baseElevation').addEventListener('blur',()=>update());
  $('placementFloor').addEventListener('click',()=>{setPlacement(0);$('baseElevation').value=0;});
  $('placementCeiling').addEventListener('click',()=>{if(isInvalid)return;const base=Transport.FIL.room.height-state.H;if(base<0){toast('立体の高さが天井高265 cmを超えています。高さを小さくしてください。');return;}setPlacement(base);$('baseElevation').value=Number((base/10).toFixed(4));});
  $('copyHeightReply').addEventListener('click',async()=>{if(isInvalid)return;try{await navigator.clipboard.writeText($('heightReply').value);toast('床からの高さを伝える文章をコピーしました。');}catch(_){$('heightReply').focus();$('heightReply').select();toast('文章を選択しました。コピーしてお使いください。');}});
  $('openFil').addEventListener('click',openFil);$('closeFil').addEventListener('click',()=>$('filDialog').close());$('applyFil').addEventListener('click',applyFil);
  $('filDialog').addEventListener('click',event=>{if(event.target===$('filDialog'))$('filDialog').close();});
  $('filClearance').addEventListener('input',event=>{
    const value=event.target.value.trim();
    if(value===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>500){filResult=null;$('filResult').hidden=true;$('applyFil').disabled=true;$('filError').hidden=false;$('filError').textContent='片側の余白を0〜500 mmで入力してください。';return;}
    state.filClearance=Number(value);filSettingsChanged();
  });
  $('filPose').addEventListener('change',event=>{state.filPose=event.target.value;filSettingsChanged();});
  $('filStaging').addEventListener('change',event=>{state.filStaging=event.target.checked;filSettingsChanged();});
  $('reset').addEventListener('click',()=>{state.baseElevation=0;preset('golden');toast('初期値に戻しました。');});
  $('zoomIn').addEventListener('click',()=>{zoom=Math.min(1.7,zoom+.1);draw();});$('zoomOut').addEventListener('click',()=>{zoom=Math.max(.5,zoom-.1);draw();});$('resetView').addEventListener('click',()=>{yaw=-.56;pitch=.4;zoom=1;draw();});
  $('exportSVG').addEventListener('click',exportSVG);$('exportCSV').addEventListener('click',exportCSV);$('print').addEventListener('click',()=>{document.querySelectorAll('.readout-details').forEach(d=>d.open=true);window.print();});
  $('saveConfig').addEventListener('click',()=>{if(!isInvalid){download('Dot_Area_Acrylic_Settings.json',JSON.stringify({version:2,state,unit},null,2),'application/json');toast('この寸法の設定を保存しました。');}});
  $('loadConfig').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>100000)throw Error('設定ファイルが大きすぎます。');importState(JSON.parse(await file.text()));selectedEdge=null;update();toast('設定を読み込みました。');}catch(error){toast(error.message||'設定を読み込めませんでした。');}event.target.value='';});
  $('edgeTable').addEventListener('click',event=>{const row=event.target.closest('[data-edge]');if(row){selectedEdge=selectedEdge===row.dataset.edge?null:row.dataset.edge;draw();readout();}});
  $('edgeTable').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const row=event.target.closest('[data-edge]');if(row){event.preventDefault();row.click();}}});
  let drag=null,dragged=false;
  $('drawing').addEventListener('pointerdown',event=>{if(view!=='3d')return;drag={x:event.clientX,y:event.clientY,yaw,pitch};dragged=false;$('drawing').setPointerCapture(event.pointerId);});
  $('drawing').addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;if(dragged){yaw=drag.yaw+dx*.006;pitch=Math.max(.05,Math.min(1.35,drag.pitch+dy*.005));draw();}});
  $('drawing').addEventListener('pointerup',event=>{drag=null;if($('drawing').hasPointerCapture(event.pointerId))$('drawing').releasePointerCapture(event.pointerId);});$('drawing').addEventListener('pointercancel',()=>{drag=null;});
  $('drawing').addEventListener('click',event=>{if(dragged){dragged=false;return;}const edge=event.target.closest('[data-select-edge]');if(edge){selectedEdge=selectedEdge===edge.dataset.selectEdge?null:edge.dataset.selectEdge;draw();readout();return;}const f=event.target.closest('[data-select-face]');if(f){faceId=f.dataset.selectFace;draw();readout();}});
  window.AcrylicStudio={getState:()=>({...state}),getModel:()=>model,getView:()=>view,setState:(next)=>{state={...state,...next};constrain();update();},isInvalid:()=>isInvalid,getTransport:()=>Transport.calculate(state,filOptions()),getPlacement:()=>Geometry.elevations(state,Transport.FIL.room.height)};
  window.addEventListener('resize',draw);
  update();
})();
