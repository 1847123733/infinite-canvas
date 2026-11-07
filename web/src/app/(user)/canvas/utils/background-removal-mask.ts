// 按主体外轮廓扣背景，封闭区域中的白底、高光和低置信度斑点均保留原图。
export function applyForegroundMask(source: ImageData, mask: Uint8Array) {
    const { width, height, data } = source;
    const silhouette = new Uint8Array(width * height);
    for (let i = 0; i < silhouette.length; i++) silhouette[i] = Number(mask[i * 4 + 3] >= 128);

    // 闭运算接合细小裂缝，避免外部背景沿模型产生的裂缝进入主体内部。
    const radius = Math.max(1, Math.round(Math.max(width, height) / 512));
    const closed = filterMask(filterMask(silhouette, width, height, radius, true), width, height, radius, false);
    fillInterior(closed, width, height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // 仅在轮廓的一像素过渡带做羽化，内部完全沿用原图透明度。
            let covered = 0;
            let samples = 0;
            for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
                for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
                    covered += closed[ny * width + nx];
                    samples++;
                }
            }
            const offset = (y * width + x) * 4 + 3;
            data[offset] = Math.round((data[offset] * covered) / samples);
        }
    }
}

// 二值膨胀/腐蚀采用横纵滑动窗口，处理耗时不随修补半径增加。
function filterMask(mask: Uint8Array, width: number, height: number, radius: number, dilate: boolean) {
    let input = mask;
    for (const horizontal of [true, false]) {
        const output = new Uint8Array(mask.length);
        const length = horizontal ? width : height;
        const lines = horizontal ? height : width;
        const stride = horizontal ? 1 : width;
        for (let line = 0; line < lines; line++) {
            const start = horizontal ? line * width : line;
            let count = 0;
            for (let i = 0; i <= Math.min(radius, length - 1); i++) count += input[start + i * stride];
            for (let i = 0; i < length; i++) {
                const samples = Math.min(length - 1, i + radius) - Math.max(0, i - radius) + 1;
                output[start + i * stride] = Number(dilate ? count > 0 : count === samples);
                if (i >= radius) count -= input[start + (i - radius) * stride];
                if (i + radius + 1 < length) count += input[start + (i + radius + 1) * stride];
            }
        }
        input = output;
    }
    return input;
}

function fillInterior(mask: Uint8Array, width: number, height: number) {
    const queue = new Int32Array(mask.length);
    let tail = 0;
    const visit = (index: number) => {
        if (mask[index] !== 0) return;
        mask[index] = 2;
        queue[tail++] = index;
    };
    // 只有能从图像边缘到达的区域才是外部背景。
    for (let x = 0; x < width; x++) {
        visit(x);
        visit((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
        visit(y * width);
        visit(y * width + width - 1);
    }
    for (let head = 0; head < tail; head++) {
        const index = queue[head];
        const x = index % width;
        if (x > 0) visit(index - 1);
        if (x < width - 1) visit(index + 1);
        if (index >= width) visit(index - width);
        if (index < mask.length - width) visit(index + width);
    }
    for (let i = 0; i < mask.length; i++) mask[i] = Number(mask[i] !== 2);
}
