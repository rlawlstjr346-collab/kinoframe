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

export function AuthModal({
  session,
  onClose,
  onAuthSuccess,
}: AuthModalProps) {
  const [providers, setProviders] = useState<ProviderAvailability>({
    kakao: false,
    naver: false,
    google: false,
    supabaseEnabled: false,
  });
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

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

  // Never show an extra account summary modal once authenticated (header provides '내 보드' + '로그아웃')
  if (session.authenticated && session.user) {
    return null;
  }

  const hasAnyOAuth = providers.kakao || providers.naver || providers.google;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "auto",
          username: username.trim(),
          password,
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

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-[#0A0B0E]/88 p-4 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="KINOFRAME 계정 로그인"
      onClick={onClose}
    >
      <div
        className="w-[min(92vw,clamp(420px,26vw,580px))] overflow-hidden rounded-[22px] border border-white/[0.14] bg-[#111318] shadow-[0_32px_96px_rgba(0,0,0,0.92)]"
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

        <div className="space-y-5 px-[clamp(24px,1.8vw,36px)] pb-[clamp(28px,2vw,40px)] pt-5">
          <div>
            <h2 className="text-[clamp(1.35rem,1.4vw,1.85rem)] font-bold tracking-tight text-[#F2EFE9]">
              내 보드 로그인
            </h2>
            <p className="mt-1.5 text-[clamp(14px,0.88vw,16px)] leading-relaxed text-[#C8C4BC]">
              나만의 아이디와 4자리 이상 패스코드를 입력하면 즉시 가입·로그인되어
              재접속 시에도 내 보드가 그대로 유지됩니다.
            </p>
          </div>

          {/* Genuine OAuth buttons appear ONLY when configured via real env credentials */}
          {hasAnyOAuth && (
            <>
              <div className="space-y-2.5">
                {providers.kakao && (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/api/auth/login/kakao";
                    }}
                    className="flex h-[clamp(48px,3.0vw,58px)] w-full items-center justify-center gap-3 rounded-full bg-[#FEE500] px-5 text-[clamp(15px,0.92vw,18px)] font-bold text-[#191919] transition-colors hover:bg-[#F5DC00]"
                  >
                    <span>카카오로 계속하기</span>
                  </button>
                )}
                {providers.naver && (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/api/auth/login/naver";
                    }}
                    className="flex h-[clamp(48px,3.0vw,58px)] w-full items-center justify-center gap-3 rounded-full bg-[#03C75A] px-5 text-[clamp(15px,0.92vw,18px)] font-bold text-white transition-colors hover:bg-[#02B652]"
                  >
                    <span>네이버로 계속하기</span>
                  </button>
                )}
                {providers.google && (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/api/auth/login/google";
                    }}
                    className="flex h-[clamp(48px,3.0vw,58px)] w-full items-center justify-center gap-3 rounded-full bg-[#FFFFFF] px-5 text-[clamp(15px,0.92vw,18px)] font-bold text-[#1F1F1F] transition-colors hover:bg-[#F2EFE9]"
                  >
                    <span>Google로 계속하기</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 text-[12px] text-[#7E7B74]">
                <span className="h-px flex-1 bg-white/10" />
                <span>또는 아이디로 계속하기</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>
            </>
          )}

          {/* Clean 1-Second Real Account Form (Auto Sign-Up / Login with Deterministic Account Vault) */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="kf-auth-username"
                className="mb-1.5 block text-[13px] font-medium text-[#C8C4BC]"
              >
                아이디 또는 이메일
              </label>
              <input
                id="kf-auth-username"
                type="text"
                required
                minLength={2}
                maxLength={64}
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="예: director_kim 또는 name@studio.kr"
                autoComplete="username"
                className="h-[clamp(46px,2.8vw,56px)] w-full rounded-xl border border-white/15 bg-[#0A0B0E] px-4 text-[clamp(15px,0.92vw,17px)] text-[#F2EFE9] placeholder:text-[#7E7B74] focus:border-[#C89E52] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="kf-auth-password"
                className="mb-1.5 block text-[13px] font-medium text-[#C8C4BC]"
              >
                패스코드 (4자리 이상)
              </label>
              <input
                id="kf-auth-password"
                type="password"
                required
                minLength={4}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="4자리 이상 패스코드 입력"
                autoComplete="current-password"
                className="h-[clamp(46px,2.8vw,56px)] w-full rounded-xl border border-white/15 bg-[#0A0B0E] px-4 text-[clamp(15px,0.92vw,17px)] text-[#F2EFE9] placeholder:text-[#7E7B74] focus:border-[#C89E52] focus:outline-none"
              />
            </div>

            {errorMsg && (
              <p
                role="alert"
                className="rounded-xl bg-[#D94436]/20 px-4 py-2.5 text-[14px] font-medium text-[#FFB4AC]"
              >
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="h-[clamp(48px,3.0vw,60px)] w-full rounded-full bg-[#C89E52] text-[clamp(15px,0.95vw,19px)] font-bold text-[#0A0B0E] transition-colors hover:bg-[#D9B36A] disabled:opacity-50"
            >
              {submitting ? "로그인 중..." : "계속하기"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
