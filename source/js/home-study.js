/* global window, document */

'use strict';

/* Homepage 3D spatial study — flat-shaded WebGL scene & camera rig.
 *
 * 固定画布 #sd-canvas 上跑一条随滚动推进的相机路径，画三段空间：院外（长阶梯 /
 * 星盘塔 / 城市天际线）→ 柱廊 → 内殿（悬浮多面体核心 + 两道星轨环）。
 *
 * 渲染：几何在 CPU 上拼成顶点数组一次上传；着色是「三档色阶的平面着色」——
 * 每面法线与固定光向点积后落三档，不做真实光照；顶点着色器负责相机矩阵、
 * 逐顶点动画与距离雾，片元叠颗粒与扫描线；相机是 Catmull-Rom 关键帧样条。
 *
 * 常驻动画全由 uTime 驱动：星盘双环、桁架下的秋千、浮空多面体、内殿核心与环。
 * 零贴图、零外部资源；WebGL 不可用时画布隐藏，内容仍可读。
 *
 * 交互层：导航浮现、<dialog> 浮层、落幕屏倒计时。
 */

(function () {
  var doc = document;

  // ================= 1. 场景 =================
  //
  // 固定画布 #sd-canvas 上的 WebGL 场景：几何在 CPU 上拼成顶点数组一次上传，
  // 三档色阶平面着色 + 距离雾 + 颗粒，相机是一条随滚动推进的关键帧样条。
  // 场景三段沿 -z 推进：院外（台阶 / 格栅 / 星盘塔）→ 柱廊 → 内殿（悬浮多面体核心）。
  // 全场景零贴图、零外部资源；WebGL 不可用时画布直接隐藏。
  (function scene() {
  // ---- 原站脚本依赖的两个外部对象：色板 P 与主题 THM ----
  // 暖调映射：亮面（近白）→ 受光（杏仁 / 砂金）→ 过渡（驼金）→ 背光（焦茶 / 胡桃）。
  // 三档之间的明度差是这套插画感的全部来源，不要把它们拉平。
  var P = {
    ui: { aqua: '#e8cfa8', panel: '#f3e4cc', pale: '#fdf8ef', line: '#e6cda4', deep: '#4a2a18', mute: '#8a6547', chroma: '#d94826' },
    scene: {
      paper: ['#fffdf9', '#dcb892', '#78482b'],
      shade: ['#f7efe2', '#c69568', '#4a2a18'],
      ink: ['#f2e4d0', '#ae784b', '#2e190e'],
      dish: ['#fffdf9', '#ebd6bc', '#ae784b'],
      night: ['#78482b', '#4a2a18', '#2e190e'],
    },
  };

  var hx = function (h) {
    return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  };
  var THM = { dark: false, K: [0.98, 0.965, 0.933], H: hx(P.ui.panel), G: hx('#f2d9b4'), N: [0.99, 0.972, 0.945], DM: [1, 1, 1] };

  // 取我站三屏里的固定画布
  var $ = function (sel) {
    if (sel === '#gl' || sel === 'canvas') return document.getElementById('sd-canvas');
    return document.querySelector(sel);
  };
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

const cv=$('#gl');
const gl=cv.getContext('webgl',{antialias:true,alpha:false,depth:true,powerPreference:'high-performance'});
if(!gl){cv.remove();return}
gl.clearColor(THM.K[0],THM.K[1],THM.K[2],1);gl.clear(gl.COLOR_BUFFER_BIT);
const hex=h=>[parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];
const PAL={};for(const k in P.scene)PAL[k]=P.scene[k].map(hex);
PAL.red=['#e8603c','#d94826','#8e2a12'].map(hex);PAL.sun=Array(3).fill(hex('#fffdf9'));PAL.glow=Array(3).fill(hex('#f6dfc2'));
/* 悬浮核心与星轨环：琥珀金三档，走自发光批次（见 quad 里的 nf = -5） */
PAL.core=['#fff2cf','#e9bd72','#a9762f'].map(hex);PAL.orbit=['#fbe6bd','#dfb87c','#8d6a38'].map(hex);
/* 核心的棱线：三档都压暗，落在金面上才分得出切边 */
PAL.edge=['#8a5620','#78491a','#5f3a14'].map(hex);
PAL.halo=PAL.sun;PAL.flute=['#fffdf9','#f7efe2','#dcb892'].map(hex);PAL.band=['#fffdf9','#ebd6bc','#c69568'].map(hex);
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l]};
const LIGHT=norm([-.42,.74,.52]);
const VERT=[];
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
function tone(n,mat){
  const d=dot(n,LIGHT),p=PAL[mat];
  return d>.42?p[0]:d>-.12?p[1]:p[2];
}
function pushV(p,c,w,ph){VERT.push(p[0],p[1],p[2],c[0],c[1],c[2],w,ph)}
/* 三角化的四边形：out 给出朝向点，法线按它翻正，明暗就不依赖顶点缠绕顺序。 */
function quad(a,b,c,d,mat,out){
  let n=norm(cross(sub(b,a),sub(c,a)));
  if(out&&dot(n,sub(a,out))<0)n=mul(n,-1);
  const col=tone(n,mat),nf=mat=='sun'?-1:mat=='halo'?-2:mat=='glow'?-4:(mat=='core'||mat=='orbit'||mat=='edge')?-5:0;
  [a,b,c,a,c,d].forEach(p=>pushV(p,col,0,nf));
}
function hull(c,mat){ /* 八个角点：0–3 在一端，4–7 在另一端 */
  const o=mul(c.reduce(add,[0,0,0]),1/8);
  quad(c[0],c[1],c[2],c[3],mat,o);quad(c[4],c[5],c[6],c[7],mat,o);
  for(let i=0;i<4;i++){const j=(i+1)%4;quad(c[i],c[j],c[j+4],c[i+4],mat,o)}
}
function box(x,y,z,w,h,d,mat='paper',ry=0){
  const cs=Math.cos(ry),sn=Math.sin(ry),P=(a,b,e)=>[x+a*w/2*cs+e*d/2*sn,y+b*h/2,z-a*w/2*sn+e*d/2*cs];
  hull([P(-1,-1,-1),P(1,-1,-1),P(1,-1,1),P(-1,-1,1),P(-1,1,-1),P(1,1,-1),P(1,1,1),P(-1,1,1)],mat);
}
function beam(a,b,t=.2,mat='ink'){
  const ax=norm(sub(b,a)),u=norm(cross(ax,Math.abs(ax[1])>.9?[1,0,0]:[0,1,0])),v=cross(ax,u),s=t/2;
  const ring=o=>[add(add(o,mul(u,-s)),mul(v,-s)),add(add(o,mul(u,s)),mul(v,-s)),add(add(o,mul(u,s)),mul(v,s)),add(add(o,mul(u,-s)),mul(v,s))];
  hull([...ring(a),...ring(b)],mat);
}
function truss(a,b,h,n,t=.14,mat='ink',up=[0,1,0]){
  const top=[a[0]+up[0]*h,a[1]+up[1]*h,a[2]+up[2]*h],d=sub(b,a),P=(o,k)=>add(o,mul(d,k/n));
  beam(a,b,t*1.5,mat);beam(top,add(b,mul(up,h)),t*1.5,mat);
  for(let i=0;i<n;i++){beam(P(a,i),P(top,i),t,mat);beam(P(a,i),P(top,i+1),t,mat)}
  beam(P(a,n),P(top,n),t,mat);
}
function dish(c,axis,R,depth,opts={}){
  const ax=norm(axis),u=norm(cross(ax,[0,1,.01])),v=cross(ax,u),S=opts.seg||26,K=opts.rings||4;
  const pt=(k,i,off)=>{const r=R*k/K,a=i/S*6.2832;return add(add(c,add(mul(u,r*Math.cos(a)),mul(v,r*Math.sin(a)))),mul(ax,depth*(k/K)*(k/K)+off))};
  const back=-.09*R/4;
  for(let k=0;k<K;k++)for(let i=0;i<S;i++){
    quad(pt(k,i,0),pt(k+1,i,0),pt(k+1,i+1,0),pt(k,i+1,0),'dish',add(c,mul(ax,-R)));
    quad(pt(k,i,back),pt(k+1,i,back),pt(k+1,i+1,back),pt(k,i+1,back),'paper',add(c,mul(ax,R*2)));
  }
  for(let i=0;i<S;i++)beam(pt(K,i,.02),pt(K,i+1,.02),R*.028,'ink');
  beam(c,add(c,mul(ax,depth+R*.7)),R*.022,'ink');
  for(const a of[0,2.09,4.19])beam(add(c,mul(ax,depth+R*.7)),add(add(c,add(mul(u,R*Math.cos(a)),mul(v,R*Math.sin(a)))),mul(ax,depth)),R*.012,'ink');
}
/* 三角面：多面体专用。quad 靠重复第四点拼三角形会多推一个零面积面，这里直接写三点。 */
function tri(a,b,d,mat,out){
  let n=norm(cross(sub(b,a),sub(d,a)));
  if(out&&dot(n,sub(a,out))<0)n=mul(n,-1);
  const col=tone(n,mat),nf=mat=='core'||mat=='orbit'?-5:0;
  [a,b,d].forEach(p=>pushV(p,col,0,nf));
}
/* 正二十面体：12 个顶点、20 个面，r 是外接球半径。面法线由 tri 现算，转起来明暗会自己变。 */
function icosa(c,r,mat){
  const g=(1+Math.sqrt(5))/2,k=r/Math.sqrt(1+g*g);
  const P=[[-1,g,0],[1,g,0],[-1,-g,0],[1,-g,0],[0,-1,g],[0,1,g],[0,-1,-g],[0,1,-g],[g,0,-1],[g,0,1],[-g,0,-1],[-g,0,1]]
    .map(v=>[c[0]+v[0]*k,c[1]+v[1]*k,c[2]+v[2]*k]);
  const F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  F.forEach(f=>tri(P[f[0]],P[f[1]],P[f[2]],mat,c));
}
/* 细环：内外两圈顶点拼成环带，从侧面看是一条线，正面看是一道弧光。 */
function halo(c,r,axis,wide,mat,seg){
  const ax=norm(axis),u=norm(cross(ax,[0,1,.01])),v=cross(ax,u),S=seg||56;
  const P=(i,j)=>add(c,add(mul(u,Math.cos(i/S*6.2832)*(r+j*wide)),mul(v,Math.sin(i/S*6.2832)*(r+j*wide))));
  for(let i=0;i<S;i++){
    quad(P(i,0),P(i+1,0),P(i+1,1),P(i,1),mat,c);
    quad(P(i,-1),P(i+1,-1),P(i+1,0),P(i,0),mat,c);
  }
}
/* 立体细环（星轨用）：一圈细管，任何角度看都是线。
   不能用上面的扁平环带——它侧看时两条面几乎退化，会渲染成一段一段的虚线。 */
function hoop(c,r,axis,t,mat,seg){
  const ax=norm(axis),u=norm(cross(ax,[0,1,.01])),v=cross(ax,u),S=seg||64;
  const P=i=>add(c,add(mul(u,Math.cos(i/S*6.2832)*r),mul(v,Math.sin(i/S*6.2832)*r)));
  for(let i=0;i<S;i++)beam(P(i),P(i+1),t,mat);
}
/* 垂挂并摆动的窄带，折面按明暗交替取色，像折过的纸。 */function ribbon(p,len,wid,ph,dir=[1,0,.3],kick=.1,amp=1){
  const n=9,d=norm(dir);let prev=null;
  for(let i=0;i<=n;i++){
    const f=i/n,y=p[1]-len*f,off=Math.sin(f*7+ph)*len*.05+kick*len*f,wv=wid*(1-f*.25),
      c=[p[0]+d[2]*off,y,p[2]+d[0]*off],a=add(c,mul(d,wv/2)),b=add(c,mul(d,-wv/2));
    if(prev){
      const col=i%2?PAL.red[1]:PAL.red[2],w0=(i-1)/n*amp,w1=i/n*amp;
      pushV(prev[0],col,w0,ph);pushV(prev[1],col,w0,ph);pushV(b,col,w1,ph);
      pushV(prev[0],col,w0,ph);pushV(b,col,w1,ph);pushV(a,col,w1,ph);
    }
    prev=[a,b];
  }
  box(p[0],p[1],p[2],wid*1.25,wid*.5,wid*.5,'red');
}
/* 多面体：按水平环 [y, rx, rz, cz, cx] 放样。star 是起伏的棱，wave 是顶边波纹。 */
function loft(T,rings,n,mat,o={}){
  const tw=o.twist||0,st=o.star||0,wv=o.wave||0,last=rings.length-1;
  const P=(k,i)=>{const r=rings[k],a=i/n*6.2832+tw,m=st&&i%2?1-st:1;
    return T((r[4]||0)+Math.cos(a)*r[1]*m,r[0]+(k==last?wv*Math.sin(a*3):0),(r[3]||0)+Math.sin(a)*r[2]*m)};
  for(let k=0;k<last;k++){const a=rings[k],b=rings[k+1],ctr=T(((a[4]||0)+(b[4]||0))/2,(a[0]+b[0])/2-.5,((a[3]||0)+(b[3]||0))/2);
    for(let i=0;i<n;i++)quad(P(k,i),P(k,i+1),P(k+1,i+1),P(k+1,i),mat,ctr)}
  if(o.cap!==false){const r=rings[last],c=T(r[4]||0,r[0],r[3]||0),u=T(r[4]||0,r[0]-1,r[3]||0);for(let i=0;i<n;i++)quad(c,P(last,i),P(last,i+1),c,o.capMat||mat,u)}
}
/* 局部坐标系：lift(x,y,z) 给出一个把局部偏移搬到世界坐标的取点函数，
   首屏左侧那排体块与塔身都用它摆位。 */
const lift=(x,y,z)=>(a,b,c)=>[x+a,y+b,z+c];
const TOWER=lift(0,0,0);
function disc(c,n,R,mat){
  const nn=norm(n),u=norm(cross(nn,[0,1,.02])),v=cross(nn,u),S=64;
  for(let i=0;i<S;i++){
    const a=i/S*6.2832,b=(i+1)/S*6.2832;
    quad(c,add(c,add(mul(u,R*Math.cos(a)),mul(v,R*Math.sin(a)))),add(c,add(mul(u,R*Math.cos(b)),mul(v,R*Math.sin(b)))),c,mat);
  }
}

/* 太阳是全场唯一既不着色也不吃雾的物体。 */
const SUN=[-150,238,-300],SUN_R=34;
disc(SUN,mul(SUN,-1),SUN_R,'sun');
/* 浅色天空下白太阳需要一圈晕边，只在浅色主题画。 */
disc(mul(SUN,1.02),mul(SUN,-1),SUN_R*1.32,'halo');
const toSun=c=>norm(sub(SUN,c));
const flat=v=>norm([v[0],0,v[2]]);

/* 地面与台基：两块叠起来的石头。外轮廓是超椭圆（n=5），转角连续，
   不是一段圆弧接一根直线；上边缘同样做了圆角。 */
box(0,-7.6,30,240,10,190,'shade');
function slab(cx,cz,a,b,y0,y1,r,mat){
  const SG=112,n=5,ring=(y,ins)=>{const o=[];for(let i=0;i<SG;i++){const t=i/SG*6.2832,c=Math.cos(t),sn=Math.sin(t);
    o.push([cx+Math.sign(c)*Math.abs(c)**(2/n)*(a-ins),y,cz+Math.sign(sn)*Math.abs(sn)**(2/n)*(b-ins)])}return o};
  const R=[ring(y0,0),ring(y1-r,0)];for(let k=1;k<=3;k++){const t=k/3*Math.PI/2;R.push(ring(y1-r+r*Math.sin(t),r*(1-Math.cos(t))))}
  for(let k=0;k<R.length-1;k++)for(let i=0;i<SG;i++){const j=(i+1)%SG,y=(R[k][i][1]+R[k+1][i][1])/2;quad(R[k][i],R[k][j],R[k+1][j],R[k+1][i],mat,[cx,y-r,cz])}
  const top=R[R.length-1],c=[cx,y1,cz];for(let i=0;i<SG;i++)quad(c,top[i],top[(i+1)%SG],c,mat,[cx,y1-1,cz]);
}
slab(-6,-6,46,31,0,8,1.6,'paper');
slab(-14,-14,29,18,7,13,1.4,'paper');
/* 实心块砌成的两段台阶：一段在下层的南面，一段在上层的东面，各带一个门洞。 */
for(let i=0;i<16;i++){const h=(i+1)*.5;box(-34+(i+.5)*1.75,h/2,26.7,1.75,h,3.4,'shade')}
for(let i=0;i<10;i++){const h=(i+1)*.5;box(16.7,8+h/2,-4-(i+.5)*2,3.4,h,2,'shade')}
box(12,2.3,25.04,2.4,4.6,.12,'night');loft(lift(12,4.6,25.04),[[0,1.2,.06],[.01,1.2,.06]],12,'night',{cap:false});
box(15.06,10.2,-28,.12,4.4,2.2,'night');
for(let i=0;i<9;i++){const a=i*.9;box(38+18*Math.sin(a),8+rnd()*1.5,-2+22*Math.cos(a),5+rnd()*5,6+rnd()*5,4+rnd()*5,'shade',a)}

/* 塔：竖向棱面放样，到塔冠处外扩。 */
loft(TOWER,[[8,10.5,10.5],[30,8,8],[58,6.6,6.6],[78,8.2,8.2],[86,11.5,11.5]],56,'flute',{star:.06,twist:.3,wave:1.1,capMat:'ink'});
loft(lift(0,29.5,0),[[0,11,11],[3,11,11]],28,'shade');
const crown=[0,105,0];
/* 塔冠上只留一根桅杆，把碟形天线托在塔顶（原十字架已移除）。 */
{const ry=Math.atan2(78,78.5),fx=6.7,fz=4.6;box(fx,96,fz,1.6,20,1.6,'ink',ry)}
/* 自转部件：每个槽记一个中心、一根轴和两个角速度（w1 绕该轴，w2 绕世界竖轴）。
   顶点被标成 20+i（s.y）就归第 i 个槽，由顶点着色器转动；槽在建几何的过程中依次占位。 */
/* 自转槽：s.y 正数（20+i）是「普通材质 + 自转」，负数（-(20+i)）是「自发光 + 自转」。
   两件事挤在同一个通道上，所以自发光体必须把槽号写成负数，否则材质标记 -5 会被覆盖掉，
   夜里整颗核心跟着建筑一起被暗夜系数压成褐色（E-184）。 */
const SPIN=[],turns=(v0,c,n,w1,emis)=>{for(let q=v0;q<VERT.length;q+=8){VERT[q+6]=0;VERT[q+7]=(emis?-1:1)*(20+SPIN.length)}SPIN.push({c,n,w1,w2:0})};
/* 碟形天线上的一圈赤道环：与下一圈同心、略小、倾斜 12 度，环上放一颗行星。 */
let PLANET;
{const C=add(crown,[0,0,0]),R=16,th=-12*Math.PI/180,N=120,a=norm([-78.5,0,78]),d=norm([78.5,0,78]),
 e2=add(mul(d,Math.cos(th)),mul([0,1,0],Math.sin(th))),on=(t,r,c)=>add(c,add(mul(a,Math.cos(t)*r),mul(e2,Math.sin(t)*r)));
 for(let i=0;i<N;i++)beam(on(i/N*6.2832,R,C),on((i+1)/N*6.2832,R,C),.6,'band');
 const E=on(.5,R,C),v0=VERT.length;
 const P=E,r=1.5;loft(lift(P[0],P[1],P[2]),[[-r,.05,.05],[-r*.7,r*.71,r*.71],[0,r,r],[r*.7,r*.71,r*.71],[r,.05,.05]],10,'ink');
 /* 行星沿这圈环公转，约十八秒一圈。 */
 turns(v0,C,norm(cross(a,e2)),.35);PLANET={c:C,n:norm(cross(a,e2)),p:E,w:.35}}
dish(crown,toSun(crown),12.5,3.5,{seg:64,rings:12});

/* 悬空的环形桁架：宽边外翻，网格是十六节点的递归倍增全归约拓扑（连 +1 +2 +4 +8）。 */
const LY=67,LR=27,NN=16,node=i=>{const a=i/NN*6.2832+.2;return[Math.cos(a)*LR,LY,Math.sin(a)*LR]};
const BROKEN=[2,6];
loft(lift(0,LY,0),[[-.7,LR-1,LR-1],[0,LR,LR],[1.3,LR+1.5,LR+1.5]],NN*2,'band',{twist:.2,cap:false});
for(const k of[1,2,4,8])for(let i=0;i<NN;i++){
  const j=(i+k)%NN;if(k==8&&i>=8)continue;
  if(k==4&&i==BROKEN[0])continue;
  beam(node(i),node(j),k==1?.3:.09,k==1?'paper':'dish');
}
for(let i=0;i<NN;i++){const n=node(i);box(n[0],n[1],n[2],.9,.9,.9,'dish',i);
  const a0=i/NN*6.2832+.2,S=5;for(let q=0;q<2;q++){const off=q/2/NN*6.2832;let prev=null;for(let s=0;s<=S;s++){const f=s/S,a=a0+off+f*(1/2/NN*6.2832),rr=LR+1.6+1.5*Math.sin(f*3.1416),P=[Math.cos(a)*rr,LY+1.3,Math.sin(a)*rr];if(prev)beam(prev,P,.1,'dish');prev=P}}
}
for(let i=0;i<4;i++){const a=i/4*6.2832+.2+.39;truss([Math.cos(a)*6.5,LY-.8,Math.sin(a)*6.5],[Math.cos(a)*LR,LY-.8,Math.sin(a)*LR],1.4,9,.09,'ink')}
/* 断掉的一段：两个残端，缺口处挂一副红色秋千，绕缺失那条弦的轴线摇摆。
   顶点带「低于该线的深度」（s.x）与标记 50（s.y），由顶点着色器绕轴转动。 */
let SWING=[0,0,1];
{const a=node(BROKEN[0]),b=node(BROKEN[1]),m1=add(a,mul(sub(b,a),.36)),m2=add(a,mul(sub(b,a),.6)),ax=norm(sub(m2,m1));SWING=[-ax[2],0,ax[0]];
 beam(a,m1,.16,'red');beam(b,m2,.16,'red');
 const v0=VERT.length,L=19,sc=add(mul(add(m1,m2),.5),[0,-L,0]),sl=Math.hypot(...sub(m2,m1));
 for(const m of[m1,m2]){box(m[0],m[1],m[2],.7,.7,.7,'red');beam(m,add(m,[0,-L-.1,0]),.14,'red')}
 box(sc[0],sc[1]-.2,sc[2],sl+1.6,.4,1.9,'red',Math.atan2(-ax[2],ax[0]));
 for(let i=v0;i<VERT.length;i+=8){VERT[i+6]=Math.max(0,m1[1]-VERT[i+1]);VERT[i+7]=50}}

/* 坡屋顶房子堆成的一整座山，压在台基上。 */
function house(x,y,z,w,h,d,ry){
  box(x,y+h/2,z,w,h,d,rnd()<.5?'paper':'shade',ry);
  const cs=Math.cos(ry),sn=Math.sin(ry),P=(a,b,e)=>[x+a*w/2*cs+e*d/2*sn,y+b,z-a*w/2*sn+e*d/2*cs],r=h*.55;
  const o=[x,y+h*.6,z];
  quad(P(-1,h,-1),P(0,h+r,-1),P(0,h+r,1),P(-1,h,1),'dish',o);quad(P(1,h,-1),P(0,h+r,-1),P(0,h+r,1),P(1,h,1),'dish',o);
  quad(P(-1,h,1),P(0,h+r,1),P(1,h,1),P(-1,h,1),'shade',o);quad(P(-1,h,-1),P(0,h+r,-1),P(1,h,-1),P(-1,h,-1),'shade',o);
  const u=Math.sin(ry)*(d/2+.04),v=Math.cos(ry)*(d/2+.04);box(x+u,y+h*.5,z+v,w*.56,h*.52,.06,'night',ry);
}
for(let L=0;L<7;L++){const c=7-L;for(let i=0;i<c;i++)house(-66+(i-(c-1)/2)*7.2+(rnd()-.5)*2.4,8+L*5.7,-6+(rnd()-.5)*(16-L*1.6),6.6,4.8,6.4,rnd()<.5?0:1.5708)}

/* 一整块带竖棱的巨石，屋顶起伏，侧墙开发光窄缝。 */
loft(lift(64,0,-52),[[0,20,15],[38,20,15]],72,'shade',{star:.05,wave:2.6,capMat:'ink'});
for(const a of[1.05,1.4,1.75,2.1])beam([64+Math.cos(a)*20.3,.2,-52+Math.sin(a)*15.3],[64+Math.cos(a)*20.3,32,-52+Math.sin(a)*15.3],.5,'glow');
/* 以尖端立在空中的方尖碑。 */
{const b=[92,0,6],t=[80,56,6],r=(p,q,d)=>[p[0]+q*d,p[1],p[2]+d*(q?0:0)],c=[];
 for(const[x,z]of[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]])c.push([b[0]+x*1.4,b[1],b[2]+z*1.4]);
 for(const[x,z]of[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]])c.push([t[0]+x*9,t[1],t[2]+z*9]);hull(c,'paper')}
/* 石盘层层叠起的台体。 */
{const R=[];for(let t=0;t<9;t++){const r=11.5-t*1.2,y=t*1.2;R.push([y,r,r],[y+1.2,r,r])}loft(lift(-4,0,74),R,28,'paper')}

/* 立杆上的碟形天线，全部朝向太阳。 */
[[-42,0,34,4.2],[-16,0,44,3],[-58,0,30,3.2],[28,16,-24,5.2],[44,12,-18,3.4],[-22,18,-28,4.6],[60,0,30,2.8],[20,0,58,2.6]].forEach(([x,y,z,r],i)=>{
  const c=[x,y+r*2.4+(y?0:7),z];beam([x,y,z],add(c,mul(toSun(c),-r*.1)),r*.09,'ink');box(x,y+.6,z,r*.7,1.2,r*.7,'shade',i);
  dish(c,toSun(c),r,r*.28,{seg:18});
  if(i%2==0)ribbon(add(c,[r*.8,-r*.1,0]),r*2.3,.34,i*2.1,[.8,0,.5],.1);
});
[[-42,20,34],[28,28,-24],[60,16,30],[-22,28,-28]].forEach(q=>{const a=[0,80,0];let pv=a;for(let i=1;i<=10;i++){const f=i/10,p=add(add(a,mul(sub(q,a),f)),[0,-Math.sin(f*3.1416)*7,0]);beam(pv,p,.09,'ink');pv=p}});

/* 上塔台的楼梯，带栏杆与系着的布条。 */
const SA=[46,.4,62],SB=[9,31,9],STEPS=48,sp=k=>add(SA,mul(sub(SB,SA),k/STEPS)),perp=norm(cross(sub(SB,SA),[0,1,0]));
for(let k=0;k<STEPS;k++){const p=sp(k);box(p[0],p[1]-.25,p[2],4.4,.5,2.2,k%2?'paper':'shade',Math.atan2(sub(SB,SA)[0],sub(SB,SA)[2]))}
const side=s=>{const off=mul(perp,s*2.2);let pv=null;for(let k=0;k<=STEPS;k+=3){const b=add(sp(k),off),t=add(b,[0,1.5,0]);beam(b,t,.1,'ink');if(pv)beam(pv,t,.11,'ink');pv=t}};
side(1);side(-1);
for(let i=0;i<11;i++){const k=3+i*4,p=add(add(sp(k),mul(perp,(i%2?2.2:-2.2))),[0,1.5,0]);ribbon(p,3.5+rnd()*5,.38,i*1.7,[.8,0,.4],.12)}
for(let k=5;k<STEPS;k+=7){const p=sp(k);box(p[0],p[1]/2-.5,p[2],2,p[1],2,'shade',.8)}

/* 内殿：三进盒子、一道 15 度斜插的自由墙，尽头是一面整墙。
   （原模型按圣地开过一条十字光缝，2026-11-17 已改为实墙。） */
const CH=[-34,0,80],CF=flat(toSun(CH)),CS=norm(cross(CF,[0,1,0])),CT=(x,y,z)=>[CH[0]+CS[0]*x+CF[0]*z,CH[1]+y,CH[2]+CS[2]*x+CF[2]*z];
const CW=4.5,CHT=9,CL=27,TH=.6,GAP=.42,ARM=5.6;
const cbox=(x0,x1,y0,y1,z0,z1,mat)=>hull([CT(x0,y0,z0),CT(x1,y0,z0),CT(x1,y0,z1),CT(x0,y0,z1),CT(x0,y1,z0),CT(x1,y1,z0),CT(x1,y1,z1),CT(x0,y1,z1)],mat);
cbox(-CW-TH,-CW,0,CHT,0,CL,'paper');cbox(CW,CW+TH,0,CHT,0,CL,'paper');
cbox(-CW-TH,CW+TH,CHT,CHT+TH,-.0,CL+TH,'paper');
cbox(-CW-TH,CW+TH,-.6,0,0,CL+TH,'shade');
/* altar wall：整面实体。原先这里按十字开了一条光缝（Tadao Ando 那间教堂的做法），
   2026-11-17 按主人要求去掉宗教符号，改为实墙 + 前方的悬浮多面体核心。 */
cbox(-CW,CW,0,CHT,CL,CL+TH,'paper');cbox(-CW,CW,0,CHT,CL-.03,CL,'night');
/* 后墙：中间留出入口 */
for(const[x0,x1,y0,y1]of[[-CW,-1.5,0,CHT],[1.5,CW,0,CHT],[-1.5,1.5,5,CHT]]){cbox(x0,x1,y0,y1,-TH,0,'paper');cbox(x0,x1,y0,y1,0,.03,'night')}
/* 内壁深色贴面 */
cbox(-CW,-CW+.03,0,CHT,0,CL,'night');cbox(CW-.03,CW,0,CHT,0,CL,'night');cbox(-CW,CW,CHT-.03,CHT,0,CL,'night');
/* 地面朝尽头逐级下降；深色长凳排开，中央一条光带。 */
/* 每级都保留真实高度（最低 0.15），尽头平台取用这个高度，避免面与面共面。 */
const FY=t=>1.35-t*.3;
for(let t=0;t<5;t++){const z0=t*4.6,z1=z0+4.6;cbox(-CW,CW,0,FY(t),z0,z1,'night')}
cbox(-CW,CW,0,FY(4),23,CL,'night');
for(let t=0;t<5;t++){const y=FY(t),z=2.2+t*4.6;for(const s of[-1,1]){cbox(s*.8,s*3.7,y,y+.72,z,z+.32,'ink');cbox(s*.8,s*3.7,y+.72,y+1.15,z+.26,z+.34,'ink')}}
{const w0=.42,w1=1.1;for(let t=0;t<5;t++){const z0=t*4.6,z1=z0+4.6,y=FY(t)+.05,k0=(CL-z0)/CL,k1=(CL-z1)/CL,a=w0+(w1-w0)*k0,b=w0+(w1-w0)*k1;quad(CT(-a,y,z0),CT(a,y,z0),CT(b,y,z1),CT(-b,y,z1),'glow')}
 quad(CT(-.5,FY(4)+.05,23),CT(.5,FY(4)+.05,23),CT(.42,FY(4)+.05,CL),CT(-.42,FY(4)+.05,CL),'glow')}
/* 斜插的自由墙：被入口切开 */
{const w=(x)=>3.2+(x+9)*Math.tan(15*Math.PI/180),seg=(x0,x1)=>{const q=(x,y,dz)=>CT(x,y,w(x)+dz);hull([q(x0,0,0),q(x1,0,0),q(x1,0,TH),q(x0,0,TH),q(x0,7.5,0),q(x1,7.5,0),q(x1,7.5,TH),q(x0,7.5,TH)],'paper')};seg(-11,-1.5);seg(1.5,3.9)}

/* 内殿后方：一个玻璃机房，机柜沿甬道排成两行。
   机器放在原本的祭坛位置，抬在同款台基上；近侧墙体留成敞开的拱廊，从外面能看见机柜。 */
{const C0=[-36,0,-51],Y0=12,L=44,W=20,HW=15,RH=24,X=x=>C0[0]+x,Z=z=>C0[2]+z,mid=[C0[0],Y0+HW/2,C0[2]];
 box(C0[0],Y0/2,C0[2],L+10,Y0,W+8,'shade');box(C0[0],Y0*.35,Z(W/2+6),L*.5,Y0*.7,4,'paper');
 box(C0[0],Y0+.3,C0[2],L+2,.6,W+2,'paper');
 box(C0[0],Y0+HW/2,Z(-W/2),L,HW,.9,'paper');box(C0[0],Y0+HW/2,Z(-W/2+.5),L-1,HW-.5,.1,'night');
 for(const s of[-1,1]){const x=X(s*L/2);box(x,Y0+HW/2,C0[2],.9,HW,W,'paper');quad([x,Y0+HW,Z(-W/2)],[x,Y0+RH,C0[2]],[x,Y0+RH,C0[2]],[x,Y0+HW,Z(W/2)],'paper',mid)}
 for(const s of[-1,1])quad([X(-L/2-.6),Y0+HW-.3,Z(s*(W/2+.8))],[X(L/2+.6),Y0+HW-.3,Z(s*(W/2+.8))],[X(L/2+.6),Y0+RH,C0[2]],[X(-L/2-.6),Y0+RH,C0[2]],'dish',[C0[0],Y0,C0[2]]);
 /* 敞开的拱廊：墩柱、圆券与过梁 */
 const bay=L/6;
 for(let i=0;i<=6;i++)box(X(-L/2+i*bay),Y0+HW/2,Z(W/2),1.8,HW,1.4,'paper');
 box(C0[0],Y0+HW-1.4,Z(W/2),L,2.8,1.4,'paper');
 for(let i=0;i<6;i++){const cx=X(-L/2+(i+.5)*bay),r=bay/2-.9;let pv=null;for(let k=0;k<=8;k++){const a=k/8*Math.PI,p=[cx-Math.cos(a)*r,Y0+9.4+Math.sin(a)*r,Z(W/2)];if(pv)beam(pv,p,1,'paper');pv=p}}
 /* 西端半圆龛，东端钟形山墙 */
 loft(lift(X(-L/2),Y0,C0[2]),[[0,8.5,8.5],[HW-1,8.5,8.5]],12,'paper',{cap:false});loft(lift(X(-L/2),Y0,C0[2]),[[HW-1,9.2,9.2],[HW+5,.4,.4]],12,'dish');
 box(X(L/2),Y0+RH+2.6,C0[2],1,5.2,5,'paper');box(X(L/2),Y0+RH+3,C0[2],1.1,2.4,2,'night');
 /* 内部：深色地面，玻璃房只靠发光边线成图，两排机柜带指示灯 */
 box(C0[0],Y0+.65,C0[2],L-1,.1,W-1,'night');
 const gx0=X(-19),gx1=X(17),gz0=Z(-6.5),gz1=Z(6.5),gy0=Y0+.7,gy1=Y0+10.6,c8=[[gx0,gz0],[gx1,gz0],[gx1,gz1],[gx0,gz1]];
 for(let i=0;i<4;i++){const a=c8[i],b=c8[(i+1)%4];beam([a[0],gy0,a[1]],[b[0],gy0,b[1]],.26,'glow');beam([a[0],gy1,a[1]],[b[0],gy1,b[1]],.26,'glow');beam([a[0],gy0,a[1]],[a[0],gy1,a[1]],.26,'glow')}
 for(const zr of[-3.4,1.8])for(let i=0;i<12;i++){const x=X(-17.4+i*2.95);box(x,Y0+.7+3.9,Z(zr),2.4,7.8,2,'night');
   for(let q=0;q<4;q++)box(x-.4+(i*7+q*3)%5*.2,Y0+1.8+((i*5+q*11+(zr>0?2:0))%11)*.55,Z(zr+1.02),1.3,.18,.05,'glow')}
}
/* 十七片高混凝土 U 形墙围出一个鱼形平面，墙与墙之间是通高玻璃。 */
{const K0=[-95,0,30],LX=22,LZ=14,N=17,GAP=.16,
 pl=t=>[K0[0]+LX*Math.cos(t),K0[2]+LZ*Math.sin(t)*(1-.28*Math.cos(t))],ctr=y=>[K0[0],y,K0[2]],RF=41;
 for(let k=0;k<N;k++){
   const t0=(k+GAP/2)/N*6.2832,t1=(k+1-GAP/2)/N*6.2832,h=RF+2+6*Math.sin(k*2.1)**2,S=5,pts=[];
   for(let q=0;q<=S;q++){const t=t0+(t1-t0)*q/S,p=pl(t),dd=2*Math.sin(Math.PI*q/S),c=[K0[0]-p[0],K0[2]-p[1]],l=Math.hypot(c[0],c[1]);pts.push([p[0]+c[0]/l*dd,p[1]+c[1]/l*dd])}
   for(let q=0;q<S;q++){const a=pts[q],b=pts[q+1];quad([a[0],0,a[1]],[b[0],0,b[1]],[b[0],h,b[1]],[a[0],h,a[1]],'paper',ctr(h/2))}
   const g0=pl(t1),g1=pl((k+1+GAP/2)/N*6.2832);
   quad([g0[0],0,g0[1]],[g1[0],0,g1[1]],[g1[0],RF,g1[1]],[g0[0],RF,g0[1]],'glow');
 }
 for(let k=0;k<N*2;k++){const a=pl(k/N/2*6.2832),b=pl((k+1)/N/2*6.2832);quad(ctr(RF),[a[0],RF,a[1]],[b[0],RF,b[1]],ctr(RF),'shade',ctr(0))}
}
/* 八角形教堂：八棱体上接高高的八坡屋顶，再收成一座小灯亭。 */
{const B0=7,M0=[8,0,-50],R=12.5,T=lift(M0[0],B0,M0[2]),o=Math.PI/8,ap=R*Math.cos(o);
 loft(lift(M0[0],0,M0[2]),[[0,R+3,R+3],[B0,R+3,R+3]],8,'shade',{twist:o});
 loft(T,[[0,R,R],[14,R,R]],8,'paper',{twist:o,cap:false});
 loft(T,[[14,R+.7,R+.7],[15.2,R+.7,R+.7]],8,'shade',{twist:o,cap:false});
 loft(T,[[15.2,R*.95,R*.95],[19.5,R*.84,R*.84],[23.5,R*.6,R*.6],[26.2,R*.3,R*.3],[26.8,R*.2,R*.2]],8,'dish',{twist:o});
 loft(T,[[26.8,2.6,2.6],[31.5,2.6,2.6]],8,'paper',{twist:o,cap:false});
 loft(T,[[31.5,3.1,3.1],[32.3,3.1,3.1],[35.5,.25,.25]],8,'dish',{twist:o});
 beam([M0[0],B0+35,M0[2]],[M0[0],B0+38.5,M0[2]],.18,'ink');
 for(let i=0;i<8;i++){const a=i/8*6.2832,cx=M0[0]+Math.cos(a)*(ap+.08),cz=M0[2]+Math.sin(a)*(ap+.08);
   if(i==1){box(M0[0]+Math.cos(a)*(ap+.5),B0+4.5,M0[2]+Math.sin(a)*(ap+.5),1,9,5,'shade',-a);box(M0[0]+Math.cos(a)*(ap+.6),B0+3.4,M0[2]+Math.sin(a)*(ap+.6),1,6.8,2.6,'night',-a)}
   else box(cx,B0+7.5,cz,.25,7.5,2.2,'night',-a);
   const lx=M0[0]+Math.cos(a)*(2.6*Math.cos(o)+.05),lz=M0[2]+Math.sin(a)*(2.6*Math.cos(o)+.05);box(lx,B0+29.2,lz,.12,2.6,1,'night',-a)}
}

/* 首屏左侧的一排体块：各自带台基，朝向镜头。
   LF 给出一个局部坐标系（局部 +z 朝镜头），b() 是该坐标系里的 box()。 */
const LF=(cx,cz)=>{const ry=Math.atan2(101-cx,102-cz),c=Math.cos(ry),s=Math.sin(ry);
  return{p:(x,y,z)=>[cx+x*c+z*s,y,cz-x*s+z*c],b:(x,y,z,w,h,d,m)=>box(cx+x*c+z*s,y,cz-x*s+z*c,w,h,d,m,ry),ry}};
const roof=(p,x0,x1,z0,z1,y0,y1,m)=>{const xm=(x0+x1)/2,o=p(xm,y0-2,(z0+z1)/2);
  quad(p(x0,y0,z0),p(x0,y0,z1),p(xm,y1,z1),p(xm,y1,z0),m,o);quad(p(x1,y0,z0),p(x1,y0,z1),p(xm,y1,z1),p(xm,y1,z0),m,o);
  quad(p(x0,y0,z1),p(x1,y0,z1),p(xm,y1,z1),p(xm,y1,z1),'paper',o);quad(p(x0,y0,z0),p(x1,y0,z0),p(xm,y1,z0),p(xm,y1,z0),'paper',o)};
/* 高塔教堂：塔身两侧的柱翼逐级跌落，背后是素净的中殿。 */
{const{p,b}=LF(-114,124);
 b(0,1,-15,50,2,44,'shade');b(0,33,0,9,62,9,'paper');
 hull([p(-4.5,64,-4.5),p(4.5,64,-4.5),p(4.5,64,4.5),p(-4.5,64,4.5),p(-1.7,75,-1.7),p(1.7,75,-1.7),p(1.7,75,1.7),p(-1.7,75,1.7)],'paper');
 hull([p(-1.7,75,-1.7),p(1.7,75,-1.7),p(1.7,75,1.7),p(-1.7,75,1.7),p(-.12,85,-.12),p(.12,85,-.12),p(.12,85,.12),p(-.12,85,.12)],'dish');
 b(0,87,0,.3,4.4,.3,'ink');/* 塔尖只留一根细针：原横向短杆与它构成十字，2026-11-17 移除 */
 for(const y of[50,56])b(0,y,4.6,2.6,4.4,.2,'night');
 for(const s of[-1,1])for(let k=0;k<7;k++){const h=54-k*7.2;b(s*(6+k*2.5),2+h/2,0,2.4,h,7-k*.4,k%2?'shade':'paper')}
 b(0,11,-20,16,18,31,'paper');roof(p,-8,8,-35.5,-4.5,20,28,'dish');b(0,7,4.6,2.8,9,.2,'night')}
/* 阶梯山墙教堂：正面是一排高低递变的竖向砖肋，像管风琴。 */
{const{p,b}=LF(-100,64);
 b(0,1,-14,28,2,38,'shade');
 for(let k=-7;k<=7;k++){const h=46-Math.abs(k)*4.2,e=k%2==0;b(k*1.5,2+h/2,e?0:-.5,1.5,h,e?3:2,e?'paper':'shade')}
 b(0,13,-17,17,22,28,'paper');roof(p,-8.5,8.5,-31,-3,24,35,'dish');b(0,7.5,1.6,3,11,.2,'night')}
/* 圆形图书馆：书库圆筒从低矮的方形基座里升起来。 */
{const{p,b}=LF(-56,96),C=p(0,0,0);
 b(0,1,0,36,2,36,'shade');
 b(0,8,12,30,12,6,'paper');b(0,8,-12,30,12,6,'paper');b(12,8,0,6,12,18,'paper');b(-12,8,0,6,12,18,'paper');
 loft(lift(C[0],0,C[2]),[[2,9.5,9.5],[34,9.5,9.5]],36,'paper',{capMat:'shade'});
 for(const y of[25,30.5])for(let i=0;i<28;i++){const a=i/28*6.2832;box(C[0]+Math.cos(a)*9.6,y,C[2]+Math.sin(a)*9.6,1.1,3.4,.25,'night',Math.atan2(-Math.cos(a),-Math.sin(a)))}
 b(0,7,15.1,3.6,9,.2,'night')}
/* 四堵墩窗墙在四角互不相接，围着一个混凝土核心筒。 */
{const{b}=LF(-44,136),H=26;
 b(0,1,0,28,2,28,'shade');b(0,14,0,16,24,16,'shade');b(0,2+H+.3,0,22,.6,22,'paper');
 for(const[sx,sz]of[[0,1],[0,-1],[1,0],[-1,0]]){const al=sz!=0;
   if(al)b(0,2+H/2,sz*10.5,18,H,1.4,'paper');else b(sx*10.5,2+H/2,0,1.4,H,18,'paper');
   for(let c=0;c<4;c++)for(let r=0;r<4;r++){const u=-6.75+c*4.5,y=5+r*5.6,o=10.5+.72,hh=r==3?4.6:3.6;
     if(al)b(u,y,sz*o,2.6,hh,.1,'night');else b(sx*o,y,u,.1,hh,2.6,'night')}}}
/* 首屏右侧：悬在空中的几何体——两个线框多面体缓慢自转，还有一个以棱着地的立方体。 */
{const wire=(c,P,E,t,w1,ax)=>{const v0=VERT.length;for(const[i,j]of E)beam(add(c,P[i]),add(c,P[j]),t,'band');turns(v0,c,ax,w1)};
 const O=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(v=>mul(v,8)),OE=[];
 for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)if(Math.abs(dot(O[i],O[j]))<1e-6)OE.push([i,j]);
 const g=(1+Math.sqrt(5))/2,I=[];for(const a of[-1,1])for(const c of[-1,1]){I.push([0,a,c*g],[a,c*g,0],[c*g,0,a])}
 const IS=I.map(v=>mul(v,4.2)),IE=[];for(let i=0;i<12;i++)for(let j=i+1;j<12;j++)if(Math.abs(Math.hypot(...sub(I[i],I[j]))-2)<1e-6)IE.push([i,j]);
 wire([-4,86,-106],O,OE,.42,.32,norm([.3,1,.2]));
 wire([1,116,-125],IS,IE,.36,-.26,norm([-.2,1,.3]));
 /* 菱形立方八面体：8 个三角面 + 18 个正方面，48 条棱等长；
   顶点是 (+-1, +-1, +-(1+sqrt 2)) 的全部排列。 */
 {const k=1+Math.SQRT2,R=[];for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1])for(const[a,b,c]of[[1,1,k],[1,k,1],[k,1,1]])R.push([sx*a,sy*b,sz*c]);
  const RS=R.map(v=>mul(v,3.2)),RE=[];for(let i=0;i<24;i++)for(let j=i+1;j<24;j++)if(Math.abs(Math.hypot(...sub(R[i],R[j]))-2)<1e-6)RE.push([i,j]);
  wire([-14.5,69.5,-80],RS,RE,.34,.24,norm([.4,1,-.25]))}
 /* 以棱着地的立方体，支在一根细杆上 */
 const u1=norm([1,-1,0]),u2=norm([1,1,-2]),u3=norm([1,1,1]),C=[-58,30,-128],s=6,cn=[];
 for(const z of[-1,1])for(const[x,y]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const q=[x,y,z];cn.push(add(C,mul(add(add(mul(u1,dot(q,u1)),mul([0,1,0],dot(q,u3))),mul([0,0,1],dot(q,u2))),s)))}
 {const v0=VERT.length;hull(cn,'paper');turns(v0,C,[0,1,0],.28)}beam([C[0],0,C[2]],[C[0],C[1]-s*Math.sqrt(3)+.3,C[2]],.5,'ink');loft(lift(C[0],0,C[2]),[[0,4,4],[1.5,4,4]],20,'shade')}

/* 没有地面：每个体块都立在自己的台基上，浮在暗处。 */

/* ===== 内殿尽头的悬浮多面体核心（方案 B，2026-11-17）=====
   甬道尽头、祭坛台阶之前，正对最后一段镜头。三个部件各占一个 SPIN 槽：
   核心只绕竖轴慢转；两道星轨环一横一斜，各自绕不同的轴反向转。
   材质走自发光批次（nf=-5），所以两套主题下都是琥珀金，不会被暗夜系数压暗。 */
{
  const CORE=CT(0,4.75,21.4);
  let v0=VERT.length;
  icosa(CORE,1.78,'core');
  /* 棱线：20 个面只靠 CPU 三档取色时，正面十来片会落在同一档、读成一个平面。
     叠 30 条细棱（同属自发光批次，暗态也不会消失）才有"精密多面体"的切面感。
     和面一起从 v0 起算，最后一次性交给同一个自转槽。 */
  {
    const g=(1+Math.sqrt(5))/2,k=1.78/Math.sqrt(1+g*g);
    const Q=[[-1,g,0],[1,g,0],[-1,-g,0],[1,-g,0],[0,-1,g],[0,1,g],[0,-1,-g],[0,1,-g],[g,0,-1],[g,0,1],[-g,0,-1],[-g,0,1]]
      .map(v=>[CORE[0]+v[0]*k,CORE[1]+v[1]*k,CORE[2]+v[2]*k]);
    for(let i=0;i<12;i++)for(let j=i+1;j<12;j++){
      const d=Math.hypot(Q[i][0]-Q[j][0],Q[i][1]-Q[j][1],Q[i][2]-Q[j][2]);
      if(Math.abs(d-2*k)<1e-6)beam(Q[i],Q[j],.055,'edge');
    }
  }
  turns(v0,CORE,[0,1,0],.34,true);

  v0=VERT.length;hoop(CORE,2.72,norm([1,.18,.12]),.075,'orbit',64);turns(v0,CORE,[0,1,0],.58,true);

  v0=VERT.length;hoop(CORE,3.14,[0,1,0],.065,'orbit',64);turns(v0,CORE,norm([1,0,.15]),-.26,true);

  /* 底光：这套着色器没有光照与混合，只能用几何模拟。
     试过地面发光环（被甬道亮带盖住）和核心下方的水平光板（这台相机几乎与它共面，只剩一条线），
     都不成立，所以撤掉——焦点交给核心自身的自发光金面 + 两道星轨环。 */
}

/* 每个面拆成六个顶点（a b c a c d，其中两个重复），去重后按索引绘制，顶点着色器只跑一遍 */
const STRIDE=32,COUNT=VERT.length/8;
const {verts,IDX}=(()=>{
  const n=COUNT,o=new Float32Array(VERT.length),ix=new Uint32Array(n);let u=0;
  const same=(i,j)=>{for(let k=0;k<8;k++)if(VERT[i*8+k]!==VERT[j*8+k])return false;return true};
  for(let i=0;i<n;i++){const k=i%6;
    if(n%6==0&&k==3&&same(i,i-3))ix[i]=ix[i-3];
    else if(n%6==0&&k==4&&same(i,i-2))ix[i]=ix[i-2];
    else{for(let q=0;q<8;q++)o[u*8+q]=VERT[i*8+q];ix[i]=u++}}
  VERT.length=0;
  if(u<=65535)return{verts:o.slice(0,u*8),IDX:Uint16Array.from(ix)};
  if(gl.getExtension('OES_element_index_uint'))return{verts:o.slice(0,u*8),IDX:ix};
  const flat=new Float32Array(n*8);for(let i=0;i<n;i++)flat.set(o.subarray(ix[i]*8,ix[i]*8+8),i*8);return{verts:flat,IDX:null};
})();
/* 雾向天空色 B 收敛。s.y 的标记：-1 不着色，-2 太阳晕（仅浅色），-3 海面（自有更长雾距），-4 发光（取 GC 色），-5 自发光且有明暗。 */
const SCENE_VS=`attribute vec3 p;attribute vec3 c;attribute vec2 s;uniform mat4 M;uniform vec3 E,B,HC,GC,N,DM;uniform float T,HV;varying vec3 C;
void main(){vec3 q=p;float sy=s.y;if(sy<-19.5)sy=-sy;if(sy>19.5&&sy<40.){vec3 c0,n0;float w1,w2;${SPIN.map((d,i)=>`${i?'else ':''}if(sy<${(20.5+i).toFixed(1)}){c0=vec3(${d.c.map(v=>v.toFixed(4))});n0=vec3(${d.n.map(v=>v.toFixed(4))});w1=${d.w1.toFixed(3)};w2=${d.w2.toFixed(3)};}`).join('')}vec3 v=q-c0;float a=T*w1,ca=cos(a),sa=sin(a);v=v*ca+cross(n0,v)*sa+n0*dot(n0,v)*(1.-ca);q=c0+v;float g=T*w2,cg=cos(g),sg=sin(g);q=vec3(q.x*cg-q.z*sg,q.y,q.x*sg+q.z*cg);}else if(s.y>40.){float t=.34*sin(T*1.7);q+=vec3(${SWING[0].toFixed(4)},0.,${SWING[2].toFixed(4)})*(s.x*sin(t));q.y+=s.x*(1.-cos(t));}else if(s.x>0.){float a=T*1.15+s.y+p.y*.55;q.x+=sin(a)*s.x*.9;q.z+=cos(a*.8)*s.x*.55;}
float d=distance(q,E),f=clamp(1.3-d/380.,.25,1.)*mix(.86,1.,clamp(q.y/30.,0.,1.));vec3 k=c*N*DM;
if(s.y<-4.5){f=1.;k=c;}else if(s.y<-3.5){f=1.;k=GC;}else if(s.y<-2.5){f=clamp(1.2-d/560.,0.,1.)*mix(.8,1.,clamp((q.y+4.)/14.,0.,1.));}else if(s.y<-1.5){f=1.;k=HC;}else if(s.y<0.&&s.y>-1.5){f=1.;k=c;}
C=mix(B,k,f);gl_Position=M*vec4(q,1.);if(s.y<-1.5&&s.y>-2.5&&HV<.5)gl_Position=vec4(2.,2.,2.,1.);}`;
const HP=`#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
/* 纸面颗粒、扫描线、一条缓慢滚过的亮带与极少的热点像素：噪点在，内容永远清晰。 */
const SCENE_FS=HP+`varying vec3 C;uniform float F;
void main(){vec2 x=gl_FragCoord.xy,g=floor(x/1.5);float n=fract(52.9829189*fract(dot(g,vec2(.06711056,.00583715))));
vec3 c=C+(n-.5)*.045;c*=.95+.05*step(.5,fract(x.y/3.));
c+=.04*smoothstep(.94,1.,fract(x.y*.0007-F*.05));
if(fract(sin(dot(floor(x/2.)+floor(F*9.),vec2(12.9898,78.233)))*43758.5453)>.9994)c=vec3(1.);
gl_FragColor=vec4(c,1.);}`;
function link(g,vs,fs){
  const pr=g.createProgram(),sh=(t,s)=>{const o=g.createShader(t);g.shaderSource(o,s);g.compileShader(o);g.attachShader(pr,o)};
  sh(g.VERTEX_SHADER,vs);sh(g.FRAGMENT_SHADER,fs);g.linkProgram(pr);return pr;
}
function sceneIn(g){
  const pr=link(g,SCENE_VS,SCENE_FS),buf=g.createBuffer(),ib=IDX&&g.createBuffer(),IT=IDX instanceof Uint16Array?g.UNSIGNED_SHORT:g.UNSIGNED_INT;
  g.bindBuffer(g.ARRAY_BUFFER,buf);g.bufferData(g.ARRAY_BUFFER,verts,g.STATIC_DRAW);
  if(ib){g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,ib);g.bufferData(g.ELEMENT_ARRAY_BUFFER,IDX,g.STATIC_DRAW)}
  const at=[['p',3,0],['c',3,12],['s',2,24]].map(([n,sz,o])=>[g.getAttribLocation(pr,n),sz,o]);
  const u={M:g.getUniformLocation(pr,'M'),E:g.getUniformLocation(pr,'E'),T:g.getUniformLocation(pr,'T'),F:g.getUniformLocation(pr,'F')};for(const n of['B','HC','GC','N','HV','DM'])u[n]=g.getUniformLocation(pr,n);
  return{use(){g.useProgram(pr);g.bindBuffer(g.ARRAY_BUFFER,buf);at.forEach(([l,sz,o])=>{g.enableVertexAttribArray(l);g.vertexAttribPointer(l,sz,g.FLOAT,false,STRIDE,o)})},
    draw(m,e,t){g.uniform3fv(u.B,THM.K);g.uniform3fv(u.HC,THM.H);g.uniform3fv(u.GC,THM.G);g.uniform3fv(u.N,THM.N);g.uniform3fv(u.DM,THM.DM);g.uniform1f(u.HV,THM.dark?0:1);g.uniformMatrix4fv(u.M,false,m);g.uniform3f(u.E,e[0],e[1],e[2]);g.uniform1f(u.T,t);g.uniform1f(u.F,t);if(ib){g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,ib);g.drawElements(g.TRIANGLES,COUNT,IT,0)}else g.drawArrays(g.TRIANGLES,0,COUNT)},
    /* 同一顶点布局的一小段缓冲，沿用上一次 draw 设好的 uniform。 */
    more(b,n){g.useProgram(pr);g.bindBuffer(g.ARRAY_BUFFER,b);at.forEach(([l,sz,o])=>g.vertexAttribPointer(l,sz,g.FLOAT,false,STRIDE,o));g.drawArrays(g.TRIANGLES,0,n);this.use()}};
}
const scene=sceneIn(gl);scene.use();

const inCH=(x,y,z)=>CT(x,y,z);
const HERO_E=[101,17,102],HERO_EP=[69,15.6,89],HERO_FOV=56,HERO_ROLL=-.1;
const STOP0=[HERO_E,[-30,50,12],40];
/* 无论窗口什么比例，太阳都停在画面里的固定位置：宽画幅时相机后退、视野更宽并略微转头，
   把塔与太阳推到右侧，左侧留空给标题；竖画幅保留自己更近的机位。 */
function placeSun(){
  const W=cv.width/scale||innerWidth,H=cv.height/scale||innerHeight;if(!W||!H)return;
  const port=W<H;STOP0[2]=port?46:HERO_FOV;
  const e=port?HERO_EP:HERO_E,fov=port?Math.min(82,STOP0[2]*1.45):STOP0[2],tn=Math.tan(fov*Math.PI/360),sx=port?.84:.87,sy0=port?.4:.3;
  STOP0[0]=e;STOP0[1]=aimSun(e,sub(STOP0[1],STOP0[0]),(2*sx-1)*tn*W/H,(1-2*sy0)*tn);
}
/* 转动相机（不带翻滚），直到太阳投影到切空间的 (tx, ty)。 */
function aimSun(e,f0,tx,ty){
  let f=norm(f0);
  for(let i=0;i<6;i++){
    const r=norm(cross(f,[0,1,0])),u=cross(r,f),d=sub(SUN,e),z=dot(d,f);
    f=norm(add(f,add(mul(r,dot(d,r)/z-tx),mul(u,dot(d,u)/z-ty))));
  }
  return add(e,mul(f,100));
}
const STOPS=[
  STOP0,
  [[62,20,84],[-6,46,-4],46],
  [[24,27,42],[-4,54,-6],60],
  [[-26,24,56],[-62,30,-14],46],
  [inCH(0,9,-40),inCH(0,5,10),40],
  [inCH(0,3.5,-2.5),inCH(0,4.6,CL),44],
  [inCH(0,3.4,7.5),inCH(0,ARM-.4,CL),50],
];
const cr=(a,b,c,d,t)=>.5*(2*b+(c-a)*t+(2*a-5*b+4*c-d)*t*t+(3*b-a-3*c+d)*t*t*t);
const sample=(u,g)=>{const N=STOPS.length-1,x=Math.min(u,.9999)*N,i=Math.floor(x),t=x-i,S=k=>g(STOPS[Math.max(0,Math.min(N,k))]);
  const a=S(i-1),b=S(i),c=S(i+1),d=S(i+2);return Array.isArray(b)?b.map((_,k)=>cr(a[k],b[k],c[k],d[k],t)):cr(a,b,c,d,t)};
const M=new Float32Array(16);
function camera(u,w,h){
  STOPS[0]=STOP0;
  const e=sample(u,s=>s[0]),tg=sample(u,s=>s[1]);let fov=sample(u,s=>s[2]);
  if(w<h)fov=Math.min(82,fov*1.45);
  /* 首屏那点倾斜：到第二档就归零 */
  const k=Math.max(0,1-u*(STOPS.length-1));roll=w>h?HERO_ROLL*k*k*(3-2*k):0;
  if(intro<1){
    /* 入场：把首屏机位整体抬高再落到原位，缓动两端都静止。 */
    const t=intro,y=SKY[0]*(1-t*t*t*(t*(t*6-15)+10));
    return look([e[0],e[1]+y,e[2]],[tg[0],tg[1]+y,tg[2]],fov,w,h);
  }
  return look(e,tg,fov,w,h);
}
let roll=0,intro=0,held=false,warm=0,wt=0,glon=false,fa;
/* 开场字形闪出结束之后为真。 */
const flashed=()=>{if(fa===undefined)fa=(document.getAnimations?document.getAnimations():[]).find(a=>a.animationName=='flash')||null;return !fa||fa.playState!='running'||fa.currentTime==null||fa.currentTime>=1390||performance.now()>9000};const INTRO=2.4,SKY=[90];
function look(e,tg,fov,w,h){
  const f=norm(sub(tg,e)),r0=norm(cross(f,[0,1,0])),u0=cross(r0,f),cs=Math.cos(roll),sn=Math.sin(roll),
    r=add(mul(r0,cs),mul(u0,sn)),up=sub(mul(u0,cs),mul(r0,sn)),n=1/Math.tan(fov*Math.PI/360),near=.4,far=800,asp=w/h;
  const Pa=(far+near)/(near-far),Pb=2*far*near/(near-far),fe=dot(f,e);
  M[0]=r[0]*n/asp;M[1]=up[0]*n;M[2]=-f[0]*Pa;M[3]=f[0];
  M[4]=r[1]*n/asp;M[5]=up[1]*n;M[6]=-f[1]*Pa;M[7]=f[1];
  M[8]=r[2]*n/asp;M[9]=up[2]*n;M[10]=-f[2]*Pa;M[11]=f[2];
  M[12]=-dot(r,e)*n/asp;M[13]=-dot(up,e)*n;M[14]=Pa*fe+Pb;M[15]=-fe;
  return e;
}


  // ================= 胶水：绑定我站的画布与滚动 =================
  var scale = Math.min(window.devicePixelRatio || 1, 2);
  var cssW = 0;
  var cssH = 0;
  var dirty = true;

  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (w === cssW && h === cssH) return;
    cssW = w;
    cssH = h;
    cv.width = Math.round(w * scale);
    cv.height = Math.round(h * scale);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    gl.viewport(0, 0, cv.width, cv.height);
    placeSun();
    dirty = true;
  }

  var p = 0;
  var target = 0;
  var t = 0;
  var last = 0;
  var raf = 0;

  /* 减少动态效果时的固定机位：锁在第一屏（p = 0），与正常模式的首帧完全一致。
     滚动不再换机位——静态帧就是静态帧，否则「相机跟着滚动推进」只是换了种方式做动效。 */
  var REDUCE_P = 0;

  function readProgress() {
    var max = root.scrollHeight - window.innerHeight;
    target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }

  function draw() {
    var w = cv.width / scale || window.innerWidth;
    var h = cv.height / scale || window.innerHeight;
    var e = camera(p, w, h);
    gl.clearColor(THM.K[0], THM.K[1], THM.K[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    scene.draw(M, e, t);
  }

  function frame(now) {
    var dt = last ? Math.min(64, now - last) : 16;
    last = now;
    t += dt * 0.001;
    p += (target - p) * 0.08;
    draw();
    raf = window.requestAnimationFrame(frame);
  }

  /* 唯一的启动入口：reduce 下直接拒绝启动（issue #20 / E-190）。 */
  function start() {
    if (RM || raf) return false;
    last = 0;
    raf = window.requestAnimationFrame(frame);
    return true;
  }

  function stop() {
    if (!raf) return false;
    window.cancelAnimationFrame(raf);
    raf = 0;
    return true;
  }

  /* reduce 的静态帧：时间轴归零、机位固定，画一次就完事。 */
  function paintStill() {
    p = REDUCE_P;
    t = 0;
    draw();
  }

  // 原站的入场动画把相机放在 90 米高空再放下来；这里没有那段动画，直接锁定落地状态，
  // 否则 intro 恒为 0，相机永远停在天上，只看得到塔顶的地球仪。
  // 原站的暗色是「黑底 + 同一套蓝白建筑」，靠 THM 切换背景与雾色；顶点色不重建。
  // 主题：浅色是暖纸白天空，深色是黑曜石夜色。
  // 深色不能只把天空改黑——同一套顶点色会亮得刺眼；DM 把「非发光面」整体压暗，
  // 自发光材质（太阳、光柱、高光边、内殿核心）在着色器里走的是另外几条分支，
  // 不受 DM 影响，所以暗夜里仍会留着一道亮边与一束光。
  function applyTheme() {
    var r = document.documentElement;
    var u = r.getAttribute('data-user-color-scheme');
    var sd = r.getAttribute('data-sun-scheme');
    var dark = u ? u === 'dark' : sd ? sd === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    THM.dark = dark;
    THM.K = dark ? [0.07, 0.063, 0.055] : [0.98, 0.965, 0.933];
    THM.N = dark ? [1, 1, 1] : [0.99, 0.972, 0.945];
    THM.H = dark ? [0.06, 0.05, 0.045] : hx(P.ui.panel);
    THM.G = dark ? [1, 0.95, 0.87] : hx('#f2d9b4');
    THM.DM = dark ? [0.52, 0.46, 0.4] : [1, 1, 1];
    dirty = true;
  }
  applyTheme();
  document.addEventListener('kasai:sun-scheme', function () { applyTheme(); draw(); });
  try {
    new MutationObserver(function () { applyTheme(); draw(); }).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-user-color-scheme', 'data-sun-scheme'],
    });
  } catch (e) { /* 老浏览器忽略 */ }

  intro = 1;
  roll = 0;
  resize();
  placeSun();
  readProgress();
  window.addEventListener('resize', function () { resize(); draw(); }, { passive: true });
  // reduce 下滚动只更新 target，不换机位：静态帧就是静态帧，
  // 否则「相机跟着滚动推进」等于换个方式做动效，前庭障碍用户照样难受。
  window.addEventListener('scroll', readProgress, { passive: true });

  if (RM) {
    paintStill();
  } else {
    p = target;
    start();
  }

  // 进后台停掉循环，回来再续；reduce 下本来就没有循环，只需补一帧。
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stop();
      return;
    }
    if (RM) paintStill();
    else start();
  });
  })();

  // ================= 2. 导航：只在第二屏浮现完整胶囊 =================

  (function nav() {
    var desk = doc.getElementById('desk');
    var body = doc.body;
    if (!desk || !body) return;
    var queued = false;

    function sync() {
      queued = false;
      var r = desk.getBoundingClientRect();
      // 视口中线落在第二屏内 → 展开导航
      var mid = (window.innerHeight || 0) * 0.5;
      var on = r.top <= mid && r.bottom >= mid;
      body.classList.toggle('nav-desk', on);
    }

    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(sync);
    }, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  })();

  // ================= 3. 浮层 =================

  (function modal() {
    var dlg = doc.getElementById('sd-modal');
    if (!dlg || typeof dlg.showModal !== 'function') return;

    var elKicker = dlg.querySelector('[data-sd-kicker]');
    var elTitle = dlg.querySelector('[data-sd-title]');
    var elBody = dlg.querySelector('[data-sd-body]');
    var elMore = dlg.querySelector('[data-sd-more]');
    var elClose = dlg.querySelector('[data-sd-close]');
    var opener = null;

    function fill(tpl) {
      if (!tpl) return false;
      elTitle.textContent = tpl.getAttribute('data-sd-name') || '';
      elBody.textContent = '';
      var frag = tpl.content ? tpl.content.cloneNode(true) : null;
      if (frag) elBody.appendChild(frag);

      var href = tpl.getAttribute('data-sd-href') || '';
      var label = tpl.getAttribute('data-sd-more') || '';
      if (href && label) {
        elMore.setAttribute('href', href);
        elMore.textContent = label;
        elMore.hidden = false;
      } else {
        elMore.removeAttribute('href');
        elMore.textContent = '';
        elMore.hidden = true;
      }
      if (elKicker) elKicker.textContent = tpl.getAttribute('data-sd-kicker') || (tpl.id === 'sd-tpl-wechat' ? '联系' : '造物');
      return true;
    }

    doc.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;

      if (target.closest('[data-sd-close]')) {
        ev.preventDefault();
        dlg.close();
        return;
      }

      var trigger = target.closest('[data-sd-open]');
      if (!trigger) return;
      var tpl = doc.getElementById('sd-tpl-' + trigger.getAttribute('data-sd-open'));
      if (!tpl) return;

      ev.preventDefault();
      opener = trigger;
      if (!fill(tpl)) return;
      dlg.showModal();
      if (elClose) {
        window.requestAnimationFrame(function () { elClose.focus(); });
      }
    });

    dlg.addEventListener('click', function (ev) {
      if (ev.target !== dlg) return;
      var r = dlg.getBoundingClientRect();
      var inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (!inside) dlg.close();
    });

    dlg.addEventListener('close', function () {
      if (opener && typeof opener.focus === 'function') opener.focus();
      opener = null;
    });
  })();

  // ================= 4. 落幕屏倒计时 =================

  (function feed() {
    var node = doc.getElementById('sd-feed');
    if (!node) return;
    var list;
    try {
      list = JSON.parse(node.textContent || '[]');
    } catch (e) {
      return;
    }
    if (!Array.isArray(list) || !list.length) return;

    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    function days(iso) {
      var q = String(iso).split('-');
      if (q.length !== 3) return null;
      var d = new Date(Number(q[0]), Number(q[1]) - 1, Number(q[2]));
      return Math.round((d - today) / 86400000);
    }

    var KIND = { 节气: 'term', 假期: 'holiday' };
    var seen = {};
    for (var i = 0; i < list.length; i += 1) {
      var ev = list[i];
      var slot = KIND[ev.k];
      if (!slot || seen[slot]) continue;
      var n = days(ev.d);
      if (n === null || n < 0) continue;
      var cell = doc.querySelector('[data-sd-feed="' + slot + '"]');
      if (!cell) continue;
      cell.textContent = String(n);
      seen[slot] = true;
    }
  })();

  // ================= 5. 桌面视窗：景深视差 + 抬头栏拖拽微调 =================

  (function deskMotion() {
    var desk = doc.getElementById('desk');
    if (!desk) return;
    var nodes = desk.querySelectorAll('.sd-win');
    if (!nodes.length) return;

    var mqDesktop = window.matchMedia('(min-width: 1024px)');
    var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    var items = [];
    var topZ = 10;
    var MAX_X = 260;
    var MAX_Y = 180;
    var PARALLAX_AMP = 20;

    function clamp(v, lo, hi) {
      return v < lo ? lo : v > hi ? hi : v;
    }

    function apply(it) {
      it.el.style.setProperty('--sd-tx', Math.round(it.dx) + 'px');
      it.el.style.setProperty('--sd-ty', (it.dy + it.py).toFixed(2) + 'px');
    }

    function resetAllOffsets() {
      for (var i = 0; i < items.length; i += 1) {
        items[i].dx = 0;
        items[i].dy = 0;
        items[i].py = 0;
        items[i].el.style.removeProperty('--sd-tx');
        items[i].el.style.removeProperty('--sd-ty');
        items[i].el.style.removeProperty('z-index');
      }
      topZ = 10;
    }

    for (var i = 0; i < nodes.length; i += 1) {
      (function (win) {
        var head = win.querySelector('.win-head');
        var depth = parseFloat(win.getAttribute('data-sd-depth') || '0') || 0;
        var it = { el: win, head: head, depth: depth, dx: 0, dy: 0, py: 0, resetTimer: 0 };
        items.push(it);

        win.addEventListener('pointerdown', function () {
          if (!mqDesktop.matches) return;
          topZ += 1;
          win.style.zIndex = String(topZ);
        });

        if (!head) return;

        var drag = null;

        head.addEventListener('pointerdown', function (ev) {
          if (!mqDesktop.matches || ev.button !== 0) return;
          if (it.resetTimer) {
            window.clearTimeout(it.resetTimer);
            it.resetTimer = 0;
            win.classList.remove('is-resetting');
          }
          ev.preventDefault();
          topZ += 1;
          win.style.zIndex = String(topZ);
          win.classList.add('is-dragging');
          drag = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, ox: it.dx, oy: it.dy };
          if (head.setPointerCapture) {
            try { head.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
          }
        });

        head.addEventListener('pointermove', function (ev) {
          if (!drag || ev.pointerId !== drag.id) return;
          var nx = clamp(drag.ox + (ev.clientX - drag.sx), -MAX_X, MAX_X);
          var ny = clamp(drag.oy + (ev.clientY - drag.sy), -MAX_Y, MAX_Y);
          it.dx = nx;
          it.dy = ny;
          apply(it);
        });

        function endDrag(ev) {
          if (!drag || ev.pointerId !== drag.id) return;
          if (head.releasePointerCapture) {
            try { head.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
          }
          drag = null;
          win.classList.remove('is-dragging');
        }

        head.addEventListener('pointerup', endDrag);
        head.addEventListener('pointercancel', endDrag);

        head.addEventListener('dblclick', function () {
          if (!mqDesktop.matches) return;
          if (it.dx === 0 && it.dy === 0) return;
          it.dx = 0;
          it.dy = 0;
          win.classList.add('is-resetting');
          apply(it);
          if (it.resetTimer) window.clearTimeout(it.resetTimer);
          it.resetTimer = window.setTimeout(function () {
            win.classList.remove('is-resetting');
            it.resetTimer = 0;
          }, 340);
        });
      })(nodes[i]);
    }

    var queued = false;

    function syncParallax() {
      queued = false;
      if (!mqDesktop.matches) {
        resetAllOffsets();
        return;
      }
      if (mqReduce.matches) {
        for (var j = 0; j < items.length; j += 1) {
          if (items[j].py !== 0) {
            items[j].py = 0;
            apply(items[j]);
          }
        }
        return;
      }
      var r = desk.getBoundingClientRect();
      var vh = window.innerHeight || 1;
      var center = r.top + r.height * 0.5;
      var norm = clamp((center - vh * 0.5) / (vh * 0.85), -1, 1);
      for (var k = 0; k < items.length; k += 1) {
        items[k].py = items[k].depth * norm * PARALLAX_AMP;
        apply(items[k]);
      }
    }

    function schedule() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(syncParallax);
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    if (mqDesktop.addEventListener) mqDesktop.addEventListener('change', schedule);
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', schedule);
    syncParallax();
  })();
})();
