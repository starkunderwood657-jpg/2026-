import { useEffect, useState } from "react";

export default function StatusPage() {
  const [m, setM] = useState(null);
  useEffect(() => {
    const tick = async () => {
      try { setM(await (await fetch("/api/metrics")).json()); } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="px-6 py-5 max-w-[900px] mx-auto space-y-4">
      <h2 className="text-lg font-extrabold">系统状态</h2>

      <Card title="增强引擎">
        <Row k="当前引擎" v={m?.engine ?? "…"} />
        <Row k="状态" v={m?.engine?.includes("placeholder") ? "占位实现(暗通道先验,He et al. 2009 公开方法)" : "实验室模型"} warn={m?.engine?.includes("placeholder")} />
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          占位引擎仅用于打通全链路;实验室模型交付后按「模型交付契约」热替换,上层链路零改动。
          演示材料中始终如实标注引擎来源。
        </p>
      </Card>

      <Card title="模型交付契约(实验室组 ↔ 工程侧)">
        <pre className="text-[12px] leading-relaxed text-foreground/85 bg-foreground/5 rounded-xl p-3.5 overflow-x-auto">{`输入:  uint8 BGR 图像
输出:  同尺寸 uint8 BGR 增强图像
形态:  PyTorch 权重(.pth) + 最小推理脚本
指标:  单帧推理耗时(注明 GPU 型号)
交接:  AutoDL 下载 → models/ 目录 → 工程侧适配器接入`}</pre>
      </Card>

      <Card title="指标口径(诚实声明)">
        <Row k="FPS" v="最近 5 秒处理帧数 ÷ 时长" />
        <Row k="增强耗时" v="引擎单帧计算耗时(编码前)" />
        <Row k="端到端延迟" v="采集时间戳 → 增强帧就绪" />
        <p className="mt-2 text-[12px] text-muted-foreground">所有数字来自本机实测,不虚构;占位引擎效率不代表实验室模型效率。</p>
      </Card>

      <Card title="路线图">
        <Row k="W2-A(当前)" v="React 正式前端 ✓" />
        <Row k="W2-B" v="实验室模型接入 + YOLO 双路检测叠加" />
        <Row k="W3" v="实时化调优 + 检测对比页" />
        <Row k="W4" v="回放 / 参数调节 / 导出" />
      </Card>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section className="glass p-5">
      <h3 className="text-sm font-extrabold mb-3 text-primary">{title}</h3>
      {children}
    </section>
  );
}
function Row({ k, v, warn }) {
  return (
    <div className="flex gap-4 py-1.5 border-b border-border/40 last:border-0">
      <span className="w-28 shrink-0 text-[12px] text-muted-foreground">{k}</span>
      <span className={`text-[13px] font-semibold ${warn ? "text-accent" : ""}`}>{v}</span>
    </div>
  );
}
