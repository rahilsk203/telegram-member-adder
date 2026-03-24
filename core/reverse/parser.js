import { Utils } from "../runtime.js";

export class Parser {
    static async parseValues(html, loading = 0, scriptId = "") {
        const matches = html.match(/\[\[{"color".*?}\]\]/g);
        if (!matches) throw new Error("Could not find dynamic design values in HTML");
        
        const dValues = JSON.parse(matches[0])[loading];
        const svgData = "M 10,30 C" + dValues.map(item => (
            ` ${item.color[0]},${item.color[1]} ${item.color[2]},${item.color[3]} ${item.color[4]},${item.color[5]}` +
            ` h ${item.deg}` +
            ` s ${item.bezier[0]},${item.bezier[1]} ${item.bezier[2]},${item.bezier[3]}`
        )).join(" C");

        if (scriptId) {
            let scriptLink;
            if (scriptId === "ondemand.s") {
                scriptLink = 'https://abs.twimg.com/responsive-web/client-web/ondemand.s.' + Utils.between(html, `"${scriptId}":"`, '"') + 'a.js';
            } else {
                scriptLink = `https://grok.com/_next/${scriptId}`;
            }

            // In CF Workers, we don't have file cache, but we could use KV. For now we fetch every time or use a global map for this execution.
            const response = await fetch(scriptLink, { headers: { "User-Agent": "Mozilla/5.0" } });
            const scriptContent = await response.text();
            const numbers = Array.from(scriptContent.matchAll(/x\[(\d+)\]\s*,\s*16/g)).map(m => parseInt(m[1]));

            return [svgData, numbers];
        }

        return svgData;
    }

    static getAnim(html, verification = "grok-site-verification") {
        const verificationToken = Utils.between(html, `"name":"${verification}","content":"`, '"');
        if (!verificationToken) return ["", 0];
        
        const decoded = Uint8Array.from(atob(verificationToken), c => c.charCodeAt(0));
        const anim = decoded[5] % 4;
        return [verificationToken, anim];
    }

    static async parseGrok(scripts) {
        let scriptContent1 = "";
        let scriptContent2 = "";
        
        for (const script of scripts) {
            const url = script.startsWith("http") ? script : `https://grok.com${script}`;
            const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
            const content = await response.text();
            
            if (content.includes("anonPrivateKey")) {
                scriptContent1 = content;
            } 
            if (content.includes("(880932)")) {
                scriptContent2 = content;
            }
            
            if (scriptContent1 && scriptContent2) break;
        }

        const actions = Array.from(scriptContent1.matchAll(/createServerReference\)\("([a-f0-9]+)"/g)).map(m => m[1]);
        const xsidMatch = scriptContent2.match(/"(static\/chunks\/[^"]+\.js)"[^}]*?\(880932\)/);
        const xsidScript = xsidMatch ? xsidMatch[1] : "";

        return [actions, xsidScript];
    }
}
