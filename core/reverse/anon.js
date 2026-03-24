import * as secp from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';

// Register synchronous hashes for secp256k1
secp.etc.hmacSha256Sync = (key, ...msgs) => hmac(sha256, key, secp.etc.concatBytes(...msgs));
secp.etc.sha256Sync = (...msgs) => sha256(secp.etc.concatBytes(...msgs));

export class Anon {
    /**
     * @param {Uint8Array} e - 32 bytes seed
     */
    static async publicKeyCreate(e) {
        const publicKey = secp.getPublicKey(e, true); // true for compressed
        return Array.from(publicKey);
    }

    static xor(e) {
        // In Python it was: b64encode(t.encode('latin-1')).decode()
        // We can just use btoa on the binary string representation
        let t = "";
        for (let i = 0; i < e.length; i++) {
            t += String.fromCharCode(e[i]);
        }
        return btoa(t);
    }

    static async generateKeys() {
        const e = crypto.getRandomValues(new Uint8Array(32));
        const n = await Anon.publicKeyCreate(e);
        const r = Anon.xor(e);
        
        return {
            "privateKey": r,
            "userPublicKey": n
        };
    }

    static async signChallenge(challenge_data_b64, key_b64) {
        const challenge_data = Uint8Array.from(atob(challenge_data_b64), c => c.charCodeAt(0));
        const key_bytes = Uint8Array.from(atob(key_b64), c => c.charCodeAt(0));
        
        // Grok uses SHA-256 hash of challenge
        const msgHashBuffer = await crypto.subtle.digest("SHA-256", challenge_data);
        const msgHash = new Uint8Array(msgHashBuffer);

        // In noble-secp256k1 v2, sign returns a Signature object. We need raw bytes.
        const signature = await secp.sign(msgHash, key_bytes);
        const signatureBytes = signature.toCompactRawBytes();
        
        return {
            "challenge": challenge_data_b64,
            "signature": btoa(String.fromCharCode(...signatureBytes))
        };
    }
}
