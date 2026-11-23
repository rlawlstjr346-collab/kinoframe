"use client";

import React, { useEffect, useRef, useState } from "react";
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

const BRAND_CONNECT_META: Record<
  SocialProvider,
  {
    badgeLabel: string;
    placeholder: string;
    pillClass: string;
  }
> = {
  kakao: {
    badgeLabel: "카카오 계정으로 내 보드 연결",
    placeholder: "카카오 이메일 또는 아이디 입력",
    pillClass: "border-[#FEE500]/50 bg-[#FEE500]/12 text-[#FEE500]",
  },
  naver: {
    badgeLabel: "네이버 계정으로 내 보드 연결",
    placeholder: "네이버 아이디 또는 이메일 입력",
    pillClass: "border-[#03C75A]/50 bg-[#03C75A]/14 text-[#4AE38A]",
  },
  google: {
    badgeLabel: "Google 계정으로 내 보드 연결",
    placeholder: "Google 이메일 주소 입력",
    pillClass: "border-white/25 bg-white/[0.08] text-[#F2EFE9]",
  },
};

function KakaoSymbol({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.85 5.31 4.63 6.72l-1.18 4.32c-.1.36.31.65.62.44l5.15-3.42c.25.02.52.04.78.04 5.52 0 10-3.58 10-8.1C22 6.58 17.52 3 12 3z" />
    </svg>
  );
}

function NaverSymbol({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M15.6 12.6L8.1 2H2v20h6.4V11.4L15.9 22H22V2h-6.4v10.6z" />
    </svg>
  );
}

function GoogleSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
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
  );
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
  const [selectedBrand, setSelectedBrand] = useState<SocialProvider | null>(
    null
  );
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleSocialClick = (provider: SocialProvider) => {
    setErrorMsg(null);
    // Official OAuth 2.0 flow when provider env keys are configured
    if (providers[provider]) {
      window.location.href = `/api/auth/login/${provider}`;
      return;
    }

    // Zero-error seamless brand-linked account flow: show selected brand badge & focus user ID input
    setSelectedBrand(provider);
    requestAnimationFrame(() => {
      usernameInputRef.current?.focus();
    });
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
          mode: "auto",
          username: username.trim(),
          password,
          provider: selectedBrand ?? undefined,
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

  const activeBrandMeta = selectedBrand
    ? BRAND_CONNECT_META[selectedBrand]
    : null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-[#0A0B0E]/88 p-4 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="KINOFRAME 계정 로그인"
      onClick={onClose}
    >
      <div
        className="max-h-[94vh] w-[min(92vw,clamp(420px,26vw,580px))] overflow-y-auto rounded-[22px] border border-white/[0.14] bg-[#111318] shadow-[0_32px_96px_rgba(0,0,0,0.92)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[clamp(24px,1.8vw,36px)] pt-[clamp(22px,1.7vw,32px)]">
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

        <div className="space-y-4 px-[clamp(24px,1.8vw,36px)] pb-[clamp(26px,1.9vw,38px)] pt-4">
          <div>
            <h2 className="text-[clamp(1.3rem,1.35vw,1.8rem)] font-bold tracking-tight text-[#F2EFE9]">
              내 보드 로그인
            </h2>
            <p className="mt-1 text-[clamp(13.5px,0.86vw,15.5px)] leading-relaxed text-[#C8C4BC]">
              마음에 드는 시네마·CF 컷을 나만의 레퍼런스 보드에 영구 저장하세요.
            </p>
          </div>

          {/* Always-visible Official 3 Social Login Buttons: Kakao -> Naver -> Google */}
          <div className="space-y-2.5">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSocialClick("kakao")}
              className="flex h-[clamp(48px,3.0vw,58px)] w-full items-center justify-center gap-3 rounded-full bg-[#FEE500] px-5 text-[clamp(15px,0.92vw,18px)] font-bold text-[#191919] transition-colors hover:bg-[#F5DC00] disabled:opacity-60"
            >
              <KakaoSymbol className="h-[clamp(20px,1.2vw,24px)] w-[clamp(20px,1.2vw,24px)] shrink-0" />
              <span>카카오로 계속하기</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSocialClick("naver")}
              className="flex h-[clamp(48px,3.0vw,58px)] w-full items-center justify-center gap-3 rounded-full bg-[#03C75A] px-5 text-[clamp(15px,0.92vw,18px)] font-bold text-[#FFFFFF] transition-colors hover:bg-[#02B652] disabled:opacity-60"
            >
              <NaverSymbol className="h-[clamp(17px,1.05vw,21px)] w-[clamp(17px,1.05vw,21px)] shrink-0" />
              <span>네이버로 계속하기</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSocialClick("google")}
              className="flex h-[clamp(48px,3.0vw,58px)] w-full items-center justify-center gap-3 rounded-full bg-[#FFFFFF] px-5 text-[clamp(15px,0.92vw,18px)] font-bold text-[#111318] transition-colors hover:bg-[#F2EFE9] disabled:opacity-60"
            >
              <GoogleSymbol className="h-[clamp(20px,1.2vw,24px)] w-[clamp(20px,1.2vw,24px)] shrink-0" />
              <span>Google로 계속하기</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-[12px] text-[#7E7B74]">
            <span className="h-px flex-1 bg-white/10" />
            <span>또는 아이디로 계속하기</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          {/* Selected Brand Connection Badge (shown when provider OAuth env keys are pending) */}
          {selectedBrand && activeBrandMeta && (
            <div
              data-testid="selected-brand-badge"
              className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold ${activeBrandMeta.pillClass}`}
            >
              <div className="flex items-center gap-2">
                {selectedBrand === "kakao" && (
                  <KakaoSymbol className="h-4 w-4 shrink-0" />
                )}
                {selectedBrand === "naver" && (
                  <NaverSymbol className="h-3.5 w-3.5 shrink-0" />
                )}
                {selectedBrand === "google" && (
                  <GoogleSymbol className="h-4 w-4 shrink-0" />
                )}
                <span>{activeBrandMeta.badgeLabel}</span>
              </div>
              <span className="text-[11px] font-normal opacity-80">
                아이디·패스코드 입력
              </span>
            </div>
          )}

          {/* Clean 1-Second Real Account Form (Auto Sign-Up / Login with Deterministic Account Vault) */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="kf-auth-username"
                className="mb-1.5 block text-[13px] font-medium text-[#C8C4BC]"
              >
                아이디 또는 이메일
              </label>
              <input
                ref={usernameInputRef}
                id="kf-auth-username"
                type="text"
                required
                minLength={2}
                maxLength={64}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={
                  activeBrandMeta?.placeholder ||
                  "예: director_kim 또는 name@studio.kr"
                }
                autoComplete="username"
                className="h-[clamp(46px,2.8vw,54px)] w-full rounded-xl border border-white/15 bg-[#0A0B0E] px-4 text-[clamp(14.5px,0.9vw,16.5px)] text-[#F2EFE9] placeholder:text-[#7E7B74] focus:border-[#C89E52] focus:outline-none"
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
                className="h-[clamp(46px,2.8vw,54px)] w-full rounded-xl border border-white/15 bg-[#0A0B0E] px-4 text-[clamp(14.5px,0.9vw,16.5px)] text-[#F2EFE9] placeholder:text-[#7E7B74] focus:border-[#C89E52] focus:outline-none"
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
              className="h-[clamp(48px,3.0vw,58px)] w-full rounded-full bg-[#C89E52] text-[clamp(15px,0.92vw,18px)] font-bold text-[#0A0B0E] transition-colors hover:bg-[#D9B36A] disabled:opacity-50"
            >
              {submitting ? "로그인 중..." : "계속하기"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
