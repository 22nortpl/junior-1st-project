// 책갈피 프로토타입 데이터 저장소
// 서버 없이 브라우저 localStorage에 저장한다. 실서비스에서는 같은 구조를 DB로 옮긴다.

const DAY = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "bookmark-club-v1";

const Store = (() => {

    let db = null;

    function load() {
        try {
            db = JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch (e) {
            db = null;
        }
        if (!db || !db.users) {
            db = seed();
            save();
        }
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
        } catch (e) {
            console.warn("저장 실패:", e);
        }
    }

    function uid(prefix) {
        return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    // ---------- 회원 ----------

    function currentUser() {
        return db.session ? db.users[db.session] : null;
    }

    function getUser(id) {
        return db.users[id] || { id, nickname: "알 수 없음", bio: "" };
    }

    function login(nickname) {
        const name = nickname.trim();
        let user = Object.values(db.users).find(u => u.nickname === name);
        if (!user) {
            user = { id: uid("u"), nickname: name, bio: "", joinedAt: Date.now() };
            db.users[user.id] = user;
            db.library[user.id] = {};
        }
        db.session = user.id;
        save();
        return user;
    }

    function logout() {
        db.session = null;
        save();
    }

    function updateProfile(fields) {
        const user = currentUser();
        if (!user) return { ok: false, error: "로그인이 필요해요." };
        const name = fields.nickname.trim();
        const taken = Object.values(db.users).some(u => u.nickname === name && u.id !== user.id);
        if (taken) return { ok: false, error: "이미 사용 중인 닉네임이에요." };
        user.nickname = name;
        user.bio = fields.bio.trim();
        save();
        return { ok: true };
    }

    // ---------- 책 ----------

    function saveBook(book) {
        db.books[book.id] = Object.assign({}, db.books[book.id], book);
        save();
    }

    function getBook(id) {
        return db.books[id] || null;
    }

    function searchLocalBooks(q) {
        const k = q.toLowerCase();
        return Object.values(db.books).filter(b =>
            b.title.toLowerCase().includes(k) ||
            b.authors.join(" ").toLowerCase().includes(k) ||
            b.isbn === q
        );
    }

    // ---------- 내 서재 / 진도 ----------

    function getEntry(userId, bookId) {
        const lib = db.library[userId] || {};
        return lib[bookId] || null;
    }

    function progressOf(userId, bookId) {
        const entry = userId ? getEntry(userId, bookId) : null;
        return entry ? entry.progress : 0;
    }

    function library(userId) {
        const lib = db.library[userId] || {};
        return Object.entries(lib).map(([bookId, entry]) =>
            Object.assign({ bookId, book: getBook(bookId) }, entry)
        );
    }

    function setShelf(userId, bookId, status) {
        if (!db.library[userId]) db.library[userId] = {};
        const lib = db.library[userId];
        const entry = lib[bookId] || { progress: 0, addedAt: Date.now() };
        entry.status = status;
        if (status === "done") entry.progress = 100;
        entry.updatedAt = Date.now();
        lib[bookId] = entry;
        save();
    }

    // 진도를 저장하고, 이 저장으로 새로 열린 다른 사람의 글 수를 돌려준다
    function setProgress(userId, bookId, progress) {
        const p = Math.max(0, Math.min(100, Math.round(progress)));
        if (!db.library[userId]) db.library[userId] = {};
        const lib = db.library[userId];
        const entry = lib[bookId] || { progress: 0, status: "reading", addedAt: Date.now() };
        const before = entry.progress;

        entry.progress = p;
        if (p === 100) entry.status = "done";
        else if (p > 0) entry.status = "reading";
        entry.updatedAt = Date.now();
        if (p === 100) entry.finishedAt = Date.now();
        lib[bookId] = entry;
        save();

        const clubIds = new Set(db.clubs.filter(c => c.bookId === bookId).map(c => c.id));
        return db.posts.filter(post =>
            clubIds.has(post.clubId) &&
            post.userId !== userId &&
            post.progress > before &&
            post.progress <= p
        ).length;
    }

    function removeFromLibrary(userId, bookId) {
        if (db.library[userId]) delete db.library[userId][bookId];
        save();
    }

    // ---------- 모임 ----------

    function clubStatus(club) {
        const now = Date.now();
        const end = club.start + club.weeks * 7 * DAY;
        if (now < club.start) return "recruiting";
        if (now < end) return "active";
        return "ended";
    }

    // 이번 주차와 주차별 목표 진도(%)
    function clubWeek(club) {
        const elapsed = Date.now() - club.start;
        const week = Math.min(club.weeks, Math.max(0, Math.floor(elapsed / (7 * DAY)) + 1));
        const target = week === 0 ? 0 : Math.round((week / club.weeks) * 100);
        return { week, target };
    }

    function clubs() {
        return db.clubs.slice();
    }

    function getClub(id) {
        return db.clubs.find(c => c.id === id) || null;
    }

    function createClub(fields) {
        const user = currentUser();
        const club = {
            id: uid("c"),
            bookId: fields.bookId,
            name: fields.name.trim(),
            intro: fields.intro.trim(),
            start: fields.start,
            weeks: fields.weeks,
            capacity: fields.capacity,
            hostId: user.id,
            members: [user.id],
            createdAt: Date.now()
        };
        db.clubs.unshift(club);
        if (!getEntry(user.id, club.bookId)) setShelf(user.id, club.bookId, "reading");
        save();
        return club;
    }

    function joinClub(clubId) {
        const user = currentUser();
        const club = getClub(clubId);
        if (!user || !club) return { ok: false, error: "모임을 찾을 수 없어요." };
        if (club.members.includes(user.id)) return { ok: true };
        if (clubStatus(club) === "ended") return { ok: false, error: "이미 끝난 모임이에요." };
        if (club.members.length >= club.capacity) return { ok: false, error: "정원이 다 찼어요." };
        club.members.push(user.id);
        const entry = getEntry(user.id, club.bookId);
        if (!entry || entry.status === "want") setShelf(user.id, club.bookId, "reading");
        save();
        return { ok: true };
    }

    function leaveClub(clubId) {
        const user = currentUser();
        const club = getClub(clubId);
        if (!user || !club) return;
        if (club.hostId === user.id) return { ok: false, error: "모임장은 모임을 나갈 수 없어요." };
        club.members = club.members.filter(id => id !== user.id);
        save();
        return { ok: true };
    }

    // ---------- 토론 글 ----------

    const QUOTE_MAX = 200;
    const QUOTE_LIMIT_PER_BOOK = 10;

    function postsOfClub(clubId) {
        return db.posts
            .filter(p => p.clubId === clubId)
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    function postsOfBook(bookId, type) {
        const clubIds = new Set(db.clubs.filter(c => c.bookId === bookId).map(c => c.id));
        return db.posts
            .filter(p => clubIds.has(p.clubId) && (!type || p.type === type))
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    function recentPosts(limit) {
        return db.posts.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    }

    function quoteCount(userId, bookId) {
        return postsOfBook(bookId, "quote").filter(p => p.userId === userId).length;
    }

    function addPost(clubId, fields) {
        const user = currentUser();
        const club = getClub(clubId);
        const post = {
            id: uid("p"),
            clubId,
            userId: user.id,
            type: fields.type,
            body: fields.body.trim(),
            quote: fields.quote ? fields.quote.trim() : "",
            page: fields.page || "",
            progress: progressOf(user.id, club.bookId),
            createdAt: Date.now(),
            likes: [],
            comments: []
        };
        db.posts.push(post);
        save();
        return post;
    }

    function getPost(id) {
        return db.posts.find(p => p.id === id) || null;
    }

    function toggleLike(postId) {
        const user = currentUser();
        const post = getPost(postId);
        if (!user || !post) return;
        const i = post.likes.indexOf(user.id);
        if (i >= 0) post.likes.splice(i, 1);
        else post.likes.push(user.id);
        save();
    }

    function addComment(postId, body) {
        const user = currentUser();
        const post = getPost(postId);
        const club = getClub(post.clubId);
        post.comments.push({
            id: uid("m"),
            userId: user.id,
            body: body.trim(),
            progress: progressOf(user.id, club.bookId),
            createdAt: Date.now()
        });
        save();
    }

    // ---------- 설정 ----------

    function prefs() {
        return db.prefs;
    }

    function setPref(key, value) {
        db.prefs[key] = value;
        save();
    }

    function reset() {
        db = seed();
        save();
    }

    load();

    return {
        currentUser, getUser, login, logout, updateProfile,
        saveBook, getBook, searchLocalBooks,
        getEntry, progressOf, library, setShelf, setProgress, removeFromLibrary,
        clubStatus, clubWeek, clubs, getClub, createClub, joinClub, leaveClub,
        postsOfClub, postsOfBook, recentPosts, quoteCount, addPost, getPost, toggleLike, addComment,
        prefs, setPref, reset,
        QUOTE_MAX, QUOTE_LIMIT_PER_BOOK
    };
})();


// ---------- 샘플 데이터 ----------
// 책 소개와 글은 이 프로토타입을 위해 새로 쓴 예시다. 실제 책 본문을 옮기지 않는다.

function seed() {
    const now = Date.now();
    const ago = days => now - days * DAY;

    const books = {
        "9788936434120": {
            id: "9788936434120", isbn: "9788936434120", title: "소년이 온다", authors: ["한강"],
            publisher: "창비", thumbnail: "", pages: 216, published: "2014",
            description: "1980년 5월 광주를 여러 인물의 목소리로 따라가는 장편소설."
        },
        "9788936434267": {
            id: "9788936434267", isbn: "9788936434267", title: "아몬드", authors: ["손원평"],
            publisher: "창비", thumbnail: "", pages: 264, published: "2017",
            description: "감정을 느끼기 어려운 소년이 세상과 관계를 맺어 가는 성장소설."
        },
        "9788937460449": {
            id: "9788937460449", isbn: "9788937460449", title: "데미안", authors: ["헤르만 헤세"],
            publisher: "민음사", thumbnail: "", pages: 232, published: "2000",
            description: "한 소년이 자기 자신에게 이르는 길을 그린 고전 성장소설."
        },
        "9791161571188": {
            id: "9791161571188", isbn: "9791161571188", title: "불편한 편의점", authors: ["김호연"],
            publisher: "나무옆의자", thumbnail: "", pages: 268, published: "2021",
            description: "서울 청파동의 작은 편의점에 모인 사람들의 이야기."
        },
        "9788934972464": {
            id: "9788934972464", isbn: "9788934972464", title: "사피엔스", authors: ["유발 하라리"],
            publisher: "김영사", thumbnail: "", pages: 636, published: "2015",
            description: "인지혁명, 농업혁명, 과학혁명으로 인류의 역사를 다시 읽는 교양서."
        }
    };

    const B = {
        boy: "9788936434120", almond: "9788936434267", demian: "9788937460449",
        store: "9791161571188", sapiens: "9788934972464"
    };

    const users = {
        u1: { id: "u1", nickname: "책벌레", bio: "한 달에 네 권이 목표예요.", joinedAt: ago(90) },
        u2: { id: "u2", nickname: "밤독서", bio: "자기 전 30분 독서", joinedAt: ago(80) },
        u3: { id: "u3", nickname: "문장수집가", bio: "좋은 문장을 모읍니다.", joinedAt: ago(70) },
        u4: { id: "u4", nickname: "새벽세시", bio: "", joinedAt: ago(60) },
        u5: { id: "u5", nickname: "느린독자", bio: "천천히, 끝까지.", joinedAt: ago(50) }
    };

    const entry = (status, progress, d) => ({ status, progress, addedAt: ago(d + 5), updatedAt: ago(d) });
    const library = {
        u1: { [B.boy]: entry("reading", 45, 1), [B.demian]: Object.assign(entry("done", 100, 25), { finishedAt: ago(25) }), [B.almond]: entry("want", 0, 3) },
        u2: { [B.boy]: entry("reading", 70, 0), [B.sapiens]: entry("reading", 30, 2), [B.store]: entry("reading", 20, 1) },
        u3: { [B.boy]: entry("reading", 20, 2), [B.almond]: entry("want", 0, 4) },
        u4: { [B.boy]: entry("reading", 90, 0), [B.sapiens]: entry("reading", 40, 3), [B.demian]: Object.assign(entry("done", 100, 26), { finishedAt: ago(26) }) },
        u5: { [B.sapiens]: entry("reading", 15, 4), [B.store]: entry("reading", 35, 1), [B.almond]: entry("want", 0, 6) }
    };

    const clubs = [
        { id: "c1", bookId: B.boy, name: "소년이 온다 4주 완독", intro: "한 주에 한두 장씩, 천천히 읽고 이야기 나눠요. 스포일러는 진도 잠금으로 보호됩니다.", start: ago(10), weeks: 4, capacity: 12, hostId: "u1", members: ["u1", "u2", "u3", "u4"], createdAt: ago(14) },
        { id: "c5", bookId: B.store, name: "퇴근 후 불편한 편의점", intro: "퇴근길에 한 챕터씩. 가볍게 읽고 편하게 이야기해요.", start: ago(3), weeks: 3, capacity: 15, hostId: "u5", members: ["u5", "u2"], createdAt: ago(6) },
        { id: "c2", bookId: B.almond, name: "아몬드 함께 읽기: 감정에 대하여", intro: "감정이란 무엇일까? 3주 동안 같이 읽고 생각을 나눠요. 독서 초보 환영!", start: now + 5 * DAY, weeks: 3, capacity: 20, hostId: "u3", members: ["u3", "u5"], createdAt: ago(2) },
        { id: "c3", bookId: B.sapiens, name: "사피엔스 8주 챌린지", intro: "벽돌책도 함께라면 끝낼 수 있다. 주 1장 페이스.", start: ago(20), weeks: 8, capacity: 30, hostId: "u2", members: ["u2", "u4", "u5"], createdAt: ago(24) },
        { id: "c4", bookId: B.demian, name: "데미안 2주 속독", intro: "짧고 굵게 2주 완독.", start: ago(40), weeks: 2, capacity: 10, hostId: "u4", members: ["u4", "u1"], createdAt: ago(45) }
    ];

    let n = 0;
    const post = (clubId, userId, progress, d, body, extra) => Object.assign({
        id: "p" + (++n), clubId, userId, type: "thought", body, quote: "", page: "",
        progress, createdAt: ago(d), likes: [], comments: []
    }, extra || {});

    const posts = [
        post("c1", "u3", 15, 8.5, "초반부터 시점이 독특해서 천천히 읽게 돼요. 다들 첫 장 읽고 어떤 느낌이었나요?", {
            likes: ["u1", "u2"],
            comments: [{ id: "m1", userId: "u1", body: "저도 첫 장에서 한참 멈췄어요. 이 책은 몰아 읽기가 어렵네요.", progress: 20, createdAt: ago(8) }]
        }),
        post("c1", "u1", 40, 3, "2장을 넘어가면서 인물들의 관계가 보이기 시작했어요. 하루 한 장씩 읽는 게 이 책에 맞는 속도 같아요.", { likes: ["u4"] }),
        post("c1", "u2", 55, 2, "문장 카드는 이렇게 짧은 구절과 내 생각을 함께 올려요. (샘플 데이터라 실제 책 문장 대신 예시 문구를 넣었어요.)", {
            type: "quote", quote: "[예시] 마음에 남은 책 속 문장이 이 자리에 들어갑니다.", page: "120", likes: ["u4"]
        }),
        post("c1", "u2", 65, 1, "중반부의 한 장면에서 한참 멈춰 있었어요. 이 부분까지 읽은 분들과 꼭 이야기해 보고 싶어요.", { likes: ["u4"] }),
        post("c1", "u4", 90, 0.2, "마지막 장을 앞두고 앞부분을 다시 펼쳐 보게 되네요. 제목의 의미가 이제야 와닿아요."),
        post("c3", "u5", 12, 17, "벽돌책이라 겁먹었는데 모임 덕분에 드디어 시작했어요.", { likes: ["u2", "u4"] }),
        post("c3", "u2", 10, 15, "첫 파트가 생각보다 술술 읽혀요. 주 1장 페이스면 충분할 것 같아요."),
        post("c3", "u4", 35, 4, "농업혁명을 바라보는 저자의 관점이 흥미로워요. 동의하지 않는 분들 의견도 궁금해요.", {
            comments: [{ id: "m2", userId: "u2", body: "저는 반쯤 동의해요. 다음 주에 더 읽고 다시 이야기해요!", progress: 30, createdAt: ago(2) }]
        }),
        post("c4", "u4", 50, 33, "주인공이 흔들리는 장면마다 제 학창 시절이 떠올라요."),
        post("c4", "u1", 100, 26, "끝까지 읽고 나니 처음 읽을 때의 느낌과 완전히 달라졌어요. 다시 읽고 싶은 책.", { likes: ["u4"] }),
        post("c5", "u2", 15, 2, "퇴근길 지하철에서 한 챕터씩 읽고 있어요. 이 모임 속도 딱 좋아요."),
        post("c5", "u5", 30, 0.5, "편의점이라는 공간이 주는 따뜻함이 좋네요. 다들 좋아하는 인물 있어요?")
    ];

    return {
        users, books, library, clubs, posts,
        session: null,
        prefs: { hideSpoilers: true }
    };
}
