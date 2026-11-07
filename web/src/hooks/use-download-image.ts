"use client";

import { useCallback } from "react";
import { App } from "antd";
import { saveAs } from "file-saver";

import { normalizeImageBlob } from "@/lib/image-format";

export function useDownloadImage() {
    const { message } = App.useApp();

    return useCallback(
        async (url: string, name: string) => {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error("读取图片失败");
                const blob = await normalizeImageBlob(await response.blob());
                const extension = (blob.type.split("/")[1] || "png").split(/[;+]/)[0].replace(/^jpeg$/, "jpg");
                saveAs(blob, `${name}.${extension}`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "下载图片失败");
            }
        },
        [message],
    );
}
