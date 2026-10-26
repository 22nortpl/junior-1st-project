async function searchBooks() {

    const keyword = document.getElementById("keyword").value;

    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(keyword)}`;

    console.log("요청 URL:", url);

    const response = await fetch(url);

    console.log("응답 코드:", response.status);

    const data = await response.json();

    console.log(data);

    displayBooks(data.items);
}

function displayBooks(books) {

    const result =
        document.getElementById("result");

    result.innerHTML = "";

    books.forEach(book => {

        const info = book.volumeInfo;

        const title =
            info.title || "제목 없음";

        const author =
            info.authors
                ? info.authors.join(", ")
                : "저자 정보 없음";

        const thumbnail =
            info.imageLinks
                ? info.imageLinks.thumbnail
                : "";

        result.innerHTML += `
            <div class="book-card">
                <img src="${thumbnail}">
                <h3>${title}</h3>
                <p>${author}</p>
                <button>내 서재 추가</button>
            </div>
        `;
    });
}