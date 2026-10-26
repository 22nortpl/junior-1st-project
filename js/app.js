// 책갈피 앱: 해시 라우터 + 화면(P1~P8) + 버튼 동작

const $app = document.getElementById("app");

// 화면 상태 (저장하지 않는 값)
const ui = {
    clubFilter: "recruiting",
    clubQuery: "",
    libTab: "reading",
    composer: "thought",
    openComments: new Set(),
    revealed: new Set(),
    picked: null,
    pickerResults: [],
    progressMode: "percent"
};

const SHELF = { want: "읽고 싶은", reading: "읽는 중", done: "다 읽음" };
const CLUB_STATUS = { recruiting: "모집 중", active: "진행 중", ended: "종료" };


// ---------- 공통 도구 ----------

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function hashCode(text) {
    let h = 0;
    for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
}

function timeAgo(t) {
    const min = Math.floor((Date.now() - t) / 60000);
    if (min < 1) return "방금";
    if (min < 60) return `${min}분 전`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour}시간 전`;
    const day = Math.floor(hour / 24);
    if (day < 30) return `${day}일 전`;
    const d = new Date(t);
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function dateText(t) {
    const d = new Date(t);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function cover(book, size) {
    const cls = "cover" + (size ? " cover-" + size : "");
    if (book && book.thumbnail) {
        return `<img class="${cls}" src="${esc(book.thumbnail)}" alt="${esc(book.title)} 표지" loading="lazy">`;
    }
    const hue = hashCode(book ? book.title : "") % 360;
    return `<div class="${cls} cover-ph" style="--hue:${hue}" aria-hidden="true"><span>${esc(book ? book.title : "?")}</span></div>`;
}

function authorsText(book) {
    return book && book.authors && book.authors.length ? book.authors.join(", ") : "저자 정보 없음";
}

function progressBar(value, target) {
    const marker = target ? `<span class="bar-target" style="left:${target}%" title="이번 주 목표 ${target}%"></span>` : "";
    return `<div class="bar"><span class="bar-fill" style="width:${value}%"></span>${marker}</div>`;
}

function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
}

function requireLogin() {
    if (Store.currentUser()) return true;
    go("#/login?next=" + encodeURIComponent(location.hash || "#/"));
    return false;
}

function emptyState(text, actionHtml) {
    return `<div class="empty"><p>${text}</p>${actionHtml || ""}</div>`;
}


// ---------- 라우터 ----------

function parseHash() {
    const raw = location.hash.slice(1) || "/";
    const [path, qs] = raw.split("?");
    return {
        parts: path.split("/").filter(Boolean).map(decodeURIComponent),
        query: new URLSearchParams(qs || "")
    };
}

function render() {
    const { parts, query } = parseHash();
    const page = parts[0] || "";

    renderNav(page);

    if (page === "") $app.innerHTML = viewHome();
    else if (page === "search") viewSearch(query.get("q") || "");
    else if (page === "book") $app.innerHTML = viewBook(parts[1]);
    else if (page === "clubs" && parts[1] === "new") $app.innerHTML = viewClubNew(query.get("book"));
    else if (page === "clubs") $app.innerHTML = viewClubs();
    else if (page === "club") $app.innerHTML = viewClub(parts[1]);
    else if (page === "library") $app.innerHTML = requireLogin() ? viewLibrary() : "";
    else if (page === "login") $app.innerHTML = viewLogin(query.get("next") || "#/");
    else if (page === "me") $app.innerHTML = requireLogin() ? viewMe() : "";
    else $app.innerHTML = emptyState("페이지를 찾을 수 없어요.", `<a class="btn" href="#/">홈으로</a>`);

    document.title = "책갈피 · 함께 읽는 북클럽";
}

function renderNav(page) {
    const user = Store.currentUser();
    const link = (hash, name, key) =>
        `<a href="${hash}" class="${page === key ? "active" : ""}">${name}</a>`;

    document.getElementById("nav").innerHTML = `
        ${link("#/search", "책 찾기", "search")}
        ${link("#/clubs", "모임", "clubs")}
        ${link("#/library", "내 서재", "library")}
        ${user
            ? `<a href="#/me" class="nav-user ${page === "me" ? "active" : ""}">${esc(user.nickname)}</a>`
            : `<a href="#/login" class="btn btn-sm">로그인</a>`}
    `;
}


// ---------- P1 홈 ----------

function viewHome() {
    const user = Store.currentUser();
    const reading = user ? Store.library(user.id).filter(e => e.status === "reading" && e.book) : [];
    const openClubs = Store.clubs().filter(c => Store.clubStatus(c) !== "ended").slice(0, 4);
    const recent = Store.recentPosts(4);

    return `
        <section class="hero">
            <p class="eyebrow">함께 읽는 북클럽</p>
            <h1>같은 책을 읽는 사람들과,<br>같은 페이지에서 만나요.</h1>
            <p class="hero-sub">내가 읽은 곳까지만 보이는 토론이라 스포일러 걱정이 없어요.
                종이책이든 리디·교보든, 어디서 읽든 함께할 수 있어요.</p>
            <div class="row">
                <a class="btn btn-primary" href="#/search">책 찾기</a>
                <a class="btn" href="#/clubs">모임 둘러보기</a>
            </div>
        </section>

        ${user && reading.length ? `
        <section>
            <div class="section-head"><h2>읽는 중</h2><a href="#/library">내 서재 →</a></div>
            <div class="reading-list">
                ${reading.map(e => `
                    <div class="reading-item">
                        <a href="#/book/${encodeURIComponent(e.bookId)}">${cover(e.book, "sm")}</a>
                        <div class="grow">
                            <a class="title-link" href="#/book/${encodeURIComponent(e.bookId)}">${esc(e.book.title)}</a>
                            ${progressBar(e.progress)}
                            <div class="meta">${e.progress}%</div>
                        </div>
                        <button class="btn btn-sm" data-action="open-progress" data-book="${esc(e.bookId)}">진도 기록</button>
                    </div>`).join("")}
            </div>
        </section>` : ""}

        <section>
            <div class="section-head"><h2>참여할 수 있는 모임</h2><a href="#/clubs">전체 보기 →</a></div>
            <div class="grid">${openClubs.map(clubCard).join("") || emptyState("아직 모임이 없어요.")}</div>
        </section>

        <section>
            <div class="section-head"><h2>최근 올라온 이야기</h2></div>
            <div class="feed">${recent.map(p => postCard(p, { showClub: true, compact: true })).join("")}</div>
        </section>
    `;
}


// ---------- P2 책 찾기 ----------

async function viewSearch(q) {
    $app.innerHTML = `
        <h1 class="page-title">책 찾기</h1>
        <form class="search-box" data-form="search">
            <input type="search" name="q" value="${esc(q)}" placeholder="제목, 저자, ISBN으로 검색" aria-label="검색어" autofocus>
            <button class="btn btn-primary">검색</button>
        </form>
        <div id="search-result">${q ? `<p class="meta">"${esc(q)}" 검색 중…</p>` : `<p class="meta">샘플 책: 소년이 온다, 아몬드, 데미안, 불편한 편의점, 사피엔스</p>`}</div>
    `;
    if (!q) return;

    const books = await BookAPI.search(q);
    if (parseHash().query.get("q") !== q) return; // 그 사이 다른 검색으로 이동함

    const box = document.getElementById("search-result");
    if (!box) return;
    const warning = BookAPI.failed
        ? `<div class="card notice">외부 책 검색 API에 연결하지 못해 저장된 책에서만 찾았어요.
            Google Books는 키 없이 쓰면 하루 호출 한도가 자주 차요. <code>js/config.js</code>에 카카오 REST 키를 넣으면 안정적으로 검색돼요.</div>`
        : "";
    if (books.length === 0) {
        box.innerHTML = warning + emptyState(`"${esc(q)}"에 해당하는 책이 없어요. 다른 검색어로 찾아보세요.`);
        return;
    }
    books.forEach(b => searchCache.set(b.id, b));
    box.innerHTML = `
        ${warning}
        <p class="meta">${books.length}권</p>
        <div class="book-grid">${books.map(b => `
            <div class="book-card">
                <a href="#/book/${encodeURIComponent(b.id)}" data-action="cache-book" data-book="${esc(b.id)}">${cover(b)}</a>
                <a class="title-link" href="#/book/${encodeURIComponent(b.id)}" data-action="cache-book" data-book="${esc(b.id)}">${esc(b.title)}</a>
                <p class="meta">${esc(authorsText(b))}</p>
                <button class="btn btn-sm" data-action="add-shelf" data-book="${esc(b.id)}" data-status="want">+ 서재</button>
            </div>`).join("")}
        </div>
    `;
}

// 검색 결과는 상세로 들어갈 때 저장한다
const searchCache = new Map();

function rememberBook(id) {
    const book = searchCache.get(id);
    if (book) Store.saveBook(book);
    return Store.getBook(id);
}


// ---------- P3 책 상세 ----------

function viewBook(id) {
    const book = rememberBook(id);
    if (!book) {
        return emptyState("책 정보를 찾을 수 없어요. 검색해서 다시 들어와 주세요.", `<a class="btn" href="#/search">책 찾기</a>`);
    }
    const user = Store.currentUser();
    const entry = user ? Store.getEntry(user.id, book.id) : null;
    const clubs = Store.clubs().filter(c => c.bookId === book.id);
    const quotes = Store.postsOfBook(book.id, "quote");

    return `
        <section class="book-hero">
            ${cover(book, "lg")}
            <div class="grow">
                <h1>${esc(book.title)}</h1>
                <p class="meta">${esc(authorsText(book))}${book.publisher ? " · " + esc(book.publisher) : ""}${book.published ? " · " + esc(book.published) : ""}</p>
                ${book.description ? `<p class="desc">${esc(book.description)}</p>` : ""}

                <div class="row">
                    <label class="select-wrap">
                        <span class="sr-only">내 서재 상태</span>
                        <select data-change="shelf" data-book="${esc(book.id)}">
                            <option value="">${entry ? "서재에서 빼기" : "내 서재에 담기 ▾"}</option>
                            ${Object.entries(SHELF).map(([k, v]) =>
                                `<option value="${k}" ${entry && entry.status === k ? "selected" : ""}>${v}</option>`).join("")}
                        </select>
                    </label>
                    ${entry ? `<button class="btn" data-action="open-progress" data-book="${esc(book.id)}">진도 ${entry.progress}%</button>` : ""}
                    <a class="btn btn-primary" href="#/clubs/new?book=${encodeURIComponent(book.id)}">이 책으로 모임 만들기</a>
                </div>

                <div class="stores">
                    <p class="meta">어디서 읽을까? 구매·열람은 각 서점에서 해요.</p>
                    <div class="row">${storeLinks(book).map(s =>
                        `<a class="chip" href="${s.url}" target="_blank" rel="noopener">${s.name} ↗</a>`).join("")}
                    </div>
                </div>
            </div>
        </section>

        <section>
            <div class="section-head"><h2>이 책의 모임</h2></div>
            <div class="grid">${clubs.map(clubCard).join("") ||
                emptyState("아직 이 책으로 열린 모임이 없어요.", `<a class="btn" href="#/clubs/new?book=${encodeURIComponent(book.id)}">첫 모임 열기</a>`)}</div>
        </section>

        <section>
            <div class="section-head"><h2>문장 카드</h2></div>
            <div class="feed">${quotes.map(p => postCard(p, { showClub: true, compact: true })).join("") ||
                emptyState("아직 문장 카드가 없어요.")}</div>
        </section>
    `;
}


// ---------- P4 모임 목록 ----------

function clubCard(club) {
    const book = Store.getBook(club.bookId);
    const status = Store.clubStatus(club);
    const avg = Math.round(club.members.reduce((s, id) => s + Store.progressOf(id, club.bookId), 0) / club.members.length);
    const when = status === "recruiting"
        ? `${dateText(club.start)} 시작`
        : status === "active" ? `${Store.clubWeek(club).week}/${club.weeks}주차` : `${club.weeks}주 완료`;

    return `
        <a class="club-card" href="#/club/${club.id}">
            ${cover(book, "sm")}
            <div class="grow">
                <span class="badge badge-${status}">${CLUB_STATUS[status]}</span>
                <h3>${esc(club.name)}</h3>
                <p class="meta">${esc(book ? book.title : "")} · ${when} · ${club.members.length}/${club.capacity}명</p>
                ${progressBar(avg)}
                <p class="meta">평균 진도 ${avg}%</p>
            </div>
        </a>`;
}

function viewClubs() {
    const q = ui.clubQuery.toLowerCase();
    const list = Store.clubs().filter(c => {
        if (Store.clubStatus(c) !== ui.clubFilter) return false;
        if (!q) return true;
        const book = Store.getBook(c.bookId);
        return c.name.toLowerCase().includes(q) || (book && book.title.toLowerCase().includes(q));
    });
    const tab = key => `<button class="tab ${ui.clubFilter === key ? "active" : ""}" data-action="club-filter" data-filter="${key}">${CLUB_STATUS[key]}</button>`;

    return `
        <div class="section-head">
            <h1 class="page-title">모임</h1>
            <a class="btn btn-primary" href="#/clubs/new">+ 모임 만들기</a>
        </div>
        <div class="toolbar">
            <div class="tabs" role="tablist">${tab("recruiting")}${tab("active")}${tab("ended")}</div>
            <input type="search" class="input" data-input="club-q" value="${esc(ui.clubQuery)}" placeholder="모임·책 이름 검색" aria-label="모임 검색">
        </div>
        <div class="grid" id="club-list">${list.map(clubCard).join("") || emptyState("조건에 맞는 모임이 없어요.")}</div>
    `;
}


// ---------- P5 모임 만들기 ----------

function viewClubNew(bookId) {
    if (!Store.currentUser()) {
        requireLogin();
        return "";
    }
    if (bookId) ui.picked = Store.getBook(bookId);
    const book = ui.picked;
    const today = new Date().toISOString().slice(0, 10);

    return `
        <h1 class="page-title">모임 만들기</h1>
        <form class="card form" data-form="club-new" novalidate>
            <div class="field">
                <span class="label">함께 읽을 책</span>
                <div id="picked-book">${book ? pickedBookHtml(book) : ""}</div>
                <div class="search-box ${book ? "hidden" : ""}" id="picker">
                    <input type="search" id="picker-q" placeholder="책 제목으로 검색" aria-label="책 검색">
                    <button type="button" class="btn" data-action="picker-search">책 검색</button>
                </div>
                <div id="picker-results"></div>
            </div>
            <label class="field">
                <span class="label">모임 이름</span>
                <input class="input" name="name" maxlength="40" placeholder="예: 소년이 온다 4주 완독" value="${book ? esc(book.title) + " 함께 읽기" : ""}">
            </label>
            <label class="field">
                <span class="label">소개</span>
                <textarea class="input" name="intro" rows="3" maxlength="300" placeholder="어떤 분위기로 읽고 싶은지 적어 주세요."></textarea>
            </label>
            <div class="field-row">
                <label class="field">
                    <span class="label">시작일</span>
                    <input class="input" type="date" name="start" value="${today}" min="${today}">
                </label>
                <label class="field">
                    <span class="label">기간</span>
                    <select class="input" name="weeks">
                        ${[1, 2, 3, 4, 5, 6, 7, 8].map(w => `<option value="${w}" ${w === 4 ? "selected" : ""}>${w}주</option>`).join("")}
                    </select>
                </label>
                <label class="field">
                    <span class="label">정원 (2~50명)</span>
                    <input class="input" type="number" name="capacity" value="12" min="2" max="50">
                </label>
            </div>
            <p class="meta">기간을 주차로 나눠 주차별 목표 진도가 자동으로 정해져요. (4주면 25% · 50% · 75% · 100%)</p>
            <p class="error" id="club-error" role="alert"></p>
            <div class="row">
                <button class="btn btn-primary">만들기</button>
                <button type="button" class="btn btn-ghost" data-action="back">취소</button>
            </div>
        </form>
    `;
}

function pickedBookHtml(book) {
    return `
        <div class="picked">
            ${cover(book, "xs")}
            <div class="grow"><strong>${esc(book.title)}</strong><div class="meta">${esc(authorsText(book))}</div></div>
            <button type="button" class="btn btn-sm btn-ghost" data-action="unpick">변경</button>
        </div>`;
}


// ---------- P6 모임방 ----------

function viewClub(id) {
    const club = Store.getClub(id);
    if (!club) return emptyState("모임을 찾을 수 없어요.", `<a class="btn" href="#/clubs">모임 목록</a>`);

    const book = Store.getBook(club.bookId);
    const user = Store.currentUser();
    const isMember = user && club.members.includes(user.id);
    const status = Store.clubStatus(club);
    const { week, target } = Store.clubWeek(club);
    const myProgress = Store.progressOf(user && user.id, club.bookId);
    const posts = Store.postsOfClub(club.id);
    const hide = Store.prefs().hideSpoilers;
    const host = Store.getUser(club.hostId);

    let when;
    if (status === "recruiting") {
        const dday = Math.ceil((club.start - Date.now()) / DAY);
        when = `${dateText(club.start)} 시작 · D-${dday}`;
    } else if (status === "active") {
        const left = Math.ceil((club.start + club.weeks * 7 * DAY - Date.now()) / DAY);
        when = `${week}/${club.weeks}주차 · 종료까지 ${left}일`;
    } else {
        when = `${dateText(club.start + club.weeks * 7 * DAY)} 종료 · 읽기 전용`;
    }

    const members = club.members
        .map(uid => ({ user: Store.getUser(uid), p: Store.progressOf(uid, club.bookId) }))
        .sort((a, b) => b.p - a.p);

    let joinButton = "";
    if (isMember && club.hostId !== user.id && status !== "ended") {
        joinButton = `<button class="btn btn-ghost" data-action="leave" data-club="${club.id}">나가기</button>`;
    } else if (!isMember && status !== "ended") {
        joinButton = club.members.length >= club.capacity
            ? `<button class="btn" disabled>정원 마감</button>`
            : `<button class="btn btn-primary" data-action="join" data-club="${club.id}">참여하기</button>`;
    }

    const canWrite = isMember && status !== "ended";
    const quotesLeft = user ? Store.QUOTE_LIMIT_PER_BOOK - Store.quoteCount(user.id, club.bookId) : 0;

    return `
        <section class="club-hero">
            <a href="#/book/${encodeURIComponent(club.bookId)}">${cover(book, "md")}</a>
            <div class="grow">
                <span class="badge badge-${status}">${CLUB_STATUS[status]}</span>
                <h1>${esc(club.name)}</h1>
                <p class="meta"><a href="#/book/${encodeURIComponent(club.bookId)}">${esc(book ? book.title : "")}</a> · 모임장 ${esc(host.nickname)} · ${club.members.length}/${club.capacity}명</p>
                <p class="meta strong">${when}${status === "active" ? ` · 이번 주 목표 <b>${target}%</b>` : ""}</p>
                ${club.intro ? `<p class="desc">${esc(club.intro)}</p>` : ""}
                <div class="row">
                    ${joinButton}
                    ${isMember ? `<button class="btn" data-action="open-progress" data-book="${esc(club.bookId)}">내 진도 ${myProgress}% · 업데이트</button>` : ""}
                </div>
            </div>
        </section>

        <div class="club-layout">
            <aside class="card board">
                <h2>진도 보드</h2>
                ${status === "active" ? `<p class="meta">세로선은 이번 주 목표(${target}%)</p>` : ""}
                <ul class="members">
                    ${members.map(m => `
                        <li class="${user && m.user.id === user.id ? "me" : ""}">
                            <div class="member-top"><span>${esc(m.user.nickname)}${m.user.id === club.hostId ? " <small>모임장</small>" : ""}</span><span>${m.p}%</span></div>
                            ${progressBar(m.p, status === "active" ? target : 0)}
                        </li>`).join("")}
                </ul>
            </aside>

            <section class="discussion">
                ${canWrite ? composerHtml(club, myProgress, quotesLeft) :
                    !user ? `<div class="card notice"><a href="#/login?next=${encodeURIComponent("#/club/" + club.id)}">로그인</a>하고 모임에 참여하면 이야기를 남길 수 있어요.</div>` :
                    !isMember && status !== "ended" ? `<div class="card notice">모임에 참여하면 이야기를 남길 수 있어요.</div>` : ""}

                <div class="feed-head">
                    <h2>이야기 ${posts.length}</h2>
                    <label class="switch">
                        <input type="checkbox" data-change="hide-spoilers" ${hide ? "checked" : ""}>
                        <span>스포일러 숨김</span>
                    </label>
                </div>
                <div class="feed">${posts.map(p => postCard(p, {})).join("") || emptyState("첫 이야기를 남겨 보세요.")}</div>
            </section>
        </div>
    `;
}

function composerHtml(club, myProgress, quotesLeft) {
    const isQuote = ui.composer === "quote";
    return `
        <form class="card composer" data-form="post" data-club="${club.id}">
            <div class="tabs" role="tablist">
                <button type="button" class="tab ${!isQuote ? "active" : ""}" data-action="composer-tab" data-type="thought">생각</button>
                <button type="button" class="tab ${isQuote ? "active" : ""}" data-action="composer-tab" data-type="quote">문장 카드</button>
            </div>
            ${isQuote ? `
                <label class="field">
                    <span class="label">책 속 구절 (${Store.QUOTE_MAX}자 이내 · 남은 카드 ${quotesLeft}장)</span>
                    <textarea class="input" name="quote" rows="2" maxlength="${Store.QUOTE_MAX}" data-count="quote-count" placeholder="마음에 남은 짧은 구절을 옮겨 적어요."></textarea>
                    <span class="meta counter" id="quote-count">0/${Store.QUOTE_MAX}</span>
                </label>
                <label class="field field-inline">
                    <span class="label">페이지</span>
                    <input class="input input-sm" name="page" inputmode="numeric" maxlength="5" placeholder="예: 120">
                </label>` : ""}
            <label class="field">
                <span class="label">${isQuote ? "이 구절에 대한 내 생각 (필수)" : "내 생각"}</span>
                <textarea class="input" name="body" rows="3" maxlength="1000" placeholder="${isQuote ? "왜 이 문장이 남았는지 적어 주세요." : "읽으면서 든 생각을 나눠 주세요."}"></textarea>
            </label>
            <div class="composer-foot">
                <span class="meta">내 진도 <b>${myProgress}%</b> 지점의 글로 올라가요. 이보다 덜 읽은 멤버에게는 가려져요.</span>
                <button class="btn btn-primary">올리기</button>
            </div>
            ${isQuote ? `<p class="meta small">출처(책 제목·저자·페이지)는 자동으로 표시돼요. 저작권을 지키기 위해 짧은 구절만, 내 생각과 함께 올릴 수 있어요.</p>` : ""}
            <p class="error" id="post-error" role="alert"></p>
        </form>`;
}

// 스포일러 잠금 판단: 내 진도보다 앞선 글은 가린다 (내 글과 직접 연 글은 제외)
function isLocked(post) {
    const user = Store.currentUser();
    if (!Store.prefs().hideSpoilers) return false;
    if (user && post.userId === user.id) return false;
    if (ui.revealed.has(post.id)) return false;
    const club = Store.getClub(post.clubId);
    return post.progress > Store.progressOf(user && user.id, club.bookId);
}

function postCard(post, opts) {
    const author = Store.getUser(post.userId);
    const club = Store.getClub(post.clubId);
    const book = Store.getBook(club.bookId);
    const user = Store.currentUser();
    const liked = user && post.likes.includes(user.id);
    const clubLink = opts.showClub
        ? `<a class="meta" href="#/club/${club.id}">${esc(book ? book.title : "")} · ${esc(club.name)}</a>` : "";

    const head = `
        <div class="post-head">
            <span class="avatar" style="--hue:${hashCode(author.nickname) % 360}">${esc(author.nickname.slice(0, 1))}</span>
            <strong>${esc(author.nickname)}</strong>
            <span class="tag-progress">${post.progress}% 지점</span>
            <span class="meta">${timeAgo(post.createdAt)}</span>
        </div>`;

    if (isLocked(post)) {
        return `
            <article class="post locked">
                ${head}
                ${clubLink}
                <div class="locked-body">
                    <p>아직 읽지 않은 부분(${post.progress}% 지점)의 ${post.type === "quote" ? "문장 카드" : "이야기"}예요.</p>
                    <button class="btn btn-sm" data-action="reveal" data-post="${post.id}">내용 보기</button>
                </div>
            </article>`;
    }

    const quote = post.type === "quote" ? `
        <blockquote class="quote">
            <p>${esc(post.quote)}</p>
            <cite>${esc(book ? book.title : "")} · ${esc(authorsText(book))}${post.page ? ` · ${esc(post.page)}쪽` : ""}</cite>
        </blockquote>` : "";

    if (opts.compact) {
        return `
            <article class="post compact">
                ${head}
                ${clubLink}
                ${quote}
                <p class="post-body">${esc(post.body)}</p>
            </article>`;
    }

    const open = ui.openComments.has(post.id);
    return `
        <article class="post">
            ${head}
            ${quote}
            <p class="post-body">${esc(post.body)}</p>
            <div class="post-actions">
                <button class="link-btn ${liked ? "liked" : ""}" data-action="like" data-post="${post.id}" aria-pressed="${liked ? "true" : "false"}">${liked ? "♥" : "♡"} 공감 ${post.likes.length}</button>
                <button class="link-btn" data-action="toggle-comments" data-post="${post.id}" aria-expanded="${open}">댓글 ${post.comments.length}</button>
            </div>
            ${open ? commentsHtml(post, club) : ""}
        </article>`;
}

function commentsHtml(post, club) {
    const user = Store.currentUser();
    const isMember = user && club.members.includes(user.id);
    const myProgress = Store.progressOf(user && user.id, club.bookId);
    const hide = Store.prefs().hideSpoilers;

    return `
        <div class="comments">
            ${post.comments.map(c => {
                const author = Store.getUser(c.userId);
                const locked = hide && c.userId !== (user && user.id) && c.progress > myProgress && !ui.revealed.has(c.id);
                return `
                    <div class="comment">
                        <strong>${esc(author.nickname)}</strong> <span class="tag-progress">${c.progress}%</span>
                        ${locked
                            ? `<span class="meta">앞선 진도의 댓글이에요.</span> <button class="link-btn" data-action="reveal" data-post="${c.id}">보기</button>`
                            : `<span>${esc(c.body)}</span>`}
                        <span class="meta"> · ${timeAgo(c.createdAt)}</span>
                    </div>`;
            }).join("")}
            ${isMember && Store.clubStatus(club) !== "ended" ? `
                <form class="comment-form" data-form="comment" data-post="${post.id}">
                    <input class="input" name="body" maxlength="300" placeholder="댓글 달기" aria-label="댓글">
                    <button class="btn btn-sm">등록</button>
                </form>` : ""}
        </div>`;
}


// ---------- P7 내 서재 ----------

function viewLibrary() {
    const user = Store.currentUser();
    const all = Store.library(user.id).filter(e => e.book);
    const year = new Date().getFullYear();
    const doneThisYear = all.filter(e => e.status === "done" && new Date(e.finishedAt || e.updatedAt).getFullYear() === year).length;
    const myClubs = Store.clubs().filter(c => c.members.includes(user.id)).length;
    const list = all.filter(e => e.status === ui.libTab).sort((a, b) => b.updatedAt - a.updatedAt);
    const count = k => all.filter(e => e.status === k).length;

    return `
        <h1 class="page-title">내 서재</h1>
        <div class="stats">
            <div class="stat"><span class="stat-num">${doneThisYear}</span><span class="meta">${year}년 완독</span></div>
            <div class="stat"><span class="stat-num">${count("reading")}</span><span class="meta">읽는 중</span></div>
            <div class="stat"><span class="stat-num">${myClubs}</span><span class="meta">참여 모임</span></div>
        </div>
        <div class="tabs" role="tablist">
            ${Object.entries(SHELF).map(([k, v]) =>
                `<button class="tab ${ui.libTab === k ? "active" : ""}" data-action="lib-tab" data-tab="${k}">${v} ${count(k)}</button>`).join("")}
        </div>
        <div class="lib-list">
            ${list.map(e => `
                <div class="lib-item">
                    <a href="#/book/${encodeURIComponent(e.bookId)}">${cover(e.book, "sm")}</a>
                    <div class="grow">
                        <a class="title-link" href="#/book/${encodeURIComponent(e.bookId)}">${esc(e.book.title)}</a>
                        <p class="meta">${esc(authorsText(e.book))}</p>
                        ${progressBar(e.progress)}
                        <p class="meta">${e.progress}%</p>
                    </div>
                    <div class="lib-actions">
                        <button class="btn btn-sm" data-action="open-progress" data-book="${esc(e.bookId)}">진도</button>
                        <select class="input input-sm" data-change="shelf" data-book="${esc(e.bookId)}" aria-label="상태 변경">
                            ${Object.entries(SHELF).map(([k, v]) => `<option value="${k}" ${e.status === k ? "selected" : ""}>${v}</option>`).join("")}
                        </select>
                        <button class="btn btn-sm btn-ghost" data-action="remove-lib" data-book="${esc(e.bookId)}">삭제</button>
                    </div>
                </div>`).join("") || emptyState("이 칸이 비어 있어요.", `<a class="btn" href="#/search">책 찾기</a>`)}
        </div>
    `;
}


// ---------- P8 로그인 / 프로필 ----------

function viewLogin(next) {
    return `
        <div class="card narrow">
            <h1 class="page-title">책갈피 시작하기</h1>
            <p class="meta">프로토타입이라 닉네임만으로 시작해요. 데이터는 이 브라우저에만 저장돼요.</p>
            <form class="form" data-form="login" data-next="${esc(next)}">
                <label class="field">
                    <span class="label">닉네임 (2~12자)</span>
                    <input class="input" name="nickname" minlength="2" maxlength="12" autofocus>
                </label>
                <p class="error" id="login-error" role="alert"></p>
                <button class="btn btn-primary btn-block">시작하기</button>
            </form>
            <div class="divider"><span>또는</span></div>
            <button class="btn btn-block" data-action="demo-login" data-next="${esc(next)}">체험 계정(책벌레)으로 둘러보기</button>
            <p class="meta small">체험 계정은 '소년이 온다'를 45%까지 읽은 상태라 스포일러 잠금을 바로 확인할 수 있어요.</p>
        </div>`;
}

function viewMe() {
    const user = Store.currentUser();
    const clubs = Store.clubs().filter(c => c.members.includes(user.id));
    return `
        <h1 class="page-title">내 프로필</h1>
        <form class="card form" data-form="profile">
            <label class="field">
                <span class="label">닉네임</span>
                <input class="input" name="nickname" minlength="2" maxlength="12" value="${esc(user.nickname)}">
            </label>
            <label class="field">
                <span class="label">한 줄 소개</span>
                <input class="input" name="bio" maxlength="60" value="${esc(user.bio || "")}">
            </label>
            <p class="error" id="profile-error" role="alert"></p>
            <div class="row">
                <button class="btn btn-primary">저장</button>
                <button type="button" class="btn btn-ghost" data-action="logout">로그아웃</button>
            </div>
        </form>
        <section>
            <div class="section-head"><h2>내 모임</h2></div>
            <div class="grid">${clubs.map(clubCard).join("") || emptyState("참여한 모임이 없어요.", `<a class="btn" href="#/clubs">모임 둘러보기</a>`)}</div>
        </section>
        <p class="meta small">프로토타입 데이터를 처음 상태로 되돌리려면 <button class="link-btn" data-action="reset">샘플 데이터 초기화</button></p>
    `;
}


// ---------- 진도 업데이트 모달 ----------

function openProgress(bookId) {
    if (!requireLogin()) return;
    const user = Store.currentUser();
    const book = rememberBook(bookId);
    const progress = Store.progressOf(user.id, bookId);
    const byPage = ui.progressMode === "page";
    const pages = book.pages || "";

    const modal = document.getElementById("modal");
    modal.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <h2 id="modal-title">진도 기록</h2>
            <p class="meta">${esc(book.title)}</p>
            <div class="tabs">
                <button type="button" class="tab ${!byPage ? "active" : ""}" data-action="progress-mode" data-mode="percent" data-book="${esc(bookId)}">%</button>
                <button type="button" class="tab ${byPage ? "active" : ""}" data-action="progress-mode" data-mode="page" data-book="${esc(bookId)}">페이지</button>
            </div>
            <form class="form" data-form="progress" data-book="${esc(bookId)}">
                ${byPage ? `
                    <div class="field-row">
                        <label class="field"><span class="label">읽은 페이지</span>
                            <input class="input" type="number" name="page" min="0" value="${pages ? Math.round(progress / 100 * pages) : ""}"></label>
                        <label class="field"><span class="label">전체 페이지</span>
                            <input class="input" type="number" name="total" min="1" value="${pages}"></label>
                    </div>
                    <p class="meta small">판본마다 쪽수가 달라서 %로 바꿔 저장해요.</p>` : `
                    <label class="field">
                        <span class="label">어디까지 읽었나요? <b id="range-value">${progress}%</b></span>
                        <input type="range" name="percent" min="0" max="100" value="${progress}" data-range="range-value">
                    </label>`}
                <p class="error" id="progress-error" role="alert"></p>
                <div class="row end">
                    <button type="button" class="btn btn-ghost" data-action="close-modal">취소</button>
                    <button class="btn btn-primary">저장</button>
                </div>
            </form>
        </div>`;
    modal.classList.add("open");
    modal.dataset.book = bookId;
}

function closeModal() {
    const modal = document.getElementById("modal");
    modal.classList.remove("open");
    modal.innerHTML = "";
}


// ---------- 버튼 동작 ----------

const actions = {

    "cache-book": d => rememberBook(d.book),

    "add-shelf": d => {
        if (!requireLogin()) return;
        const user = Store.currentUser();
        rememberBook(d.book);
        if (Store.getEntry(user.id, d.book)) {
            toast("이미 내 서재에 있는 책이에요.");
            return;
        }
        Store.setShelf(user.id, d.book, d.status);
        toast(`'${SHELF[d.status]}'에 담았어요.`);
    },

    "open-progress": d => openProgress(d.book),

    "progress-mode": d => {
        ui.progressMode = d.mode;
        openProgress(d.book);
    },

    "close-modal": closeModal,

    "join": d => {
        if (!requireLogin()) return;
        const r = Store.joinClub(d.club);
        if (!r.ok) return toast(r.error);
        toast("모임에 참여했어요! 책은 '읽는 중'에 담겼어요.");
        render();
    },

    "leave": d => {
        if (!confirm("모임에서 나갈까요? 내가 쓴 글은 남아 있어요.")) return;
        const r = Store.leaveClub(d.club);
        if (r && !r.ok) return toast(r.error);
        render();
    },

    "reveal": d => {
        if (!confirm("아직 읽지 않은 부분의 내용이 담겨 있을 수 있어요. 그래도 볼까요?")) return;
        ui.revealed.add(d.post);
        render();
    },

    "like": d => {
        if (!requireLogin()) return;
        Store.toggleLike(d.post);
        render();
    },

    "toggle-comments": d => {
        if (ui.openComments.has(d.post)) ui.openComments.delete(d.post);
        else ui.openComments.add(d.post);
        render();
    },

    "composer-tab": d => {
        ui.composer = d.type;
        render();
    },

    "club-filter": d => {
        ui.clubFilter = d.filter;
        render();
    },

    "lib-tab": d => {
        ui.libTab = d.tab;
        render();
    },

    "remove-lib": d => {
        if (!confirm("내 서재에서 삭제할까요? 진도 기록도 함께 지워져요.")) return;
        Store.removeFromLibrary(Store.currentUser().id, d.book);
        render();
    },

    "picker-search": async () => {
        const q = document.getElementById("picker-q").value.trim();
        const box = document.getElementById("picker-results");
        if (!q) return;
        box.innerHTML = `<p class="meta">검색 중…</p>`;
        const books = await BookAPI.search(q);
        ui.pickerResults = books.slice(0, 8);
        box.innerHTML = ui.pickerResults.map((b, i) => `
            <div class="picked">
                ${cover(b, "xs")}
                <div class="grow"><strong>${esc(b.title)}</strong><div class="meta">${esc(authorsText(b))}</div></div>
                <button type="button" class="btn btn-sm" data-action="pick-book" data-index="${i}">선택</button>
            </div>`).join("") || `<p class="meta">검색 결과가 없어요.</p>`;
    },

    "pick-book": d => {
        const book = ui.pickerResults[Number(d.index)];
        Store.saveBook(book);
        ui.picked = book;
        document.getElementById("picked-book").innerHTML = pickedBookHtml(book);
        document.getElementById("picker").classList.add("hidden");
        document.getElementById("picker-results").innerHTML = "";
        const name = document.querySelector("[data-form=club-new] [name=name]");
        if (!name.value) name.value = book.title + " 함께 읽기";
    },

    "unpick": () => {
        ui.picked = null;
        document.getElementById("picked-book").innerHTML = "";
        document.getElementById("picker").classList.remove("hidden");
    },

    "back": () => history.back(),

    "demo-login": d => {
        Store.login("책벌레");
        go(d.next || "#/");
    },

    "logout": () => {
        Store.logout();
        go("#/");
    },

    "reset": () => {
        if (!confirm("모든 데이터를 샘플 상태로 되돌릴까요?")) return;
        Store.reset();
        ui.revealed.clear();
        go("#/");
    }
};


// ---------- 폼 제출 ----------

const forms = {

    "search": form => {
        const q = form.q.value.trim();
        if (!q) return toast("검색어를 입력해 주세요.");
        go("#/search?q=" + encodeURIComponent(q));
    },

    "login": form => {
        const name = form.nickname.value.trim();
        if (name.length < 2 || name.length > 12) {
            document.getElementById("login-error").textContent = "닉네임은 2~12자로 입력해 주세요.";
            return;
        }
        Store.login(name);
        go(form.dataset.next || "#/");
    },

    "profile": form => {
        const name = form.nickname.value.trim();
        const err = document.getElementById("profile-error");
        if (name.length < 2 || name.length > 12) {
            err.textContent = "닉네임은 2~12자로 입력해 주세요.";
            return;
        }
        const r = Store.updateProfile({ nickname: name, bio: form.bio.value });
        if (!r.ok) {
            err.textContent = r.error;
            return;
        }
        toast("저장했어요.");
        render();
    },

    "club-new": form => {
        const err = document.getElementById("club-error");
        const name = form.name.value.trim();
        const capacity = Number(form.capacity.value);
        const start = new Date(form.start.value + "T00:00:00").getTime();

        if (!ui.picked) return (err.textContent = "함께 읽을 책을 골라 주세요.");
        if (!name) return (err.textContent = "모임 이름을 입력해 주세요.");
        if (!form.start.value || isNaN(start)) return (err.textContent = "시작일을 골라 주세요.");
        if (!(capacity >= 2 && capacity <= 50)) return (err.textContent = "정원은 2~50명이에요.");

        const club = Store.createClub({
            bookId: ui.picked.id,
            name,
            intro: form.intro.value,
            start,
            weeks: Number(form.weeks.value),
            capacity
        });
        ui.picked = null;
        toast("모임을 만들었어요!");
        go("#/club/" + club.id);
    },

    "post": form => {
        const err = document.getElementById("post-error");
        const club = Store.getClub(form.dataset.club);
        const user = Store.currentUser();
        const body = form.body.value.trim();
        const type = ui.composer;

        if (!body) return (err.textContent = type === "quote" ? "문장 카드에는 내 생각을 꼭 함께 적어 주세요." : "내용을 입력해 주세요.");

        const fields = { type, body };
        if (type === "quote") {
            const quote = form.quote.value.trim();
            if (!quote) return (err.textContent = "책 속 구절을 입력해 주세요.");
            if (quote.length > Store.QUOTE_MAX) return (err.textContent = `구절은 ${Store.QUOTE_MAX}자 이내로 적어 주세요.`);
            if (Store.quoteCount(user.id, club.bookId) >= Store.QUOTE_LIMIT_PER_BOOK) {
                return (err.textContent = `한 책에는 문장 카드를 ${Store.QUOTE_LIMIT_PER_BOOK}장까지 올릴 수 있어요.`);
            }
            fields.quote = quote;
            fields.page = form.page.value.replace(/\D/g, "");
        }
        Store.addPost(club.id, fields);
        toast("올렸어요.");
        render();
    },

    "comment": form => {
        const body = form.body.value.trim();
        if (!body) return;
        Store.addComment(form.dataset.post, body);
        ui.openComments.add(form.dataset.post);
        render();
    },

    "progress": form => {
        const err = document.getElementById("progress-error");
        let percent;
        if (ui.progressMode === "page") {
            const page = Number(form.page.value);
            const total = Number(form.total.value);
            if (!(total > 0)) return (err.textContent = "전체 페이지 수를 입력해 주세요.");
            if (!(page >= 0) || page > total) return (err.textContent = "읽은 페이지는 0부터 전체 페이지 사이여야 해요.");
            percent = (page / total) * 100;
            const book = Store.getBook(form.dataset.book);
            if (book && !book.pages) Store.saveBook(Object.assign({}, book, { pages: total }));
        } else {
            percent = Number(form.percent.value);
        }

        const unlocked = Store.setProgress(Store.currentUser().id, form.dataset.book, percent);
        closeModal();
        const p = Math.round(percent);
        if (p === 100) toast("완독을 축하해요! '다 읽음'으로 옮겼어요.");
        else if (unlocked > 0) toast(`${p}%까지 기록했어요. 새로 열린 이야기 ${unlocked}개!`);
        else toast(`${p}%까지 기록했어요.`);
        render();
    }
};


// ---------- 이벤트 연결 ----------

document.addEventListener("click", e => {
    const el = e.target.closest("[data-action]");
    if (!el) {
        if (e.target.id === "modal") closeModal();
        return;
    }
    const fn = actions[el.dataset.action];
    if (!fn) return;
    if (el.tagName === "BUTTON") e.preventDefault();
    fn(el.dataset, el, e);
});

document.addEventListener("submit", e => {
    const form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    const fn = forms[form.dataset.form];
    if (fn) fn(form);
});

document.addEventListener("change", e => {
    const el = e.target;
    if (el.dataset.change === "shelf") {
        if (!requireLogin()) return;
        const user = Store.currentUser();
        rememberBook(el.dataset.book);
        if (el.value) {
            Store.setShelf(user.id, el.dataset.book, el.value);
            toast(`'${SHELF[el.value]}'(으)로 옮겼어요.`);
        } else {
            Store.removeFromLibrary(user.id, el.dataset.book);
            toast("서재에서 뺐어요.");
        }
        render();
    }
    if (el.dataset.change === "hide-spoilers") {
        Store.setPref("hideSpoilers", el.checked);
        render();
    }
});

document.addEventListener("input", e => {
    const el = e.target;
    if (el.dataset.input === "club-q") {
        ui.clubQuery = el.value;
        const q = el.value.toLowerCase();
        const list = Store.clubs().filter(c => {
            if (Store.clubStatus(c) !== ui.clubFilter) return false;
            const book = Store.getBook(c.bookId);
            return !q || c.name.toLowerCase().includes(q) || (book && book.title.toLowerCase().includes(q));
        });
        document.getElementById("club-list").innerHTML = list.map(clubCard).join("") || emptyState("조건에 맞는 모임이 없어요.");
    }
    if (el.dataset.range) {
        document.getElementById(el.dataset.range).textContent = el.value + "%";
    }
    if (el.dataset.count) {
        document.getElementById(el.dataset.count).textContent = `${el.value.length}/${Store.QUOTE_MAX}`;
    }
});

document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
    if (e.key === "Enter" && e.target.id === "picker-q") {
        e.preventDefault();
        actions["picker-search"]();
    }
});

window.addEventListener("hashchange", () => {
    closeModal();
    window.scrollTo(0, 0);
    render();
});

render();
