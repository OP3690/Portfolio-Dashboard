'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

interface Holding { stockName?: string; isin?: string; sectorName?: string; marketValue?: number; }
interface Props    { holdings: Holding[]; }

const STEP  = 50_000;
const GOALS = [3_00_000, 5_00_000, 10_00_000] as const;
const GL    : Record<number,string> = { 300000:'3L', 500000:'5L', 1000000:'10L' };

const fmtV = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_00_000) return `₹${(v/1_00_000).toFixed(2)}L`;
  if (a >= 1_000)    return `₹${(v/1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
};
const fmtS = (v: number) => {
  if (v >= 1_00_000) return `₹${(v/1_00_000).toFixed(1)}L`;
  if (v >= 1_000)    return `₹${(v/1_000).toFixed(0)}k`;
  return `₹${v.toFixed(0)}`;
};
const nextMs = (v: number) => { const n = Math.ceil(Math.max(v,1)/STEP)*STEP; return n>v?n:n+STEP; };
const clr    = (p: number) => p>=100?'#4ade80':p>=75?'#34d399':p>=50?'#38bdf8':p>=25?'#facc15':'#f87171';
const clrBg  = (p: number) => p>=100?'rgba(74,222,128,.15)':p>=75?'rgba(52,211,153,.15)':p>=50?'rgba(56,189,248,.15)':p>=25?'rgba(250,204,21,.15)':'rgba(248,113,113,.15)';

/* ── custom bar chart tooltip ── */
function ChartTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background:'#0f1117', border:'1px solid rgba(255,255,255,0.14)', borderRadius:10, padding:'10px 14px', minWidth:200, fontSize:12 }}>
      <p style={{ color:'#fff', fontWeight:700, marginBottom:6 }}>{d.fullName}</p>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <Row2 l="Current"   v={fmtV(d.value)}              c={d.color} />
        <Row2 l="Progress"  v={`${d.pct.toFixed(1)}%`}     c={d.color} />
        <Row2 l="Next"      v={fmtV(d.nxt)}                c="#a78bfa" />
        <Row2 l="To Goal"   v={d.atGoal?'✓ Done':fmtV(d.needed)} c={d.atGoal?'#4ade80':'#f87171'} />
      </div>
    </div>
  );
}
const Row2 = ({ l, v, c }: { l:string; v:string; c:string }) => (
  <div style={{ display:'flex', justifyContent:'space-between', gap:16 }}>
    <span style={{ color:'rgba(255,255,255,0.5)' }}>{l}</span>
    <span style={{ color:c, fontWeight:700 }}>{v}</span>
  </div>
);

/* ══ MAIN COMPONENT ══ */
export default function StockMilestoneTracker({ holdings }: Props) {
  const valid = holdings.filter(h => (h.marketValue??0) > 0);

  const defaultGoal = useMemo<number>(() => {
    if (valid.every(h=>(h.marketValue??0)>=5_00_000)) return 10_00_000;
    if (valid.every(h=>(h.marketValue??0)>=3_00_000)) return 5_00_000;
    return 3_00_000;
  }, [valid]);

  const [goal,   setGoal]   = useState<number>(defaultGoal);
  const [sortBy, setSortBy] = useState<'value'|'pct'|'needed'|'name'>('value');
  const [view,   setView]   = useState<'cards'|'chart'>('cards');

  const data = useMemo(() =>
    valid.map(h => {
      const v   = h.marketValue ?? 0;
      const pct = Math.min(100,(v/goal)*100);
      const nxt = nextMs(v);
      const needed = Math.max(0,goal-v);
      const toNxt  = Math.max(0, nxt>goal ? 0 : nxt-v);
      const msDone = Math.floor(v/STEP);
      const msTotal= Math.ceil(goal/STEP);
      return {
        name:    (h.stockName||h.isin||'?').slice(0,20),
        fullName: h.stockName||h.isin||'?',
        sector:   h.sectorName||'',
        value:v, pct, nxt, toNxt, needed, msDone, msTotal,
        atGoal: v>=goal,
        color:  clr(pct),
        bg:     clrBg(pct),
      };
    }).sort((a,b)=>
      sortBy==='value'  ? b.value-a.value
      :sortBy==='pct'   ? b.pct-a.pct
      :sortBy==='needed'? a.needed-b.needed
      :a.fullName.localeCompare(b.fullName)
    ),
  [valid,goal,sortBy]);

  const atGoalCnt = data.filter(d=>d.atGoal).length;
  const avgPct    = data.length ? data.reduce((s,d)=>s+d.pct,0)/data.length : 0;
  const totalNeed = data.reduce((s,d)=>s+d.needed,0);
  const closestStk= [...data].filter(d=>!d.atGoal).sort((a,b)=>a.toNxt-b.toNxt)[0]??null;
  const msLines   = useMemo(()=>{ const r=[]; for(let m=STEP;m<=goal;m+=STEP) r.push(m); return r; },[goal]);

  /* ── milestone progress bar with tick marks ── */
  const ProgressBar = ({ d }: { d: typeof data[0] }) => {
    const fillPct = Math.min(100, d.pct);
    const ticks = msLines.filter(m => m < goal);
    return (
      <div style={{ position:'relative', height:14, borderRadius:8, background:'rgba(255,255,255,0.08)', overflow:'visible' }}>
        {/* fill */}
        <div style={{
          position:'absolute', left:0, top:0, bottom:0,
          width:`${fillPct}%`, borderRadius:8,
          background: `linear-gradient(90deg, ${d.color}99, ${d.color})`,
          transition:'width 0.4s ease',
        }} />
        {/* milestone ticks */}
        {ticks.map(m => {
          const tickPct = (m/goal)*100;
          const passed  = d.value >= m;
          return (
            <div key={m} style={{
              position:'absolute', top:-3, bottom:-3,
              left:`${tickPct}%`, transform:'translateX(-50%)',
              width:2, borderRadius:2,
              background: passed ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
              zIndex:2,
            }} />
          );
        })}
      </div>
    );
  };

  const SORTS = [
    {k:'value'  as const, l:'Value'},
    {k:'pct'    as const, l:'Progress'},
    {k:'needed' as const, l:'Closest'},
    {k:'name'   as const, l:'A–Z'},
  ];

  return (
    <div style={{ background:'var(--bg-card)', borderRadius:16, border:'1px solid var(--border)', padding:24, display:'flex', flexDirection:'column', gap:20 }}>

      {/* ══ HEADER ══ */}
      <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div>
          <h3 style={{ color:'#fff', fontWeight:800, fontSize:18, margin:0 }}>Stock Milestone Tracker</h3>
          <p style={{ color:'rgba(255,255,255,0.5)', fontSize:12, marginTop:4 }}>
            ₹50k steps · goal: ₹{GL[goal]} per stock
          </p>
        </div>

        <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
          {/* view toggle */}
          <div style={{ display:'flex', background:'rgba(255,255,255,0.06)', borderRadius:10, padding:3, border:'1px solid rgba(255,255,255,0.1)' }}>
            {(['cards','chart'] as const).map(v=>(
              <button key={v} onClick={()=>setView(v)}
                style={{ padding:'6px 14px', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
                  background: view===v ? 'rgba(255,255,255,0.14)' : 'transparent',
                  color: view===v ? '#fff' : 'rgba(255,255,255,0.5)',
                }}>
                {v==='cards' ? '▦ Cards' : '≡ Chart'}
              </button>
            ))}
          </div>

          {/* sort */}
          <div style={{ display:'flex', background:'rgba(255,255,255,0.06)', borderRadius:10, padding:3, border:'1px solid rgba(255,255,255,0.1)' }}>
            {SORTS.map(o=>(
              <button key={o.k} onClick={()=>setSortBy(o.k)}
                style={{ padding:'6px 12px', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
                  background: sortBy===o.k ? 'rgba(255,255,255,0.14)' : 'transparent',
                  color: sortBy===o.k ? '#fff' : 'rgba(255,255,255,0.5)',
                }}>
                {o.l}
              </button>
            ))}
          </div>

          {/* goal */}
          <div style={{ display:'flex', background:'rgba(255,255,255,0.06)', borderRadius:10, padding:3, border:'1px solid rgba(255,255,255,0.1)' }}>
            {GOALS.map(g=>(
              <button key={g} onClick={()=>setGoal(g)}
                style={{ padding:'6px 18px', borderRadius:7, fontSize:13, fontWeight:700, cursor:'pointer', border:'none',
                  background: goal===g ? 'var(--brand)' : 'transparent',
                  color: goal===g ? '#fff' : 'rgba(255,255,255,0.55)',
                }}>
                {GL[g]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ SUMMARY STRIP ══ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:`At ${GL[goal]} Goal`, value:`${atGoalCnt} / ${data.length}`,
            sub: atGoalCnt===data.length ? '🎯 All reached!' : `${data.length-atGoalCnt} remaining`, color: atGoalCnt===data.length?'#4ade80':'#facc15' },
          { label:'Avg Progress', value:`${avgPct.toFixed(1)}%`, sub:`toward ₹${GL[goal]}`, color:clr(avgPct) },
          { label:'Total Remaining', value:fmtV(totalNeed), sub:`across all stocks`, color:'#f87171' },
          { label:'Closest to Next ₹50k', value: closestStk ? fmtV(closestStk.nxt) : '—',
            sub: closestStk ? `${closestStk.name} · ${fmtV(closestStk.toNxt)} away` : 'All at goal', color:'#a78bfa' },
        ].map(s=>(
          <div key={s.label} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, padding:'14px 16px' }}>
            <p style={{ color:'rgba(255,255,255,0.5)', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>{s.label}</p>
            <p style={{ color:s.color, fontSize:24, fontWeight:800, lineHeight:1, marginBottom:4 }}>{s.value}</p>
            <p style={{ color:'rgba(255,255,255,0.45)', fontSize:11 }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ══ CHART VIEW ══ */}
      {view==='chart' && (
        <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, padding:'16px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <p style={{ color:'#fff', fontWeight:700, fontSize:14 }}>Holdings vs ₹{GL[goal]} Goal</p>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              {[{c:'#4ade80',l:'≥75%'},{c:'#38bdf8',l:'50–75%'},{c:'#facc15',l:'25–50%'},{c:'#f87171',l:'<25%'}].map(({c,l})=>(
                <span key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'rgba(255,255,255,0.65)' }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:c, display:'inline-block' }} />{l}
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(300, data.length*36+40)}>
            <BarChart data={data} layout="vertical" margin={{ top:4, right:160, left:4, bottom:4 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" domain={[0,goal]} tick={{ fill:'rgba(255,255,255,0.5)', fontSize:11 }}
                tickLine={false} axisLine={{ stroke:'rgba(255,255,255,0.08)' }} tickFormatter={fmtS} />
              <YAxis type="category" dataKey="name" width={130}
                tick={{ fill:'rgba(255,255,255,0.8)', fontSize:12, fontWeight:500 }} tickLine={false} axisLine={false} />
              {msLines.filter(m=>m%1_00_000!==0).map(m=>(
                <ReferenceLine key={m} x={m} stroke="rgba(255,255,255,0.04)" strokeDasharray="2 4" />
              ))}
              {msLines.filter(m=>m%1_00_000===0&&m<goal).map(m=>(
                <ReferenceLine key={m} x={m} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 3"
                  label={{ value:fmtS(m), fill:'rgba(255,255,255,0.4)', fontSize:10, position:'top' }} />
              ))}
              <ReferenceLine x={goal} stroke="#facc15" strokeWidth={2} strokeDasharray="6 3"
                label={{ value:`${GL[goal]} Goal`, fill:'#facc15', fontSize:11, fontWeight:700, position:'insideTopRight' }} />
              <Tooltip content={<ChartTip />} cursor={{ fill:'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="value" radius={[0,5,5,0]} barSize={24} background={{ fill:'rgba(255,255,255,0.04)', radius:5 }}>
                {data.map((d,i)=><Cell key={i} fill={d.color} fillOpacity={0.9} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ══ CARDS VIEW ══ */}
      {view==='cards' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
          {data.map(d => (
            <div key={d.fullName} style={{
              background: 'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)',
              borderRadius:14, padding:16, display:'flex', flexDirection:'column', gap:12,
            }}>
              {/* card top: avatar + name + badge */}
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{
                  width:42, height:42, borderRadius:12, flexShrink:0,
                  background:d.bg, border:`1.5px solid ${d.color}55`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:16, fontWeight:800, color:d.color,
                }}>
                  {d.fullName.charAt(0)}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ color:'#fff', fontWeight:700, fontSize:14, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {d.fullName}
                  </p>
                  {d.sector && <p style={{ color:'rgba(255,255,255,0.45)', fontSize:11, marginTop:2 }}>{d.sector}</p>}
                </div>
                {d.atGoal
                  ? <span style={{ background:'rgba(74,222,128,0.15)', color:'#4ade80', padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, border:'1px solid rgba(74,222,128,0.3)', whiteSpace:'nowrap' }}>🎯 Goal</span>
                  : <span style={{ background:d.bg, color:d.color, padding:'3px 10px', borderRadius:99, fontSize:12, fontWeight:800, border:`1px solid ${d.color}40`, whiteSpace:'nowrap' }}>
                      {d.pct.toFixed(1)}%
                    </span>
                }
              </div>

              {/* current value — large */}
              <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                <span style={{ color:d.color, fontSize:26, fontWeight:800, lineHeight:1 }}>{fmtV(d.value)}</span>
                <span style={{ color:'rgba(255,255,255,0.35)', fontSize:12 }}>of ₹{GL[goal]}</span>
              </div>

              {/* progress bar */}
              <div>
                <ProgressBar d={d} />
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
                  <span style={{ color:'rgba(255,255,255,0.45)', fontSize:10 }}>₹0</span>
                  <span style={{ color:'rgba(255,255,255,0.45)', fontSize:10 }}>{d.msDone}/{d.msTotal} milestones</span>
                  <span style={{ color:'rgba(255,255,255,0.45)', fontSize:10 }}>₹{GL[goal]}</span>
                </div>
              </div>

              {/* 3-stat footer */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, paddingTop:8, borderTop:'1px solid rgba(255,255,255,0.07)' }}>
                <Stat label="Next MS" value={fmtV(d.nxt)} color="#a78bfa" sub={d.atGoal?'—':`${fmtV(d.toNxt)} away`} />
                <Stat label="To Goal"  value={d.atGoal?'Done':fmtV(d.needed)} color={d.atGoal?'#4ade80':'#f87171'} sub={d.atGoal?'✓':` ${(100-d.pct).toFixed(0)}% left`} />
                <Stat label="Invested" value={fmtV(d.value)} color="rgba(255,255,255,0.75)" sub={`${d.pct.toFixed(0)}% of goal`} />
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function Stat({ label, value, color, sub }: { label:string; value:string; color:string; sub:string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <p style={{ color:'rgba(255,255,255,0.4)', fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</p>
      <p style={{ color, fontSize:13, fontWeight:700 }}>{value}</p>
      <p style={{ color:'rgba(255,255,255,0.35)', fontSize:10 }}>{sub}</p>
    </div>
  );
}
