"use client";

import { App } from "antd";
import { useEffect } from "react";

import { useGlobalNotificationStore } from "@/stores/use-global-notification-store";

export function GlobalNotificationBridge() {
    const { notification } = App.useApp();
    const notices = useGlobalNotificationStore((state) => state.notices);
    const remove = useGlobalNotificationStore((state) => state.remove);

    useEffect(() => {
        notices.forEach((notice) => {
            notification[notice.type]({
                message: notice.title,
                description: notice.description,
                placement: "topRight",
            });
            remove(notice.id);
        });
    }, [notices, notification, remove]);

    return null;
}
