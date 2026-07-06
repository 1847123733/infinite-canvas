"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";

export type GlobalNoticeType = "success" | "error" | "info" | "warning";

export type GlobalNotice = {
    id: string;
    type: GlobalNoticeType;
    title: string;
    description?: string;
};

type GlobalNotificationStore = {
    notices: GlobalNotice[];
    notify: (notice: Omit<GlobalNotice, "id">) => void;
    remove: (id: string) => void;
};

export const useGlobalNotificationStore = create<GlobalNotificationStore>((set) => ({
    notices: [],
    notify: (notice) => set((state) => ({ notices: [...state.notices, { ...notice, id: nanoid() }] })),
    remove: (id) => set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) })),
}));

export function notifyGlobal(notice: Omit<GlobalNotice, "id">) {
    useGlobalNotificationStore.getState().notify(notice);
}
