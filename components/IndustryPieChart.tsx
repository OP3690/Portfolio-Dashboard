'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface IndustryPieChartProps {
  data: Array<{
    sector: string;
    percentage: number;
    amount: number;
    xirr: number;
    cagr: number;
    overallReturnPercent: number;
    profitLossPercent: number;
    profitLossAmount: number;
  }>;
}

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#3b82f6',
];

export default function IndustryPieChart({ data }: IndustryPieChartProps) {
  const chartData = data.map((item, index) => ({
    ...item,
    name: item.sector,
    fill: COLORS[index % COLORS.length],
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="card px-3 py-2.5 text-sm" style={{ minWidth: 160 }}>
          <p className="font-bold text-hi mb-1">{d.sector}</p>
          <p className="text-brand metric-value">{formatCurrency(d.amount)}</p>
          <p className="text-lo metric-value">{d.percentage.toFixed(2)}%</p>
        </div>
      );
    }
    return null;
  };

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.03) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central" fontSize={12} fontWeight="700">
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    );
  };

  const renderLegend = (props: any) => {
    const { payload } = props;
    return (
      <div className="flex flex-wrap justify-center gap-2.5 mt-3">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: entry.color }} />
            <span className="text-xs text-lo">{entry.payload.sector}</span>
          </div>
        ))}
      </div>
    );
  };

  const rateColor = (v: number) =>
    v >= 9 ? 'var(--gain)' : v >= 5 ? 'var(--warn)' : 'var(--loss)';

  return (
    <div className="card p-6">
      <div className="flex justify-between items-center mb-5">
        <h2 className="section-title text-lg">Holdings Across Industries</h2>
        <p className="text-sm text-lo font-medium">Industry Breakdown</p>
      </div>

      {data.length === 0 ? (
        <p className="text-muted text-center py-8">No data available</p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Pie chart */}
          <div className="flex-1 lg:w-1/2 rounded-xl p-2" style={{ background: 'var(--bg-raised)' }}>
            <ResponsiveContainer width="100%" height={380}>
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" labelLine={false}
                  label={CustomLabel} outerRadius={120} dataKey="amount" nameKey="sector"
                  isAnimationActive={true}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} stroke="var(--bg-surface)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend content={renderLegend} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Sector list */}
          <div className="flex-1 lg:w-1/2">
            <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
              {data.map((item, index) => (
                <div key={item.sector} className="p-4 rounded-xl transition-all duration-150"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-sunken)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-raised)'; }}>

                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded shrink-0" style={{ background: COLORS[index % COLORS.length] }} />
                      <span className="text-sm font-semibold text-hi">{item.sector}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-hi metric-value">{formatCurrency(item.amount)}</p>
                      <p className="text-xs text-lo metric-value">{item.percentage.toFixed(1)}%</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {[
                      { label: 'XIRR', val: item.xirr },
                      { label: 'CAGR', val: item.cagr },
                      { label: 'Overall Return', val: item.overallReturnPercent },
                      { label: 'P/L %', val: item.profitLossPercent },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <span className="text-lo">{label}: </span>
                        <span className="font-semibold metric-value" style={{ color: rateColor(val) }}>
                          {val >= 0 ? '+' : ''}{val.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                    <div className="col-span-2">
                      <span className="text-lo">P/L Amount: </span>
                      <span className="font-semibold metric-value"
                        style={{ color: item.profitLossAmount >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                        {item.profitLossAmount >= 0 ? '+' : ''}{formatCurrency(item.profitLossAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
