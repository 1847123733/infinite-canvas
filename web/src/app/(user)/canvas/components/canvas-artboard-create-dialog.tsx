"use client";

import { useState } from "react";
import { Form, InputNumber, Modal } from "antd";

export function CanvasArtboardCreateDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (width: number, height: number) => void }) {
    const [width, setWidth] = useState<number | null>(1080);
    const [height, setHeight] = useState<number | null>(1080);
    const valid = width !== null && height !== null && Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 && width <= 8192 && height <= 8192;

    return (
        <Modal
            title="自定义画布"
            open={open}
            onCancel={onClose}
            onOk={() => {
                if (valid) onCreate(width!, height!);
            }}
            okText="创建画布"
            cancelText="取消"
            okButtonProps={{ disabled: !valid }}
            centered
            width={400}
        >
            <Form layout="vertical" className="!pt-4">
                <div className="grid grid-cols-2 gap-4">
                    <Form.Item label="宽度（像素）">
                        <InputNumber className="!w-full" min={1} max={8192} precision={0} value={width} onChange={setWidth} />
                    </Form.Item>
                    <Form.Item label="高度（像素）">
                        <InputNumber className="!w-full" min={1} max={8192} precision={0} value={height} onChange={setHeight} />
                    </Form.Item>
                </div>
                <p className="text-sm opacity-55">透明背景，支持 1–8192 像素。将图片节点接线到画布左侧即可导入。</p>
            </Form>
        </Modal>
    );
}
