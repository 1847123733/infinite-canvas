"use client";

import { App, Button, Tag } from "antd";
import { HardDrive, ShieldAlert, TerminalSquare } from "lucide-react";
import { useState } from "react";

const cleanupItems = [
    "用户临时文件夹 (%temp%)",
    "系统临时文件夹 (C:\\Windows\\Temp)",
    "Windows 更新下载缓存",
    "回收站（清空后无法恢复）",
    "Windows 系统日志",
    "Prefetch 预读取缓存",
    "资源管理器缩略图缓存",
    "IE / Edge 系统浏览器缓存",
];

export function WindowsCleanup() {
    const { message, modal } = App.useApp();
    const [launching, setLaunching] = useState(false);

    const confirmCleanup = () => {
        const runWindowsCleanup = window.desktopApp?.runWindowsCleanup;
        if (!runWindowsCleanup) {
            message.warning("请在 Windows 桌面版中使用此工具");
            return;
        }

        modal.confirm({
            title: "确认清理 C 盘",
            content: "该操作将清空回收站、系统日志、Windows 更新缓存等内容。回收站内容无法恢复，系统日志清理后可能影响故障排查。",
            okText: "继续清理",
            cancelText: "取消",
            okButtonProps: { danger: true },
            keyboard: false,
            mask: { closable: false },
            focusable: { autoFocusButton: null },
            onOk: async () => {
                setLaunching(true);
                try {
                    const result = await runWindowsCleanup();
                    if (!result.success) throw new Error(result.error || "启动失败");
                    message.success("清理窗口已启动，请在系统提示中允许管理员权限");
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "启动清理工具失败");
                } finally {
                    setLaunching(false);
                }
            },
        });
    };

    return (
        <section className="min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-background/95 shadow-sm shadow-stone-200/70 backdrop-blur dark:border-stone-800 dark:shadow-none">
            <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between dark:border-stone-800">
                <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-stone-500 dark:text-stone-400">
                        <HardDrive className="size-4" />
                        Windows 系统工具
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950 dark:text-stone-100">清理 C 盘</h2>
                </div>
                <Tag color="red" className="m-0 w-fit rounded-full px-3 py-1 text-xs">需要管理员权限</Tag>
            </div>

            <div className="grid min-h-[470px] gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div>
                    <h3 className="text-sm font-semibold text-stone-950 dark:text-stone-100">清理范围</h3>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {cleanupItems.map((item, index) => (
                            <div key={item} className="flex gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-950/50 dark:text-stone-300">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-stone-200 text-xs font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200">{index + 1}</span>
                                <span className="leading-6">{item}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-5 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-100">
                        <ShieldAlert className="mt-0.5 size-5 shrink-0" />
                        <p>执行期间会停止并重新启动 Windows Update 与 BITS 服务。请先保存工作，清理窗口结束前不要关机。</p>
                    </div>
                </div>

                <aside className="flex flex-col justify-between rounded-lg border border-stone-200 bg-stone-50 p-5 dark:border-stone-800 dark:bg-stone-950/50">
                    <div>
                        <span className="flex size-12 items-center justify-center rounded-lg bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950">
                            <TerminalSquare className="size-6" />
                        </span>
                        <h3 className="mt-4 text-lg font-semibold text-stone-950 dark:text-stone-100">内置批处理</h3>
                        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">启动后 Windows 会显示用户账户控制提示。允许后将打开命令窗口并逐项显示清理进度。</p>
                    </div>
                    <Button danger type="primary" size="large" loading={launching} onClick={confirmCleanup}>开始清理</Button>
                </aside>
            </div>
        </section>
    );
}