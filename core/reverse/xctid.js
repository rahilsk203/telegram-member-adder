export class Signature {
    static _h(x, _param, c, e) {
        let f = ((x * (c - _param)) / 255.0) + _param;
        if (e) return Math.floor(f);
        let rounded = Math.round(f * 100) / 100;
        return rounded === 0 ? 0 : rounded;
    }

    static cubicBezierEased(t, x1, y1, x2, y2) {
        const bezier = (u) => {
            const omu = 1.0 - u;
            const b1 = 3.0 * omu * omu * u;
            const b2 = 3.0 * omu * u * u;
            const b3 = u * u * u;
            const x = b1 * x1 + b2 * x2 + b3;
            const y = b1 * y1 + b2 * y2 + b3;
            return [x, y];
        };

        let lo = 0.0, hi = 1.0;
        for (let i = 0; i < 80; i++) {
            let mid = 0.5 * (lo + hi);
            if (bezier(mid)[0] < t) lo = mid;
            else hi = mid;
        }
        let u = 0.5 * (lo + hi);
        return bezier(u)[1];
    }

    static xa(svg) {
        const substr = svg.substring(9);
        const parts = substr.split("C");
        const out = [];
        for (const part of parts) {
            const cleaned = part.replace(/[^\d]+/g, " ").trim();
            if (cleaned === "") {
                out.push([0]);
            } else {
                out.push(cleaned.split(/\s+/).map(Number));
            }
        }
        return out;
    }

    static tohex(num) {
        let rounded = Math.round(num * 100) / 100;
        if (rounded === 0) return "0";
        let sign = rounded < 0 ? "-" : "";
        let absval = Math.abs(rounded);
        let intpart = Math.floor(absval);
        let frac = absval - intpart;
        
        if (frac === 0) return sign + intpart.toString(16);
        
        let frac_digits = [];
        let f = frac;
        for (let i = 0; i < 20; i++) {
            f *= 16;
            let digit = Math.floor(f + 1e-12);
            frac_digits.push(digit.toString(16));
            f -= digit;
            if (Math.abs(f) < 1e-12) break;
        }
        let frac_str = frac_digits.join("").replace(/0+$/, "");
        if (frac_str === "") return sign + intpart.toString(16);
        return sign + intpart.toString(16) + "." + frac_str;
    }

    static simulateStyle(values, c) {
        const duration = 4096;
        const currentTime = Math.round(c / 10.0) * 10;
        const t = currentTime / duration;
        const cp = [];
        for (let i = 0; i < values.slice(7).length; i++) {
            cp.push(Signature._h(values[i + 7], (i % 2 === 1) ? -1 : 0, 1, false));
        }

        const easedY = Signature.cubicBezierEased(t, cp[0], cp[1], cp[2], cp[3]);
        const start = values.slice(0, 3).map(Number);
        const end = values.slice(3, 6).map(Number);
        
        const r = Math.round(start[0] + (end[0] - start[0]) * easedY);
        const g = Math.round(start[1] + (end[1] - start[1]) * easedY);
        const b = Math.round(start[2] + (end[2] - start[2]) * easedY);
        const color = `rgb(${r}, ${g}, ${b})`;

        const endAngle = Signature._h(values[6], 60, 360, true);
        const angle = endAngle * easedY;
        const rad = (angle * Math.PI) / 180.0;

        const isEffectivelyZero = (v) => Math.abs(v) < 1e-7;
        const isEffectivelyInteger = (v) => Math.abs(v - Math.round(v)) < 1e-7;

        const cosv = Math.cos(rad);
        const sinv = Math.sin(rad);

        let a, bval, cval, d;
        if (isEffectivelyZero(cosv)) { a = 0; d = 0; }
        else if (isEffectivelyInteger(cosv)) { a = Math.round(cosv); d = Math.round(cosv); }
        else { a = cosv.toFixed(6); d = cosv.toFixed(6); }

        if (isEffectivelyZero(sinv)) { bval = 0; cval = 0; }
        else if (isEffectivelyInteger(sinv)) { bval = Math.round(sinv); cval = Math.round(-sinv); }
        else { bval = sinv.toFixed(7); cval = (-sinv).toFixed(7); }

        const transform = `matrix(${a}, ${bval}, ${cval}, ${d}, 0, 0)`;
        return { color, transform };
    }

    static xs(x_bytes, svg, x_values) {
        const arr = Array.from(x_bytes);
        const idx = arr[x_values[0]] % 16;
        const c = ((arr[x_values[1]] % 16) * (arr[x_values[2]] % 16)) * (arr[x_values[3]] % 16);
        const o = Signature.xa(svg);
        const vals = o[idx];
        const k = Signature.simulateStyle(vals, c);

        const concat = String(k.color) + String(k.transform);
        const matches = concat.match(/[\d\.\-]+/g) || [];
        const converted = matches.map(m => Signature.tohex(parseFloat(m)));
        const joined = converted.join("");
        return joined.replace(/\./g, "").replace(/-/g, "");
    }

    static async generateSign(path, method, verification, svg, x_values, time_n = null, random_float = null) {
        const n = time_n || Math.floor(Date.now() / 1000 - 1682924400);
        const t = new Uint8Array(new Uint32Array([n]).buffer);
        const r_decoded = Uint8Array.from(atob(verification), c => c.charCodeAt(0));
        const o = Signature.xs(r_decoded, svg, x_values);

        const msg = [method, path, n].join("!") + "obfiowerehiring" + o;
        const msgUint8 = new TextEncoder().encode(msg);
        const digestBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
        const digest = new Uint8Array(digestBuffer).slice(0, 16);

        const prefix_byte = random_float !== null ? Math.floor(random_float * 256) : Math.floor(Math.random() * 256);
        const assembled = new Uint8Array(1 + r_decoded.length + t.length + digest.length + 1);
        assembled[0] = prefix_byte;
        assembled.set(r_decoded, 1);
        assembled.set(t, 1 + r_decoded.length);
        assembled.set(digest, 1 + r_decoded.length + t.length);
        assembled[assembled.length - 1] = 3;

        const first = assembled[0];
        for (let i = 1; i < assembled.length; i++) {
            assembled[i] = assembled[i] ^ first;
        }

        return btoa(String.fromCharCode(...assembled)).replace(/=/g, "");
    }
}
