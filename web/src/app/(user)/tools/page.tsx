"use client";

import { ExternalLink, FileUp, HardDrive, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "antd";
import { useState } from "react";

import { MemoryExpander } from "@/app/(user)/tools/components/memory-expander";
import { WindowsCleanup } from "@/app/(user)/tools/components/windows-cleanup";

const OPENAI_VERIFY_URL = "https://openai.com/zh-Hans-CN/research/verify/";
const tools = [
    {
        id: "memory",
        name: "内存变大",
        description: "指定图片大小",
        tag: "本地",
        icon: FileUp,
    },
    {
        id: "windows-cleanup",
        name: "清理 C 盘",
        description: "清理 Windows 缓存",
        tag: "桌面版",
        icon: HardDrive,
    },
    {
        id: "openai-verify",
        name: "OpenAI 图像验证",
        description: "C2PA / SynthID",
        tag: "官方",
        icon: ShieldCheck,
    },
] as const;

type ToolId = (typeof tools)[number]["id"];

export default function ToolsPage() {
    const [activeTool, setActiveTool] = useState<ToolId>("memory");

    return (
        <main className="h-full overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] text-stone-950 dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)] dark:text-stone-100">
            <div className="mx-auto flex min-h-full max-w-7xl flex-col px-6 py-8">
                <header className="pb-8">
                    <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-background/80 px-3 py-1 text-xs font-medium text-stone-500 shadow-sm shadow-stone-200/60 backdrop-blur dark:border-stone-800 dark:text-stone-400 dark:shadow-none">
                        <Wrench className="size-3.5" />
                        工具集合
                    </div>
                    <h1 className="mt-4 text-4xl font-semibold tracking-normal text-stone-950 sm:text-5xl dark:text-stone-100">工具箱</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500 dark:text-stone-400">把创作流程里零散的小工具收在一处，按需要快速处理图片文件。</p>
                </header>

                <div className="grid min-h-[560px] flex-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="self-start rounded-lg border border-stone-200 bg-background/95 p-3 shadow-sm shadow-stone-200/70 backdrop-blur dark:border-stone-800 dark:shadow-none">
                        <div className="px-2 pb-2 text-xs font-medium text-stone-500 dark:text-stone-400">工具</div>
                        <div className="space-y-2">
                            {tools.map((tool) => {
                                const Icon = tool.icon;
                                const active = activeTool === tool.id;
                                return (
                                    <button
                                        key={tool.id}
                                        type="button"
                                        className={
                                            active
                                                ? "w-full rounded-lg border border-stone-300 bg-stone-100 p-3 text-left text-stone-800 shadow-sm shadow-stone-200/80 transition hover:-translate-y-0.5 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-100 dark:shadow-none"
                                                : "w-full rounded-lg border border-stone-200 bg-background p-3 text-left text-stone-700 shadow-sm shadow-stone-200/60 transition hover:-translate-y-0.5 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-200 dark:shadow-none dark:hover:border-stone-700 dark:hover:bg-stone-800/70"
                                        }
                                        onClick={() => setActiveTool(tool.id)}
                                    >
                                        <div className="flex items-start gap-3">
                                            <span
                                                className={
                                                    active
                                                        ? "flex size-10 shrink-0 items-center justify-center rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950"
                                                        : "flex size-10 shrink-0 items-center justify-center rounded-md bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950"
                                                }
                                            >
                                                <Icon className="size-5" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2">
                                                    <span className="truncate text-sm font-medium">{tool.name}</span>
                                                    <span
                                                        className={
                                                            active
                                                                ? "shrink-0 rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-stone-700 dark:text-stone-200"
                                                                : "shrink-0 rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-200"
                                                        }
                                                    >
                                                        {tool.tag}
                                                    </span>
                                                </span>
                                                <span className={active ? "mt-1 block text-xs text-stone-500 dark:text-stone-300" : "mt-1 block text-xs text-stone-500 dark:text-stone-400"}>{tool.description}</span>
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>

                    {activeTool === "memory" ? <MemoryExpander /> : activeTool === "windows-cleanup" ? <WindowsCleanup /> : <OpenAIVerifyCard />}
                </div>
            </div>
        </main>
    );
}

function OpenAIVerifyCard() {
    return (
        <section className="flex min-w-0 items-center justify-center rounded-lg border border-stone-200 bg-background/95 p-8 shadow-sm shadow-stone-200/70 backdrop-blur dark:border-stone-800 dark:shadow-none">
            <div className="max-w-md text-center">
                <span className="mx-auto flex size-14 items-center justify-center rounded-lg bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950">
                    <ShieldCheck className="size-7" />
                </span>
                <h2 className="mt-5 text-2xl font-semibold tracking-normal text-stone-950 dark:text-stone-100">OpenAI 图像验证</h2>
                <p className="mt-3 text-sm leading-6 text-stone-500 dark:text-stone-400">使用 OpenAI 官方页面上传图片并查看 C2PA / SynthID 验证结果。</p>
                <Button className="mt-6" type="primary" size="large" href={OPENAI_VERIFY_URL} target="_blank" rel="noreferrer" icon={<ExternalLink className="size-4" />}>
                    OpenAI 官方页面
                </Button>
            </div>
        </section>
    );
}
