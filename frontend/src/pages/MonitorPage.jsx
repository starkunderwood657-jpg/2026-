import { useEffect, useRef, useState } from "react";

export default function MonitorPage() {
  const [mode, setMode] = useState("split"); // split | compare
  const [metrics, setMetrics] = useState(null);
  const [source, setSource] = useState("0");
  const [toast, setToast] = useState(null);
  const [split, setSplit] = useState(50);
  const [live, setLive] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const m = await (await fetch("/api/metrics")).json();
        if (!alive) return;
        setMetrics(m);
        setLive(m.fps > 0);
      } catch { if (alive) setLive(false); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const connectSource = async () => {
    try {
      const r = await fetch("/api/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: source.trim() }),
      });
      const d = await r.json();
      showToast(d.ok ? `已连接:${source.trim()}` : `打开失败:${d.error ?? "检查地址"}`);
    } catch { showToast("服务不可达"); }
  };

  const freeze = async () => {
    try {
      const d = await (await fetch("/api/freeze", { method: "POST" })).json();
      showToast(d.ok ? `对比记录 #${d.id} 已存档,可在「取证档案」查看` : (d.error ?? "冻结失败"));
    } catch { showToast("服务不可达"); }
  };

  return (
    <div className="px-6 py-5 max-w-[1400px] mx-auto w-full">
      {/* 控制条 */}
      <div className="glass px-4 py-3 flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 p-1 rounded-xl bg-foreground/5 border border-border/60">
          {[
            { key: "split", label: "左右分屏" },
            { key: "compare", label: "滑动对比" },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-all ${
                mode === m.key ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && connectSource()}
          placeholder="0 = 摄像头 / rtsp://… / 视频文件路径"
          className="flex-1 min-w-[260px] max-w-md bg-foreground/5 border border-border/70 rounded-xl px-3.5 py-2 text-[13px] outline-none focus:border-primary/50 text-foreground placeholder:text-muted-foreground/70"
        />
        <button onClick={connectSource} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold hover:brightness-110 transition">
          连接视频源
        </button>
        <button onClick={freeze} className="px-4 py-2 rounded-xl bg-accent text-accent-foreground text-[13px] font-bold hover:brightness-110 transition">
          ⬒ 冻结取证
        </button>
        <div className="flex-1" />
        <LiveBadge live={live} />
      </div>

      {/* 视图区 */}
      {mode === "split" ? (
        <div className="grid md:grid-cols-2 gap-4">
          <VideoPane title="原始画面" src="/stream/raw" sub="RAW" />
          <VideoPane title="增强画面" src="/stream/enhanced" sub="ENHANCED" accent />
        </div>
      ) : (
        <ComparePane split={split} onSplit={setSplit} />
      )}

      {/* 指标条 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        <MetricCard hero label="处理帧率" value={metrics ? metrics.fps : "–"} unit="FPS" />
        <MetricCard label="增强耗时 P50" value={metrics ? metrics.enhance_ms_p50 : "–"} unit="ms" />
        <MetricCard label="增强耗时 P95" value={metrics ? metrics.enhance_ms_p95 : "–"} unit="ms" />
        <MetricCard label="端到端延迟" value={metrics ? metrics.e2e_ms_p50 : "–"} unit="ms" />
        <MetricCard label="累计处理帧" value={metrics ? metrics.frames : "–"} unit="" />
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 glass px-5 py-2.5 text-sm font-semibold text-foreground shadow-xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

function LiveBadge({ live }) {
  return (
    <span className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-bold border ${
      live ? "bg-success/10 border-success/30 text-success" : "bg-foreground/5 border-border text-muted-foreground"
    }`}>
      <span className={`w-2 h-2 rounded-full ${live ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
      {live ? "实时处理中" : "未连接"}
    </span>
  );
}

function VideoPane({ title, src, sub, accent }) {
  return (
    <div className="glass glass-hover overflow-hidden relative aspect-video bg-black/50">
      <img src={src} alt={title} className="w-full h-full object-contain" />
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur border border-foreground/10 text-[11px] font-bold">
          {title}
          {accent && <em className="not-italic text-accent ml-1.5">占位引擎</em>}
        </span>
      </div>
      <span className="absolute top-3 right-3 px-2 py-0.5 rounded bg-black/40 text-[10px] tracking-widest text-muted-foreground">{sub}</span>
    </div>
  );
}

function ComparePane({ split, onSplit }) {
  const ref = useRef(null);
  return (
    <div ref={ref} className="glass overflow-hidden relative aspect-video bg-black/50 select-none">
      <img src="/stream/raw" alt="原始" className="absolute inset-0 w-full h-full object-contain" />
      <img src="/stream/enhanced" alt="增强" className="absolute inset-0 w-full h-full object-contain" style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
      <div className="absolute top-0 bottom-0 w-0.5 bg-accent shadow-[0_0_12px_rgba(232,150,79,0.7)]" style={{ left: `${split}%` }}>
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-accent text-accent-foreground grid place-items-center text-sm font-extrabold">⇄</span>
      </div>
      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur border border-foreground/10 text-[11px] font-bold">← 原始</span>
      <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur border border-accent/30 text-[11px] font-bold text-accent">增强 →</span>
      <input
        type="range" min={2} max={98} value={split}
        onChange={(e) => onSplit(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
      />
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-lg bg-black/50 backdrop-blur text-[11px] text-muted-foreground">拖动分割线 · 同一帧逐像素对比</span>
    </div>
  );
}

function MetricCard({ label, value, unit, hero }) {
  return (
    <div className={`glass px-4 py-3 ${hero ? "border-accent/30" : ""}`}>
      <p className="text-[11px] text-muted-foreground font-semibold tracking-wide">{label}</p>
      <p className={`mt-0.5 text-2xl font-extrabold tabular-nums ${hero ? "text-accent" : "text-foreground"}`}>
        {value}
        {unit && <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>}
      </p>
    </div>
  );
}
