import { useEffect, useState } from "react";
import MonitorPage from "./pages/MonitorPage.jsx";
import ArchivePage from "./pages/ArchivePage.jsx";
import StatusPage from "./pages/StatusPage.jsx";

const TABS = [
  { key: "monitor", label: "实时监控" },
  { key: "archive", label: "取证档案" },
  { key: "status", label: "系统状态" },
];

export default function App() {
  const [tab, setTab] = useState("monitor");

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶栏 */}
      <header className="flex items-center gap-4 px-6 py-3.5 border-b border-border/70 backdrop-blur-md sticky top-0 z-20 bg-background/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/80 to-accent/70 grid place-items-center font-extrabold text-primary-foreground shadow-lg shadow-primary/20">
            雾巡
          </div>
          <div>
            <p className="text-sm font-extrabold tracking-wide">雾巡 · 无人机巡检实时增强</p>
            <p className="text-[11px] text-muted-foreground">UAV Real-time Dehazing System</p>
          </div>
        </div>
        <nav className="ml-6 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === t.key
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/5 border border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <EngineBadge />
      </header>

      <main className="flex-1">
        {tab === "monitor" && <MonitorPage />}
        {tab === "archive" && <ArchivePage />}
        {tab === "status" && <StatusPage />}
      </main>

      <footer className="px-6 py-3 text-[11px] text-muted-foreground/70 border-t border-border/50">
        雾巡 W2-A · 当前增强引擎为暗通道先验占位实现(如实标注)· 所有指标为实测口径
      </footer>
    </div>
  );
}

function EngineBadge() {
  const [engine, setEngine] = useState(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const m = await (await fetch("/api/metrics")).json();
        if (alive) setEngine(m.engine);
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return (
    <span className="px-3 py-1 rounded-lg bg-accent/10 border border-accent/25 text-[11px] font-bold text-accent">
      {engine ?? "…"}{engine?.includes("placeholder") ? " · 占位" : ""}
    </span>
  );
}
