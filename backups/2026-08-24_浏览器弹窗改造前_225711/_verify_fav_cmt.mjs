// 收藏与评论验证:登录→收藏帖子→我的收藏→发评论→我的评论→取消收藏
import { spawn } from 'node:child_process';
const PORT = 9282;
const BASE = 'http://localhost:5000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\edge-fav`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let _cookie = '';
async function api(path, body, method) {
    const opts = { method: method || (body !== undefined ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' } };
    if (_cookie) opts.headers['Cookie'] = _cookie;
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(BASE + path, opts);
    const setc = r.headers.get('set-cookie');
    if (setc) _cookie = setc.split(';')[0];
    return r.json();
}
async function getWsUrl(){for(let i=0;i<30;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p)return p.webSocketDebuggerUrl;}catch(e){}await sleep(500);}throw new Error('no ws');}
function connect(wsUrl){return new Promise((res,rej)=>{const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();ws.onopen=()=>res({send(m,p={}){return new Promise((r,j)=>{const mid=++id;pend.set(mid,{r,j});ws.send(JSON.stringify({id:mid,method:m,params:p}));});},close(){ws.close();}});ws.onerror=e=>rej(e);ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result);}};});}
async function evalJs(cdp,e){const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('JS: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result?.value;}

let pass = 0, fail = 0;
function check(label, cond, detail) {
    if (cond) { pass++; console.log('[✅]', label); }
    else { fail++; console.log('[❌]', label, '|', detail ? JSON.stringify(detail).slice(0, 200) : ''); }
}

try {
    // 登录(管理员,有社区数据)
    const login = await api('/admin/api/login', { username: 'IllusoryActor', password: 'illusorior' });
    check('管理员登录', login.ok, login);
    const me = await api('/api/auth/me');
    const uid = me.user.id;
    const uname = me.user.username;

    // 帖子详情(拿一个帖子 id)
    const posts = await api('/api/community/posts/2');
    check('存在测试帖子', posts.ok && posts.post, posts);
    const postId = posts.post.id;

    // 收藏帖子
    const fav1 = await api('/api/favorites', { type: 'post', id: postId });
    check('收藏帖子', fav1.ok && fav1.favorited === true, fav1);
    // 我的收藏列表
    const favs = await api('/api/favorites');
    check('我的收藏含该帖子', favs.ok && favs.favorites.some(f => f.type === 'post' && f.item_id === postId && f.title), favs);
    // 取消收藏
    const fav2 = await api('/api/favorites', { type: 'post', id: postId });
    check('取消收藏', fav2.ok && fav2.favorited === false, fav2);
    const favs2 = await api('/api/favorites');
    check('取消后列表移除', !favs2.favorites.some(f => f.type === 'post' && f.item_id === postId), favs2);

    // 发评论(帖子)→ 我的评论
    const cmt = await api('/api/community/posts/' + postId + '/comments', { content: '收藏评论测试-' + Date.now() });
    check('发评论', cmt.ok, cmt);
    const mycmts = await api('/api/my/comments');
    check('我的评论含刚发评论', mycmts.ok && mycmts.comments.some(c => c.type === 'post' && c.parent_id === postId), mycmts);

    // 未登录访问被拒
    _cookie = '';
    const noAuth = await api('/api/favorites');
    check('未登录访问收藏被拒', noAuth.ok === false && noAuth.error, noAuth);
    const noAuth2 = await api('/api/my/comments');
    check('未登录访问评论被拒', noAuth2.ok === false, noAuth2);

    console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
    edge.kill();
    process.exit(fail ? 1 : 0);
} catch (e) {
    console.error('测试失败:', e.message);
    edge.kill();
    process.exit(1);
}
