// 책 검색 API: 카카오(키가 있으면) → Google Books → 저장된 책(오프라인)

const BookAPI = {

    // 마지막 검색에서 외부 API가 모두 실패했으면 true
    failed: false,

    async search(keyword) {
        const q = keyword.trim();
        if (!q) return [];

        let results = [];
        let ok = false;

        if (CONFIG.KAKAO_REST_KEY) {
            try {
                results = await searchKakao(q);
                ok = true;
            } catch (e) {
                console.warn("카카오 검색 실패, Google Books로 전환:", e);
            }
        }

        if (results.length === 0) {
            try {
                results = await searchGoogle(q);
                ok = true;
            } catch (e) {
                console.warn("Google Books 검색 실패, 저장된 책에서 검색:", e);
            }
        }
        this.failed = !ok;

        // 이미 저장된 책(샘플 포함) 중 일치하는 것을 앞에 붙인다
        const local = Store.searchLocalBooks(q);
        const seen = new Set(local.map(b => b.id));
        return local.concat(results.filter(b => !seen.has(b.id)));
    }
};

async function searchKakao(q) {
    const url = `https://dapi.kakao.com/v3/search/book?size=20&query=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
        headers: { Authorization: `KakaoAK ${CONFIG.KAKAO_REST_KEY}` }
    });
    if (!response.ok) throw new Error("HTTP " + response.status);

    const data = await response.json();

    return data.documents.map(doc => {
        const isbns = doc.isbn.split(" ").filter(Boolean);
        const isbn = isbns.find(s => s.length === 13) || isbns[0] || "";
        return {
            id: isbn || "k-" + doc.url,
            isbn,
            title: doc.title,
            authors: doc.authors,
            publisher: doc.publisher,
            thumbnail: doc.thumbnail,
            description: doc.contents,
            pages: 0,
            published: doc.datetime ? doc.datetime.slice(0, 10) : ""
        };
    });
}

async function searchGoogle(q) {
    const url = `https://www.googleapis.com/books/v1/volumes?maxResults=20&q=${encodeURIComponent(q)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("HTTP " + response.status);

    const data = await response.json();

    return (data.items || []).map(item => {
        const info = item.volumeInfo;
        const ids = info.industryIdentifiers || [];
        const isbn13 = ids.find(i => i.type === "ISBN_13");
        const isbn = isbn13 ? isbn13.identifier : "";
        const thumb = info.imageLinks ? info.imageLinks.thumbnail : "";
        return {
            id: isbn || "g-" + item.id,
            isbn,
            title: info.title || "제목 없음",
            authors: info.authors || [],
            publisher: info.publisher || "",
            thumbnail: thumb.replace("http://", "https://"),
            description: info.description || "",
            pages: info.pageCount || 0,
            published: info.publishedDate || ""
        };
    });
}

// 외부 서점 검색 링크 (책 본문은 각 서점 앱에서 읽는다)
function storeLinks(book) {
    const q = encodeURIComponent(book.title);
    return [
        { name: "리디", url: `https://ridibooks.com/search?q=${q}` },
        { name: "교보문고", url: `https://search.kyobobook.co.kr/search?keyword=${q}` },
        { name: "예스24", url: `https://www.yes24.com/Product/Search?domain=ALL&query=${q}` },
        { name: "알라딘", url: `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=All&SearchWord=${q}` }
    ];
}
