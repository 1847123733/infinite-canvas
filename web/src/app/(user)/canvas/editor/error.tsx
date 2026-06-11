"use client";

export default function CanvasEditorError({ error, reset }: { error: Error; reset: () => void }) {
    return (
        <div className="flex h-full items-center justify-center bg-background text-foreground">
            <div className="text-center">
                <p className="text-lg font-medium">画布加载失败</p>
                <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
                <button onClick={reset} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
                    重试
                </button>
            </div>
        </div>
    );
}
