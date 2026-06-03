'use client';

import { useState, useEffect, useCallback } from 'react';

/* ─── Types ──────────────────────────────────────────────────────────────── */
export type TradeStatus = 'holding' | 'partial' | 'closed';
type PredStatus  = 'Active' | 'Achieved' | 'OverAchieved' | 'MissedSlightly' | 'Missed' | 'Expired';

interface SellLot {
  _id:            string;
  sellDate:       string;
  sellPrice:      number;
  sellQuantity:   number;
  realizedPnL:    number;
  realizedPnLPct: number;
  notes?:         string;
}

export interface Trade {
  _id:                  string;
  predictionId:         string;
  stockSymbol:          string;
  stockName:            string;
  predictionEntryPrice: number;
  buyDate:              string;
  buyPrice:             number;
  buyQuantity:          number;
  totalInvested:        number;
  sells:                SellLot[];
  soldQuantity:         number;
  remainingQuantity:    number;
  realizedPnL:          number;
  realizedPnLPct:       number;
  status:               TradeStatus;
  notes?:               string;
  // enriched
  currentPrice:         number;
  unrealizedPnL:        number;
  unrealizedPnLPct:     number;
  currentValue:         number;
  totalPnL:             number;
  totalPnLPct:          number;
  predictionStatus:     PredStatus;
  lastTracked:          string | null;
}

export interface TradePrediction {
  _id:         string;
  stockSymbol: string;
  stockName:   string;
  entryPrice:  number;
  status:      PredStatus;
}

/* ─── Formatters ─────────────────────────────────────────────────────────── */
function fmtINR(n: number) {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function fmtPct(n: number, sign = true) {
  return `${sign && n > 0 ? '+' : n < 0 ? '' : ''}${n.toFixed(2)}%`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateInput(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}
function pnlColor(n: number) {
  return n > 0 ? 'var(--gain)' : n < 0 ? 'var(--loss)' : 'var(--text-muted)';
}
function pnlBg(n: number) {
  if (n > 0) return 'rgba(52,211,153,0.09)';
  if (n < 0) return 'rgba(248,113,113,0.09)';
  return 'transparent';
}

/* ─── Status chips ───────────────────────────────────────────────────────── */
const TRADE_STATUS: Record<TradeStatus, { label: string; color: string; bg: string }> = {
  holding: { label: 'Holding',  color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
  partial: { label: 'Partial',  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  closed:  { label: 'Closed',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};

function TradeChip({ status }: { status: TradeStatus }) {
  const s = TRADE_STATUS[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold"
      style={{ background: s.bg, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

/* ─── Modal shell ─────────────────────────────────────────────────────────── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-md)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-sm)' }}>
          <h3 className="text-sm font-black" style={{ color: 'var(--text-hi)' }}>{title}</h3>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-lg leading-none"
            style={{ color: 'var(--text-muted)', background: 'var(--bg-raised)' }}>
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ─── Field ─────────────────────────────────────────────────────────────── */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}>
        {label}{hint && <span className="ml-1 font-normal normal-case tracking-normal" style={{ color: 'var(--text-lo)', opacity: 0.7 }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full px-3 py-2.5 rounded-xl text-sm font-semibold outline-none"
      style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--border-md)',
        color: 'var(--text-hi)',
        ...props.style,
      }}
    />
  );
}

/* ─── BuyModal ───────────────────────────────────────────────────────────── */
export function BuyModal({
  prediction,
  onClose,
  onSuccess,
}: {
  prediction: TradePrediction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [buyDate, setBuyDate]         = useState(today);
  const [buyPrice, setBuyPrice]       = useState(prediction.entryPrice.toFixed(2));
  const [buyQty, setBuyQty]           = useState('');
  const [notes, setNotes]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const invested = parseFloat(buyPrice || '0') * parseFloat(buyQty || '0');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!buyDate || !buyPrice || !buyQty) { setError('All fields required'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/prediction-trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          predictionId: prediction._id,
          buyDate, buyPrice, buyQuantity: buyQty, notes,
        }),
      });
      const data = await res.json();
      if (data.success) { onSuccess(); onClose(); }
      else setError(data.error || 'Failed to save');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <Modal title={`Buy — ${prediction.stockSymbol}`} onClose={onClose}>
      {/* Stock info banner */}
      <div className="flex items-center justify-between mb-4 p-3 rounded-xl"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
        <div>
          <p className="text-xs font-black" style={{ color: 'var(--text-hi)' }}>{prediction.stockSymbol}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{prediction.stockName}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>AI Entry Price</p>
          <p className="text-sm font-black" style={{ color: 'var(--brand)' }}>₹{prediction.entryPrice.toLocaleString('en-IN')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Field label="Buy Date">
          <Input type="date" value={buyDate} onChange={e => setBuyDate(e.target.value)} max={today} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Avg Buy Price (₹)">
            <Input type="number" step="0.01" min="0.01" placeholder="e.g. 336.50"
              value={buyPrice} onChange={e => setBuyPrice(e.target.value)} />
          </Field>
          <Field label="Quantity">
            <Input type="number" step="1" min="1" placeholder="e.g. 10"
              value={buyQty} onChange={e => setBuyQty(e.target.value)} />
          </Field>
        </div>

        {/* Live invested preview */}
        {invested > 0 && (
          <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Total Invested</span>
            <span className="text-sm font-black" style={{ color: '#818cf8' }}>{fmtINR(invested)}</span>
          </div>
        )}

        <Field label="Notes" hint="(optional)">
          <Input type="text" placeholder="Any notes about this buy" value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>

        {error && <p className="text-xs mb-3" style={{ color: 'var(--loss)' }}>{error}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)', border: '1px solid var(--border-md)' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: 'var(--brand)', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Saving…' : 'Record Buy'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── SellModal ──────────────────────────────────────────────────────────── */
export function SellModal({
  trade,
  onClose,
  onSuccess,
}: {
  trade: Trade;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [sellDate, setSellDate]   = useState(today);
  const [sellPrice, setSellPrice] = useState(trade.currentPrice > 0 ? trade.currentPrice.toFixed(2) : '');
  const [sellQty, setSellQty]     = useState(trade.remainingQuantity.toString());
  const [notes, setNotes]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const sp   = parseFloat(sellPrice || '0');
  const sq   = parseFloat(sellQty || '0');
  const pnl  = (sp - trade.buyPrice) * sq;
  const pnlP = trade.buyPrice > 0 ? ((sp - trade.buyPrice) / trade.buyPrice) * 100 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sellDate || !sellPrice || !sellQty) { setError('All fields required'); return; }
    if (sq > trade.remainingQuantity) { setError(`Max qty is ${trade.remainingQuantity}`); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/prediction-trades/${trade._id}/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellDate, sellPrice, sellQuantity: sellQty, notes }),
      });
      const data = await res.json();
      if (data.success) { onSuccess(); onClose(); }
      else setError(data.error || 'Failed to save');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  const isPartial = sq > 0 && sq < trade.remainingQuantity;

  return (
    <Modal title={`Sell — ${trade.stockSymbol}`} onClose={onClose}>
      {/* Trade summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Avg Buy', val: fmtINR(trade.buyPrice) },
          { label: 'Remaining', val: `${trade.remainingQuantity} shares` },
          { label: 'Current', val: fmtINR(trade.currentPrice) },
        ].map(({ label, val }) => (
          <div key={label} className="rounded-lg p-2 text-center"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
            <p className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>{label}</p>
            <p className="text-xs font-black mt-0.5" style={{ color: 'var(--text-hi)' }}>{val}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <Field label="Sell Date">
          <Input type="date" value={sellDate} onChange={e => setSellDate(e.target.value)} max={today} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Avg Sell Price (₹)">
            <Input type="number" step="0.01" min="0.01" placeholder="e.g. 350.00"
              value={sellPrice} onChange={e => setSellPrice(e.target.value)} />
          </Field>
          <Field label={`Qty (max ${trade.remainingQuantity})`}>
            <Input type="number" step="1" min="1" max={trade.remainingQuantity}
              value={sellQty} onChange={e => setSellQty(e.target.value)} />
          </Field>
        </div>

        {/* Live P&L preview */}
        {sp > 0 && sq > 0 && (
          <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-lg"
            style={{ background: pnlBg(pnl), border: `1px solid ${pnl >= 0 ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}` }}>
            <div>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {isPartial ? 'Partial Sell' : 'Full Close'} · Realized P&L
              </span>
            </div>
            <div className="text-right">
              <span className="text-sm font-black" style={{ color: pnlColor(pnl) }}>
                {pnl >= 0 ? '+' : ''}{fmtINR(pnl)}
              </span>
              <span className="text-[10px] ml-1.5" style={{ color: pnlColor(pnlP) }}>
                ({fmtPct(pnlP)})
              </span>
            </div>
          </div>
        )}

        <Field label="Notes" hint="(optional)">
          <Input type="text" placeholder="Any notes about this sell" value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>

        {error && <p className="text-xs mb-3" style={{ color: 'var(--loss)' }}>{error}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)', border: '1px solid var(--border-md)' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: pnl >= 0 ? '#34d399' : '#f87171', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Saving…' : isPartial ? 'Partial Sell' : 'Sell All'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── ModifyModal ────────────────────────────────────────────────────────── */
export function ModifyModal({
  trade,
  onClose,
  onSuccess,
}: {
  trade: Trade;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [buyDate,  setBuyDate]  = useState(fmtDateInput(trade.buyDate));
  const [buyPrice, setBuyPrice] = useState(trade.buyPrice.toFixed(2));
  const [buyQty,   setBuyQty]   = useState(trade.buyQuantity.toString());
  const [notes,    setNotes]    = useState(trade.notes ?? '');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const invested = parseFloat(buyPrice || '0') * parseFloat(buyQty || '0');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!buyDate || !buyPrice || !buyQty) { setError('All fields required'); return; }
    const qty = parseFloat(buyQty);
    if (qty < trade.soldQuantity) {
      setError(`Qty cannot be less than already sold (${trade.soldQuantity})`);
      return;
    }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/prediction-trades/${trade._id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ buyDate, buyPrice, buyQuantity: buyQty, notes }),
      });
      const data = await res.json();
      if (data.success) { onSuccess(); onClose(); }
      else setError(data.error || 'Failed to update');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <Modal title={`Modify Buy — ${trade.stockSymbol}`} onClose={onClose}>
      {/* Stock info banner */}
      <div className="flex items-center justify-between mb-4 p-3 rounded-xl"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
        <div>
          <p className="text-xs font-black" style={{ color: 'var(--text-hi)' }}>{trade.stockSymbol}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{trade.stockName}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>AI Entry Price</p>
          <p className="text-sm font-black" style={{ color: 'var(--brand)' }}>₹{trade.predictionEntryPrice.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {trade.soldQuantity > 0 && (
        <div className="mb-4 px-3 py-2 rounded-lg text-[11px]"
          style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#f59e0b' }}>
          ⚠️ {trade.soldQuantity} shares already sold — quantity cannot go below this.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Field label="Buy Date">
          <Input type="date" value={buyDate} onChange={e => setBuyDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Avg Buy Price (₹)">
            <Input type="number" step="0.01" min="0.01" value={buyPrice}
              onChange={e => setBuyPrice(e.target.value)} />
          </Field>
          <Field label="Quantity" hint={trade.soldQuantity > 0 ? `min ${trade.soldQuantity}` : undefined}>
            <Input type="number" step="1" min={trade.soldQuantity || 1} value={buyQty}
              onChange={e => setBuyQty(e.target.value)} />
          </Field>
        </div>

        {invested > 0 && (
          <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>New Total Invested</span>
            <span className="text-sm font-black" style={{ color: '#818cf8' }}>{fmtINR(invested)}</span>
          </div>
        )}

        <Field label="Notes" hint="(optional)">
          <Input type="text" placeholder="Any notes about this trade" value={notes}
            onChange={e => setNotes(e.target.value)} />
        </Field>

        {error && <p className="text-xs mb-3" style={{ color: 'var(--loss)' }}>{error}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)', border: '1px solid var(--border-md)' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: '#f59e0b', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── DiscardModal ───────────────────────────────────────────────────────── */
export function DiscardModal({
  trade,
  onClose,
  onSuccess,
}: {
  trade: Trade;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleDiscard() {
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/prediction-trades/${trade._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { onSuccess(); onClose(); }
      else setError(data.error || 'Failed to discard');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <Modal title="Discard Trade" onClose={onClose}>
      {/* Warning icon */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
          style={{ background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.25)' }}>
          <svg className="w-7 h-7" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm font-black mb-1" style={{ color: 'var(--text-hi)' }}>
          Permanently discard this trade?
        </p>
        <p className="text-xs" style={{ color: 'var(--text-lo)' }}>
          This will delete the recorded buy for <strong style={{ color: 'var(--text-hi)' }}>{trade.stockSymbol}</strong> and all associated sell history. This cannot be undone.
        </p>
      </div>

      {/* Trade summary */}
      <div className="rounded-xl p-3 mb-5" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Stock',    val: trade.stockSymbol },
            { label: 'Qty',      val: trade.buyQuantity.toString() },
            { label: 'Invested', val: fmtINR(trade.totalInvested) },
          ].map(({ label, val }) => (
            <div key={label}>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
              <p className="text-xs font-black" style={{ color: 'var(--text-hi)' }}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-xs mb-3 text-center" style={{ color: 'var(--loss)' }}>{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onClose}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)', border: '1px solid var(--border-md)' }}>
          Keep Trade
        </button>
        <button type="button" onClick={handleDiscard} disabled={loading}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ background: '#ef4444', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Discarding…' : 'Yes, Discard'}
        </button>
      </div>
    </Modal>
  );
}

/* ─── SellHistoryRow ─────────────────────────────────────────────────────── */
function SellHistory({ sells }: { sells: SellLot[] }) {
  if (sells.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-sm)' }}>
      <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider"
        style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-sm)' }}>
        Sell History
      </div>
      {sells.map((s, i) => (
        <div key={s._id ?? i}
          className="flex items-center justify-between px-3 py-2 text-xs"
          style={{ borderBottom: i < sells.length - 1 ? '1px solid var(--border-sm)' : 'none', background: 'var(--bg-surface)' }}>
          <span style={{ color: 'var(--text-muted)' }}>{fmtDate(s.sellDate)}</span>
          <span style={{ color: 'var(--text-lo)' }}>{s.sellQuantity} @ {fmtINR(s.sellPrice)}</span>
          <span className="font-bold" style={{ color: pnlColor(s.realizedPnL) }}>
            {s.realizedPnL >= 0 ? '+' : ''}{fmtINR(s.realizedPnL)} ({fmtPct(s.realizedPnLPct)})
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Analytics Summary Cards ─────────────────────────────────────────────── */
function AnalyticsCards({ trades }: { trades: Trade[] }) {
  const totalInvested    = trades.reduce((s, t) => s + t.totalInvested, 0);
  const realizedPnL      = trades.reduce((s, t) => s + t.realizedPnL,   0);
  const unrealizedPnL    = trades.reduce((s, t) => s + t.unrealizedPnL, 0);
  const totalPnL         = realizedPnL + unrealizedPnL;
  const currentValue     = trades.reduce((s, t) => s + t.currentValue, 0)
                         + trades.reduce((s, t) => s + t.sells.reduce((ss, sl) => ss + sl.sellPrice * sl.sellQuantity, 0), 0);
  const closedTrades     = trades.filter(t => t.status === 'closed');
  const winTrades        = closedTrades.filter(t => t.realizedPnL > 0);
  const winRate          = closedTrades.length > 0 ? (winTrades.length / closedTrades.length) * 100 : 0;

  const cards = [
    {
      label: 'Total Invested',
      val: fmtINR(totalInvested),
      sub: `${trades.length} trade${trades.length !== 1 ? 's' : ''}`,
      color: '#818cf8',
      bg: 'rgba(129,140,248,0.08)',
    },
    {
      label: 'Realized P&L',
      val: `${realizedPnL >= 0 ? '+' : ''}${fmtINR(realizedPnL)}`,
      sub: `${closedTrades.length} closed`,
      color: pnlColor(realizedPnL),
      bg: pnlBg(realizedPnL),
    },
    {
      label: 'Unrealized P&L',
      val: `${unrealizedPnL >= 0 ? '+' : ''}${fmtINR(unrealizedPnL)}`,
      sub: `${trades.filter(t => t.status !== 'closed').length} open`,
      color: pnlColor(unrealizedPnL),
      bg: pnlBg(unrealizedPnL),
    },
    {
      label: 'Total P&L',
      val: `${totalPnL >= 0 ? '+' : ''}${fmtINR(totalPnL)}`,
      sub: totalInvested > 0 ? `${fmtPct((totalPnL / totalInvested) * 100)} overall` : '',
      color: pnlColor(totalPnL),
      bg: pnlBg(totalPnL),
    },
    {
      label: 'Win Rate',
      val: closedTrades.length > 0 ? `${winRate.toFixed(0)}%` : '—',
      sub: `${winTrades.length}/${closedTrades.length} closed`,
      color: '#a78bfa',
      bg: 'rgba(167,139,250,0.08)',
    },
    {
      label: 'Portfolio Value',
      val: fmtINR(currentValue),
      sub: totalInvested > 0 ? `${fmtPct(((currentValue - totalInvested) / totalInvested) * 100)} vs cost` : '',
      color: '#38bdf8',
      bg: 'rgba(56,189,248,0.08)',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
      {cards.map(c => (
        <div key={c.label} className="rounded-xl p-3" style={{ background: c.bg, border: '1px solid var(--border-sm)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{c.label}</p>
          <p className="text-sm font-black" style={{ color: c.color }}>{c.val}</p>
          {c.sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function PredictionTrades({
  predictions,
  onBuySuccess,
  onTradeChange,
  refreshKey,
}: {
  predictions: TradePrediction[];
  onBuySuccess?: () => void;
  /** Called after any modify or discard so the parent can refresh allTrades */
  onTradeChange?: () => void;
  refreshKey?: number;
}) {
  const [trades, setTrades]               = useState<Trade[]>([]);
  const [loading, setLoading]             = useState(true);
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [buyFor, setBuyFor]               = useState<TradePrediction | null>(null);
  const [sellFor, setSellFor]             = useState<Trade | null>(null);
  const [modifyFor, setModifyFor]         = useState<Trade | null>(null);
  const [discardFor, setDiscardFor]       = useState<Trade | null>(null);
  const [statusFilter, setStatusFilter]   = useState<'all' | TradeStatus>('all');
  const [selectedPred, setSelectedPred]   = useState<TradePrediction | null>(null);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/prediction-trades');
      const data = await res.json();
      if (data.success) setTrades(data.trades);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTrades(); }, [fetchTrades]);
  // Re-fetch whenever parent signals a trade was recorded externally (buy/sell from top cards or table)
  useEffect(() => { if (refreshKey !== undefined) fetchTrades(); }, [refreshKey]);

  const filtered = statusFilter === 'all'
    ? trades
    : trades.filter(t => t.status === statusFilter);

  const tdStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 12,
    borderBottom: '1px solid var(--border-sm)',
    whiteSpace: 'nowrap' as const,
  };

  if (loading) {
    return (
      <div className="card p-6 flex items-center justify-center gap-3" style={{ minHeight: 120 }}>
        <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading trades…</span>
      </div>
    );
  }

  return (
    <>
      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {buyFor     && <BuyModal     prediction={buyFor}  onClose={() => setBuyFor(null)}     onSuccess={() => { fetchTrades(); onBuySuccess?.(); }} />}
      {sellFor    && <SellModal    trade={sellFor}      onClose={() => setSellFor(null)}    onSuccess={fetchTrades} />}
      {modifyFor  && <ModifyModal  trade={modifyFor}    onClose={() => setModifyFor(null)}  onSuccess={() => { fetchTrades(); onTradeChange?.(); }} />}
      {discardFor && <DiscardModal trade={discardFor}   onClose={() => setDiscardFor(null)} onSuccess={() => { fetchTrades(); onTradeChange?.(); }} />}

      <div className="card overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-4"
          style={{ borderBottom: '1px solid var(--border-sm)' }}>
          <div>
            <h2 className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-hi)' }}>
              <svg className="w-4 h-4" style={{ color: '#34d399' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              My Trades from AI Predictions
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Track your actual buys/sells and P&amp;L against AI picks
            </p>
          </div>

          {/* Buy button for any prediction */}
          {predictions.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <select
                className="px-3 py-2 rounded-xl text-xs font-semibold outline-none"
                style={{
                  background: 'var(--bg-raised)',
                  border: `1px solid ${selectedPred ? 'var(--brand)' : 'var(--border-md)'}`,
                  color: selectedPred ? 'var(--text-hi)' : 'var(--text-lo)',
                  transition: 'border-color 0.15s',
                }}
                value={selectedPred?._id ?? ''}
                onChange={e => {
                  const p = predictions.find(p => p._id === e.target.value);
                  setSelectedPred(p ?? null);
                }}>
                <option value="" disabled>Select stock to buy…</option>
                {predictions.map(p => (
                  <option key={p._id} value={p._id}>{p.stockSymbol} — {p.stockName}</option>
                ))}
              </select>
              <button
                disabled={!selectedPred}
                onClick={() => { if (selectedPred) { setBuyFor(selectedPred); setSelectedPred(null); } }}
                className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-150"
                style={{
                  background: selectedPred ? 'var(--brand)' : 'var(--bg-raised)',
                  color:      selectedPred ? '#fff' : 'var(--text-muted)',
                  border:     `1px solid ${selectedPred ? 'var(--brand)' : 'var(--border-md)'}`,
                  cursor:     selectedPred ? 'pointer' : 'not-allowed',
                  opacity:    selectedPred ? 1 : 0.55,
                  boxShadow:  selectedPred ? '0 2px 10px var(--brand-glow)' : 'none',
                }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Record Buy
              </button>
            </div>
          )}
        </div>

        {/* Analytics summary */}
        {trades.length > 0 && (
          <div className="p-4" style={{ borderBottom: '1px solid var(--border-sm)' }}>
            <AnalyticsCards trades={trades} />
          </div>
        )}

        {/* Filter pills */}
        {trades.length > 0 && (
          <div className="flex items-center gap-1 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-sm)' }}>
            {(['all', 'holding', 'partial', 'closed'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="px-3 py-1 rounded-lg text-[11px] font-semibold capitalize whitespace-nowrap transition-all"
                style={statusFilter === s
                  ? { background: 'var(--brand)', color: '#fff' }
                  : { color: 'var(--text-lo)', background: 'transparent' }}>
                {s === 'all' ? `All (${trades.length})` : `${TRADE_STATUS[s].label} (${trades.filter(t => t.status === s).length})`}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {trades.length === 0 && (
          <div className="p-10 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-raised)' }}>
              <svg className="w-6 h-6" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-hi)' }}>No trades recorded yet</p>
            <p className="text-xs text-center max-w-xs" style={{ color: 'var(--text-muted)' }}>
              Use the dropdown above to record a buy when you act on an AI prediction.
            </p>
          </div>
        )}

        {/* Trades table */}
        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {['Stock', 'Buy Date', 'Qty', 'Avg Buy', 'Invested', 'Sold', 'Avg Sell', 'Remaining', 'Current ₹', 'Unrealized P&L', 'Realized P&L', 'Total P&L', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                      textTransform: 'uppercase', textAlign: h === 'Actions' ? 'center' : 'left',
                      color: 'var(--text-muted)', background: 'var(--bg-raised)',
                      borderBottom: '1px solid var(--border-md)', whiteSpace: 'nowrap',
                      position: 'sticky', top: 0, zIndex: 2,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const isExpanded = expanded === t._id;
                  const avgSellPrice = t.soldQuantity > 0
                    ? t.sells.reduce((s, sl) => s + sl.sellPrice * sl.sellQuantity, 0) / t.soldQuantity
                    : null;

                  return (
                    <>
                      <tr key={t._id}
                        style={{ background: isExpanded ? 'color-mix(in srgb,var(--brand) 4%,transparent)' : i % 2 === 0 ? 'transparent' : 'color-mix(in srgb,var(--bg-raised) 40%,transparent)' }}
                        className="cursor-pointer"
                        onClick={() => setExpanded(isExpanded ? null : t._id)}>

                        {/* Stock */}
                        <td style={tdStyle}>
                          <div className="flex items-center gap-2">
                            <div className="w-0.5 h-6 rounded-full" style={{ background: TRADE_STATUS[t.status].color }} />
                            <div>
                              <p className="text-xs font-black" style={{ color: 'var(--text-hi)' }}>{t.stockSymbol}</p>
                              <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t.stockName.slice(0, 20)}</p>
                            </div>
                          </div>
                        </td>

                        {/* Buy Date */}
                        <td style={tdStyle}><span style={{ color: 'var(--text-lo)' }}>{fmtDate(t.buyDate)}</span></td>

                        {/* Buy Qty */}
                        <td style={tdStyle}><span className="font-semibold" style={{ color: 'var(--text-lo)' }}>{t.buyQuantity}</span></td>

                        {/* Avg Buy */}
                        <td style={tdStyle}><span className="font-semibold" style={{ color: 'var(--text-lo)' }}>{fmtINR(t.buyPrice)}</span></td>

                        {/* Invested */}
                        <td style={tdStyle}><span className="font-bold" style={{ color: '#818cf8' }}>{fmtINR(t.totalInvested)}</span></td>

                        {/* Sold Qty */}
                        <td style={tdStyle}>
                          <span style={{ color: t.soldQuantity > 0 ? 'var(--text-lo)' : 'var(--border-md)' }}>
                            {t.soldQuantity > 0 ? t.soldQuantity : '—'}
                          </span>
                        </td>

                        {/* Avg Sell */}
                        <td style={tdStyle}>
                          <span style={{ color: avgSellPrice ? 'var(--text-lo)' : 'var(--border-md)' }}>
                            {avgSellPrice ? fmtINR(avgSellPrice) : '—'}
                          </span>
                        </td>

                        {/* Remaining */}
                        <td style={tdStyle}>
                          <span className="font-semibold" style={{ color: t.remainingQuantity > 0 ? 'var(--text-lo)' : 'var(--border-md)' }}>
                            {t.remainingQuantity > 0 ? t.remainingQuantity : '—'}
                          </span>
                        </td>

                        {/* Current Price */}
                        <td style={tdStyle}>
                          <span style={{ color: 'var(--text-lo)' }}>
                            {t.remainingQuantity > 0 ? fmtINR(t.currentPrice) : '—'}
                          </span>
                        </td>

                        {/* Unrealized P&L */}
                        <td style={{ ...tdStyle, background: t.remainingQuantity > 0 ? pnlBg(t.unrealizedPnL) : 'transparent' }}>
                          {t.remainingQuantity > 0 ? (
                            <div>
                              <span className="font-bold text-xs" style={{ color: pnlColor(t.unrealizedPnL) }}>
                                {t.unrealizedPnL >= 0 ? '+' : ''}{fmtINR(t.unrealizedPnL)}
                              </span>
                              <span className="text-[10px] ml-1" style={{ color: pnlColor(t.unrealizedPnLPct) }}>
                                ({fmtPct(t.unrealizedPnLPct)})
                              </span>
                            </div>
                          ) : <span style={{ color: 'var(--border-md)' }}>—</span>}
                        </td>

                        {/* Realized P&L */}
                        <td style={{ ...tdStyle, background: t.soldQuantity > 0 ? pnlBg(t.realizedPnL) : 'transparent' }}>
                          {t.soldQuantity > 0 ? (
                            <div>
                              <span className="font-bold text-xs" style={{ color: pnlColor(t.realizedPnL) }}>
                                {t.realizedPnL >= 0 ? '+' : ''}{fmtINR(t.realizedPnL)}
                              </span>
                              <span className="text-[10px] ml-1" style={{ color: pnlColor(t.realizedPnLPct) }}>
                                ({fmtPct(t.realizedPnLPct)})
                              </span>
                            </div>
                          ) : <span style={{ color: 'var(--border-md)' }}>—</span>}
                        </td>

                        {/* Total P&L */}
                        <td style={{ ...tdStyle, background: pnlBg(t.totalPnL) }}>
                          <div>
                            <span className="font-black text-xs" style={{ color: pnlColor(t.totalPnL) }}>
                              {t.totalPnL >= 0 ? '+' : ''}{fmtINR(t.totalPnL)}
                            </span>
                            <span className="text-[10px] ml-1" style={{ color: pnlColor(t.totalPnLPct) }}>
                              ({fmtPct(t.totalPnLPct)})
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td style={tdStyle}><TradeChip status={t.status} /></td>

                        {/* Actions */}
                        <td style={{ ...tdStyle, textAlign: 'center', padding: '8px 10px' }} onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 justify-center">

                            {/* Sell */}
                            <button title="Sell shares"
                              onClick={e => { e.stopPropagation(); setSellFor(t); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-90 active:scale-95"
                              style={{
                                background: t.remainingQuantity > 0 ? 'rgba(248,113,113,0.13)' : 'var(--bg-raised)',
                                color: t.remainingQuantity > 0 ? '#f87171' : 'var(--border-md)',
                                border: `1px solid ${t.remainingQuantity > 0 ? 'rgba(248,113,113,0.30)' : 'var(--border-sm)'}`,
                                cursor: t.remainingQuantity > 0 ? 'pointer' : 'not-allowed',
                                opacity: t.remainingQuantity > 0 ? 1 : 0.35,
                                pointerEvents: t.remainingQuantity > 0 ? 'auto' : 'none',
                              }}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                              </svg>
                            </button>

                            {/* Modify */}
                            <button title="Modify buy details"
                              onClick={e => { e.stopPropagation(); setModifyFor(t); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-90 active:scale-95"
                              style={{ background: 'rgba(251,191,36,0.13)', color: '#f59e0b', border: '1px solid rgba(251,191,36,0.32)' }}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>

                            {/* Discard */}
                            <button title="Permanently discard this trade"
                              onClick={e => { e.stopPropagation(); setDiscardFor(t); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-90 active:scale-95"
                              style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>

                            {/* Expand / collapse */}
                            <button title={isExpanded ? 'Collapse' : 'Expand details'}
                              onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : t._id); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-90 active:scale-95"
                              style={{
                                background: isExpanded ? 'var(--brand-bg)' : 'var(--bg-raised)',
                                color: isExpanded ? 'var(--brand)' : 'var(--text-muted)',
                                border: `1px solid ${isExpanded ? 'var(--brand-glow)' : 'var(--border-md)'}`,
                              }}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isExpanded
                                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />}
                              </svg>
                            </button>

                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr key={`${t._id}-exp`}>
                          <td colSpan={14} style={{ padding: '0 12px 12px 12px', background: 'color-mix(in srgb,var(--brand) 4%,transparent)' }}>
                            <div className="rounded-xl p-4 mt-1" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
                                {[
                                  { label: 'AI Entry Price', val: fmtINR(t.predictionEntryPrice), note: 'recommended' },
                                  { label: 'Your Buy Price', val: fmtINR(t.buyPrice), note: t.buyPrice <= t.predictionEntryPrice ? '≤ AI price ✓' : '> AI price' },
                                  { label: 'Prediction Status', val: t.predictionStatus, note: '' },
                                  { label: 'Last Price Update', val: t.lastTracked ? fmtDate(t.lastTracked) : 'Never', note: '' },
                                ].map(({ label, val, note }) => (
                                  <div key={label}>
                                    <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{label}</p>
                                    <p className="text-xs font-black mt-0.5" style={{ color: 'var(--text-lo)' }}>{val}</p>
                                    {note && <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{note}</p>}
                                  </div>
                                ))}
                              </div>
                              {t.notes && (
                                <p className="text-xs mb-3 px-3 py-2 rounded-lg"
                                  style={{ background: 'var(--bg-sunken)', color: 'var(--text-lo)', border: '1px solid var(--border-sm)' }}>
                                  📝 {t.notes}
                                </p>
                              )}
                              <SellHistory sells={t.sells} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length === 0 && trades.length > 0 && (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            No {statusFilter} trades.
          </div>
        )}
      </div>
    </>
  );
}
