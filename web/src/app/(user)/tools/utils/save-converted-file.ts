import { saveAs } from "file-saver";

type SaveFilePicker = (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{
    createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}>;

export async function saveConvertedFile(blob: Blob, fileName: string, extension: string, description: string) {
    if (window.desktopApp?.saveFile) {
        const result = await window.desktopApp.saveFile({ fileName, data: await blob.arrayBuffer(), extension, description });
        if (result.canceled) return false;
        if (!result.success) throw new Error(result.error || "保存文件失败");
        return true;
    }

    const showSaveFilePicker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
    if (showSaveFilePicker) {
        try {
            const handle = await showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description, accept: { [blob.type.split(";", 1)[0]]: [`.${extension}`] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return true;
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return false;
            throw error;
        }
    }

    saveAs(blob, fileName);
    return true;
}
