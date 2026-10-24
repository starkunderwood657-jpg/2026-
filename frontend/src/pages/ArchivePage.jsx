import { useEffect, useState } from "react";

export default function ArchivePage() {
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const d = await (await fetch("/api/captures")).json();
      setItems(d.captures ?? []);
    } catch { setError("服务不可达"); }
  };
  useEffect(() => { load(); }, []);

  if (error) return <p className="p-8 text-muted-foreground">{error}</p>;
  if (!items) return <p className="p-8 text-muted-foreground">加载中…</p>;

  return (
    <div className="px-6 py-5 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-extrabold">取证档案</h2>
        <span className="text-[12px] text-muted-foreground">冻结对比记录(原始/增强同帧双图)</span>
        <div className="flex-1" />
        <button onClick={load} className="px-3.5 py-1.5 rounded-xl glass text-[12px] font-bold hover:border-primary/40">刷新</button>
      </div>

      {items.length === 0 ? (
        <div className="glass p-12 text-center text-muted-foreground text-sm">
          暂无记录——回到「实时监控」点「⬒ 冻结取证」生成第一组对比。
        </div>
      ) : (
        <div className="grid md:grid-cols-[300px_1fr] gap-4">
          <div className="glass p-2.5 max-h-[560px] overflow-y-auto">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => setSelected(it)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all ${
                  selected?.id === it.id ? "bg-primary/15 border border-primary/30" : "border border-transparent hover:bg-foreground/5"
                }`}
              >
                <p className="text-[13px] font-bold">记录 #{it.id}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(it.created_at * 1000).toLocaleString("zh-CN")}</p>
              </button>
            ))}
          </div>
          <div>
            {selected ? (
              <PairView id={selected.id} />
            ) : (
              <div className="glass p-12 text-center text-muted-foreground text-sm">← 选择一条记录查看对比</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PairView({ id }) {
  const base = `/api/captures/${id}/image?kind=`;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="glass overflow-hidden relative aspect-video bg-black/50">
        <img src={`${base}raw`} alt="原始" className="w-full h-full object-contain" />
        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 text-[11px] font-bold">原始</span>
      </div>
      <div className="glass overflow-hidden relative aspect-video bg-black/50">
        <img src={`${base}enhanced`} alt="增强" className="w-full h-full object-contain" />
        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 text-[11px] font-bold text-accent">增强</span>
      </div>
    </div>
  );
}
