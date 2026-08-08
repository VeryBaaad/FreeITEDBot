// Made by Qwen3.8-Max

const NS = 'lsposed';
const te = new TextEncoder();
const td = new TextDecoder();

export async function verify(username, signature, string) {
  try {
    if (typeof username !== 'string' || typeof signature !== 'string' || typeof string !== 'string') {
      return false;
    }
    const sig = parseSignature(signature);
    if (td.decode(sig.ns) !== NS) return false;
    const msg = te.encode(string);
    const data = await buildSignedData(sig, msg);
    const keys = await fetchGithubKeys(username);
    const want = bytesToB64(sig.pk);
    const found = keys.some((line) => {
      try {
        const b64 = String(line).trim().split(/\s+/)[1];
        return bytesToB64(b64ToBytes(b64)) === want;
      } catch {
        return false;
      }
    });
    if (!found) return false;
    return await verifySignature(sig, data);
  } catch {
    return false;
  }
}

async function fetchGithubKeys(username) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cf-worker',
  };
  const token = typeof globalThis.github_token === 'string'
    ? globalThis.github_token.trim()
    : '';
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let url = `https://api.github.com/users/${encodeURIComponent(username)}/keys`;
  const out = [];
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('github api error');
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error('bad github response');
    for (const item of json) {
      if (item?.key) out.push(item.key);
    }
    const link = res.headers.get('Link') || '';
    const m = link.match(/<([^>]+)>;\s*rel="next"/i);
    url = m ? m[1] : null;
  }
  return out;
}

function parseSignature(input) {
  const m = String(input).match(/-----BEGIN SSH SIGNATURE-----([\s\S]*?)-----END SSH SIGNATURE-----/i);
  const b = b64ToBytes(m ? m[1] : String(input));
  if (td.decode(b.subarray(0, 6)) !== 'SSHSIG') throw new Error('bad signature');
  let o = 6;
  if (u32(b, o) !== 1) throw new Error('bad version');
  o += 4;
  let pk, ns, res, hash, container;
  [pk, o] = rd(b, o);
  [ns, o] = rd(b, o);
  [res, o] = rd(b, o);
  [hash, o] = rd(b, o);
  [container, o] = rd(b, o);
  let so = 0;
  let fmt, sig;
  [fmt, so] = rt(container, so);
  [sig, so] = rd(container, so);
  return { pk, ns, res, hash, fmt, sig };
}

async function buildSignedData(sig, msg) {
  const alg = td.decode(sig.hash).toUpperCase().replace(/^SHA-/, 'SHA');
  let h = msg;
  if (alg) {
    const digestName = {
      SHA1: 'SHA-1',
      SHA256: 'SHA-256',
      SHA384: 'SHA-384',
      SHA512: 'SHA-512',
    }[alg];
    if (!digestName) throw new Error('unsupported hash');
    h = new Uint8Array(await crypto.subtle.digest(digestName, msg));
  }
  const MAGIC = new Uint8Array([0x53, 0x53, 0x48, 0x53, 0x49, 0x47]);
  return concat(
    MAGIC,
    sshstr(sig.ns),
    sshstr(sig.res),
    sshstr(sig.hash),
    sshstr(h),
  );
}

async function verifySignature(sig, data) {
  let o = 0;
  let type;
  [type, o] = rt(sig.pk, o);
  if (sig.fmt === 'ssh-ed25519' && type === 'ssh-ed25519') {
    let raw;
    [raw, o] = rd(sig.pk, o);
    if (raw.length !== 32 || sig.sig.length !== 64) return false;
    const imp = await importEd25519(raw);
    return crypto.subtle.verify(
      { name: imp.name },
      imp.key,
      sig.sig,
      data,
    );
  }

  if ((sig.fmt === 'ssh-rsa' || sig.fmt.startsWith('rsa-sha2-')) && type === 'ssh-rsa') {
    let e, n;
    [e, o] = rd(sig.pk, o);
    [n, o] = rd(sig.pk, o);
    const hash = {
      'ssh-rsa': 'SHA-1',
      'rsa-sha2-256': 'SHA-256',
      'rsa-sha2-512': 'SHA-512',
    }[sig.fmt];
    if (!hash) return false;
    const alg = {
      name: 'RSASSA-PKCS1-v1_5',
      hash,
    };
    const jwk = {
      kty: 'RSA',
      n: b64url(trimZeros(n)),
      e: b64url(trimZeros(e)),
    };
    const key = await crypto.subtle.importKey('jwk', jwk, alg, false, ['verify']);
    return crypto.subtle.verify(alg, key, sig.sig, data);
  }

  const ec = {
    'ecdsa-sha2-nistp256': ['P-256', 'SHA-256', 32],
    'ecdsa-sha2-nistp384': ['P-384', 'SHA-384', 48],
    'ecdsa-sha2-nistp521': ['P-521', 'SHA-512', 66],
  }[sig.fmt];

  if (ec && type === sig.fmt) {
    const [crv, hash, len] = ec;
    let q;
    [q, o] = rd(sig.pk, o);
    if (q.length !== 1 + 2 * len || q[0] !== 4) return false;
    const x = q.subarray(1, 1 + len);
    const y = q.subarray(1 + len, 1 + 2 * len);
    const jwk = {
      kty: 'EC',
      crv,
      x: b64url(x),
      y: b64url(y),
    };
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: crv },
      false,
      ['verify'],
    );
    let so = 0;
    let r, s;
    [r, so] = rd(sig.sig, so);
    [s, so] = rd(sig.sig, so);
    const rawSig = concat(fixMpi(r, len), fixMpi(s, len));
    return crypto.subtle.verify(
      { name: 'ECDSA', hash },
      key,
      rawSig,
      data,
    );
  }
  return false;
}

async function importEd25519(raw) {
  for (const name of ['Ed25519', 'NODE-ED25519', 'ed25519']) {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        raw,
        { name },
        false,
        ['verify'],
      );
      return { name, key };
    } catch {}
  }
  throw new Error('Ed25519 unsupported');
}

function u32(b, o) {
  return new DataView(b.buffer, b.byteOffset + o, 4).getUint32(0, false);
}

function rd(b, o) {
  const len = u32(b, o);
  const start = o + 4;
  const end = start + len;
  if (end > b.length) throw new Error('truncated');
  return [b.subarray(start, end), end];
}

function rt(b, o) {
  const [x, n] = rd(b, o);
  return [td.decode(x), n];
}

function sshstr(x) {
  const out = new Uint8Array(4 + x.length);
  new DataView(out.buffer).setUint32(0, x.length, false);
  out.set(x, 4);
  return out;
}

function concat(...xs) {
  const out = new Uint8Array(xs.reduce((s, x) => s + x.length, 0));
  let p = 0;
  for (const x of xs) {
    out.set(x, p);
    p += x.length;
  }
  return out;
}

function b64ToBytes(s) {
  s = String(s)
    .replace(/[^A-Za-z0-9+/=]/g, '')
    .replace(/=+$/, '');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function bytesToB64(a) {
  let s = '';
  for (const b of a) {
    s += String.fromCharCode(b);
  }
  return btoa(s);
}

function b64url(a) {
  return bytesToB64(a)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function trimZeros(a) {
  let i = 0;
  while (i < a.length - 1 && a[i] === 0) i++;
  return a.subarray(i);
}

function fixMpi(a, len) {
  let i = 0;
  while (i < a.length - 1 && a[i] === 0) i++;
  a = a.subarray(i);
  if (a.length > len) throw new Error('mpi too long');
  const out = new Uint8Array(len);
  out.set(a, len - a.length);
  return out;
}
