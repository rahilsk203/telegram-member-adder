export class Headers {
    constructor() {
        this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
        
        this.LOAD = {
            "upgrade-insecure-requests": "1",
            "user-agent": this.userAgent,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-site": "none",
            "sec-fetch-mode": "navigate",
            "sec-fetch-user": "?1",
            "sec-fetch-dest": "document",
            "accept-encoding": "gzip, deflate, br, zstd",
            "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
            "priority": "u=0, i",
        };

        this.C_REQUEST = {
            "sec-ch-ua-platform": '"Windows"',
            "next-action": "",
            "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "next-router-state-tree": "%5B%22%22%2C%7B%22children%22%3A%5B%22c%22%2C%7B%22children%22%3A%5B%5B%22slug%22%2C%22%22%2C%22oc%22%5D%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D",
            "baggage": '',
            "sentry-trace": "",
            "user-agent": this.userAgent,
            "accept": "text/x-component",
            "content-type": "text/plain;charset=UTF-8",
            "origin": "https://grok.com",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            "referer": "https://grok.com/c",
            "accept-encoding": "gzip, deflate, br, zstd",
            "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
            "priority": "u=1, i",
        };

        this.CONVERSATION = {
            "x-xai-request-id": "",
            "sec-ch-ua-platform": '"Windows"',
            "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "baggage": "",
            "sentry-trace": "",
            "traceparent": "",
            "user-agent": this.userAgent,
            "content-type": "application/json",
            "x-statsig-id": "",
            "accept": "*/*",
            "origin": "https://grok.com",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            "referer": "https://grok.com/",
            "accept-encoding": "gzip, deflate, br, zstd",
            "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
            "priority": "u=1, i",
        };
    }

    static fixOrder(headers, base) {
        // Headers are typically case-insensitive in Fetch API but we try to match key order if needed
        const ordered = {};
        for (const key of Object.keys(base)) {
            if (headers[key.toLowerCase()] !== undefined || headers[key] !== undefined) {
                ordered[key] = headers[key] || headers[key.toLowerCase()];
            }
        }
        for (const [key, value] of Object.entries(headers)) {
            if (!(key in ordered)) {
                ordered[key] = value;
            }
        }
        return ordered;
    }
}
