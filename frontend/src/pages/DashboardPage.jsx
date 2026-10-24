import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const KIND = { defect: "缺陷", foreign: "异物", other: "其他" };
const STATUS = { confirmed: "已确认", pending: "待审核", rejected: "已排除" };
const STATUS_COLOR = { confirmed: "#10b981", pending: "#e8964f", rejected: "#ef4444" };

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [fpsHistory, setFpsHistory] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await (await fetch("/api/stats")).json();
        if (alive && d.ok) setStats(d);
      } catch { /* ignore */ }
    };
    load();
    const id1 = setInterval(load, 5000);
    // 帧率曲线:前端每秒采样,滚动 60 点
    const id2 = setInterval(async () => {
      try {
        const m = await (await fetch("/api/metrics")).json();
        if (!alive) return;
        setFpsHistory((h) => [...h.slice(-59), { t: h.length, fps: m.fps, e2e: m.e2e_ms_p50 }]);
      } catch { /* ignore */ }
    }, 1000);
    return () => { alive = false; clearInterval(id1); clearInterval(id2); };
  }, []);

  if (!stats) return <p className="text-muted-foreground">加载中…</p>;

  const statusData = Object.entries(stats.by_status).map(([k, v]) => ({ name: STATUS[k] ?? k, value: v, key: k }));
  const kindData = Object.entries(stats.by_kind).map(([k, v]) => ({ name: KIND[k] ?? k, 数量: v }));
  const towerData = Object.entries(stats.by_tower).map(([k, v]) => ({ name: k, 发现数: v }));
  const timelineData = stats.timeline.map((f) => ({
    name: `#${f.id}`,
    累计: 0,
    kind: KIND[f.kind],
    status: STATUS[f.status],
    time: new Date(f.created_at * 1000).toLocaleTimeString("zh-CN"),
  }));
  timelineData.forEach((d, i) => { d.累计 = i + 1; });

  return (
    <div className="px-6 py-5 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-extrabold">统计看板</h2>
        <span className="text-[12px] text-muted-foreground">巡检业务与运行性能的实时汇总 · 5 秒刷新</span>
      </div>

      {/* 概览卡 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="巡检任务" v={stats.tasks_total} />
        <Stat label="杆塔台账" v={stats.towers_total} />
        <Stat label="发现总数" v={stats.findings_total} hero />
        <Stat label="已确认" v={stats.by_status.confirmed ?? 0} ok />
        <Stat label="取证图" v={stats.captures_total} />
      </div>

      {/* 实时性能曲线 */}
      <div className="glass p-4">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-extrabold text-primary">实时性能</h3>
          <span className="text-[11px] text-muted-foreground">最近 60 秒采样 · FPS / 端到端延迟</span>
          <div className="flex-1" />
          <span className="text-[12px] text-muted-foreground">
            当前 {stats.metrics.fps} FPS · P50 {stats.metrics.enhance_ms_p50}ms
          </span>
        </div>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={fpsHistory} margin={{ top: 5, right: 10, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
              <XAxis dataKey="t" hide />
              <YAxis yAxisId="l" fontSize={11} stroke="#64748b" />
              <YAxis yAxisId="r" orientation="right" fontSize={11} stroke="#e8964f" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="l" type="monotone" dataKey="fps" name="FPS" stroke="#0e7490" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="r" type="monotone" dataKey="e2e" name="端到端 ms" stroke="#e8964f" strokeWidth={1.6} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* 审核状态 */}
        <div className="glass p-4">
          <h3 className="text-sm font-extrabold text-primary mb-3">审核状态</h3>
          {statusData.length === 0 ? <Empty /> : (
            <div className="space-y-2.5">
              {statusData.map((s) => (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="w-16 text-[12px] text-muted-foreground">{s.name}</span>
                  <div className="flex-1 h-5 rounded-lg bg-foreground/5 overflow-hidden">
                    <div className="h-full rounded-lg transition-all"
                      style={{ width: `${Math.max(4, (s.value / stats.findings_total) * 100)}%`, background: STATUS_COLOR[s.key] }} />
                  </div>
                  <span className="w-8 text-right text-sm font-extrabold tabular-nums">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 类型分布 */}
        <div className="glass p-4">
          <h3 className="text-sm font-extrabold text-primary mb-3">发现类型</h3>
          {kindData.length === 0 ? <Empty /> : (
            <div style={{ height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kindData} margin={{ top: 5, right: 5, bottom: 0, left: -22 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
                  <XAxis dataKey="name" fontSize={11} stroke="#64748b" />
                  <YAxis allowDecimals={false} fontSize={11} stroke="#64748b" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                  <Bar dataKey="数量" fill="#0e7490" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* 杆塔分布 */}
        <div className="glass p-4">
          <h3 className="text-sm font-extrabold text-primary mb-3">杆塔分布</h3>
          {towerData.length === 0 ? <Empty /> : (
            <div style={{ height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={towerData} layout="vertical" margin={{ top: 5, right: 12, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
                  <XAxis type="number" allowDecimals={false} fontSize={11} stroke="#64748b" />
                  <YAxis type="category" dataKey="name" width={56} fontSize={11} stroke="#64748b" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                  <Bar dataKey="发现数" fill="#e8964f" radius={[0, 6, 6, 0]}>
                    {towerData.map((_, i) => <Cell key={i} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* 发现累计曲线 */}
      <div className="glass p-4">
        <h3 className="text-sm font-extrabold text-primary mb-3">发现累计(最近 {stats.timeline.length} 条)</h3>
        {timelineData.length === 0 ? <Empty /> : (
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData} margin={{ top: 5, right: 10, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
                <XAxis dataKey="name" fontSize={10} stroke="#64748b" />
                <YAxis allowDecimals={false} fontSize={11} stroke="#64748b" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 10 }}
                  formatter={(v, n, p) => [v, n]}
                  labelFormatter={(v, payload) => payload?.[0]?.payload ? `${payload[0].payload.time} · ${payload[0].payload.kind}` : v}
                />
                <Line type="monotone" dataKey="累计" stroke="#0e7490" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, v, hero, ok }) {
  return (
    <div className={`glass px-4 py-3 ${hero ? "border-accent/30" : ""}`}>
      <p className="text-[11px] text-muted-foreground font-semibold tracking-wide">{label}</p>
      <p className={`mt-0.5 text-2xl font-extrabold tabular-nums ${hero ? "text-accent" : ok ? "text-success" : ""}`}>{v}</p>
    </div>
  );
}
function Empty() {
  return <p className="py-8 text-center text-[12px] text-muted-foreground">暂无数据 · 去巡检任务页登记发现</p>;
}
