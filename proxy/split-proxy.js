const fs = require("fs");

// File proxy gốc
const inputFile = "./proxyscrape_premium.txt";

// Đọc file và tách thành mảng dòng
const proxies = fs.readFileSync(inputFile, "utf8")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

// Kích thước mỗi file
const chunkSize = 350;

for (let i = 0; i < proxies.length; i += chunkSize) {
    const chunk = proxies.slice(i, i + chunkSize);
    const fileName = `./proxy_germany_${Math.floor(i / chunkSize) + 1}.txt`;
    fs.writeFileSync(fileName, chunk.join("\n"));
    console.log(`Đã tạo file: ${fileName} (${chunk.length} proxy)`);
}
