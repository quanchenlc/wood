import math
def bezier(x1,y1,x2,y2):
    def f(t):
        if t<=0: return 0.0
        if t>=1: return 1.0
        lo,hi=0.0,1.0
        for _ in range(60):
            u=(lo+hi)/2; x=3*(1-u)**2*u*x1+3*(1-u)*u*u*x2+u**3
            lo,hi=(u,hi) if x<t else (lo,u)
        u=(lo+hi)/2; return 3*(1-u)**2*u*y1+3*(1-u)*u*u*y2+u**3
    return f
OPEN_MS=350; CLOSE_MS=250
OPEN_EASE=(0.40,0.30,0.40,1.0); CLOSE_EASE=(0.55,0.0,0.80,0.35)
eo=bezier(*OPEN_EASE); ec=bezier(*CLOSE_EASE)
H0,H1=20,400; D0,D1=40,14
def clip_h(p): return H0+(H1-H0)*p
def diam(p): return math.sqrt(D1**2+(D0**2-D1**2)*(1-p))
def roll_alpha(p): return 1.0 if p<0.93 else max(0.0,(1-p)/0.07)
def tag_top(p): return max(48.0, clip_h(p)-16+1.25*(diam(p)-D1))
def content_alpha_open(ms):
    t=(ms-203)/120; t=min(1,max(0,t)); return 1-(1-t)**2
def dim_open(ms): return 0.30*min(1,ms/200)
def state_open(frac):
    ms=frac*OPEN_MS; p=eo(frac)
    return dict(ms=ms,p=p,h=clip_h(p),d=diam(p),roll_y=clip_h(p),ra=roll_alpha(p),tag=tag_top(p),ca=content_alpha_open(ms),dim=dim_open(ms))
if __name__=='__main__':
    for f in (0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1):
        s=state_open(f); print({k:round(v,3) for k,v in s.items()})
