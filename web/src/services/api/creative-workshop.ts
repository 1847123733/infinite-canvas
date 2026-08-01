import { apiGet, compactApiParams } from "@/services/api/request";

export type CreativeWorkshopPrompt = {
    id: number;
    sourceId: number;
    sourceName: string;
    title: string;
    prompt: string;
    description: string;
    coverUrl?: string;
    tags: string[];
    author: string;
    sourceUrl: string;
    sourceCreatedAt: string;
    imageMode: string;
    imageModel: string;
    isVisible: boolean;
    mark?: number;
    createdAt?: string;
    updatedAt?: string;
};

export type CreativeWorkshopPromptList = {
    items: CreativeWorkshopPrompt[];
    total: number;
};

export type CreativeWorkshopFilterOptions = {
    sources: Array<{
        count: number;
        label: string;
        value: number;
    }>;
    tags: string[];
};

export type CreativeWorkshopPromptQuery = {
    page?: number;
    pageSize?: number;
    keyword?: string;
    sourceId?: number;
    tags?: string[];
};

function creativeWorkshopUrl(baseUrl: string, path: string) {
    return `${baseUrl.replace(/\/+$/, "")}/api/system/creative-workshop${path}`;
}

export function fetchCreativeWorkshopPrompts(baseUrl: string, token: string, query: CreativeWorkshopPromptQuery = {}) {
    return apiGet<CreativeWorkshopPromptList>(
        creativeWorkshopUrl(baseUrl, "/prompts"),
        compactApiParams({
            page: query.page,
            pageSize: query.pageSize,
            keyword: query.keyword,
            sourceId: query.sourceId,
            tags: query.tags?.length ? JSON.stringify(query.tags) : undefined,
        }),
        token,
    );
}

export function fetchCreativeWorkshopFilterOptions(baseUrl: string, token: string, sourceId?: number) {
    return apiGet<CreativeWorkshopFilterOptions>(creativeWorkshopUrl(baseUrl, "/prompts/filter-options"), compactApiParams({ sourceId }), token);
}

export async function fetchAllCreativeWorkshopPrompts(baseUrl: string, token: string) {
    const pageSize = 100;
    const firstPage = await fetchCreativeWorkshopPrompts(baseUrl, token, { page: 1, pageSize });
    const pageCount = Math.ceil(firstPage.total / pageSize);
    const remainingPages = pageCount > 1 ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => fetchCreativeWorkshopPrompts(baseUrl, token, { page: index + 2, pageSize }))) : [];
    const items = [firstPage, ...remainingPages].flatMap((result) => result.items).filter((item) => item.isVisible && item.mark !== 0);
    return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

export async function fetchRandomCreativeWorkshopPrompts(baseUrl: string, token: string, count = 12) {
    const pageSize = Math.min(100, Math.max(24, count * 2));
    const firstPage = await fetchCreativeWorkshopPrompts(baseUrl, token, { page: 1, pageSize });
    const pageCount = Math.max(1, Math.ceil(firstPage.total / pageSize));
    const pages = Array.from({ length: pageCount }, (_, index) => index + 1);

    for (let index = pages.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [pages[index], pages[swapIndex]] = [pages[swapIndex], pages[index]];
    }

    const candidates: CreativeWorkshopPrompt[] = [];
    for (const page of pages) {
        const result = page === 1 ? firstPage : await fetchCreativeWorkshopPrompts(baseUrl, token, { page, pageSize });
        candidates.push(...result.items.filter((item) => item.isVisible && item.mark !== 0 && item.coverUrl));
        if (candidates.length >= count) break;
    }

    for (let index = candidates.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }

    return Array.from(new Map(candidates.map((item) => [item.id, item])).values()).slice(0, count);
}
