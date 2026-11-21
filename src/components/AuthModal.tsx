"use client";

import React, { useEffect, useState } from "react";
import type { AuthSessionState } from "@/types/archive";
import { CloseIcon, KinoframeLogo } from "@/components/Icons";

interface AuthModalProps {
  session: AuthSessionState;
  savedCount: number;
  boardCount: number;
  onClose: () => void;
  onAuthSuccess: (nextSession: AuthSessionState) => void;
  onLogout: () => Promise<void>;
}

interface ProviderAvailability {
  google: boolean;
  naver: boolean;
  supabaseEnabled: boolean;
}

export function AuthModal({
  session,
  savedCount,
  boardCount,
  onClose,
  onAuthSuccess,
  onLogout,
}: AuthModalProps) {
  const [providers, setProviders] = useState<ProviderAvailability>({
    google: false,
    naver: false,
    supabaseEnabled: false,
  });
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/providers")
      .then((res) => res.json())
      .then((data: ProviderAvailability) => {
        if (mounted) setProviders(data);
      })
      .catch(() => {});

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      mounted = false;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          username: username.trim(),
          password,
          displayName:
            mode === "register" ? displayName.trim() || username.trim() : undefined,
        }),
      });
      const data = (await res.json()) as Partial<AuthSessionState> & {
        error?: string;
      };
      if (!res.ok || !data.authenticated || !data.user) {
        setErrorMsg(data.error || "로그인 처리에 실패했습니다.");
        return;
      }
      onAuthSuccess({
        authenticated: true,
        user: data.user,
        cloudSyncAvailable: Boolean(data.cloudSyncAvailable),
      });
      onClose();
    } catch {
      setErrorMsg("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setLoggingOut(true);
    try {
      await onLogout();
      onClose();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050507]/88 p-4 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="KINOFRAME 계정 로그인"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0E0F13] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-7 pt-7">
          <KinoframeLogo className="h-8 w-8" />
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#D0CBC0] transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-7 pb-8 pt-4">
          {session.authenticated && session.user ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#FAF8F5] text-[20px] font-bold text-[#09090B]">
                  {session.user.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-[22px] font-bold text-[#FFFFFF]">
                    {session.user.name}
                  </h2>
                  <p className="mt-0.5 text-[14px] text-[#D0CBC0]">
                    보드 {boardCount}개 · 저장된 아카이브 {savedCount}컷
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={loggingOut}
                className="h-12 w-full rounded-full border border-white/20 bg-[#181A22] text-[15px] font-semibold text-[#FAF8F5] transition-colors hover:bg-[#242733]"
              >
                {loggingOut ? "로그아웃 중..." : "로그아웃"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-[24px] font-bold tracking-tight text-[#FFFFFF]">
                  {mode === "login" ? "내 보드 로그인" : "새 계정 만들기"}
                </h2>
                <p className="mt-1.5 text-[15px] leading-relaxed text-[#D0CBC0]">
                  로그인하면 나만의 보드를 만들고 아카이브를 계정별로 안전하게
                  저장할 수 있습니다. 이미지 복사·다운로드는 로그인 없이도 바로
                  사용 가능합니다.
                </p>
              </div>

              {/* OAuth buttons appear seamlessly when configured */}
              {(providers.google || providers.naver) && (
                <div className="space-y-2.5">
                  {providers.google && (
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = "/api/auth/login/google";
                      }}
                      className="flex h-12 w-full items-center justify-center rounded-full bg-[#FAF8F5] text-[15px] font-bold text-[#09090B] hover:bg-white"
                    >
                      Google로 계속하기
                    </button>
                  )}
                  {providers.naver && (
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = "/api/auth/login/naver";
                      }}
                      className="flex h-12 w-full items-center justify-center rounded-full bg-[#03C75A] text-[15px] font-bold text-[#09090B] hover:opacity-95"
                    >
                      네이버로 계속하기
                    </button>
                  )}
                </div>
              )}

              {/* Mode Switcher */}
              <div className="grid grid-cols-2 rounded-full bg-[#161820] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setErrorMsg(null);
                  }}
                  className={`h-10 rounded-full text-[15px] font-semibold transition-colors ${
                    mode === "login"
                      ? "bg-[#FAF8F5] text-[#09090B]"
                      : "text-[#D0CBC0] hover:text-white"
                  }`}
                >
                  로그인
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setErrorMsg(null);
                  }}
                  className={`h-10 rounded-full text-[15px] font-semibold transition-colors ${
                    mode === "register"
                      ? "bg-[#FAF8F5] text-[#09090B]"
                      : "text-[#D0CBC0] hover:text-white"
                  }`}
                >
                  회원가입
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {mode === "register" && (
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="닉네임 (예: 김디렉터)"
                    maxLength={28}
                    className="h-12 w-full rounded-xl border border-white/15 bg-[#15171F] px-4 text-[15px] text-[#FFFFFF] placeholder:text-[#A8A398] focus:border-[#E5A93B] focus:outline-none"
                  />
                )}

                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="아이디 또는 이메일"
                  autoComplete="username"
                  className="h-12 w-full rounded-xl border border-white/15 bg-[#15171F] px-4 text-[15px] text-[#FFFFFF] placeholder:text-[#A8A398] focus:border-[#E5A93B] focus:outline-none"
                />

                <input
                  type="password"
                  required
                  minLength={4}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 (4자 이상)"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  className="h-12 w-full rounded-xl border border-white/15 bg-[#15171F] px-4 text-[15px] text-[#FFFFFF] placeholder:text-[#A8A398] focus:border-[#E5A93B] focus:outline-none"
                />

                {errorMsg && (
                  <p
                    role="alert"
                    className="rounded-lg bg-[#D94436]/20 px-3.5 py-2.5 text-[14px] font-medium text-[#FFB4AC]"
                  >
                    {errorMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="h-12 w-full rounded-full bg-[#FAF8F5] text-[16px] font-bold text-[#09090B] transition-colors hover:bg-white disabled:opacity-50"
                >
                  {submitting
                    ? "처리 중..."
                    : mode === "login"
                    ? "로그인하고 보드 열기"
                    : "계정 만들고 시작하기"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
