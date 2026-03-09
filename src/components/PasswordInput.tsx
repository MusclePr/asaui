"use client";

import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const PasswordInput: React.FC<PasswordInputProps> = ({ className, ...props }) => {
  const [isVisible, setIsVisible] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    // 左クリック（またはタッチ）のみ反応させる
    if (e.button !== 0) return;
    setIsVisible(true);
  };

  const handlePointerUp = () => {
    setIsVisible(false);
  };

  const handlePointerLeave = () => {
    setIsVisible(false);
  };

  return (
    <div className="relative">
      <input
        {...props}
        type={isVisible ? "text" : "password"}
        className={`pr-10 ${className}`}
      />
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        // コンテキストメニューなどを防ぎ、意図しない挙動を抑制
        onContextMenu={(e) => e.preventDefault()}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground focus:outline-none transition-colors select-none"
        title="押している間パスワードを表示"
      >
        {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};
