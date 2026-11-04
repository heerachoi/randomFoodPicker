# 점심메이트 🍱

오늘 피하고 싶은 카테고리를 선택하고, 남은 음식점 중 한 곳을 공평하게 추첨하는 웹사이트입니다. HTML/CSS/JavaScript 화면과 Supabase 팀 공용 목록을 사용합니다.

## 사용하기

1. 오늘 제외할 카테고리를 선택합니다. 주황색과 체크 표시가 있으면 **제외** 상태입니다. 여러 개를 선택할 수 있으며 다시 누르면 제외가 해제됩니다.
2. 선택한 카테고리의 음식점은 모두 후보에서 빠집니다. 아무것도 선택하지 않으면 전체 목록에서 뽑습니다.
3. **점심 메뉴 돌리기**를 누릅니다. 후보가 0곳이면 버튼이 비활성화되고, 1곳이면 남은 곳으로 결정합니다.
4. 추첨 결과와 음식점 카드에서 음식점 이름과 카테고리를 확인합니다. 음식점 링크는 사용하지 않습니다.

**우리의 점심 리스트**는 음식점 이름과 카테고리를 간단한 행으로 표시합니다. 목록 상단의 **전체 / 카테고리 필터**로 원하는 음식점만 볼 수 있습니다. 음식점 관리 창에도 별도의 필터가 있으며, 두 목록의 필터는 추첨 제외 선택에 영향을 주지 않습니다.

팀원 등록이나 이름 입력은 필요하지 않습니다. 제외 선택은 **한국 시간 자정**에 초기화되고 음식점 목록은 유지합니다. 추첨 중 목록이나 제외 선택을 바꾸면 진행 중인 추첨은 취소됩니다.

기본 목록에는 중식, 햄버거, 한식, 초밥, 순대국, 돈까츠, 라멘, 건강식, 샌드위치가 있습니다. 요청한 새 목록과 기존 서담헌을 포함합니다. `쌀국수`와 `쎕이리`는 요청한 분류대로 중식에 등록되어 있습니다.

## 저장 방식

배포된 사이트는 음식점, 카테고리와 오늘의 제외 선택을 Supabase에 저장합니다. 다른 브라우저의 변경 사항은 주기적으로 또는 탭에 돌아올 때 반영됩니다.

Supabase 연결 전 각 브라우저에 저장한 목록은 그 브라우저에 보관됩니다. 공용 목록에 넣을 항목은 검토 후 음식점 관리에서 반영할 수 있습니다.

## 기본 음식점 변경

공용 목록은 사이트의 음식점 관리에서 수정합니다. Supabase 설정이 없는 로컬 환경의 기본 목록은 [`restaurants.js`](./restaurants.js)에서 관리합니다.

```js
export const DEFAULT_RESTAURANTS = [
  { id: 'ssepiri', name: '쎕이리', category: '중식' },
  { id: 'popeyes', name: '파파이스', category: '햄버거' },
  { id: 'seodamheon', name: '서담헌', category: '중식' },
];
```

각 음식점의 `id`는 고유하고 일정하게 유지해 주세요. 같은 `category`를 사용하면 같은 제외 항목으로 묶입니다. 기본 목록은 저장소의 `restaurants.js`에서 직접 수정할 수 있습니다.

기본 목록이 업데이트되면 기존 브라우저의 개인 추가·삭제를 유지하면서 기본 음식점의 변경 사항을 반영합니다. 브라우저에서 따로 삭제한 기본 음식점은 되살리지 않습니다. 저장 공간을 지우면 최신 기본 목록으로 시작합니다.

## GitHub Pages 배포

1. `heerachoi/randomFoodPicker` 공개 저장소의 `main` 브랜치에 소스를 올립니다.
2. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
3. **Settings → Secrets and variables → Actions → Variables**에서 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 저장소 변수로 등록합니다. 브라우저용 publishable 키 또는 기존 anon 키를 사용합니다.
4. **Actions → Deploy lunch picker to GitHub Pages → Run workflow**로 최초 배포합니다. 이후 `main`에 수정 내용을 push하면 테스트, 빌드, 배포가 자동 실행됩니다.
5. 성공한 workflow의 `github-pages` 배포 링크로 접속합니다. 프로젝트 주소는 `https://heerachoi.github.io/randomFoodPicker/`입니다.

모든 파일 경로는 상대 경로이므로 GitHub Pages 프로젝트 하위 경로에서도 작동합니다. `.github/workflows/deploy.yml`은 `dist/`만 배포하므로 테스트 파일이나 설명 문서는 웹 배포물에 포함되지 않습니다.

## 로컬 실행 및 검증

Node.js 24와 Python 3을 사용합니다. `npm install`은 필요하지 않습니다.

```sh
npm run dev
# http://127.0.0.1:4173

npm test
npm run build
```

ES 모듈을 사용하므로 `index.html`을 파일로 직접 여는 대신 HTTP 서버에서 실행하세요. Google Fonts를 사용할 수 없으면 시스템 글꼴로 표시됩니다.
