# Synthesises one looping engine recording per ground vehicle: python veh.py <out_dir>
import numpy as np, wave, sys, re, os
sr=22050; dur=4.0; n=int(sr*dur); t=np.arange(n)/sr
def q(f): return round(f*dur)/dur          # whole cycles in 4 s -> seamless loop
def lp(x,a):
    from itertools import accumulate
    y=np.empty_like(x); s=0.0
    for i in range(len(x)): s+=a*(x[i]-s); y[i]=s
    return y
# name: (kind, firing Hz, clank Hz (0 = wheels), turbine whine Hz (0 = none), roughness)
V={
 'Humvee':('wheel',38,0,0,.5),'VBL Scout':('wheel',44,0,0,.4),'UAZ Patrol':('petrol',52,0,0,.6),
 'Dongfeng Scout':('wheel',46,0,0,.45),'Safir Jeep':('petrol',58,0,0,.7),
 'MTVR':('truck',30,0,0,.5),'MAN SV':('truck',28,0,0,.4),'KamAZ':('truck',26,0,0,.7),
 'Patriot':('truck',24,0,0,.6),'SAMP/T NG':('truck',27,0,0,.5),'S-400':('truck',22,0,0,.8),
 'HQ-9':('truck',25,0,0,.6),'PGZ-09':('track',34,7,0,.6),
 'Abrams':('track',20,6,1500,.3),'Leopard 2':('track',30,6.5,0,.4),'T-90':('track',27,5.5,0,.8),
 'Type 99':('track',29,6,0,.6),'Karrar':('track',26,5.75,0,.75),
 'Bradley':('track',34,7.5,0,.5),'Puma':('track',36,8,0,.4),'BMP-3':('track',38,8.5,0,.7),
 'BMP-2':('track',40,8.75,0,.8),'ZBD-04':('track',37,8.25,0,.6),
 'M88':('track',22,4.5,0,.6),'BREM-1':('track',21,4.25,0,.85),'Type 99II':('track',23,4.75,0,.7),
 'M104 Wolverine':('track',25,5,0,.5),'Leguan':('track',28,5.25,0,.4),'MTU-72':('track',24,4.75,0,.8),
 'GQL-111':('track',26,5,0,.65),'AVLB':('track',23,4.5,0,.75),
}
out=sys.argv[1]
for i,(name,(kind,fire,clank,whine,rough)) in enumerate(V.items()):
    rng=np.random.default_rng(100+i); noise=rng.standard_normal(n)
    f=q(fire)
    puls=(0.5+0.5*np.sin(2*np.pi*f*t))**(3 if kind!='petrol' else 1.5)
    body=lp(noise,{'petrol':.12,'wheel':.08,'truck':.05,'track':.05}[kind])*puls*2.5
    body+=sum(np.sin(2*np.pi*f*h*t)*a for h,a in [(1,.35),(2,.2),(3,.1)])*(1-0.5*rough)
    body+=lp(noise,.015)*(0.8+rough)          # low rumble
    x=body
    if clank:
        c=q(clank); ph=(t*c)%1
        hit=np.exp(-ph*25)*(lp(rng.standard_normal(n),.5)-lp(rng.standard_normal(n),.08))*(1.2+rough)
        x=x+hit+np.exp(-((t*c*2)%1)*40)*rng.standard_normal(n)*0.25   # link squeak/rattle
    if whine: x=x+np.sin(2*np.pi*q(whine)*t)*.12+np.sin(2*np.pi*q(whine*1.5)*t)*.05+lp(noise,.3)*.3
    x/=np.max(np.abs(x)); x=np.tanh(x*2.5)/np.tanh(2.5)*.95
    fn=os.path.join(out,'engine-'+re.sub(r'^-|-$','',re.sub(r'[^a-z0-9]+','-',name.lower()))+'.wav')
    with wave.open(fn,'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((x*32767).astype('<i2').tobytes())
    print(os.path.basename(fn))
