# My株ダッシュボード 📊

라쿠텐 증권 초보 투자자용 개인 주식 대시보드 (아이폰 PWA).
순수 HTML/CSS/JS + Chart.js. 서버 없이 GitHub Pages로 무료 배포.

## 기능
- 주요 지수(S&P500·日経225·NASDAQ·ダウ), 관심종목, TOP 상승/하락
- 종목 상세: 일봉/주봉/월봉 라인차트
- 투신·ETF 섹션 (S&P500 연동 ETF)
- 관심종목 직접 추가/삭제 (브라우저에 저장)
- 다크모드 · 일본식 색상(상승=빨강, 하락=파랑)

## 데이터 관련 (중요)
- 시세는 **Yahoo Finance**(무료·키 불필요)에서 가져오며, 브라우저 보안(CORS)을 우회하려고 **무료 CORS 프록시**를 경유합니다.
- 프록시는 무료 공용 서비스라 가끔 느리거나 끊길 수 있습니다. 화면 상단이 빨갛게 뜨면 새로고침(⟳) 하세요.
- 시세는 **약 15분 지연**입니다(완전 실시간 아님). 개인 참고용입니다.
- 일본 투신(投資信託)의 基準価額은 무료 API가 없어, 동일 지수를 추종하는 ETF로 대체 표시합니다.

---

## 1) 로컬에서 먼저 열어보기
파일을 그냥 더블클릭하면 CORS/서비스워커가 막힐 수 있어요. 간단한 로컬 서버로 여세요.

```bash
cd kabu-dashboard
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

---

## 2) GitHub에 올리기 (잔디 심기 🌱)

처음 한 번만 GitHub에서 새 저장소(repository)를 만드세요. 이름 예: `kabu-dashboard` (Public).
그다음 이 폴더에서:

```bash
# 최초 1회 (이 폴더에서)
git init
git add .
git commit -m "feat: 주식 대시보드 첫 배포"
git branch -M main
git remote add origin https://github.com/<본인아이디>/kabu-dashboard.git
git push -u origin main
```

이후 수정할 때마다 (매일 커밋 기록 남기기):

```bash
git add .
git commit -m "update: 관심종목 조정"
git push
```

### 커밋 자동화 스크립트 (선택)
`push.sh` 파일을 이 폴더에 만들어 두면 한 줄로 커밋+푸시됩니다.

```bash
#!/bin/bash
# 사용법: ./push.sh "커밋 메시지"
MSG=${1:-"update: $(date '+%Y-%m-%d %H:%M')"}
git add .
git commit -m "$MSG"
git push
```

```bash
chmod +x push.sh   # 실행권한 부여 (최초 1회)
./push.sh "오늘 작업"
```

---

## 3) GitHub Pages로 무료 배포

1. GitHub 저장소 페이지 → **Settings** → 왼쪽 **Pages**
2. **Source** 를 `Deploy from a branch` 로, **Branch** 를 `main` / `/ (root)` 선택 후 **Save**
3. 1~2분 뒤 `https://<본인아이디>.github.io/kabu-dashboard/` 주소가 생깁니다.

---

## 4) 아이폰 홈 화면에 앱처럼 추가 (PWA)

1. 아이폰 **Safari**로 위 GitHub Pages 주소 접속
2. 하단 **공유 버튼(⬆️)** → **홈 화면에 추가**
3. 홈 화면 아이콘을 누르면 주소창 없는 전체화면 앱처럼 실행됩니다.

> ※ 반드시 Safari로 여세요. Chrome 등 다른 앱에서는 홈 화면 추가가 제한됩니다.

---

## 파일 구조
```
kabu-dashboard/
├── index.html      # 화면 구조
├── styles.css      # 디자인(다크모드)
├── app.js          # 데이터·차트·동작 로직
├── manifest.json   # PWA 설정
├── sw.js           # 서비스워커(오프라인·홈화면)
├── icons/          # 앱 아이콘
└── README.md
```

## 커스터마이즈 팁
- 관심종목 기본값: `app.js` 상단 `DEFAULT_WATCH` 수정
- 색상 변경: `styles.css` 상단 `:root` 의 `--up`(상승) / `--down`(하락)
- 일본주식 티커는 `.T`(예: 토요타 `7203.T`), 미국주식은 티커 그대로(`AAPL`)
