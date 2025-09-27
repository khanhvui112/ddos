// run_decoded_script_sandbox.js
// YÊU CẦU: chỉ dùng khi bạn có quyền hợp pháp kiểm thử trang.
// npm init -y && node run_decoded_script_sandbox.js

const vm = require('vm');

// Dán HTML (hoặc chỉ <script>...</script>) vào đây:
const html = `<html><title>You are being redirected...</title>
<noscript>Javascript is required. Please enable javascript before you are allowed to see this page.</noscript>

<script>var s={},u,c,U,r,i,l=0,a,e=eval,w=String.fromCharCode,sucuri_cloudproxy_js='',S='az0iMCIgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKDUwKSArICI4IiArICJkIiArICJjIiArIFN0cmluZy5mcm9tQ2hhckNvZGUoOTcpICsgU3RyaW5nLmZyb21DaGFyQ29kZSg1NSkgKyAnZScgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKDU2KSArICIwIiArIFN0cmluZy5mcm9tQ2hhckNvZGUoMTAxKSArICc4JyArICcwJyArICIwIiArICJkIiArICI1IiArICdmJyArICc3JyArICc0JyArICdhJyArICc4JyArIFN0cmluZy5mcm9tQ2hhckNvZGUoNDkpICsgJzgnICsgImIiICsgU3RyaW5nLmZyb21DaGFyQ29kZSg1MikgKyAiYyIgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKDU1KSArICJiIiArICJmIiArICJkIiArIFN0cmluZy5mcm9tQ2hhckNvZGUoNTQpICsgU3RyaW5nLmZyb21DaGFyQ29kZSgxMDIpICsgJyc7ZG9jdW1lbnQuY29va2llPSdzJysndScrJ2MnKyd1JysncicrJ2knKydfJysnYycrJ2wnKydvJysndScrJ2QnKydwJysncicrJ28nKyd4JysneScrJ18nKyd1JysndScrJ2knKydkJysnXycrJzcnKycwJysnYycrJzQnKyczJysnYicrJzgnKycwJysnOScrIj0iICsgayArICc7cGF0aD0vO21heC1hZ2U9ODY0MDAnOyBsb2NhdGlvbi5yZWxvYWQoKTs=';L=S.length;U=0;r='';var A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';for(u=0;u<64;u++){s[A.charAt(u)]=u;}for(i=0;i<L;i++){c=s[S.charAt(i)];U=(U<<6)+c;l+=6;while(l>=8){((a=(U>>>(l-=8))&0xff)||(i<(L-2)))&&(r+=w(a));}}e(r);</script></html>`;

function getCookie(html) {
    // 1. Trích xuất giá trị S='...'
    const re = /S\s*=\s*'([^']+)'/i;
    const m = html.match(re);
    if (!m) {
        console.error('Không tìm thấy chuỗi S trong HTML');
        process.exit(1);
    }
    const S = m[1];

    let decoded;
    try {
        decoded = Buffer.from(S, 'base64').toString('utf8');
    } catch (err) {
        console.error('Lỗi khi decode Base64:', err.message);
        process.exit(1);
    }


    const sandbox = {
        // document: có getter/setter cookie để bắt mọi gán document.cookie = '...'
        document: {},
        location: {
            reloaded: false,
            reload: () => {
                // chặn reload thật và chỉ ghi lại là có yêu cầu reload
                sandbox.location.reloaded = true;
                // console.warn('[sandbox] location.reload() called (blocked)');
            }
        },
        console: console,
        // Cấp một vài global cần thiết (String, etc.)
        String: String,
        // Để an toàn hơn, không cung cấp eval/file system, network, process, require...
    };

    Object.defineProperty(sandbox.document, 'cookie', {
        configurable: true,
        enumerable: true,
        get: function () {
            return this._cookie || '';
        },
        set: function (val) {
            // lưu cookie vào trường _cookie và cũng ghi vào sandbox.cookieSet
            this._cookie = (this._cookie ? (this._cookie + '; ' + val) : val);
            sandbox.cookieSet = this._cookie;
            // console.log('[sandbox] document.cookie set to ->', val);
        }
    });

// 4. Tạo context và thực thi decoded script trong VM có timeout
    const context = vm.createContext(sandbox, { name: 'sucuri-sandbox' });

    try {
        const script = new vm.Script(decoded, { filename: 'decoded.js' });
        script.runInContext(context, { timeout: 2000 }); // timeout ms
    } catch (err) {
        console.error('Lỗi khi chạy script trong sandbox:', err && err.stack ? err.stack : err);
    }

    let c = sandbox.cookieSet.split(';')[0];
    console.log(c)
}
getCookie(html)