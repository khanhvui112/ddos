const fs = require("fs");

let links =[
    "https://bavarian-traditional.de/",
    "https://translate.google.com/",
    "https://bavarian-traditional.de/set-1-lederhose-traeger/",
    "https://bavarian-traditional.de/set-2-lederhose-traeger-hemd/",
    "https://bavarian-traditional.de/set-3-lederhose-traeger-socken/",
    "https://bavarian-traditional.de/lederhose-mieten/",
    "https://bavarian-traditional.de/set-5-dirndl-schurze/",
    "https://bavarian-traditional.de/set-6-dirndl-schuerze-bluse/",
    "https://bavarian-traditional.de/impressum/",
    "https://bavarian-traditional.de/datenschutzerklaerung/",
    "https://bavarian-traditional.de/agb/",
    "https://api.whatsapp.com/send?phone=+49%20(0)176%2099%20200%20696&text=Hello",
    "https://booqable.com/?source=Shop&campaign=Cart",
    "https://bavarian-traditional.de/",
    "https://bavarian-traditional.de/impressum/",
    "https://bavarian-traditional.de/datenschutzerklaerung/",
    "https://bavarian-traditional.de/agb/",
    "https://api.whatsapp.com/send?phone=+49%20(0)176%2099%20200%20696&text=Hello",
    "https://devowl.io/de/wordpress-real-cookie-banner/"
]
const root = "https://bavarian-outfitters.de";
const staticExt = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".js", ".css", ".ico", ".woff", ".woff2"];

// lọc bỏ domain gốc, chỉ lấy phần path
let filtered = links
    .filter(l => {
        if (!(l.startsWith(root)) || l === root || l === root + "/") return false;

        // loại bỏ nếu link có đuôi trong danh sách staticExt
        let lower = l.toLowerCase();
        return !staticExt.some(ext => lower.endsWith(ext));
    })
    .map(l => l.replace(root, ""));

filtered = [...new Set(links)];

// lưu ra JSON
fs.writeFileSync("links1.json", JSON.stringify(filtered, null, 2), "utf8");

console.log("Đã lưu", filtered.length, "path vào links.json");
