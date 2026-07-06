"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import type { PSDTask } from "@/services/api/psd";

export type PSDTaskRecord = PSDTask & {
    createdAt: string;
    updatedAt: string;
};

type PSDTaskStore = {
    hydrated: boolean;
    tasks: PSDTaskRecord[];
    activeTaskId: string;
    upsertTask: (task: PSDTask) => void;
    setActiveTaskId: (id: string) => void;
    removeTask: (id: string) => void;
};

const PSD_TASK_STORE_KEY = "infinite-canvas:psd_task_store";

const psdTaskStorage: PersistStorage<PSDTaskStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        return JSON.parse(value) as StorageValue<PSDTaskStore>;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const usePSDTaskStore = create<PSDTaskStore>()(
    persist(
        (set) => ({
            hydrated: false,
            tasks: [],
            activeTaskId: "",
            upsertTask: (task) =>
                set((state) => {
                    const now = new Date().toISOString();
                    const current = state.tasks.find((item) => item.id === task.id);
                    const nextTask: PSDTaskRecord = { ...(current || { createdAt: now }), ...task, updatedAt: now };
                    const tasks = [nextTask, ...state.tasks.filter((item) => item.id !== task.id)].slice(0, 50);
                    return { tasks, activeTaskId: state.activeTaskId || task.id };
                }),
            setActiveTaskId: (activeTaskId) => set({ activeTaskId }),
            removeTask: (id) =>
                set((state) => {
                    const tasks = state.tasks.filter((task) => task.id !== id);
                    return { tasks, activeTaskId: state.activeTaskId === id ? tasks[0]?.id || "" : state.activeTaskId };
                }),
        }),
        {
            name: PSD_TASK_STORE_KEY,
            storage: psdTaskStorage,
            partialize: (state) => ({ tasks: state.tasks, activeTaskId: state.activeTaskId }) as StorageValue<PSDTaskStore>["state"],
            onRehydrateStorage: () => () => {
                usePSDTaskStore.setState({ hydrated: true });
            },
        },
    ),
);
