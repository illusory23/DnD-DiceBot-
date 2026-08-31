/* ━━━ 战术地图 · 页面内联逻辑模块（加入房间遮罩 / 返回与统计）━━━
 * 从 map.html 内联 script 外置（2026-08-16 二次治理）
 */
(function(){
var K='dnd_joined_room';
var _raw=sessionStorage.getItem(K);if(_raw){try{var _d=JSON.parse(_raw);if(_d&&_d.name){document.getElementById('join-username').value=_d.name;document.getElementById('join-overlay').classList.add('hidden');if(typeof window._chatUser!=='undefined')window._chatUser=_d.name;var _ci=document.getElementById('chat-input');var _cs=document.getElementById('chat-send-btn');if(_ci)_ci.disabled=false;if(_cs)_cs.disabled=false;setInterval(function(){var s=JSON.parse(sessionStorage.getItem(K));if(s&&s.name){fetch('/api/room/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:s.name,color:s.color||'',role:s.role||'PL'})}).catch(function(){});}},10000);return;}}catch(e){}}
var C='#00bcd4';
var P=['#00bcd4','#4caf50','#ff9800','#e91e63','#9c27b0','#2196f3','#ff5722','#607d8b','#795548','#cddc39','#00e5ff','#76ff03','#ffd740','#ff4081','#b388ff','#448aff','#ff6e40','#90a4ae','#8d6e63','#ffff00'];
function B(){var p=document.getElementById('join-color-palette');p.innerHTML=P.map(function(c){return '<div class="join-color-swatch'+(c===C?' selected':'')+'" style="background:'+c+';" onclick="window._selectJoinColor(\''+c+'\')"></div>';}).join('');}
B();
window.toggleJoinColorPalette=function(){B();document.getElementById('join-color-palette').classList.toggle('show');};
window._selectJoinColor=function(c){C=c;document.getElementById('join-color-btn').style.background=c;document.getElementById('join-color-palette').classList.remove('show');};
window._portalUserId=null;fetch('/api/auth/me').then(function(r){return r.json();}).then(function(d){if(d.ok&&d.user){window._portalUserId=d.user.id;document.getElementById('join-username').value=d.user.username;document.getElementById('join-subtitle').textContent='已绑定官网账号：'+d.user.username+'（可修改显示名）';}}).catch(function(){});fetch('/api/dm-status').then(function(r){return r.json();}).then(function(d){if(d.is_dm){C='#ffd700';document.getElementById('join-color-btn').style.background='#ffd700';document.getElementById('join-dm-badge').style.display='inline-block';document.getElementById('join-subtitle').textContent='你是主持人，请输入ID进入';}});
document.getElementById('join-username').addEventListener('keydown',function(e){if(e.key==='Enter')doJoin();});
window.doJoin=function(){var n=document.getElementById('join-username').value.trim();if(!n){document.getElementById('join-error').textContent='请输入你的ID';return;}var b=document.getElementById('join-btn');b.disabled=true;b.textContent='连接中...';fetch('/api/room/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,color:C,role:document.querySelector('input[name=\"join-role\"]:checked').value})}).then(function(r){return r.json();}).then(function(d){if(d.ok){sessionStorage.setItem(K,JSON.stringify({name:n,color:C,is_dm:d.is_dm,role:document.querySelector('input[name=\"join-role\"]:checked').value}));document.getElementById('join-overlay').classList.add('hidden');if(typeof loadCharTokens==='function')loadCharTokens();if(typeof loadMapCombatCharSelect==='function')loadMapCombatCharSelect();fetch('/api/chat/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,text:'进入了骰娘',color:C})});window._isDM=d.is_dm;window._roleLocked=true;if(window.applyRoleRestrictions)window.applyRoleRestrictions();else setTimeout(function(){if(window.applyRoleRestrictions)window.applyRoleRestrictions();},1000);try{if(d.is_dm){var fw=document.getElementById('fog-dropdown-wrap');if(fw)fw.style.display='';var cbt=document.querySelectorAll('[onclick*=\"clearDrawings\"],[onclick*=\"clearAll\"]');for(var _i=0;_i<cbt.length;_i++)cbt[_i].style.display='';}else{var _fw=document.getElementById('fog-dropdown-wrap');if(_fw)_fw.style.display='none';var _cbt=document.querySelectorAll('[onclick*=\"clearDrawings\"],[onclick*=\"clearAll\"]');for(var _j=0;_j<_cbt.length;_j++)_cbt[_j].style.display='none';}}catch(ex){}try{var ci=document.getElementById('chat-input');var cs=document.getElementById('chat-send-btn');var cu=document.getElementById('chat-username');if(ci)ci.disabled=false;if(cs)cs.disabled=false;if(cu)cu.value=n;}catch(ex){}}else{document.getElementById('join-error').textContent='加入失败: '+(d.error||'');b.disabled=false;b.textContent='进入骰娘';}}).catch(function(e){document.getElementById('join-error').textContent='网络错误';b.disabled=false;b.textContent='进入骰娘';});};
document.addEventListener('click',function(e){if(!e.target.closest('.color-row')){document.getElementById('join-color-palette').classList.remove('show');}});
})();


(function(){
    var ref = document.referrer;
    if (ref && ref.indexOf(location.origin) === 0 && ref.indexOf('/map') === -1) {
        var brand = document.getElementById('map-brand');
        if (brand) {
            brand.href = 'javascript:history.back()';
            brand.textContent = '← 返回';
            brand.title = '返回上一页面（保持原状态）';
            brand.style.color = '#ffd700';
        }
    }

// ━━ 骰子统计排行榜 ━━
// 统计按钮右移逻辑：统计面板或角色侧边栏任一打开时右移 260px，
// 避免统计按钮（z-index 199）遮挡角色侧边栏右上角关闭按钮（z-index 150）
window._syncStatsToggle=function(){
  var st=document.getElementById("stats-toggle-btn");
  if(!st)return;
  var sp=document.getElementById("stats-panel");
  var sb=document.getElementById("char-sidebar");
  var open=((sp&&sp.classList.contains("open"))||(sb&&sb.classList.contains("open")));
  var right=open?"260px":"0";
  st.style.right=right;
  // 状态池与模组时间竖条同样跟随侧边栏展开右移
  var su=document.getElementById("status-pool-btn");
  if(su)su.style.right=right;
  var ti=document.getElementById("time-toggle-btn");
  if(ti)ti.style.right=right;
  // 快速掷骰按钮：展开时右移到侧边栏左侧，避免遮挡展开界面
  var df=document.getElementById("dice-float-btn");
  if(df)df.style.right=open?"calc(260px + 1rem)":"1rem";
};
window.toggleStats=function(){
  var p=document.getElementById("stats-panel");
  var isOpen=p.classList.toggle("open");
  if(isOpen)loadStats();
  window._syncStatsToggle();
};
window._statsMode=20;
window.switchStatsTab=function(mode){
  window._statsMode=mode;
  document.getElementById("stats-tab-20").classList.toggle("selected",mode===20);
  document.getElementById("stats-tab-1").classList.toggle("selected",mode===1);
  loadStats();
};
window.clearStats=async function(){
  if(!await showConfirmDialog("确定清空所有骰子统计数据？此操作不可撤销。"))return;
  fetch("/api/dice-stats",{method:"DELETE"}).then(function(r){return r.json();}).then(function(d){
    if(d.ok){loadStats();}
  }).catch(function(){});
};
window.loadStats=function(){
  var list=document.getElementById("stats-list");
  list.innerHTML='<div style="color:var(--text-dim);text-align:center;padding:20px;">加载中...</div>';
  fetch("/api/dice-stats").then(function(r){return r.json();}).then(function(d){
    if(!d.ok||!d.leaderboard||!d.leaderboard.length){
      list.innerHTML='<div style="color:var(--text-dim);text-align:center;padding:20px;font-size:0.8rem;">暂无数据</div>';
      return;
    }
    var mode=window._statsMode||20;
    var sorted=d.leaderboard.slice().sort(function(a,b){
      return mode===20 ? b.crit20-a.crit20 : b.crit1-a.crit1;
    });
    var icon=mode===20?'🎯':'💀';
    var label=mode===20?'大成功(d20=20)':'大失败(d20=1)';
    var title='<div style="padding:4px 10px;font-size:0.62rem;color:var(--text-dim);border-bottom:1px solid var(--border);">'+icon+' '+label+' 次数 | 概率（暴击数/总投掷数）</div>';
    list.innerHTML=title+sorted.map(function(s,i){
      var rank=i+1;
      var rc=rank===1?'gold':(rank===2?'silver':(rank===3?'bronze':''));
      var medals={1:'🥇',2:'🥈',3:'🥉'};
      var cnt=mode===20?s.crit20:s.crit1;
      var rate=mode===20?s.rate20:s.rate1;
      if(cnt===0)return '';
      return '<div class="stats-row">'+
        '<span class="stats-rank '+rc+'">'+(medals[rank]||rank)+'</span>'+
        '<span class="stats-name">'+s.name+'</span>'+
        '<span class="stats-num '+(mode===20?'green':'red')+'">'+cnt+'</span>'+
        '<span class="stats-rate">'+rate+'%</span>'+
        '</div>';
    }).filter(Boolean).join('');
  }).catch(function(){
    list.innerHTML='<div style="color:var(--red);text-align:center;padding:20px;">加载失败</div>';
  });
};
})();

