"use client";

import React, { useEffect, useState } from "react";
import type { AuthSessionState } from "@/types/archive";
import { CloseIcon } from "@/components/Icons";
import { KinoframeLogo } from "@/components/KinoframeLogo";

interface AuthModalProps {
  session: AuthSessionState;
  savedCount: number;
  boardCount: number;
  onClose: () => void;
  onAuthSuccess: (nextSession: AuthSessionState) => void | Promise<void>;
  onLogout: () => Promise<void>;
}

interface ProviderAvailability {
  kakao: boolean;
  naver: boolean;
  google: boolean;
  supabaseEnabled: boolean;
}

type SocialProvider = "kakao" | "naver" | "google";

export function AuthModal({
  session,
  savedCount,
  boardCount,
  onClose,
  onAuthSuccess,
  onLogout,
}: AuthModalProps) {
  const [providers, setProviders] = useState<ProviderAvailability>({
    kakao: false,
    naver: false,
    google: false,
    supabaseEnabled: false,
  });
  const [showEmailForm, setShowEmailForm] = useState<boolean>(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<SocialProvider | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/providers")
      .then((res) => res.json())
      .then((data: Partial<ProviderAvailability>) => {
        if (mounted) {
          setProviders({
            kakao: Boolean(data.kakao),
            naver: Boolean(data.naver),
            google: Boolean(data.google),
            supabaseEnabled: Boolean(data.supabaseEnabled),
          });
        }
      })
      .catch(() => {});

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      mounted = false;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  const handleSocialContinue = async (provider: SocialProvider) => {
    setErrorMsg(null);
    // When official OAuth env keys are configured, redirect to live OAuth 2.0 flow
    if (providers[provider]) {
      window.location.href = `/api/auth/login/${provider}`;
      return;
    }

    // Local unconfigured fallback: 1-click social profile session login + auto-save pending item
    setBusyProvider(provider);
    try {
      const res = await fetch("/api/auth/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "social_local", provider }),
      });
      const data = (await res.json()) as Partial<AuthSessionState> & {
        error?: string;
      };
      if (!res.ok || !data.authenticated || !data.user) {
        setErrorMsg(data.error || "로그인 처리에 실패했습니다.");
        return;
      }
      await onAuthSuccess({
        authenticated: true,
        user: data.user,
        cloudSyncAvailable: Boolean(data.cloudSyncAvailable),
      });
      onClose();
    } catch {
      setErrorMsg("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusyProvider(null);
    }
  };

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
            mode === "register"
              ? displayName.trim() || username.trim()
              : undefined,
        }),
      });
      const data = (await res.json()) as Partial<AuthSessionState> & {
        error?: string;
      };
      if (!res.ok || !data.authenticated || !data.user) {
        setErrorMsg(data.error || "로그인 처리에 실패했습니다.");
        return;
      }
      await onAuthSuccess({
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

  const providerLabel =
    session.user?.provider === "kakao"
      ? "Kakao"
      : session.user?.provider === "naver"
      ? "Naver"
      : session.user?.provider === "google"
      ? "Google"
      : "KINOFRAME";

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-[#0A0B0E]/88 p-4 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="KINOFRAME 계정 로그인"
      onClick={onClose}
    >
      <div
        className="w-[min(92vw,clamp(420px,26vw,600px))] overflow-hidden rounded-[22px] border border-white/[0.14] bg-[#111318] shadow-[0_32px_96px_rgba(0,0,0,0.92)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[clamp(24px,1.8vw,36px)] pt-[clamp(24px,1.8vw,34px)]">
          <KinoframeLogo className="h-[clamp(18px,1.15vw,24px)] w-auto" />
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#C8C4BC] transition-colors hover:bg-white/[0.08] hover:text-[#F2EFE9]"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-[clamp(24px,1.8vw,36px)] pb-[clamp(28px,2vw,40px)] pt-5">
          {session.authenticated && session.user ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex h-[clamp(52px,3.2vw,64px)] w-[clamp(52px,3.2vw,64px)] shrink-0 items-center justify-center rounded-full bg-[#C89E52] text-[clamp(18px,1.2vw,24px)] font-bold text-[#0A0B0E]">
                  {session.user.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-[clamp(1.2rem,1.25vw,1.6rem)] font-bold text-[#F2EFE9]">
                      {session.user.name}
                    </h2>
                    <span className="rounded-full bg-white/[0.08] px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-[#C89E52]">
                      {providerLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-[clamp(13px,0.85vw,16px)] text-[#C8C4BC]">
                    보드 {boardCount}개 · 저장된 클립 {savedCount}컷
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={loggingOut}
                className="h-[clamp(48px,3.0vw,60px)] w-full rounded-full border border-white/20 bg-[#181A22] text-[clamp(15px,0.95vw,18px)] font-semibold text-[#F2EFE9] transition-colors hover:border-[#C89E52]/70 hover:bg-[#222530]"
              >
                {loggingOut ? "로그아웃 중..." : "로그아웃"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-[clamp(1.35rem,1.4vw,1.85rem)] font-bold tracking-tight text-[#F2EFE9]">
                  내 보드 시작하기
                </h2>
                <p className="mt-1.5 text-[clamp(14px,0.88vw,17px)] leading-relaxed text-[#C8C4BC]">
                  소셜 계정으로 1초 만에 로그인하고 마음에 드는 시네마·CF 컷을
                  나만의 레퍼런스 보드에 저장하세요.
                </p>
              </div>

              {/* Official 3 Social Login Buttons: Kakao -> Naver -> Google */}
              <div className="space-y-3">
                {/* 1. Kakao (#FEE500) */}
                <button
                  type="button"
                  disabled={busyProvider !== null || submitting}
                  onClick={() => handleSocialContinue("kakao")}
                  className="flex h-[clamp(48px,3.0vw,60px)] w-full items-center justify-center gap-3 rounded-full bg-[#FEE500] px-5 text-[clamp(15px,0.95vw,19px)] font-bold text-[#191919] transition-colors hover:bg-[#F5DC00] disabled:opacity-60"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[clamp(20px,1.25vw,24px)] w-[clamp(20px,1.25vw,24px)] shrink-0"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.85 5.31 4.63 6.72l-1.18 4.32c-.1.36.31.65.62.44l5.15-3.42c.25.02.52.04.78.04 5.52 0 10-3.58 10-8.1C22 6.58 17.52 3 12 3z" />
                  </svg>
                  <span>
                    {busyProvider === "kakao"
                      ? "카카오 로그인 중..."
                      : "카카오로 계속하기"}
                  </span>
                </button>

                {/* 2. Naver (#03C75A) */}
                <button
                  type="button"
                  disabled={busyProvider !== null || submitting}
                  onClick={() => handleSocialContinue("naver")}
                  className="flex h-[clamp(48px,3.0vw,60px)] w-full items-center justify-center gap-3 rounded-full bg-[#03C75A] px-5 text-[clamp(15px,0.95vw,19px)] font-bold text-white transition-colors hover:bg-[#02B652] disabled:opacity-60"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[clamp(18px,1.15vw,22px)] w-[clamp(18px,1.15vw,22px)] shrink-0"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M15.6 12.6L8.1 2H2v20h6.4V11.4L15.9 22H22V2h-6.4v10.6z" />
                  </svg>
                  <span>
                    {busyProvider === "naver"
                      ? "네이버 로그인 중..."
                      : "네이버로 계속하기"}
                  </span>
                </button>

                {/* 3. Google (#FFFFFF) */}
                <button
                  type="button"
                  disabled={busyProvider !== null || submitting}
                  onClick={() => handleSocialContinue("google")}
                  className="flex h-[clamp(48px,3.0vw,60px)] w-full items-center justify-center gap-3 rounded-full bg-[#FFFFFF] px-5 text-[clamp(15px,0.95vw,19px)] font-bold text-[#1F1F1F] transition-colors hover:bg-[#F2EFE9] disabled:opacity-60"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[clamp(20px,1.25vw,24px)] w-[clamp(20px,1.25vw,24px)] shrink-0"
                    aria-hidden="true"
                  >
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.29A7.18 7.18 0 0 1 4.9 12c0-.79.14-1.57.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.1z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4 3.1c.95-2.84 3.6-4.95 6.72-4.95z"
                    />
                  </svg>
                  <span>
                    {busyProvider === "google"
                      ? "Google 로그인 중..."
                      : "Google로 계속하기"}
                  </span>
                </button>
              </div>

              {errorMsg && (
                <p
                  role="alert"
                  className="rounded-xl bg-[#D94436]/20 px-4 py-2.5 text-[14px] font-medium text-[#FFB4AC]"
                >
                  {errorMsg}
                </p>
              )}

              {/* Optional Local Account Toggle */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailForm((prev) => !prev);
                    setErrorMsg(null);
                  }}
                  className="w-full text-center text-[clamp(13px,0.82vw,15px)] font-medium text-[#7E7B74] transition-colors hover:text-[#C89E52]"
                >
                  {showEmailForm
                    ? "이메일·아이디 입력 닫기"
                    : "또는 아이디·비밀번호로 계속하기"}
                </button>

                {showEmailForm && (
                  <div className="mt-4 space-y-3.5 border-t border-white/[0.08] pt-4">
                    <div className="grid grid-cols-2 rounded-full bg-[#0A0B0E] p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMode("login");
                          setErrorMsg(null);
                        }}
                        className={`h-9 rounded-full text-[14px] font-semibold transition-colors ${
                          mode === "login"
                            ? "bg-[#C89E52] text-[#0A0B0E]"
                            : "text-[#C8C4BC] hover:text-[#F2EFE9]"
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
                        className={`h-9 rounded-full text-[14px] font-semibold transition-colors ${
                          mode === "register"
                            ? "bg-[#C89E52] text-[#0A0B0E]"
                            : "text-[#C8C4BC] hover:text-[#F2EFE9]"
                        }`}
                      >
                        회원가입
                      </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">
                      {mode === "register" && (
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="닉네임 (예: 김디렉터)"
                          maxLength={28}
                          className="h-12 w-full rounded-xl border border-white/15 bg-[#0A0B0E] px-4 text-[15px] text-[#F2EFE9] placeholder:text-[#7E7B74] focus:border-[#C89E52] focus:outline-none"
                        />
                      )}
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="아이디 또는 이메일"
                        autoComplete="username"
                        className="h-12 w-full rounded-xl border border-white/15 bg-[#0A0B0E] px-4 text-[15px] text-[#F2EFE9] placeholder:text-[#7E7B74] focus:border-[#C89E52] focus:outline-none"
                      />
                      <input
                        type="password"
                        required
                        minLength={4}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="비밀번호 (4자 이상)"
                        autoComplete={
                          mode === "login"
                            ? "current-password"
                            : "new-password"
                        }
                        className="h-12 w-full rounded-xl border border-white/15 bg-[#0A0B0E] px-4 text-[15px] text-[#F2EFE9] placeholder:text-[#7E7B74] focus:border-[#C89E52] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={submitting}
                        className="h-[clamp(46px,2.8vw,56px)] w-full rounded-full bg-[#C89E52] text-[clamp(15px,0.92vw,18px)] font-bold text-[#0A0B0E] transition-colors hover:bg-[#D9B36A] disabled:opacity-50"
                      >
                        {submitting
                          ? "처리 중..."
                          : mode === "login"
                          ? "로그인"
                          : "계정 만들기"}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
