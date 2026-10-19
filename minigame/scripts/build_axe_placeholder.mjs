// Procedural low-poly wooden-handle axe placeholder -> axe.gltf + axe.bin + axe_baseColor.jpg + axe_orm.png
import fs from 'node:fs';
import sharp from 'sharp';
const OUT = process.argv[2] || '/workspace/axe-placeholder';
fs.mkdirSync(OUT, { recursive: true });

// ---------- helpers ----------
const lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0));return t*t*(3-2*t);};
function table(xs, ys){ // monotone-ish catmull-rom interpolation over sorted xs
  return (x)=>{ if(x<=xs[0])return ys[0]; const n=xs.length; if(x>=xs[n-1])return ys[n-1];
    let i=0; while(x>xs[i+1])i++; const t=(x-xs[i])/(xs[i+1]-xs[i]);
    const p0=ys[Math.max(0,i-1)],p1=ys[i],p2=ys[i+1],p3=ys[Math.min(n-1,i+2)];
    const m1=(p2-p0)/2*0.5, m2=(p3-p1)/2*0.5; // tension 0.5 to avoid overshoot
    const t2=t*t,t3=t2*t; return (2*t3-3*t2+1)*p1+(t3-2*t2+t)*m1+(-2*t3+3*t2)*p2+(t3-t2)*m2; };
}
// value noise 3D
const PERM=new Uint8Array(512);{let s=1337;const p=[...Array(256).keys()];for(let i=255;i>0;i--){s=(s*16807)%2147483647;const j=s%(i+1);[p[i],p[j]]=[p[j],p[i]];}for(let i=0;i<512;i++)PERM[i]=p[i&255];}
const hash=(x,y,z)=>PERM[(PERM[(PERM[x&255]+y)&255]+z)&255]/255;
function vnoise(x,y,z){const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);const xf=x-xi,yf=y-yi,zf=z-zi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf);
  const c=(a,b,d)=>hash(xi+a,yi+b,zi+d);
  return lerp(lerp(lerp(c(0,0,0),c(1,0,0),u),lerp(c(0,1,0),c(1,1,0),u),v),lerp(lerp(c(0,0,1),c(1,0,1),u),lerp(c(0,1,1),c(1,1,1),u),v),w);}
const fbm=(x,y,z,o=4)=>{let a=0,f=1,amp=0.5,s=0;for(let i=0;i<o;i++){a+=vnoise(x*f,y*f,z*f)*amp;s+=amp;f*=2.03;amp*=0.5;}return a/s;};

// ---------- mesh accumulation ----------
const P=[],N=[],UV=[],ATTR=[],IDX=[]; // ATTR: [part, a]  part 0 wood,1 endgrain,2 steel
const TEX=1024, px=(v)=>v/TEX;
function addGrid(rows, cols, posFn, uvFn, attrFn){ // grid (rows+1)x(cols+1); smooth normals within grid
  const base=P.length/3, V=[];
  for(let r=0;r<=rows;r++)for(let c=0;c<=cols;c++){const p=posFn(r/rows,c/cols,r,c);V.push(p);P.push(...p);UV.push(...uvFn(r/rows,c/cols,p,r,c));ATTR.push(...attrFn(r/rows,c/cols,p));}
  const nrm=V.map(()=>[0,0,0]); const W=cols+1;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const a=r*W+c,b=a+1,d=a+W,e=d+1;
    for(const [i,j,k] of [[a,d,b],[b,d,e]]){IDX.push(base+i,base+j,base+k);
      const A=V[i],B=V[j],C=V[k];const u=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],v=[C[0]-A[0],C[1]-A[1],C[2]-A[2]];
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];for(const q of [i,j,k]){nrm[q][0]+=n[0];nrm[q][1]+=n[1];nrm[q][2]+=n[2];}}}
  return {base,V,nrm,W};
}
const grids=[];
function finishNormals(g, flip=false){for(const n of g.nrm){let l=Math.hypot(...n)||1;N.push(...n.map(x=>x/l*(flip?-1:1)));}}

// ---------- handle ----------
const Y0=-0.003, Y1=1.098;
const rxF=table([-0.003,0.10,0.20,0.40,0.60,0.78,0.90,0.96,1.00,1.04,1.07,1.085,1.098],[0.0205,0.0205,0.0200,0.0188,0.0176,0.0170,0.0176,0.0195,0.0245,0.0310,0.0350,0.0335,0.0300]);
const rzF=table([-0.003,0.40,0.78,0.92,1.00,1.06,1.098],[0.0150,0.0140,0.0132,0.0140,0.0165,0.0190,0.0175]);
const cxF=table([-0.003,0.92,0.98,1.03,1.07,1.098],[0,0,-0.004,-0.010,-0.0145,-0.0155]);
const czF=(y)=>0.0005+0.0125*Math.pow(clamp(y/1.098),1.6);
// ring stations: [y, radiusScale]
const st=[[Y0,1],[0.0,1],[0.012,1]];
for(let y=0.04;y<0.95;y+=0.032)st.push([+y.toFixed(4),1]);
for(let y=0.95;y<=1.0801;y+=0.0125)st.push([+y.toFixed(4),1]);
st.push([1.0885,0.93],[1.0935,0.80],[1.0965,0.58],[1.0978,0.30],[1.098,0.0]);
// arc length along (y, r) profile for strip v
const arc=[0];for(let i=1;i<st.length;i++){const dy=st[i][0]-st[i-1][0],dr=rxF(st[i][0])*st[i][1]-rxF(st[i-1][0])*st[i-1][1];arc.push(arc[i-1]+Math.hypot(dy,dr));}
const L=arc[arc.length-1];
const SEG=18;
const ringPt=(y,s,ang)=>{const yy=Math.min(y,Y1);return [cxF(yy)+Math.cos(ang)*rxF(yy)*s, yy, czF(yy)+Math.sin(ang)*rzF(yy)*s];};
// handle UV strip: length -> texture x [16,1008], circumference -> texture y [16,336]
const hg=addGrid(st.length-1,SEG,(r,c,ri,ci)=>{const [y,s]=st[ri];return ringPt(y,s,ci/SEG*Math.PI*2+Math.PI/2);},
  (r,c,p,ri,ci)=>[px(16+arc[ri]/L*992), px(16+ci/SEG*320)], (r,c,p)=>[0,0]);
// grid winding: rows along length (+y), cols around: check orientation later via flip
grids.push([hg,'handle']);
// top end cap (y=Y0): fan as grid of 1 row collapsing to center; planar UV island [16,144]x[352,480]
const capC=[cxF(Y0),Y0,czF(Y0)];
const tg=addGrid(1,SEG,(r,c,ri,ci)=>{if(ri===1)return [...capC];return ringPt(Y0,1,ci/SEG*Math.PI*2+Math.PI/2);},
  (r,c,p)=>[px(80+(p[0]-capC[0])/0.021*60), px(416+(p[2]-capC[2])/0.021*60)], ()=>[1,0]);
grids.push([tg,'cap']);

// ---------- head ----------
const HX=[0.059,0.050,0.035,0.020,0.0,-0.020,-0.035,-0.050,-0.070,-0.100,-0.130,-0.144,-0.162];
const yhiF=table(HX.slice().reverse(),[0.080,0.088,0.098,0.103,0.104,0.103,0.098,0.088,0.076,0.080,0.090,0.095,0.100].reverse());
const yloF=table(HX.slice().reverse(),[0.003,0.000,0.000,0.000,0.000,0.000,0.000,0.000,0.002,0.000,-0.002,-0.003,-0.003].reverse());
const tF  =table(HX.slice().reverse(),[0.0150,0.0175,0.0195,0.0205,0.0205,0.0205,0.0195,0.0185,0.0165,0.0120,0.0072,0.0050,0.0].reverse());
const ZC=0.0005, XP=0.059, XE=-0.162, AB=0.92; // bevel start fraction
const Xa=(a)=>XP+(XE-XP)*a;
// a stations
const aCheek=[0,0.02,0.06,0.11,0.17,0.24,0.31,0.38,0.45,0.52,0.59,0.66,0.72,0.78,0.83,0.875,AB];
const aBevel=[AB,0.945,0.968,0.986,1.0];
function headPoint(a, face, w){ // face: 'L','R','T','B','TL','BL','BR','TR'; w in [0,1] across face
  const x0=Xa(a), yhi=yhiF(x0), ylo=yloF(x0), t=tF(x0), c=Math.min(0.0045,0.5*t);
  let y,z;
  switch(face){
    case 'L': y=lerp(ylo+c,yhi-c,w); z=t; break;
    case 'R': y=lerp(yhi-c,ylo+c,w); z=-t; break;
    case 'T': y=yhi; z=lerp(t-c,-(t-c),w); break;
    case 'B': y=ylo; z=lerp(-(t-c),t-c,w); break;
    case 'TL': y=lerp(yhi-c,yhi,w); z=lerp(t,t-c,w); break;
    case 'TR': y=lerp(yhi,yhi-c,w); z=lerp(-(t-c),-t,w); break;
    case 'BR': y=lerp(ylo+c,ylo,w); z=lerp(-t,-(t-c),w); break;
    case 'BL': y=lerp(ylo,ylo+c,w); z=lerp(t-c,t,w); break;
  }
  const ym=(yhi+ylo)/2, hh=Math.max(1e-4,(yhi-ylo)/2), q=clamp((y-ym)/hh,-1,1);
  const x=x0+Math.pow(a,6)*0.007*q*q;
  return [x,y,z+ZC];
}
// UV regions
const SIDE_S=1830, sideU=(x,off)=>px(off+(x-(-0.165))*SIDE_S), sideV=(y)=>px(352+(0.105-y)*SIDE_S);
const strips={T:[566,646],B:[662,742],TL:[758,798],TR:[814,854],BR:[870,910],BL:[926,966]};
const faceRows={L:4,R:4,T:2,B:2,TL:1,TR:1,BR:1,BL:1};
for(const face of ['L','R','T','B','TL','TR','BR','BL']){
  for(const as of [aCheek,aBevel]){
    const g=addGrid(as.length-1,faceRows[face],(r,c,ri,ci)=>headPoint(as[ri],face,c),
      (r,c,p,ri)=>{ if(face==='L') return [sideU(p[0],160+0), sideV(p[1])];
        if(face==='R') return [sideU(-0.106-p[0],586), sideV(p[1])]; // mirrored so poll on left? keep readable
        const [y0,y1]=strips[face]; return [px(16+as[ri]*992), px(lerp(y0,y1,c))]; },
      (r,c,p)=>[2, 0]);
    // store 'a' attr
    for(let k=0;k<(as.length)*(faceRows[face]+1);k++){ATTR[(g.base+k)*2+1]=as[Math.floor(k/(faceRows[face]+1))];}
    grids.push([g,'head-'+face]);
  }
}
// poll cap at x=XP: octagon fan; island x[16,144] y[496,556]
{const a=0; const ring=[['L',0],['L',1],['TL',1],['TR',0],['R',0],['R',1],['BR',1],['BL',0]].map(([f,w])=>headPoint(a,f,w));
 const cen=[XP,(yhiF(XP)+yloF(XP))/2,ZC]; const base=P.length/3;
 const uvOf=(p)=>[px(16+(p[1]-0.0)/0.085*128), px(526+(p[2]-ZC)/0.0155*28)];
 P.push(...cen);UV.push(...uvOf(cen));ATTR.push(2,0);N.push(1,0,0);
 for(const p of ring){P.push(...p);UV.push(...uvOf(p));ATTR.push(2,0);N.push(1,0,0);}
 for(let i=0;i<8;i++){IDX.push(base, base+1+i, base+1+((i+1)%8));}
 grids.push([null,'poll']); }

// normals for grids in order + fix winding so normals point outward
// Determine outward by comparing normal with vector from local centre.
let nAdded=0; const fixList=[];
for(const [g,name] of grids){ if(!g)continue; fixList.push([g,name]); }
// we must push normals in vertex order; grids were created in order, poll pushed its normals inline -> rebuild N fully
{
  const total=P.length/3; const NN=new Float32Array(total*3);
  // poll normals already in N at the end segment; recompute all from grids
  for(const [g,name] of fixList){
    // outward reference
    let flip=false; const midIdx=Math.floor(g.V.length/2); const p=g.V[midIdx], n=g.nrm[midIdx];
    let ref;
    if(name==='handle'){ref=[cxF(p[1]),p[1],czF(p[1])];}
    else if(name==='cap'){ref=[p[0],p[1]+1,p[2]];}
    else {ref=[-0.03,0.05,ZC];}
    const d=[p[0]-ref[0],p[1]-ref[1],p[2]-ref[2]]; flip=(d[0]*n[0]+d[1]*n[1]+d[2]*n[2])<0;
    if(name.startsWith('head-')){ // more robust: use face direction
      const f=name.slice(5); const dir={L:[0,0,1],R:[0,0,-1],T:[0,1,0],B:[0,-1,0],TL:[0,1,1],TR:[0,1,-1],BR:[0,-1,-1],BL:[0,-1,1]}[f];
      flip=(dir[0]*n[0]+dir[1]*n[1]+dir[2]*n[2])<0; }
    for(let k=0;k<g.V.length;k++){let v=g.nrm[k];const l=Math.hypot(...v)||1;const s=flip?-1:1;
      // degenerate (collapsed) points: fall back to neighbours later
      NN.set([v[0]/l*s,v[1]/l*s,v[2]/l*s],(g.base+k)*3);}
    if(flip){ // flip winding of this grid's triangles
      const lo=g.base, hi=g.base+g.V.length; for(let t=0;t<IDX.length;t+=3){ if(IDX[t]>=lo&&IDX[t]<hi){const tmp=IDX[t+1];IDX[t+1]=IDX[t+2];IDX[t+2]=tmp;} } }
  }
  // poll normals
  const pollBase=total-9; for(let k=0;k<9;k++)NN.set([1,0,0],(pollBase+k)*3);
  // check poll winding: normal of first tri should be +x
  { const t=IDX.length-24; const A=IDX[t],B=IDX[t+1],C=IDX[t+2]; const g=(i)=>[P[i*3],P[i*3+1],P[i*3+2]];
    const a=g(A),b=g(B),c=g(C); const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]]; const nx=u[1]*v[2]-u[2]*v[1];
    if(nx<0){for(let k=IDX.length-24;k<IDX.length;k+=3){const tmp=IDX[k+1];IDX[k+1]=IDX[k+2];IDX[k+2]=tmp;}} }
  // butt tip: collapsed ring -> normal along handle axis
  for(let ci=0;ci<=SEG;ci++){const k=(st.length-1)*(SEG+1)+ci; NN.set([0,1,0],(hg.base+k)*3);}
  // fix NaN / zero
  for(let i=0;i<total;i++){if(!isFinite(NN[i*3])||Math.hypot(NN[i*3],NN[i*3+1],NN[i*3+2])<0.5)NN.set([0,1,0],i*3);}
  N.length=0; N.push(...NN);
}
// handle seam normals: average first/last column
for(let ri=0;ri<st.length;ri++){const a=hg.base+ri*(SEG+1), b=a+SEG; for(let k=0;k<3;k++){const m=(N[a*3+k]+N[b*3+k])/2;N[a*3+k]=m;N[b*3+k]=m;}
  const l=Math.hypot(N[a*3],N[a*3+1],N[a*3+2]);for(let k=0;k<3;k++){N[a*3+k]/=l;N[b*3+k]=N[a*3+k];}}

const nV=P.length/3, nT=IDX.length/3;
console.log('verts',nV,'tris',nT);

// ---------- texture painting via UV-space rasterization ----------
function rasterAttrs(S){ // returns per-texel: part, pos(3), a, cover
  const part=new Int8Array(S*S).fill(-1), pos=new Float32Array(S*S*3), aa=new Float32Array(S*S);
  for(let t=0;t<IDX.length;t+=3){const ids=[IDX[t],IDX[t+1],IDX[t+2]];
    const u=ids.map(i=>UV[i*2]*S), v=ids.map(i=>UV[i*2+1]*S);
    const minx=Math.max(0,Math.floor(Math.min(...u))-1),maxx=Math.min(S-1,Math.ceil(Math.max(...u))+1);
    const miny=Math.max(0,Math.floor(Math.min(...v))-1),maxy=Math.min(S-1,Math.ceil(Math.max(...v))+1);
    const den=(v[1]-v[2])*(u[0]-u[2])+(u[2]-u[1])*(v[0]-v[2]); if(Math.abs(den)<1e-9)continue;
    for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){const X=x+0.5,Y=y+0.5;
      let l0=((v[1]-v[2])*(X-u[2])+(u[2]-u[1])*(Y-v[2]))/den, l1=((v[2]-v[0])*(X-u[2])+(u[0]-u[2])*(Y-v[2]))/den, l2=1-l0-l1;
      const e=-1.0/ (Math.sqrt(Math.abs(den))+1e-6); // allow ~1px conservative
      if(l0<e||l1<e||l2<e)continue; const k=y*S+x; const inside=(l0>=0&&l1>=0&&l2>=0);
      if(part[k]>=0&&!inside)continue;
      part[k]=ATTR[ids[0]*2]; for(let c=0;c<3;c++)pos[k*3+c]=l0*P[ids[0]*3+c]+l1*P[ids[1]*3+c]+l2*P[ids[2]*3+c];
      aa[k]=l0*ATTR[ids[0]*2+1]+l1*ATTR[ids[1]*2+1]+l2*ATTR[ids[2]*2+1];}}
  return {part,pos,aa};
}
function dilate(img,mask,S,ch,iters){ // push colours into empty texels
  let m=mask.slice();
  for(let it=0;it<iters;it++){const nm=m.slice();
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){const k=y*S+x;if(m[k])continue;let s=[0,0,0,0],n=0;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=S||Y>=S)continue;const q=Y*S+X;if(!m[q])continue;for(let c=0;c<ch;c++)s[c]+=img[q*ch+c];n++;}
      if(n){for(let c=0;c<ch;c++)img[k*ch+c]=s[c]/n;nm[k]=1;}}
    m=nm;}
  return m;
}
const srgb=(r,g,b)=>[r,g,b];
function woodColor(p, isCap){
  const [x,y,z]=p; const dx=x-cxF(clamp(y,Y0,Y1)), dz=z-czF(clamp(y,Y0,Y1));
  // pith far away along -z & slightly x -> flat-sawn streaks, warped by noise along length
  const warp=(fbm(y*2.2,dx*8,dz*8,3)-0.5)*0.006 + Math.sin(y*5.0+dx*40)*0.0012;
  const r=Math.hypot(dx*0.35-0.002, (dz+0.16)) + warp;
  const ring=(r/0.0024)%1; // ~3mm rings
  const late=smooth(0.55,0.80,ring)*(1-smooth(0.92,1.0,ring));
  const fine=fbm(dx*900,y*28,dz*900,3); // pores streaking along length
  const pores=fine<0.36?0.75:1;
  let light=[214,172,120], dark=[160,108,64];
  let col=[0,1,2].map(i=>lerp(light[i],dark[i],late*0.85)*pores*(0.92+0.16*fine));
  // mild colour variation along length
  const mv=fbm(y*3,1.7,0.3,2); col=col.map((c,i)=>c*(0.94+0.12*mv)*(i===2?0.97:1));
  // grip wear near butt: darker / slightly warmer
  const grip=smooth(0.74,0.82,y)*(1-smooth(1.04,1.09,y));
  col=col.map((c,i)=>c*(1-0.16*grip*(0.7+0.3*fbm(y*40,dx*200,dz*200,2)))*(i===0?1.0:0.98));
  // dirt/AO near head
  const nearHead=1-smooth(0.10,0.16,y); col=col.map(c=>c*(1-0.30*nearHead));
  if(isCap){ // end grain: darker, wedge
    col=col.map(c=>c*0.78);
    if(Math.abs(dz)<0.0014 && Math.abs(dx)<0.0185) col=[120,82,48].map(c=>c*(0.9+0.2*fine));
  }
  // butt end grain (collapsed rings near y>1.09): darken
  if(y>1.092) col=col.map(c=>c*0.82);
  return col;
}
function steelColor(p,a){
  // Warm mid-grey steel (avoid blue cast under sky hemi). Readable as steel without envMap.
  const [x,y,z]=p; const brushed=fbm(x*28,y*720,z*28,3);
  let col=[158,154,145].map(c=>c*(0.9+0.26*brushed)); // brighter warm steel (readable in split shadow)
  // forge scale blotches near eye/poll — warm dark, not blue
  const sc=fbm(x*140+3,y*140,z*140,4); const scale=smooth(0.62,0.75,sc)*(1-smooth(0.45,0.8,a))*0.5;
  col=col.map((c,i)=>c*(1-0.32*scale)*(i===0?1.02:i===2?0.96:1));
  // ground bevel lighter with grinding streaks
  const bev=smooth(AB-0.012,AB+0.004,a);
  const grind=fbm(x*30,y*1100,z*1100,3);
  const bcol=[186,184,176].map(c=>c*(0.88+0.22*grind));
  col=col.map((c,i)=>lerp(c,bcol[i],bev));
  // honed edge line
  const hone=smooth(0.982,0.996,a); col=col.map((c,i)=>lerp(c, i===2?210:225, hone*0.75));
  // wear scratches on cheeks
  const scr=vnoise(x*1600,y*90,z*40); if(scr>0.93&&a<AB) col=col.map(c=>c+36*(scr-0.93)/0.07);
  // cheek specular ridge (fake highlight so head isn't a flat box)
  const ridge=Math.exp(-((z*z)/(0.012*0.012)))*0.22*(1-bev);
  col=col.map(c=>c+ridge*55);
  return col;
}
async function paint(){
  const S=TEX; const {part,pos,aa}=rasterAttrs(S); const img=new Float32Array(S*S*3); const mask=new Uint8Array(S*S);
  for(let k=0;k<S*S;k++){if(part[k]<0)continue;mask[k]=1;const p=[pos[k*3],pos[k*3+1],pos[k*3+2]];
    const c=part[k]===2?steelColor(p,aa[k]):woodColor(p,part[k]===1); img.set(c,k*3);}
  const m=dilate(img,mask,S,3,24);
  for(let k=0;k<S*S;k++)if(!m[k])img.set([120,96,70],k*3);
  const buf=Buffer.alloc(S*S*3);for(let i=0;i<buf.length;i++)buf[i]=clamp(Math.round(img[i]),0,255);
  await sharp(buf,{raw:{width:S,height:S,channels:3}}).jpeg({quality:85,mozjpeg:true,progressive:false}).toFile(`${OUT}/axe_baseColor.jpg`);
  // ORM 256: R=AO, G=roughness, B=metal (steel=1, wood=0)
  const s=256; const r2=rasterAttrs(s); const orm=new Float32Array(s*s*3); const om=new Uint8Array(s*s);
  for(let k=0;k<s*s;k++){if(r2.part[k]<0)continue;om[k]=1;const steel=r2.part[k]===2;const a=r2.aa[k];
    const rough=steel?lerp(0.42,0.28,smooth(AB-0.01,AB+0.01,a)):(r2.pos[k*3+1]>0.78&&r2.pos[k*3+1]<1.06?0.62:0.74);
    orm.set([255,rough*255, steel?255:0],k*3);}
  const m2=dilate(orm,om,s,3,8); for(let k=0;k<s*s;k++)if(!m2[k])orm.set([255,0.7*255,0],k*3);
  const ob=Buffer.alloc(s*s*3);for(let i=0;i<ob.length;i++)ob[i]=Math.round(orm[i]);
  await sharp(ob,{raw:{width:s,height:s,channels:3}}).png({compressionLevel:9,palette:false}).toFile(`${OUT}/axe_orm.png`);
}
await paint();

// ---------- glTF write (same node structure/transform/material name as old axe) ----------
const T=[-0.051619267542264424,0.5474593472899869,0.006034188443663879], SC=0.5505650991108268;
const pos=new Float32Array(nV*3);for(let i=0;i<nV;i++)for(let c=0;c<3;c++)pos[i*3+c]=(P[i*3+c]-T[c])/SC;
const nrm=new Float32Array(N); const uv=new Float32Array(UV);
const idx=nV<65536?new Uint16Array(IDX):new Uint32Array(IDX);
const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<nV;i++)for(let c=0;c<3;c++){mn[c]=Math.min(mn[c],pos[i*3+c]);mx[c]=Math.max(mx[c],pos[i*3+c]);}
const parts=[pos,nrm,uv,idx].map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength));
const pad4=b=>b.length%4?Buffer.concat([b,Buffer.alloc(4-b.length%4)]):b;
let off=0;const views=[];const chunks=[];for(const [i,b] of parts.entries()){const pb=pad4(b);views.push({buffer:0,byteOffset:off,byteLength:b.length,target:i<3?34962:34963});chunks.push(pb);off+=pb.length;}
const bin=Buffer.concat(chunks); fs.writeFileSync(`${OUT}/axe.bin`,bin);
const gltf={asset:{version:'2.0',generator:'wood axe placeholder (procedural, three-free node script)'},
  scene:0,scenes:[{name:'AuxScene',nodes:[0]}],
  nodes:[{name:'AuxScene',children:[1]},{name:'Mesh',extras:{name:'Mesh'},translation:T,scale:[SC,SC,SC],mesh:0}],
  meshes:[{name:'Mesh',primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0,mode:4}]}],
  materials:[{name:'Mat.1',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:0},metallicFactor:1,roughnessFactor:1,metallicRoughnessTexture:{index:1}}}],
  textures:[{source:0,sampler:0},{source:1,sampler:0}],
  images:[{uri:'axe_baseColor.jpg',mimeType:'image/jpeg'},{uri:'axe_orm.png',mimeType:'image/png'}],
  samplers:[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}],
  accessors:[
    {bufferView:0,componentType:5126,count:nV,type:'VEC3',min:mn,max:mx},
    {bufferView:1,componentType:5126,count:nV,type:'VEC3'},
    {bufferView:2,componentType:5126,count:nV,type:'VEC2'},
    {bufferView:3,componentType:idx instanceof Uint16Array?5123:5125,count:IDX.length,type:'SCALAR'}],
  bufferViews:views, buffers:[{uri:'axe.bin',byteLength:bin.length}]};
fs.writeFileSync(`${OUT}/axe.gltf`,JSON.stringify(gltf,null,2)+'\n');
console.log('written');
