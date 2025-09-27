(function collectInternalLinks() {
    const baseDomain = 'bavarian-outfitters.de';
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const urls = new Set();

    anchors.forEach(a => {
        const href = a.getAttribute('href').trim();
        if (!href || href.startsWith('#')) return;
        if (/^(javascript:|mailto:|tel:|data:)/i.test(href)) return;
        try {
            const abs = new URL(href, location.href).toString();
            // chỉ lấy domain đúng
            if (abs.startsWith('https://bavarian-outfitters.de')) {
                urls.add(abs);
            }
        } catch (e) {
            // ignore
        }
    });

    const list = Array.from(urls);
    console.log(`${list.length} internal links:`);
    console.table(list.slice(0, 200));
    return list;
})();
