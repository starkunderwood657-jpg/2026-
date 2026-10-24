import { useEffect, useRef, useState } from "react";

/** 视频批处理:上传整段视频 → 后台逐帧去雾 → 下载增强视频。 */
export default function BatchPage() {
  const [jobs, setJobs] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const load = async () => {
    try {
      const d = await (await fetch("/api/batch/jobs")).json();
      setJobs(d.jobs ?? []);
    } catch { /* ignore */ }
  };
  useEffect(() => {
    load();
    const id = setInterval(load, 1500);
    return () => clearInterval(id);
  }, []);

  const upload = async (file) => {
    if (!file) return;
    if (!/\.(mp4|avi|mov|mkv)$/i.test(file.name)) { say("请选择视频文件(mp4/avi/mov/mkv)"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/batch/start", { method: "POST", body: fd });
      const d = await r.json();
      if (d.ok) { say("批处理已启动"); load(); }
      else say(d.error ?? "启动失败");
    } catch { say("服务不可达"); }
    finally { setUploading(false); }
  };

  return (
    <div className="px-6 py-5 max-w-[1000px] mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-extrabold">视频批处理</h2>
        <span className="text-[12px] text-muted-foreground">离线逐帧去雾,适用于整段巡检录像的批量增强</span>
      </div>

      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files[0]); }}
        className="glass glass-hover p-12 text-center cursor-pointer mb-4"
        style={{ borderStyle: "dashed" }}
      >
        <p className="text-xl font-extrabold text-primary">{uploading ? "上传中…" : "拖入视频,或点击选择"}</p>
        <p className="mt-2 text-[12.5px] text-muted-foreground">mp4 / avi / mov / mkv,≤ 500MB · 逐帧使用当前引擎参数增强</p>
        <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      </div>

      {jobs === null ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : jobs.length === 0 ? (
        <div className="glass p-10 text-center text-muted-foreground text-sm">暂无批处理任务</div>
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <div key={j.id} className="glass p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[13px] font-bold truncate max-w-[280px]">{j.source_name}</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  j.status === "done" ? "bg-success/15 text-success"
                  : j.status === "failed" ? "bg-danger/15 text-danger"
                  : "bg-accent/15 text-accent"
                }`}>
                  {j.status === "done" ? "完成" : j.status === "failed" ? "失败" : "处理中"}
                </span>
                <span className="text-[11.5px] text-muted-foreground">
                  {j.processed} / {j.total_frames || "?"} 帧
                </span>
                <div className="flex-1" />
                {j.status === "done" && (
                  <a href={`/api/batch/download/${j.id}`} className="px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-[12px] font-bold no-underline">
                    下载增强视频
                  </a>
                )}
              </div>
              <div className="mt-2.5 h-2 rounded-full bg-foreground/8 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${j.status === "failed" ? "bg-danger" : j.status === "done" ? "bg-success" : "bg-accent"}`}
                  style={{ width: `${Math.round(j.progress * 100)}%` }} />
              </div>
              {j.error && <p className="mt-1.5 text-[11.5px] text-danger">{j.error}</p>}
            </div>
          ))}
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 glass px-5 py-2.5 text-sm font-semibold shadow-xl z-50">{toast}</div>}
    </div>
  );
}
