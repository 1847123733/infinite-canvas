type ForegroundCrop = { x: number; y: number; width: number; height: number };

export function getForegroundCrop(mask: Uint8Array, width: number, height: number) {
    return selectMainComponents(mask, width, height).crop;
}

// 按主体外轮廓扣背景，封闭区域中的白底、高光和低置信度斑点均保留原图。
export function applyForegroundMask(source: ImageData, mask: Uint8Array) {
    const { width, height, data } = source;
    const selected = selectMainComponents(mask, width, height);
    const silhouette = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        const sy = Math.min(selected.height - 1, Math.floor((y * selected.height) / height));
        for (let x = 0; x < width; x++) {
            const sx = Math.min(selected.width - 1, Math.floor((x * selected.width) / width));
            const index = y * width + x;
            silhouette[index] = Number(mask[index * 4 + 3] >= 128 && selected.mask[sy * selected.width + sx] !== 0);
        }
    }

    // 闭运算接合细小裂缝，避免外部背景沿模型产生的裂缝进入主体内部。
    const radius = Math.max(1, Math.round(Math.max(width, height) / 512));
    const closed = filterMask(filterMask(silhouette, width, height, radius, true), width, height, radius, false);
    fillInterior(closed, width, height);

    // 只在外轮廓附近使用模型的连续蒙版，避免硬阈值加统一羽化产生锯齿和白边。
    const edgeRadius = Math.max(1, Math.ceil(Math.max(width, height) / 1024));
    const interior = filterMask(closed, width, height, edgeRadius, false);
    const support = filterMask(closed, width, height, edgeRadius, true);
    for (let i = 0; i < closed.length; i++) {
        const offset = i * 4 + 3;
        const alpha = interior[i] ? 255 : support[i] ? mask[offset] : 0;
        data[offset] = Math.round((data[offset] * alpha) / 255);
    }
}

function selectMainComponents(mask: Uint8Array, width: number, height: number) {
    // 连通区域分析限制在模型精度内，避免大图额外分配原尺寸的整型标签和队列。
    const scale = Math.max(1, Math.max(width, height) / 1024);
    const w = Math.max(1, Math.round(width / scale));
    const h = Math.max(1, Math.round(height / scale));
    const sampled = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / h));
        for (let x = 0; x < w; x++) {
            const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / w));
            sampled[y * w + x] = Number(mask[(sy * width + sx) * 4 + 3] >= 128);
        }
    }

    const queue = new Int32Array(sampled.length);
    const components: { start: number; end: number }[] = [];
    let tail = 0;
    let largest = 0;
    const visit = (index: number) => {
        if (sampled[index] !== 1) return;
        sampled[index] = 2;
        queue[tail++] = index;
    };
    for (let i = 0; i < sampled.length; i++) {
        if (sampled[i] !== 1) continue;
        const start = tail;
        visit(i);
        for (let head = start; head < tail; head++) {
            const index = queue[head];
            const x = index % w;
            if (x > 0) visit(index - 1);
            if (x < w - 1) visit(index + 1);
            if (index >= w) visit(index - w);
            if (index < sampled.length - w) visit(index + w);
        }
        components.push({ start, end: tail });
        largest = Math.max(largest, tail - start);
    }
    // 同时保留成组商品；相对主体很小的独立文字、装饰和碎点不进入后续闭运算。
    let kept = 0;
    let left = w;
    let top = h;
    let right = 0;
    let bottom = 0;
    for (const { start, end } of components) {
        const keep = Number(end - start >= largest * 0.1);
        for (let i = start; i < end; i++) {
            const index = queue[i];
            sampled[index] = keep;
            if (!keep) continue;
            kept++;
            const x = index % w;
            const y = Math.floor(index / w);
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
    }

    let crop: ForegroundCrop | undefined;
    // 海报外围干扰较多时，聚焦商品重跑同一模型，改善白色包装被文字干扰而漏识别的问题。
    if (kept > 0 && tail - kept >= largest * 0.1) {
        const padding = Math.ceil(Math.max(((right - left + 1) * width) / w, ((bottom - top + 1) * height) / h) * 0.05);
        const x = Math.max(0, Math.floor((left * width) / w) - padding);
        const y = Math.max(0, Math.floor((top * height) / h) - padding);
        const endX = Math.min(width, Math.ceil(((right + 1) * width) / w) + padding);
        const endY = Math.min(height, Math.ceil(((bottom + 1) * height) / h) + padding);
        if ((endX - x) * (endY - y) < width * height * 0.8) crop = { x, y, width: endX - x, height: endY - y };
    }
    return { mask: filterMask(sampled, w, h, 1, true), width: w, height: h, crop };
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
