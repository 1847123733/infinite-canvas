"use client";

import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, Checkbox, Form, Input } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { useCloudAuthStore } from "@/stores/use-cloud-auth-store";

type LoginFormValues = {
    username: string;
    password: string;
    remember?: boolean;
};

const REMEMBER_LOGIN_KEY = "infinite-canvas:desktop-login:remember";

function readRememberedLogin(): LoginFormValues | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(REMEMBER_LOGIN_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<LoginFormValues>;
        if (!parsed.username || !parsed.password) return null;
        return { username: parsed.username, password: parsed.password, remember: true };
    } catch {
        return null;
    }
}

function saveRememberedLogin(values: LoginFormValues) {
    if (typeof window === "undefined") return;
    if (!values.remember) {
        window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
        return;
    }
    window.localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify({ username: values.username, password: values.password }));
}

// 仅放行站内相对路径，拦截开放重定向。浏览器会忽略 URL 中的 Tab/换行/回车，并把
// //host 或 /\host 解析为协议相对的跨站地址，因此先剥离控制字符，再拒绝 // 与 /\ 前缀。
function safeRedirect(value: string | null): string {
    const cleaned = (value ?? "").replace(/[\t\n\r]/g, "");
    if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.startsWith("/\\")) {
        return "/";
    }
    return cleaned;
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginContent />
        </Suspense>
    );
}

function LoginContent() {
    const { message } = App.useApp();
    const [form] = Form.useForm<LoginFormValues>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const cloudLogin = useCloudAuthStore((state) => state.login);
    const cloudUser = useCloudAuthStore((state) => state.user);
    const isCloudReady = useCloudAuthStore((state) => state.isReady);
    const isCloudLoading = useCloudAuthStore((state) => state.isLoading);
    const redirect = safeRedirect(searchParams.get("redirect"));

    useEffect(() => {
        const error = searchParams.get("error");
        if (error) message.error(error);
    }, [message, searchParams]);

    useEffect(() => {
        const remembered = readRememberedLogin();
        if (remembered) form.setFieldsValue(remembered);
    }, [form]);

    useEffect(() => {
        if (!cloudUser) return;
        router.replace(redirect);
        router.refresh();
    }, [cloudUser, redirect, router]);

    const submit = async (values: LoginFormValues) => {
        try {
            await cloudLogin({ username: values.username, password: values.password });
            saveRememberedLogin(values);
            message.success("登录成功");
            router.replace(redirect);
            router.refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        }
    };

    return (
        <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-10 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
            <section className="w-full max-w-[420px]">
                <div className="mb-7 text-center">
                    <img src="/logo.svg" alt="无限画布" width={48} height={48} className="mx-auto mb-4 block size-12 object-contain" />
                    <h1 className="text-3xl font-semibold tracking-normal text-stone-950 dark:text-stone-100">桌面账号登录</h1>
                </div>

                <Form<LoginFormValues> form={form} layout="vertical" size="large" requiredMark={false} onFinish={submit}>
                    <Form.Item name="username" label={<span className="font-medium text-stone-800 dark:text-stone-200">用户名</span>} rules={[{ required: true, message: "请输入用户名" }]}>
                        <Input prefix={<UserOutlined />} autoComplete="username" />
                    </Form.Item>
                    <Form.Item name="password" label={<span className="font-medium text-stone-800 dark:text-stone-200">密码</span>} rules={[{ required: true, message: "请输入密码" }]}>
                        <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
                    </Form.Item>
                    <Form.Item name="remember" valuePropName="checked" className="-mt-2 mb-4">
                        <Checkbox className="text-stone-700 dark:text-stone-300">记住账号密码</Checkbox>
                    </Form.Item>
                    <Button block type="primary" htmlType="submit" disabled={!isCloudReady} loading={!isCloudReady || isCloudLoading}>
                        登录
                    </Button>
                </Form>
            </section>
        </main>
    );
}
