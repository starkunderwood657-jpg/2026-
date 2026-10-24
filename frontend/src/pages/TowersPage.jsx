import { useEffect, useState } from "react";

export default function TowersPage() {
  const [towers, setTowers] = useState(null);
  const [form, setForm] = useState({ code: "", section: "", location: "", note: "" });
  const [toast, setToast] = useState(null);
  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };

  const load = async () => {
    const d = await (await fetch("/api/towers")).json();
    setTowers(d.towers ?? []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    const r = await fetch("/api/towers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.ok) { setForm({ code: "", section: "", location: "", note: "" }); say("杆塔已登记"); load(); }
    else say(d.error);
  };

  const del = async (id) => {
    await fetch(`/api/towers/${id}`, { method: "DELETE" });
    load();
  };

  if (!towers) return <p className="p-8 text-muted-foreground">加载中…</p>;

  return (
    <div className="px-6 py-5 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-extrabold">杆塔台账</h2>
        <span className="text-[12px] text-muted-foreground">巡检发现的归属对象;编号建议与线路台账一致</span>
      </div>

      <div className="glass p-4 mb-4 grid md:grid-cols-5 gap-3 items-end">
        {[
          ["杆塔编号", "code", "如:N07"], ["区段", "section", "如:甲乙线Ⅰ回"], ["位置", "location", "如:K12+300 山脊"], ["备注", "note", "选填"],
        ].map(([label, key, ph]) => (
          <label key={key} className="block">
            <span className="block text-[11px] text-muted-foreground font-semibold mb-1">{label}</span>
            <input
              className="w-full bg-foreground/5 border border-border/70 rounded-xl px-3 py-2 text-[13px] outline-none focus:border-primary/50"
              value={form[key]} placeholder={ph}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
        <button onClick={add} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold h-[38px]">+ 登记</button>
      </div>

      {towers.length === 0 ? (
        <div className="glass p-12 text-center text-muted-foreground text-sm">暂无杆塔记录</div>
      ) : (
        <div className="glass overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] text-muted-foreground border-b border-border/60">
                <th className="px-4 py-2.5 font-semibold">编号</th>
                <th className="px-4 py-2.5 font-semibold">区段</th>
                <th className="px-4 py-2.5 font-semibold">位置</th>
                <th className="px-4 py-2.5 font-semibold">备注</th>
                <th className="px-4 py-2.5 font-semibold w-20"></th>
              </tr>
            </thead>
            <tbody>
              {towers.map((t) => (
                <tr key={t.id} className="border-b border-border/30 last:border-0 hover:bg-foreground/[.03]">
                  <td className="px-4 py-2.5 text-[13px] font-bold">{t.code}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground">{t.section || "—"}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground">{t.location || "—"}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground">{t.note || "—"}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => del(t.id)} className="px-2.5 py-1 rounded-lg bg-danger/15 text-danger text-[11px] font-bold">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 glass px-5 py-2.5 text-sm font-semibold shadow-xl z-50">{toast}</div>}
    </div>
  );
}
