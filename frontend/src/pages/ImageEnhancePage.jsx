import { useRef, useState } from "react";

/** 图像去雾:上传单图 → 引擎增强 → 滑动对比查看,可存入取证档案。 */
export default function ImageEnhancePage() {
  const [rawUrl, setRawUrl] = useState(null);
  const [enhUrl, setEnhUrl] = useState(null);
  const [split, setSplit] = useState(50);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);
  const [toast, setToast] = useState(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const handleFile = async (file, save = false) => {
    if (!file || !file.type.startsWith("image/")) { say("请选择图片文件"); return; }
    setBusy(true); setInfo(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/enhance/image?save=${save}`, { method: "POST", body: fd });
      const d = await r.json();
      if (!d.ok) { say(d.error ?? "处理失败"); return; }
      if (rawUrl) URL.revokeObjectURL(rawUrl);
      if (enhUrl) URL.revokeObjectURL(enhUrl);
      setRawUrl(URL.createObjectURL(file));
      setEnhUrl(`data:image/jpeg;base64,${d.image_b64}`);
      setSplit(50);
      setInfo({ name: file.name, size: (file.size / 1024).toFixed(0), capture_id: d.capture_id });
      say(save ? `已存入取证档案 #${d.capture_id}` : "处理完成");
    } catch { say("服务不可达"); }
    finally { setBusy(false); }
  };

  const download = () => {
    if (!enhUrl) return;
    const a = document.createElement("a");
    a.href = enhUrl;
    a.download = `dehazed_${info?.name?.replace(/\.[^.]+$/, "") ?? "image"}.jpg`;
    a.click();
  };

  return (
    <div className="px-6 py-5 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-extrabold">图像去雾</h2>
        <span className="text-[12px] text-muted-foreground">上传巡检照片,单图离线增强 · 当前为占位引擎(如实标注)</span>
      </div>

      {!rawUrl ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
          className={`glass glass-hover p-16 text-center cursor-pointer border-dashed ${drag ? "border-primary/60" : ""}`}
          style={{ borderStyle: "dashed" }}
        >
          <p className="text-2xl font-extrabold text-primary">{busy ? "处理中…" : "拖入图片,或点击选择"}</p>
          <p className="mt-2 text-[13px] text-muted-foreground">支持 JPG / PNG,≤ 20MB · 增强结果可下载或存入取证档案</p>
          <input
            ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      ) : (
        <>
          <div className="glass overflow-hidden relative aspect-video bg-black/80 select-none">
            <img src={rawUrl} alt="原始" className="absolute inset-0 w-full h-full object-contain" />
            <img src={enhUrl} alt="增强" className="absolute inset-0 w-full h-full object-contain" style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
            <div className="absolute top-0 bottom-0 w-0.5 bg-accent shadow-[0_0_12px_rgba(232,150,79,0.7)]" style={{ left: `${split}%` }}>
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-accent text-accent-foreground grid place-items-center text-sm font-extrabold">⇄</span>
            </div>
            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/55 text-white text-[11px] font-bold">← 原始</span>
            <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/55 text-accent text-[11px] font-bold">增强 →</span>
            <input
              type="range" min={2} max={98} value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold"
            >换一张</button>
            <button onClick={download} className="px-4 py-2 rounded-xl glass glass-hover text-[13px] font-bold">下载增强图</button>
            {info && !info.capture_id && (
              <span className="text-[12px] text-muted-foreground">需要归档?重新上传时选「上传并归档」</span>
            )}
            {info?.capture_id && (
              <span className="px-3 py-1 rounded-lg bg-success/10 border border-success/30 text-success text-[11px] font-bold">
                已存档 #${info.capture_id}
              </span>
            )}
            <div className="flex-1" />
            {info && <span className="text-[12px] text-muted-foreground">{info.name} · {info.size} KB</span>}
          </div>
          <div className="mt-3">
            <button
              onClick={() => { if (rawUrl) URL.revokeObjectURL(rawUrl); if (enhUrl) URL.revokeObjectURL(enhUrl); setRawUrl(null); setEnhUrl(null); setInfo(null); }}
              className="text-[12px] text-muted-foreground underline underline-offset-2"
            >清空重选</button>
          </div>
          <input
            ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </>
      )}

      {busy && rawUrl === null && (
        <div className="glass p-12 text-center text-muted-foreground">引擎处理中,通常数秒内完成…</div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 glass px-5 py-2.5 text-sm font-semibold shadow-xl z-50">{toast}</div>
      )}
    </div>
  );
}
