import { Headers } from "./headers.js";
import { Utils } from "./runtime.js";
import { Anon } from "./reverse/anon.js";
import { Parser } from "./reverse/parser.js";
import { Signature } from "./reverse/xctid.js";

export class Grok {
    constructor(model = "grok-3-auto", proxy = null) {
        this.model = model;
        this.proxy = proxy;
        this.headers = new Headers();
        
        const models = {
            "grok-3-auto": ["MODEL_MODE_AUTO", "auto"],
            "grok-3-fast": ["MODEL_MODE_FAST", "fast"],
            "grok-4": ["MODEL_MODE_EXPERT", "expert"],
            "grok-4-mini-thinking-tahoe": ["MODEL_MODE_GROK_4_MINI_THINKING", "grok-4-mini-thinking"]
        };
        
        const m = models[model] || models["grok-3-auto"];
        this.modelMode = m[0];
        this.mode = m[1];
        
        this.cRun = 0;
        this.cookies = {};
        this.sessionHeaders = {};
    }

    /**
     * Helper to update internal cookie store from Fetch Response
     */
    _updateCookies(response) {
        const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
        if (cookies.length === 0 && response.headers.get("Set-Cookie")) {
            // Fallback for environments without getSetCookie
            cookies.push(response.headers.get("Set-Cookie"));
        }

        cookies.forEach(cookie => {
            const part = cookie.split(";")[0].trim();
            const [key, ...values] = part.split("=");
            const value = values.join("=");
            if (key && value) this.cookies[key] = value;
        });
    }

    _getCookieString() {
        return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    }

    _joinUint8Arrays(arrays) {
        const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    }

    async _load(extraData = null) {
        if (!extraData) {
            const response = await fetch('https://grok.com/c', {
                headers: this.headers.LOAD
            });
            this._updateCookies(response);
            const html = await response.text();
            
            // Extract scripts
            const scriptRegex = /<script[^>]+src="([^"]+)"/g;
            let scripts = [];
            let match;
            while ((match = scriptRegex.exec(html)) !== null) {
                if (match[1].includes("/_next/static/chunks/")) {
                    scripts.push(match[1]);
                }
            }

            [this.actions, this.xsidScript] = await Parser.parseGrok(scripts);
            this.baggage = Utils.between(html, '<meta name="baggage" content="', '"');
            this.sentryTrace = Utils.between(html, '<meta name="sentry-trace" content="', '-');
            this.keys = await Anon.generateKeys();
        } else {
            this.cookies = extraData.cookies || {};
            this.actions = extraData.actions;
            this.xsidScript = extraData.xsid_script;
            this.baggage = extraData.baggage;
            this.sentryTrace = extraData.sentry_trace;
            this.anonUserId = extraData.anon_user;
            this.keys = { privateKey: extraData.privateKey };
        }
    }

    async cRequest(nextAction) {
        const trace = `${this.sentryTrace}-${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}-0`;
        let reqHeaders = {
            ...this.headers.C_REQUEST,
            'baggage': this.baggage,
            'next-action': nextAction,
            'sentry-trace': trace,
            'cookie': this._getCookieString()
        };

        if (this.cRun === 0) {
            // Multipart request for keys
            const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
            reqHeaders['content-type'] = `multipart/form-data; boundary=${boundary}`;
            
            const encoder = new TextEncoder();
            const part1 = encoder.encode([
                `--${boundary}`,
                'Content-Disposition: form-data; name="1"; filename="blob"',
                'Content-Type: application/octet-stream',
                '',
                ''
            ].join('\r\n'));
            const keyData = new Uint8Array(this.keys.userPublicKey);
            const part2 = encoder.encode([
                '',
                `--${boundary}`,
                'Content-Disposition: form-data; name="0"',
                '',
                '[{"userPublicKey":"$o1"}]',
                `--${boundary}--`,
                ''
            ].join('\r\n'));

            const body = this._joinUint8Arrays([part1, keyData, part2]);

            const response = await fetch("https://grok.com/c", {
                method: "POST",
                headers: reqHeaders,
                body: body
            });
            this._updateCookies(response);
            const text = await response.text();
            this.anonUserId = Utils.between(text, '{"anonUserId":"', '"');
        } else {
            let data;
            if (this.cRun === 1) {
                data = JSON.stringify([{ "anonUserId": this.anonUserId }]);
            } else if (this.cRun === 2) {
                data = JSON.stringify([{ "anonUserId": this.anonUserId, ...this.challengeDict }]);
            }

            const response = await fetch('https://grok.com/c', {
                method: "POST",
                headers: { ...reqHeaders, 'cookie': this._getCookieString() },
                body: data
            });
            this._updateCookies(response);
            const buffer = await response.arrayBuffer();
            const hex = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

            if (this.cRun === 1) {
                const startMarker = "3a6f38362c";
                let challengeHex = "";
                const startIdx = hex.indexOf(startMarker);
                if (startIdx !== -1) {
                    const contentStart = startIdx + startMarker.length;
                    const endIdx = hex.indexOf("313a", contentStart);
                    if (endIdx !== -1) {
                        challengeHex = hex.substring(contentStart, endIdx);
                    }
                }

                if (!challengeHex) {
                    throw new Error("Could not find challenge in response");
                }

                const challengeBytes = Uint8Array.from(challengeHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                const challengeB64 = btoa(String.fromCharCode(...challengeBytes));
                this.challengeDict = await Anon.signChallenge(challengeB64, this.keys.privateKey);
            } else if (this.cRun === 2) {
                const text = new TextDecoder().decode(buffer);
                [this.verificationToken, this.anim] = Parser.getAnim(text);
                [this.svgData, this.numbers] = await Parser.parseValues(text, this.anim, this.xsidScript);
            }
        }
        this.cRun++;
    }

    async startConvo(message, extraData = null) {
        await this._load(extraData);
        
        if (!extraData) {
            await this.cRequest(this.actions[0]);
            await this.cRequest(this.actions[1]);
            await this.cRequest(this.actions[2]);
        } else {
            this.cRun = 1;
            await this.cRequest(this.actions[1]);
            await this.cRequest(this.actions[2]);
        }

        const xsid = await Signature.generateSign(
            extraData ? `/rest/app-chat/conversations/${extraData.conversationId}/responses` : '/rest/app-chat/conversations/new',
            'POST',
            this.verificationToken,
            this.svgData,
            this.numbers
        );

        let conversationHeaders = {
            ...this.headers.CONVERSATION,
            'baggage': this.baggage,
            'sentry-trace': `${this.sentryTrace}-${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}-0`,
            'x-statsig-id': xsid,
            'x-xai-request-id': crypto.randomUUID(),
            'traceparent': `00-${Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')}-${Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('')}-00`,
            'cookie': this._getCookieString()
        };

        const payload = extraData ? {
            'message': message,
            'modelName': this.model,
            'parentResponseId': extraData.parentResponseId,
            'disableSearch': false,
            'enableImageGeneration': true,
            'imageAttachments': [],
            'returnImageBytes': false,
            'returnRawGrokInXaiRequest': false,
            'fileAttachments': [],
            'enableImageStreaming': true,
            'imageGenerationCount': 2,
            'forceConcise': false,
            'toolOverrides': {},
            'enableSideBySide': true,
            'sendFinalMetadata': true,
            'customPersonality': '',
            'isReasoning': false,
            'webpageUrls': [],
            'metadata': {
                'requestModelDetails': { 'modelId': this.model },
                'request_metadata': { 'model': this.model, 'mode': this.mode }
            },
            'disableTextFollowUps': false,
            'disableArtifact': false,
            'isFromGrokFiles': false,
            'disableMemory': false,
            'forceSideBySide': false,
            'modelMode': this.modelMode,
            'isAsyncChat': false,
            'skipCancelCurrentInflightRequests': false,
            'isRegenRequest': false,
        } : {
            'temporary': false,
            'modelName': this.model,
            'message': message,
            'fileAttachments': [],
            'imageAttachments': [],
            'disableSearch': false,
            'enableImageGeneration': true,
            'returnImageBytes': false,
            'returnRawGrokInXaiRequest': false,
            'enableImageStreaming': true,
            'imageGenerationCount': 2,
            'forceConcise': false,
            'toolOverrides': {},
            'enableSideBySide': true,
            'sendFinalMetadata': true,
            'isReasoning': false,
            'webpageUrls': [],
            'disableTextFollowUps': false,
            'responseMetadata': {
                'requestModelDetails': { 'modelId': this.model }
            },
            'disableMemory': false,
            'forceSideBySide': false,
            'modelMode': this.modelMode,
            'isAsyncChat': false,
        };

        const url = extraData ? `https://grok.com/rest/app-chat/conversations/${extraData.conversationId}/responses` : 'https://grok.com/rest/app-chat/conversations/new';
        
        const response = await fetch(url, {
            method: "POST",
            headers: conversationHeaders,
            body: JSON.stringify(payload)
        });

        return this._parseStream(response, extraData ? extraData.conversationId : null);
    }

    async * _parseStream(response, initialConversationId) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        
        let fullResponse = "";
        let conversationId = initialConversationId;
        let parentResponseId = null;
        let privateKey = this.keys.privateKey;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;

                let start = -1;
                let balance = 0;
                for (let i = 0; i < line.length; i++) {
                    if (line[i] === '{') {
                        if (balance === 0) start = i;
                        balance++;
                    } else if (line[i] === '}') {
                        balance--;
                        if (balance === 0 && start !== -1) {
                            const jsonStr = line.substring(start, i + 1);
                            try {
                                const data = JSON.parse(jsonStr);
                                const res = data.result || data || {};
                                
                                // Enhanced Token Extraction
                                const token = res.token || 
                                              (res.response && res.response.token) || 
                                              (res.modelResponse && res.modelResponse.token);
                                
                                if (token) {
                                    yield { type: "token", data: token };
                                }

                                // Enhanced Full Response Extraction
                                const modelRes = res.modelResponse || 
                                                  (res.response && res.response.modelResponse) || 
                                                  res;
                                
                                if (modelRes.message) {
                                    // Always keep the longest message as the full response candidate
                                    if (modelRes.message.length >= fullResponse.length) {
                                        fullResponse = modelRes.message;
                                    }
                                }
                                
                                if (!conversationId && res.conversation && res.conversation.conversationId) {
                                    conversationId = res.conversation.conversationId;
                                }
                                if (!parentResponseId && modelRes.responseId) {
                                    parentResponseId = modelRes.responseId;
                                }
                            } catch(e) {}
                        }
                    }
                }
            }
        }

        yield {
            type: "final",
            data: {
                "response": fullResponse,
                "extra_data": {
                    "anon_user": this.anonUserId,
                    "cookies": this.cookies,
                    "actions": this.actions,
                    "xsid_script": this.xsidScript,
                    "baggage": this.baggage,
                    "sentry_trace": this.sentryTrace,
                    "conversationId": conversationId,
                    "parentResponseId": parentResponseId,
                    "privateKey": privateKey
                }
            }
        };
    }
}
