import { useEffect, useState } from "react";
import MonitorPage from "./pages/MonitorPage.jsx";
import ImageEnhancePage from "./pages/ImageEnhancePage.jsx";
import BatchPage from "./pages/BatchPage.jsx";
import TasksPage from "./pages/TasksPage.jsx";
import TowersPage from "./pages/TowersPage.jsx";
import ArchivePage from "./pages/ArchivePage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import StatusPage from "./pages/StatusPage.jsx";

/** 导航结构:与教学系统侧边栏一致(分组 + 图标位 + 折叠态提示)。 */
const NAV_GROUPS = [
  {
    label: "监控",
    items: [
      { key: "monitor", label: "实时监控", icon: "▣", desc: "双路流 / 滑动对比 / 参数调节" },
      { key: "enhance", label: "图像去雾", icon: "◫", desc: "上传单图离线增强" },
      { key: "batch", label: "视频批处理", icon: "▶", desc: "整段录像批量去雾" },
    ],
  },
  {
    label: "巡检",
    items: [
      { key: "tasks", label: "巡检任务", icon: "✓", desc: "发现登记与审核" },
      { key: "towers", label: "杆塔台账", icon: "⌖", desc: "线路台账管理" },
      { key: "archive", label: "取证档案", icon: "▤", desc: "冻结对比记录" },
      { key: "dashboard", label: "统计看板", icon: "▤", desc: "业务与性能汇总" },
    ],
  },
  {
    label: "系统",
    items: [{ key: "status", label: "系统状态", icon: "◉", desc: "引擎 / 契约 / 口径" }],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export default function App() {
  const [tab, setTab] = useState("monitor");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = ALL_ITEMS.find((t) => t.key === tab);

  return (
    <div className="min-h-screen flex">
      {/* ── 液态玻璃侧边栏(教学系统同款)── */}
      <aside
        className={`liquid-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-[width] duration-300 ${
          collapsed ? "w-[4.5rem]" : "w-64"
        } ${mobileOpen ? "" : "-translate-x-full md:translate-x-0"}`}
      >
        {/* 品牌 */}
        <div className={`flex h-[4.5rem] items-center px-4 ${collapsed ? "justify-center px-2" : ""}`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/25 text-sm font-extrabold">
              雾巡
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold tracking-tight text-sidebar-foreground">雾巡</p>
                <p className="text-[10px] font-semibold tracking-[0.16em] text-primary">UAV DEHAZING</p>
              </div>
            )}
          </div>
        </div>

        {/* 分组导航 */}
        <nav className={`flex-1 overflow-y-auto pb-3 ${collapsed ? "px-2" : "px-3"}`}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              {!collapsed && (
                <p className="mb-1.5 px-3 text-[10px] font-bold tracking-[0.12em] text-muted-foreground/75">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    title={collapsed ? item.label : item.desc}
                    onClick={() => { setTab(item.key); setMobileOpen(false); }}
                    className={`w-full flex items-center rounded-xl py-2.5 text-sm font-medium transition-all duration-200 ${
                      collapsed ? "justify-center px-2" : "gap-3 px-3"
                    } ${
                      tab === item.key
                        ? "liquid-control text-primary shadow-md"
                        : "text-sidebar-foreground/75 hover:bg-white/45 hover:text-primary"
                    }`}
                  >
                    <span className="h-[1.05rem] w-[1.05rem] shrink-0 grid place-items-center text-[13px]">{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* 折叠按钮 + 引擎徽章 */}
        <div className={`border-t border-border/70 p-3 ${collapsed ? "flex flex-col items-center" : ""}`}>
          {!collapsed && <EngineBadge />}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`grid place-items-center h-7 w-7 rounded-full border border-border bg-surface text-muted-foreground shadow-sm text-xs ${collapsed ? "mt-2" : "absolute -right-3 top-5 z-10 hidden md:grid"}`}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── 主区 ── */}
      <div className={`flex-1 min-w-0 transition-[margin] duration-300 ${collapsed ? "md:ml-[4.5rem]" : "md:ml-64"}`}>
        {/* 顶栏(教学系统 liquid-navbar 同款) */}
        <header className="liquid-navbar sticky top-0 z-30 border-b">
          <div className="flex h-[3.5rem] items-center gap-3 px-5">
            <button
              className="md:hidden liquid-control rounded-lg px-2.5 py-1.5 text-sm font-bold text-primary"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              ☰
            </button>
            <p className="text-[15px] font-extrabold text-foreground">{current.label}</p>
            <span className="hidden sm:block text-[11px] text-muted-foreground">{current.desc}</span>
            <div className="flex-1" />
            <span className="hidden md:inline text-[11px] text-muted-foreground">无人机巡检实时视觉增强</span>
            <span className="md:hidden"><EngineBadge /></span>
          </div>
        </header>

        {/* 网格底纹主区(教学系统 app-main 同款);页面自带容器与内边距 */}
        <div className="app-main">
          {tab === "monitor" && <MonitorPage />}
          {tab === "enhance" && <ImageEnhancePage />}
          {tab === "batch" && <BatchPage />}
          {tab === "tasks" && <TasksPage />}
          {tab === "towers" && <TowersPage />}
          {tab === "archive" && <ArchivePage />}
          {tab === "dashboard" && <DashboardPage />}
          {tab === "status" && <StatusPage />}
          <footer className="pb-4 text-center text-[11px] text-muted-foreground/70">
            雾巡 · 当前增强引擎为暗通道先验占位实现(如实标注)· 所有指标为实测口径
          </footer>
        </div>
      </div>
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
    <span className="inline-block px-3 py-1 rounded-lg bg-accent/10 border border-accent/25 text-[11px] font-bold text-accent">
      {engine ?? "…"}{engine?.includes("placeholder") ? " · 占位" : ""}
    </span>
  );
}
