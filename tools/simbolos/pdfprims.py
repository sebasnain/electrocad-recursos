import pymupdf,sys,json
f,out=sys.argv[1],sys.argv[2]
d=pymupdf.open(f);p=d[0];prims=[]
def colored(c):
    if c is None:return False
    r,g,b=c
    return max(r,g,b)-min(r,g,b)>0.25
def bez(p0,p1,p2,p3,n=8):
    o=[]
    for i in range(1,n+1):
        t=i/n;u=1-t
        o.append((u**3*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t**3*p3[0],u**3*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t**3*p3[1]))
    return o
for dr in p.get_drawings():
    fc,sc=dr.get('fill'),dr.get('color')
    if not(colored(fc) or colored(sc)):continue
    fill=colored(fc)
    cur=[];subs=[]
    for it in dr['items']:
        k=it[0]
        if k=='l':
            a,b=it[1],it[2]
            if cur and abs(cur[-1][0]-a.x)<1e-3 and abs(cur[-1][1]-a.y)<1e-3:cur.append((b.x,b.y))
            else:
                if len(cur)>1:subs.append(cur)
                cur=[(a.x,a.y),(b.x,b.y)]
        elif k=='c':
            a,b,c2,e=it[1],it[2],it[3],it[4]
            pts=bez((a.x,a.y),(b.x,b.y),(c2.x,c2.y),(e.x,e.y))
            if cur and abs(cur[-1][0]-a.x)<1e-3 and abs(cur[-1][1]-a.y)<1e-3:cur+=pts
            else:
                if len(cur)>1:subs.append(cur)
                cur=[(a.x,a.y)]+pts
        elif k=='re' or k=='qu':
            r=it[1]
            if k=='re':q=[(r.x0,r.y0),(r.x1,r.y0),(r.x1,r.y1),(r.x0,r.y1)]
            else:q=[(it[1].ul.x,it[1].ul.y),(it[1].ur.x,it[1].ur.y),(it[1].lr.x,it[1].lr.y),(it[1].ll.x,it[1].ll.y)]
            if len(cur)>1:subs.append(cur);cur=[]
            subs.append(q+[q[0]])
    if len(cur)>1:subs.append(cur)
    for s in subs:
        closed=fill or (len(s)>2 and abs(s[0][0]-s[-1][0])<1e-3 and abs(s[0][1]-s[-1][1])<1e-3)
        prims.append({'k':'P','pts':[[x,-y] for x,y in s],'closed':bool(closed),'fill':bool(fill)})
json.dump(prims,open(out,'w'))
print(len(prims),'prims')
