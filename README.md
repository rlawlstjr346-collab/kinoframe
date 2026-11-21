# KINOFRAME

**35mm 암실 다크룸 시네마틱 구도 & 초반 3초 설득 레퍼런스 아카이브 (Zero-Server Static Architecture)**

KINOFRAME은 빈티지 TVCF(Prelinger Archives / 역사적 명작 광고), 역사적 뉴스릴·NASA 우주 기록, 빈티지 지면 광고·모더니스트 포스터, 아이코닉 보도사진 및 스탠리 큐브릭 계열 1점 투시 스틸을 **한국어 이중 택소노미(시각 구도 × 마케팅 설득 훅)**로 교차 탐색하고 해부하는 무서버 웹 아카이브입니다.

---

## 핵심 기능

1. **100% HTTP 검증 정적 스냅샷 (`src/data/archive-snapshot.json`)**
   - 4대 매체(`TVCF` · `NEWS` · `PRINT` · `PHOTO`) 30개 아이코닉 아카이브 항목
   - 모든 썸네일·MP4 스트림·YouTube oEmbed·원본 출처 URL을 `npm run verify:links`로 실증 검증
2. **35mm 암실 디자인 시스템**
   - 다크룸 베이스 `#09090B` / 슬라이드 마운트 `#111216` / 웜 아이보리 `#F4F1EA` / 본 실버 `#BEB9AE` / 코닥 앰버 `#D99B26`
   - 초경량 인라인 SVG 아날로그 필름 그레인(2.5%) & 다중 스톱 광학 비네팅 + 커스텀 인라인 SVG 로고·아이콘
3. **한국어 이중 택소노미 교차 필터 & 검색·정렬**
   - 매체 × 시각 구도 8종 × 마케팅 설득 훅 6종 × 연대(`1950-60s` ~ `1990-00s`) × 키워드 검색 × 4종 정렬
4. **상세 뷰파인더 스튜디오 & 인라인 SVG 구도 오버레이**
   - 작품별 좌표(`viewfinder`)에 맞춘 `1점 투시 소실점`, `삼분할 격자`, `수평·수직 대칭축`, `1→2→3 시선 동선` 독립 토글 및 투명도 조절
   - 4컷 필름 콘택트 시트(클릭 시 MP4 타임스탬프 이동 또는 프레임 포커스 하이라이트), 클릭 복사 5색 HEX 팔레트, 3줄 실무 해부 카드
5. **좌우 교차 비교 뷰 & 무서버 URL 공유 무드보드(`?board=`)**
   - 임의의 2개 작품 구도 오버레이·설득 공식 나란히 대조
   - `?board=KF-001,KF-006` URL 공유 링크 1클릭 복사 및 노션/기획서용 마크다운 브리프 1클릭 생성
6. **IP 밴 0% 링크 방어막 & GitHub Actions 자동 스케줄러**
   - `scripts/verify-links.mjs`: 표준 `User-Agent`, `ETag`/`If-Modified-Since` 캐시(`304` 스킵), 동일 도메인 `1500~2500ms` 랜덤 Jitter, `429`/`403` 즉시 도메인 쿨다운 Circuit Breaker
   - `.github/workflows/archive-link-shield.yml`: 매주 월요일 새벽 자동 생존 검증 및 타입·테스트·빌드 체크

---

## 로컬 실행 및 검증

```bash
npm install
npm run dev

# 검증 파이프라인
npm run verify:links
npx tsc --noEmit
npx vitest run
npm run build
```
