"use client";

import React, { useEffect, useRef, useState } from "react";
import type { AuthSessionState } from "@/types/archive";
import { CloseIcon, KinoframeLogo } from "@/components/Icons";

interface AuthModalProps {
  session: AuthSessionState;
  localNickname: string;
  onSaveLocalNickname: (name: string) => void;
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
  localNickname,
  onSaveLocalNickname,
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
  const [nicknameInput, setNicknameInput] = useState<string>(localNickname);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleStartLocalVault = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = nicknameInput.trim();
    if (!cleaned) return;
    onSaveLocalNickname(cleaned);
    onClose();
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

  const isSignedIn = session.authenticated && Boolean(session.user);
  const activeName = isSignedIn
    ? session.user?.name || "Director"
    : localNickname;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050507]/88 p-4 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="KINOFRAME 보관함 프로필"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-white/[0.1] bg-[#0E0F13] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6">
          <KinoframeLogo className="h-7 w-7" />
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#C8C3B8] transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 px-6 pb-7 pt-4">
          {activeName ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-[22px] font-bold tracking-tight text-[#FAF8F5]">
                  {activeName}님의 보관함
                </h2>
                <p className="mt-1.5 text-[15px] leading-relaxed text-[#C8C3B8]">
                  {session.cloudSyncAvailable
                    ? "클라우드 보관함이 실시간으로 동기화되고 있습니다."
                    : "현재 브라우저의 개인 보관함에 폴더와 레퍼런스가 안전하게 유지됩니다."}
                </p>
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={onExportBackup}
                  className="flex-1 rounded-full bg-[#F4F1EA] py-2.5 text-[14px] font-semibold text-[#09090B] hover:bg-white"
                >
                  보관함 파일 백업
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={loggingOut}
                  className="rounded-full border border-white/[0.14] px-5 py-2.5 text-[14px] font-medium text-[#FAF8F5] hover:border-white/30"
                >
                  {loggingOut ? "처리 중..." : "로그아웃"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-[22px] font-bold tracking-tight text-[#FAF8F5]">
                  나만의 레퍼런스 보관함
                </h2>
                <p className="mt-1.5 text-[15px] leading-relaxed text-[#C8C3B8]">
                  닉네임을 설정하거나 계정으로 연결해 폴더별 레퍼런스를 관리하세요.
                </p>
              </div>

              {/* Seamless OAuth buttons rendered cleanly only when configured */}
              {(providers.google || providers.naver) && (
                <div className="space-y-2.5">
                  {providers.google && (
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = "/api/auth/login/google";
                      }}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#F4F1EA] text-[15px] font-semibold text-[#09090B] transition-opacity hover:opacity-92"
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
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#03C75A] text-[15px] font-semibold text-[#09090B] transition-opacity hover:opacity-92"
                    >
                      네이버로 계속하기
                    </button>
                  )}
                </div>
              )}

              {/* Instant Nickname-Based Personal Vault Entry */}
              <form onSubmit={handleStartLocalVault} className="space-y-3">
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="디렉터 닉네임 입력"
                  maxLength={24}
                  className="h-11 w-full rounded-full border border-white/[0.14] bg-[#141519] px-4 text-[15px] text-[#FAF8F5] placeholder:text-[#9E998E] focus:border-[#E5A93B] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={nicknameInput.trim().length === 0}
                  className="h-11 w-full rounded-full bg-[#F4F1EA] text-[15px] font-semibold text-[#09090B] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  보관함 시작하기
                </button>
              </form>
            </div>
          )}

          {/* Clean File Backup / Restore Row */}
          <div className="flex items-center justify-between border-t border-white/[0.08] pt-4 text-[14px] text-[#C8C3B8]">
            <button
              type="button"
              onClick={onExportBackup}
              className="font-medium transition-colors hover:text-[#FAF8F5]"
            >
              백업 파일 내보내기
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="font-medium transition-colors hover:text-[#FAF8F5]"
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
                  onClose();
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
