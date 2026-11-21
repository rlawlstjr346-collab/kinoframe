"use client";

import React, { useEffect, useRef, useState } from "react";
import type { AuthSessionState } from "@/types/archive";
import { CloseIcon, KinoframeLogo } from "@/components/Icons";

interface AuthModalProps {
  session: AuthSessionState;
  onClose: () => void;
  onLogout: () => Promise<void>;
  onExportBackup: () => void;
  onImportBackupFile: (file: File) => void;
}

interface ProviderAvailability {
  google: boolean;
  naver: boolean;
  supabaseEnabled: boolean;
}

export function AuthModal({
  session,
  onClose,
  onLogout,
  onExportBackup,
  onImportBackupFile,
}: AuthModalProps) {
  const [providers, setProviders] = useState<ProviderAvailability>({
    google: false,
    naver: false,
    supabaseEnabled: false,
  });
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedUnconfigured, setSelectedUnconfigured] = useState<
    "google" | "naver" | null
  >(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/providers")
      .then((res) => res.json())
      .then((data: ProviderAvailability) => {
        if (mounted) {
          setProviders(data);
          setLoadingProviders(false);
        }
      })
      .catch(() => {
        if (mounted) setLoadingProviders(false);
      });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      mounted = false;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const handleOAuthClick = (provider: "google" | "naver") => {
    if (providers[provider]) {
      window.location.href = `/api/auth/login/${provider}`;
    } else {
      setSelectedUnconfigured(provider);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090B]/88 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="KINOFRAME 계정 및 보관함 동기화"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[6px] border border-[#F4F1EA]/[0.12] bg-[#111216] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[#F4F1EA]/[0.08] bg-[#09090B] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <KinoframeLogo className="h-6 w-6" />
            <h2 className="font-mono text-sm font-semibold tracking-wider text-ivory">
              {session.authenticated ? "계정 및 클라우드 보관함" : "KINOFRAME 로그인"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="로그인 창 닫기"
            className="rounded-[4px] border border-[#F4F1EA]/[0.1] p-1.5 text-silver hover:border-[#D99B26] hover:text-ivory"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 p-6">
          {session.authenticated && session.user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3.5 rounded-[4px] border border-[#F4F1EA]/[0.1] bg-[#09090B] p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#D99B26]/50 bg-[#D99B26]/15 font-mono text-sm font-bold text-[#D99B26]">
                  {session.user.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-ivory">
                    {session.user.name}
                  </p>
                  <p className="truncate font-mono text-xs text-silver">
                    {session.user.provider.toUpperCase()} OAuth
                    {session.user.email ? ` · ${session.user.email}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-[3px] px-2 py-1 font-mono text-xs ${
                    session.cloudSyncAvailable
                      ? "bg-[#D99B26]/20 text-[#D99B26]"
                      : "bg-[#F4F1EA]/10 text-silver"
                  }`}
                >
                  {session.cloudSyncAvailable ? "클라우드 동기화" : "로컬 동기화"}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={loggingOut}
                className="w-full rounded-[4px] border border-[#F4F1EA]/[0.15] bg-[#09090B] py-2.5 text-sm font-medium text-ivory transition-colors hover:border-[#D99B26] hover:text-[#D99B26]"
              >
                {loggingOut ? "로그아웃 처리 중..." : "로그아웃"}
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-silver">
                Google 또는 Naver 계정으로 로그인하면 폴더별 레퍼런스·장면 타임스탬프·메모가
                기기를 넘나들어 자동 동기화됩니다. 비로그인 상태에서도 스틸컷 PC PNG 저장과
                로컬 보관함 백업은 즉시 사용할 수 있습니다.
              </p>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleOAuthClick("google")}
                  disabled={loadingProviders}
                  className="flex w-full items-center justify-between rounded-[4px] border border-[#F4F1EA]/[0.18] bg-[#F4F1EA] px-4 py-3 text-sm font-semibold text-[#09090B] transition-opacity hover:opacity-92 disabled:opacity-50"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#09090B] font-mono text-xs font-bold text-[#F4F1EA]">
                      G
                    </span>
                    <span>Google 계정으로 계속하기</span>
                  </span>
                  <span className="font-mono text-xs text-[#09090B]/70">
                    {providers.google ? "OAuth 연결됨" : "키 설정 안내"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOAuthClick("naver")}
                  disabled={loadingProviders}
                  className="flex w-full items-center justify-between rounded-[4px] border border-[#03C75A]/80 bg-[#03C75A] px-4 py-3 text-sm font-semibold text-[#09090B] transition-opacity hover:opacity-92 disabled:opacity-50"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-[#09090B] font-mono text-xs font-bold text-[#03C75A]">
                      N
                    </span>
                    <span>네이버(Naver) 계정으로 계속하기</span>
                  </span>
                  <span className="font-mono text-xs text-[#09090B]/80">
                    {providers.naver ? "OAuth 연결됨" : "키 설정 안내"}
                  </span>
                </button>
              </div>

              {selectedUnconfigured && (
                <div className="rounded-[4px] border border-[#D99B26]/45 bg-[#D99B26]/10 p-4 text-xs leading-relaxed text-ivory">
                  <p className="font-mono font-semibold text-[#D99B26]">
                    {selectedUnconfigured === "google" ? "GOOGLE" : "NAVER"} OAuth 환경변수 연동 안내
                  </p>
                  <p className="mt-1.5 text-silver">
                    프로젝트 루트의 <code className="font-mono text-ivory">.env.local</code>에
                    아래 키를 입력하고 서버를 재시작하면 즉시 실계정 로그인이 활성화됩니다.
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded bg-[#09090B] p-2.5 font-mono text-[11px] text-ivory">
                    {selectedUnconfigured === "google"
                      ? `GOOGLE_CLIENT_ID=발급받은_클라이언트_ID\nGOOGLE_CLIENT_SECRET=발급받은_시크릿\n# 콜백 URL: /api/auth/callback/google`
                      : `NAVER_CLIENT_ID=발급받은_클라이언트_ID\nNAVER_CLIENT_SECRET=발급받은_시크릿\n# 콜백 URL: /api/auth/callback/naver`}
                  </pre>
                </div>
              )}
            </>
          )}

          {/* Non-Login Instant PC File Backup & Restore */}
          <div className="border-t border-[#F4F1EA]/[0.08] pt-4">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-silver">
              비로그인 PC 보관함 파일 백업 (.kinoframe.json)
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onExportBackup}
                className="rounded-[4px] border border-[#F4F1EA]/[0.14] bg-[#09090B] px-3 py-2 text-xs font-medium text-ivory transition-colors hover:border-[#D99B26] hover:text-[#D99B26]"
              >
                보관함 파일 내보내기
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-[4px] border border-[#F4F1EA]/[0.14] bg-[#09090B] px-3 py-2 text-xs font-medium text-ivory transition-colors hover:border-[#D99B26] hover:text-[#D99B26]"
              >
                백업 파일 불러오기
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.kinoframe.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImportBackupFile(file);
                    e.target.value = "";
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
