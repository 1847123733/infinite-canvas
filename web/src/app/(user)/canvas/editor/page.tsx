import { Suspense } from "react";

import CanvasClientPage, { CanvasRefreshShell } from "../[id]/canvas-client-page";

export default function CanvasEditorPage() {
    return (
        <div className="h-full">
            <Suspense fallback={<CanvasRefreshShell />}>
                <CanvasClientPage />
            </Suspense>
        </div>
    );
}
