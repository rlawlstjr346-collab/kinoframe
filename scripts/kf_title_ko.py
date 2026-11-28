#!/usr/bin/env python3
"""
Korean display titles (titleKo) for harvested clips.

Order of preference:
  1. Wikidata Korean label, only when the entity's English label equals the clip title exactly.
  2. Established Korean spellings for brands and common words (BRAND_KO / WORD_KO).
  3. English pronunciation (CMU Pronouncing Dictionary) written in Hangul following the
     National Institute of Korean Language loanword rules (simplified: no rhotic r, short-vowel
     stop codas, 으-epenthesis, intervocalic ㄹㄹ, w/y glides).
  4. Letter-based pronunciation guess for words missing from the dictionary.
Acronyms (MTV, KFC, BBC) stay in Latin, numbers stay as digits.
"""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.parse
import urllib.request

try:
    import cmudict  # type: ignore

    _CMU = cmudict.dict()
except Exception:  # pragma: no cover - dictionary optional; letter fallback still works
    _CMU = {}

BRAND_KO = {
    "coca-cola": "코카콜라", "coca": "코카", "coke": "코크", "pepsi": "펩시", "mcdonald's": "맥도날드",
    "mcdonalds": "맥도날드", "nestle": "네슬레", "nescafe": "네스카페", "nespresso": "네스프레소",
    "kellogg's": "켈로그", "kelloggs": "켈로그", "cadbury's": "캐드버리", "cadbury": "캐드버리",
    "heineken": "하이네켄", "carlsberg": "칼스버그", "guinness": "기네스", "budweiser": "버드와이저",
    "mercedes-benz": "메르세데스-벤츠", "mercedes": "메르세데스", "benz": "벤츠", "bmw": "BMW", "volvo": "볼보",
    "volkswagen": "폭스바겐", "renault": "르노", "peugeot": "푸조", "citroen": "시트로엥", "fiat": "피아트",
    "audi": "아우디", "porsche": "포르쉐", "honda": "혼다", "toyota": "도요타", "nissan": "닛산",
    "ford": "포드", "chevrolet": "쉐보레", "chevy": "쉐비", "hyundai": "현대", "kia": "기아",
    "samsung": "삼성", "lg": "LG", "sony": "소니", "panasonic": "파나소닉", "toshiba": "도시바",
    "canon": "캐논", "nikon": "니콘", "kodak": "코닥", "philips": "필립스", "apple": "애플",
    "ibm": "IBM", "microsoft": "마이크로소프트", "nintendo": "닌텐도", "sega": "세가", "atari": "아타리",
    "nike": "나이키", "adidas": "아디다스", "reebok": "리복", "puma": "푸마", "levi's": "리바이스",
    "levis": "리바이스", "chanel": "샤넬", "dior": "디올", "gucci": "구찌", "prada": "프라다",
    "balenciaga": "발렌시아가", "kenzo": "겐조", "hermes": "에르메스", "l'oreal": "로레알",
    "maybelline": "메이블린", "gillette": "질레트", "colgate": "콜게이트", "dove": "도브",
    "kfc": "KFC", "pizza": "피자", "hut": "헛", "burger": "버거", "starbucks": "스타벅스",
    "heinz": "하인즈", "campbell's": "캠벨", "pillsbury": "필스버리", "mattel": "마텔",
    "hasbro": "해즈브로", "lego": "레고", "disney": "디즈니", "mars": "마스", "m&m's": "M&M's",
    "wrigley": "리글리", "marmite": "마마이트", "bovril": "보브릴", "bisto": "비스토",
    "sainsbury's": "세인즈버리", "woolworths": "울워스", "ikea": "이케아", "lapierre": "라피에르",
    "mtv": "MTV", "bbc": "BBC", "nowness": "나우니스", "netflix": "넷플릭스",
}

WORD_KO = {
    "christmas": "크리스마스", "the": "더", "a": "어", "and": "앤드", "of": "오브", "in": "인",
    "with": "위드", "for": "포", "to": "투", "on": "온", "my": "마이", "your": "유어", "you": "유",
    "is": "이즈", "it": "잇", "new": "뉴", "love": "러브", "night": "나이트", "day": "데이",
    "world": "월드", "man": "맨", "woman": "우먼", "girl": "걸", "boy": "보이", "boys": "보이즈",
    "home": "홈", "life": "라이프", "time": "타임", "light": "라이트", "red": "레드", "black": "블랙",
    "white": "화이트", "blue": "블루", "gold": "골드", "city": "시티", "road": "로드", "sea": "시",
    "film": "필름", "movie": "무비", "tv": "TV", "dream": "드림", "story": "스토리", "beer": "비어",
    "germany": "독일", "japan": "일본", "korea": "한국", "france": "프랑스", "italy": "이탈리아",
    "spain": "스페인", "china": "중국", "england": "영국", "britain": "영국", "america": "미국", "usa": "미국",
    "coffee": "커피", "milk": "밀크", "camera": "카메라", "hollywood": "할리우드", "onion": "어니언", "chocolate": "초콜릿", "jeans": "진", "shoes": "슈즈",
}

# Words that only label the clip type; removed from the title (an ad gets " 광고" appended once).
AD_WORDS = re.compile(r"\b(advert|advertisement|commercials?|commecials?|tv\s*spot|tvc|tvcf|ad)\b", re.I)
# Titles in another language are kept as written rather than mis-read with English rules.
FOREIGN = re.compile(r"[ÁÉÍÓÚÑÀÈÌÒÙÂÊÎÔÛÃÕÄËÏÖÜÇáéíóúñàèìòùâêîôûãõäëïöüç¿¡]|\b(del|los|las|nuestras?|nuestros?|und|der|die|het|een|avec|les|une|dans)\b", re.I)
TOKEN = re.compile(r"[A-Za-zÀ-ÿ0-9]+(?:['’][A-Za-z]+)?|[^A-Za-zÀ-ÿ0-9]+")
FILM_NOISE = re.compile(r"(\|\|?\s*)?(-\s*)?\b(a\s+)?short\s+(film|documentary)(\s+by\s+[^|()]+)?\b", re.I)

VOWELS = {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"}
SHORT = {"AE", "EH", "IH", "AH", "UH", "AA"}
# Choseong indices
INIT = {"P": 17, "B": 7, "T": 16, "D": 3, "K": 15, "G": 0, "F": 17, "V": 7, "TH": 9, "DH": 3, "S": 9,
        "Z": 12, "SH": 9, "ZH": 12, "CH": 14, "JH": 12, "M": 6, "N": 2, "NG": 11, "L": 5, "R": 5, "HH": 18}
# Jungseong indices
V_A, V_AE, V_YA, V_YAE, V_EO, V_E, V_YEO, V_YE, V_O, V_WA, V_WAE, V_YO, V_U, V_WO, V_WE, V_WI, V_YU, V_EU, V_I = (
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 20)
VMAP = {"AA": V_A, "AE": V_AE, "AH": V_EO, "AO": V_O, "AW": V_A, "AY": V_A, "EH": V_E, "ER": V_EO,
        "EY": V_E, "IH": V_I, "IY": V_I, "OW": V_O, "OY": V_O, "UH": V_U, "UW": V_U}
TAIL = {"AW": V_U, "AY": V_I, "EY": V_I, "OY": V_I}  # second syllable of diphthongs
W_GLIDE = {"AA": V_WO, "AO": V_WO, "AH": V_WO, "ER": V_WO, "OW": V_WO, "AE": V_WAE, "EH": V_WE,
           "EY": V_WE, "IH": V_WI, "IY": V_WI, "UH": V_U, "UW": V_U, "AY": V_WA, "AW": V_WA}
Y_GLIDE = {"AA": V_YA, "AE": V_YAE, "AH": V_YEO, "ER": V_YEO, "EH": V_YE,
           "EY": V_YE, "OW": V_YO, "AO": V_YO, "UW": V_YU, "UH": V_YU, "IH": V_I, "IY": V_I}
SH_GLIDE = {"AA": V_YA, "AE": V_YAE, "AH": V_YEO, "ER": V_YEO, "EH": V_YE, "EY": V_YE, "OW": V_YO,
            "AO": V_YO, "UW": V_YU, "UH": V_YU}
CODA = {"M": 16, "N": 4, "NG": 21, "L": 8, "P": 17, "T": 19, "K": 1}
VOWEL_GROUP = re.compile(r"[aeiouy]+")
STANDALONE_I = {"CH", "JH", "SH", "ZH"}  # word-final affricates/sibilants take ㅣ (치, 지, 시)


def _syl(l: int, v: int, t: int = 0) -> str:
    return chr(0xAC00 + (l * 21 + v) * 28 + t)


def arpabet_to_hangul(phones: list[str], vowel_letters: list[str] | None = None) -> str:
    """`vowel_letters`: the spelling's vowel groups aligned 1:1 with the vowel phonemes, used to pick
    the conventional Hangul vowel for reduced vowels (rabbit 래빗, Christopher 크리스토퍼, fog 포그)."""
    stress = [re.search(r"\d", p).group(0) if re.search(r"\d", p) else "" for p in phones]
    ph = [re.sub(r"\d", "", p) for p in phones]
    out: list[list[int]] = []
    last_vowel: str | None = None
    vowel_idx = -1
    link_r = False
    i, n = 0, len(ph)

    def spelled(vowel: str, v: int, pos: int) -> int:
        if not vowel_letters or not (0 <= vowel_idx < len(vowel_letters)):
            return v
        letter = vowel_letters[vowel_idx][0]
        if vowel == "AA" and letter == "o":
            return V_O
        if vowel == "AH" and stress[pos] == "0":
            return {"o": V_O, "i": V_I}.get(letter, v)
        return v

    def add_vowel(l: int, vowel: str, v: int, pos: int) -> None:
        nonlocal last_vowel, vowel_idx, link_r
        vowel_idx += 1
        if link_r and l == 11:
            l = 5  # ER + vowel: linking r (featuring 피처링, wanderers 원더러스)
        if v == VMAP.get(vowel):
            v = spelled(vowel, v, pos)
        out.append([l, v, 0])
        if vowel in TAIL:
            out.append([11, TAIL[vowel], 0])
        last_vowel = vowel
        link_r = vowel == "ER"

    while i < n:
        p = ph[i]
        nxt = ph[i + 1] if i + 1 < n else None
        if p in VOWELS:
            add_vowel(11, p, VMAP[p], i)
            i += 1
            continue
        if p in ("W", "Y"):
            if nxt in VOWELS:
                v = (W_GLIDE if p == "W" else Y_GLIDE).get(nxt, VMAP[nxt])
                link_r = False
                add_vowel(11, nxt, v, i + 1)
                i += 2
            else:
                out.append([11, V_U if p == "W" else V_I, 0])
                i += 1
            continue
        link_r = False
        if p == "R" and nxt not in VOWELS:
            i += 1  # non-rhotic
            continue
        if nxt in VOWELS:
            if p in ("L", "NG") and out and out[-1][2] == 0 and i > 0 and ph[i - 1] in VOWELS:
                out[-1][2] = CODA[p]  # 할리우드, 싱어
            if p == "L" and out and out[-1][1] == V_EU and out[-1][2] == 0 and i > 0 and ph[i - 1] not in VOWELS:
                out[-1][2] = CODA["L"]  # consonant + l: flute 플루트, glass 글라스
            l = 11 if p == "NG" else INIT[p]
            v = SH_GLIDE.get(nxt, VMAP[nxt]) if p == "SH" else VMAP[nxt]
            add_vowel(l, nxt, v, i + 1)
            i += 2
            continue
        if p in ("K", "G") and nxt == "W" and i + 2 < n and ph[i + 2] in VOWELS:
            add_vowel(INIT[p], ph[i + 2], W_GLIDE.get(ph[i + 2], VMAP[ph[i + 2]]), i + 2)
            i += 3
            continue
        if nxt == "Y" and i + 2 < n and ph[i + 2] in VOWELS:
            add_vowel(INIT[p], ph[i + 2], Y_GLIDE.get(ph[i + 2], VMAP[ph[i + 2]]), i + 2)
            i += 3
            continue
        prev = out[-1] if out else None
        free_coda = prev is not None and prev[2] == 0 and i > 0 and ph[i - 1] in VOWELS
        if p in ("M", "N", "NG", "L") and free_coda:
            prev[2] = CODA[p]
        elif p == "L" and prev is not None and prev[1] == V_EU and prev[2] == 0:
            prev[2] = CODA["L"]  # final -ble/-ple: double 더블, simple 심플
        elif p == "D" and nxt == "Z":
            out.append([12, V_EU, 0])  # -ds -> 즈 (Reynolds 레놀즈)
            i += 2
            continue
        elif p in ("P", "T", "K") and free_coda and last_vowel in SHORT and nxt is None:
            prev[2] = CODA[p]
        elif p in ("B", "G") and free_coda and last_vowel in ("IH", "AE", "EH") and nxt is None and len(out) == 1:
            prev[2] = CODA["P" if p == "B" else "K"]  # one-syllable words: big 빅, bob 밥
        elif p == "T" and nxt == "S":
            out.append([14, V_EU, 0])  # -ts -> 츠
            i += 2
            continue
        else:
            out.append([INIT[p] if p != "NG" else 11, V_I if p in STANDALONE_I and nxt is None else V_EU, 0])
        i += 1
    return "".join(_syl(*s) for s in out)


LETTER_RULES = [
    ("tion", ["SH", "AH", "N"]), ("ph", ["F"]), ("sh", ["SH"]), ("ch", ["CH"]), ("th", ["TH"]),
    ("ck", ["K"]), ("qu", ["K", "W"]), ("ee", ["IY"]), ("oo", ["UW"]), ("ou", ["AW"]), ("ai", ["EY"]),
    ("ay", ["EY"]), ("ea", ["IY"]), ("ie", ["IY"]), ("oa", ["OW"]), ("ng", ["NG"]),
    ("a", ["AA"]), ("e", ["EH"]), ("i", ["IY"]), ("o", ["OW"]), ("u", ["UW"]), ("y", ["IY"]),
    ("b", ["B"]), ("c", ["K"]), ("d", ["D"]), ("f", ["F"]), ("g", ["G"]), ("h", ["HH"]), ("j", ["JH"]),
    ("k", ["K"]), ("l", ["L"]), ("m", ["M"]), ("n", ["N"]), ("p", ["P"]), ("r", ["R"]), ("s", ["S"]),
    ("t", ["T"]), ("v", ["V"]), ("w", ["W"]), ("x", ["K", "S"]), ("z", ["Z"]),
]


def _letters_to_phones(word: str) -> list[str]:
    w = re.sub(r"(.)\1", r"\1", word.lower())
    if len(w) > 3 and w.endswith("e") and w[-2] not in "aeiou":
        w = w[:-1]  # silent final e
    w = re.sub(r"c(?=[eiy])", "s", w)
    phones: list[str] = []
    i = 0
    while i < len(w):
        for pat, ph in LETTER_RULES:
            if w.startswith(pat, i):
                phones.extend(ph)
                i += len(pat)
                break
        else:
            i += 1
    return phones


def _vowel_letters(word: str) -> list[str]:
    w = word.lower()
    if len(w) > 3 and w.endswith("e") and w[-2] not in "aeiou" and not w.endswith("le"):
        w = w[:-1]
    return VOWEL_GROUP.findall(w)


def _cmu_hangul(core: str) -> str | None:
    pron = _CMU.get(core)
    if not pron:
        return None
    phones = list(pron[0])
    if core.endswith("le") and len(phones) >= 2 and phones[-2] == "AH0" and phones[-1] == "L":
        phones = phones[:-2] + ["L"]  # syllabic -le: double, table
    letters = _vowel_letters(core)
    vowel_count = sum(1 for p in phones if re.sub(r"\d", "", p) in VOWELS)
    return arpabet_to_hangul(phones, letters if len(letters) == vowel_count else None)


def transliterate_word(word: str) -> str:
    plain = unicodedata.normalize("NFKD", word).encode("ascii", "ignore").decode()
    key = plain.lower()
    if not key:
        return word
    if key in BRAND_KO:
        return BRAND_KO[key]
    if key in WORD_KO:
        return WORD_KO[key]
    if re.fullmatch(r"[0-9.,:/]+", key) or re.fullmatch(r"[0-9]+(s|th|st|nd|rd)", key):
        return word
    core = key.replace("’", "'").replace("'s", "").replace("'", "")
    direct = _cmu_hangul(core)
    if direct:
        return direct
    if word.isupper() and 1 < len(word) <= 5 and len(re.findall(r"[AEIOU]", word)) <= 1:
        return word  # acronym (MTV, KFC, BBC, UPN)
    # Compound words missing from the dictionary: sealink, doubletake, kidsuper
    for cut in range(3, len(core) - 2):
        left, right = core[:cut], core[cut:]
        lk = WORD_KO.get(left) or BRAND_KO.get(left) or _cmu_hangul(left)
        rk = WORD_KO.get(right) or BRAND_KO.get(right) or _cmu_hangul(right)
        if lk and rk and len(left) >= 4 and len(right) >= 4:
            return lk + rk
    if not re.search(r"[a-z]", core):
        return word
    return arpabet_to_hangul(_letters_to_phones(core), None)


def _clean(title: str) -> tuple[str, bool]:
    t = re.sub(r"\(\s*(19|20)\d{2}\s*\)", " ", title)
    t = re.sub(r"\b(19|20)\d{2}\b\s*$", " ", t.strip())
    is_ad = bool(AD_WORDS.search(t))
    t = AD_WORDS.sub(" ", t)
    t = FILM_NOISE.sub(" ", t)
    t = re.sub(r"[|_]+", " ", t)
    t = re.sub(r"\s*[-–—:]\s*$", "", t)
    return re.sub(r"\s+", " ", t).strip(" -–—:,"), is_ad


def wikidata_korean_label(title: str, timeout: int = 6) -> str | None:
    """Korean label of the Wikidata entity whose English label is exactly `title`."""
    try:
        q = urllib.parse.urlencode({"action": "wbsearchentities", "search": title[:64], "language": "en",
                                    "format": "json", "limit": 3})
        req = urllib.request.Request(f"https://www.wikidata.org/w/api.php?{q}", headers={"User-Agent": "KinoframeTitleKo/1.0"})
        hits = json.loads(urllib.request.urlopen(req, timeout=timeout).read()).get("search") or []
        for hit in hits:
            if str(hit.get("label", "")).strip().lower() != title.strip().lower():
                continue
            q2 = urllib.parse.urlencode({"action": "wbgetentities", "ids": hit["id"], "props": "labels",
                                         "languages": "ko", "format": "json"})
            req2 = urllib.request.Request(f"https://www.wikidata.org/w/api.php?{q2}", headers={"User-Agent": "KinoframeTitleKo/1.0"})
            ent = json.loads(urllib.request.urlopen(req2, timeout=timeout).read())["entities"][hit["id"]]
            label = ent.get("labels", {}).get("ko", {}).get("value")
            if label and re.search(r"[가-힣]", label):
                return label.strip()
    except Exception:
        return None
    return None


def make_title_ko(title: str, category: str = "", use_wikidata: bool = True) -> str:
    cleaned, is_ad = _clean(title)
    if not cleaned:
        cleaned = title.strip()
    if use_wikidata and category != "TVCF":
        label = wikidata_korean_label(cleaned)
        if label:
            return label
    if FOREIGN.search(cleaned):
        out = cleaned
    else:
        text = cleaned
        for brand, ko in BRAND_KO.items():
            if "-" in brand or "'" in brand:
                text = re.sub(re.escape(brand), ko, text, flags=re.I)
        out = "".join(transliterate_word(t) if re.search(r"[A-Za-zÀ-ÿ]", t) else t for t in TOKEN.findall(text))
    out = re.sub(r"\s+", " ", out)
    out = re.sub(r"\(\s*\)", "", out)
    out = re.sub(r"\(\s+", "(", out)
    out = re.sub(r"\s+([),:;!?])", r"\1", out)
    out = re.sub(r"\s+", " ", out).strip(" :;,-")
    if (is_ad or category == "TVCF") and not out.endswith("광고"):
        out = f"{out} 광고"
    return out


if __name__ == "__main__":
    import sys

    for arg in sys.argv[1:]:
        print(arg, "->", make_title_ko(arg, use_wikidata=False))
