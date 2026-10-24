import { useEffect, useState } from "react";

const KIND = { defect: "缺陷", foreign: "异物", other: "其他" };
const STATUS = { pending: "待审核", confirmed: "已确认", rejected: "已排除" };

export default function TasksPage() {
  const [tasks, setTasks] = useState(null);
  const [towers, setTowers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", section: "", note: "" });
  const [detail, setDetail] = useState(null); // {task, findings}
  const [report, setReport] = useState(null);
  const [toast, setToast] = useState(null);

  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const load = async () => {
    const d = await (await fetch("/api/tasks")).json();
    setTasks(d.tasks ?? []);
    const t = await (await fetch("/api/towers")).json();
    setTowers(t.towers ?? []);
  };
  useEffect(() => { load(); }, []);

  const createTask = async () => {
    const r = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.ok) { setCreating(false); setForm({ name: "", section: "", note: "" }); say("任务已创建"); load(); }
    else say(d.error);
  };

  const openDetail = async (id) => {
    const d = await (await fetch(`/api/tasks/${id}`)).json();
    if (d.ok) { setDetail(d); setReport(null); }
  };

  const review = async (fid, status) => {
    await fetch(`/api/findings/${fid}/review?status=${status}`, { method: "POST" });
    openDetail(detail.task.id);
    load();
  };

  const toggleClose = async (t) => {
    await fetch(`/api/tasks/${t.id}/close?closed=${t.status === "open"}`, { method: "POST" });
    load(); openDetail(t.id);
  };

  const genReport = async () => {
    let metrics = {};
    try { metrics = await (await fetch("/api/metrics")).json(); } catch {}
    const r = await fetch(`/api/tasks/${detail.task.id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metrics) });
    const d = await r.json();
    if (d.ok) setReport(d.report);
  };

  if (!tasks) return <p className="p-8 text-muted-foreground">加载中…</p>;

  return (
    <div className="px-6 py-5 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-extrabold">巡检任务</h2>
        <span className="text-[12px] text-muted-foreground">创建任务 → 执行巡检(取证/登记发现)→ 人工审核 → 生成报告</span>
        <div className="flex-1" />
        <button onClick={() => setCreating(!creating)} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold">
          + 新建任务
        </button>
      </div>

      {creating && (
        <div className="glass p-4 mb-4 grid md:grid-cols-4 gap-3 items-end">
          <Field label="任务名称"><input className="inp" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如:110kV 甲乙线雾天特巡" /></Field>
          <Field label="杆塔区段"><input className="inp" value={form.section} onChange={e => setForm({ ...form, section: e.target.value })} placeholder="如:N1—N15" /></Field>
          <Field label="备注"><input className="inp" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="选填" /></Field>
          <button onClick={createTask} className="px-4 py-2 rounded-xl bg-accent text-accent-foreground text-[13px] font-bold h-[38px]">创建</button>
        </div>
      )}

      <div className="grid md:grid-cols-[340px_1fr] gap-4">
        <div className="glass p-2.5 max-h-[600px] overflow-y-auto space-y-1.5">
          {tasks.length === 0 && <p className="p-6 text-center text-muted-foreground text-sm">暂无任务,点右上「新建任务」</p>}
          {tasks.map((t) => (
            <button key={t.id} onClick={() => openDetail(t.id)}
              className={`w-full text-left px-3.5 py-3 rounded-xl transition-all ${detail?.task?.id === t.id ? "bg-primary/15 border border-primary/30" : "border border-transparent hover:bg-foreground/5"}`}>
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-bold flex-1 truncate">{t.name}</p>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.status === "open" ? "bg-success/15 text-success" : "bg-foreground/10 text-muted-foreground"}`}>
                  {t.status === "open" ? "进行中" : "已归档"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {t.section || "未设区段"} · 发现 {t.findings_total}(确认 {t.findings_confirmed} / 待审 {t.findings_pending})
              </p>
            </button>
          ))}
        </div>

        <div>
          {!detail ? (
            <div className="glass p-12 text-center text-muted-foreground text-sm">← 选择任务查看详情与审核</div>
          ) : (
            <TaskDetail
              detail={detail} towers={towers} onReview={review} onToggleClose={toggleClose}
              onGenReport={genReport} report={report} setReport={setReport} say={say}
              onRefresh={load} onRefreshDetail={openDetail}
            />
          )}
        </div>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 glass px-5 py-2.5 text-sm font-semibold shadow-xl z-50">{toast}</div>}
      <style>{`.inp{width:100%;background:rgba(15,40,38,.04);border:1px solid var(--color-border);border-radius:.6rem;padding:.5rem .8rem;font-size:13px;color:var(--color-foreground);outline:none;background-color:transparent}.inp:focus{border-color:color-mix(in oklab,var(--color-primary)50%,transparent)}`}</style>
    </div>
  );
}

function TaskDetail({ detail, towers, onReview, onToggleClose, onGenReport, report, setReport, say, onRefresh, onRefreshDetail }) {
  const { task, findings } = detail;
  const [reg, setReg] = useState({ tower_id: "", kind: "defect", note: "" });
  const [showReg, setShowReg] = useState(false);

  const registerLatestCapture = async () => {
    try {
      const cap = await (await fetch("/api/freeze", { method: "POST" })).json();
      if (!cap.ok) { say(cap.error || "冻结失败"); return; }
      const r = await fetch("/api/findings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id, tower_id: reg.tower_id ? Number(reg.tower_id) : null, capture_id: cap.id, kind: reg.kind, note: reg.note }),
      });
      const d = await r.json();
      if (d.ok) { say(`发现 #${d.finding.id} 已登记(取证 #${cap.id})`); setShowReg(false); onRefresh(); onRefreshDetail(task.id); }
      else say(d.error);
    } catch { say("服务不可达"); }
  };

  return (
    <div className="space-y-4">
      <div className="glass p-5">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-base font-extrabold">{task.name}</h3>
            <p className="text-[12px] text-muted-foreground mt-1">
              区段 {task.section || "—"} · 创建于 {new Date(task.created_at * 1000).toLocaleString("zh-CN")} · 状态 {task.status === "open" ? "进行中" : "已归档"}
            </p>
            {task.note && <p className="text-[12px] text-muted-foreground mt-1">{task.note}</p>}
          </div>
          <button onClick={() => onToggleClose(task)} className="px-3.5 py-1.5 rounded-xl glass text-[12px] font-bold">
            {task.status === "open" ? "归档任务" : "重新开启"}
          </button>
          <button onClick={onGenReport} className="px-3.5 py-1.5 rounded-xl bg-accent text-accent-foreground text-[12px] font-bold">生成报告</button>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => setShowReg(!showReg)} className="px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-[12px] font-bold">
            ⬒ 冻结当前画面并登记发现
          </button>
        </div>
        {showReg && (
          <div className="mt-3 grid md:grid-cols-4 gap-3 items-end">
            <Field label="关联杆塔">
              <select className="inp" value={reg.tower_id} onChange={e => setReg({ ...reg, tower_id: e.target.value })}>
                <option value="">不指定</option>
                {towers.map(t => <option key={t.id} value={t.id}>{t.code}</option>)}
              </select>
            </Field>
            <Field label="类型">
              <select className="inp" value={reg.kind} onChange={e => setReg({ ...reg, kind: e.target.value })}>
                {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="备注"><input className="inp" value={reg.note} onChange={e => setReg({ ...reg, note: e.target.value })} placeholder="选填" /></Field>
            <button onClick={registerLatestCapture} className="px-4 py-2 rounded-xl bg-accent text-accent-foreground text-[13px] font-bold h-[38px]">确认登记</button>
          </div>
        )}
      </div>

      <div className="glass p-4">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-sm font-extrabold text-primary">发现记录与审核</h4>
          <span className="text-[11px] text-muted-foreground">共 {findings.length} 条</span>
        </div>
        {findings.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">暂无发现——巡检时点「冻结当前画面并登记发现」</p>
        ) : (
          <div className="divide-y divide-border/40">
            {findings.map((f) => (
              <div key={f.id} className="flex items-center gap-3 py-2.5">
                <span className="text-[12px] font-bold w-14">#{f.id}</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-foreground/10">{KIND[f.kind] ?? f.kind}</span>
                <span className="text-[12px] text-muted-foreground">{f.tower_code ? `杆塔 ${f.tower_code}` : "未指定杆塔"}</span>
                {f.note && <span className="text-[12px] text-muted-foreground truncate flex-1">{f.note}</span>}
                <div className="flex-1" />
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${f.status === "confirmed" ? "bg-success/15 text-success" : f.status === "rejected" ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent"}`}>
                  {STATUS[f.status]}
                </span>
                {f.status === "pending" && (
                  <span className="flex gap-1.5">
                    <button onClick={() => onReview(f.id, "confirmed")} className="px-2.5 py-1 rounded-lg bg-success/20 text-success text-[11px] font-bold">确认</button>
                    <button onClick={() => onReview(f.id, "rejected")} className="px-2.5 py-1 rounded-lg bg-danger/15 text-danger text-[11px] font-bold">排除</button>
                  </span>
                )}
                {f.capture_id && (
                  <a href={`/api/captures/${f.capture_id}/image?kind=enhanced`} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg glass text-[11px] font-bold">查看图</a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {report && <ReportView report={report} onClose={() => setReport(null)} />}
    </div>
  );
}

function ReportView({ report, onClose }) {
  const s = report.summary;
  return (
    <div className="glass p-5">
      <div className="flex items-center gap-3 mb-3">
        <h4 className="text-sm font-extrabold text-primary">巡检报告 · {report.task.name}</h4>
        <div className="flex-1" />
        <button onClick={onClose} className="px-3 py-1 rounded-lg glass text-[12px] font-bold">收起</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="发现总数" v={s.findings_total} />
        <Stat label="已确认" v={s.by_status.confirmed ?? 0} ok />
        <Stat label="待审核" v={s.by_status.pending ?? 0} warn />
        <Stat label="已排除" v={s.by_status.rejected ?? 0} />
        <Stat label="取证图" v={s.captures_total} />
      </div>
      {Object.keys(s.by_tower).length > 0 && (
        <div className="mt-3 text-[12px] text-muted-foreground">
          杆塔分布:{Object.entries(s.by_tower).map(([k, v]) => `${k}(${v})`).join(" · ")}
        </div>
      )}
      {report.metrics?.fps !== undefined && (
        <div className="mt-1.5 text-[12px] text-muted-foreground">
          生成时性能:FPS {report.metrics.fps} · 增强耗时 P50 {report.metrics.enhance_ms_p50}ms · 端到端 {report.metrics.e2e_ms_p50}ms
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-muted-foreground font-semibold mb-1">{label}</span>
      {children}
    </label>
  );
}
function Stat({ label, v, ok, warn }) {
  return (
    <div className="glass px-3.5 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-xl font-extrabold tabular-nums ${ok ? "text-success" : warn ? "text-accent" : ""}`}>{v}</p>
    </div>
  );
}
