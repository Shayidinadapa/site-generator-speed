// solve.js — a fast drop-in for makefun-site 1.0.0.
// Written from the makefun-site README (the spec) plus black-box probing of
// the reference's behaviour on the practice set and targeted edge cases.
// No code is copied from the reference: every line below is my own.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// ---- text helpers ----

const ESC_RE = /[&<>"']/;
function esc(s) {
  // HTML escaping: & < > " ' and nothing else. Fast path when there is
  // nothing to escape (the common case for body text).
  if (!ESC_RE.test(s)) return s;
  let out = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let rep = null;
    if (c === 38) rep = '&amp;';
    else if (c === 60) rep = '&lt;';
    else if (c === 62) rep = '&gt;';
    else if (c === 34) rep = '&quot;';
    else if (c === 39) rep = '&#39;';
    if (rep !== null) {
      out += s.slice(start, i) + rep;
      start = i + 1;
    }
  }
  return out + s.slice(start);
}

const slugCache = new Map();
function slugOf(text) {
  const hit = slugCache.get(text);
  if (hit !== undefined) return hit;
  // Fast path: an all-ASCII string needs no NFKD or combining-mark work.
  let ascii = true;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) { ascii = false; break; }
  }
  let out = '';
  let lastDash = false;
  if (ascii) {
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code >= 65 && code <= 90) code += 32;
      if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
        out += String.fromCharCode(code);
        lastDash = false;
      } else if (!lastDash) {
        out += '-';
        lastDash = true;
      }
    }
  } else {
    // NFKD, drop combining marks (\p{M}), lowercase, each run of non [a-z0-9] -> '-'.
    const nfkd = text.normalize('NFKD');
    for (let i = 0; i < nfkd.length; i++) {
      const code = nfkd.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < nfkd.length) {
        // surrogate pair (astral character): one non-alnum run.
        if (!lastDash) { out += '-'; lastDash = true; }
        i++;
        continue;
      }
      if (isCombiningMarkCode(code)) continue;
      let lower = code;
      if (code >= 65 && code <= 90) lower = code + 32;
      if ((lower >= 97 && lower <= 122) || (lower >= 48 && lower <= 57)) {
        out += String.fromCharCode(lower);
        lastDash = false;
      } else if (!lastDash) {
        out += '-';
        lastDash = true;
      }
    }
  }
  // trim leading/trailing '-'
  if (out.charCodeAt(0) === 45) out = out.slice(1);
  if (out.charCodeAt(out.length - 1) === 45) out = out.slice(0, -1);
  if (out.length > 64) {
    out = out.slice(0, 64);
    if (out.charCodeAt(63) === 45) out = out.slice(0, 63);
  }
  if (out === '') out = 'untitled';
  slugCache.set(text, out);
  return out;
}

// Combining marks (\p{M}) by BMP code unit. NFKD decomposes most accents into
// the 0x300 block, which the first range covers; the rest are rarer blocks.
function isCombiningMarkCode(code) {
  return (
    (code >= 0x300 && code <= 0x36f) ||
    (code >= 0x483 && code <= 0x489) ||
    (code >= 0x591 && code <= 0x5bd) || code === 0x5bf ||
    (code >= 0x5c1 && code <= 0x5c2) || (code >= 0x5c4 && code <= 0x5c7) ||
    (code >= 0x610 && code <= 0x61a) || (code >= 0x64b && code <= 0x65f) ||
    code === 0x670 || (code >= 0x6d6 && code <= 0x6dc) ||
    (code >= 0x6df && code <= 0x6e4) || (code >= 0x6e7 && code <= 0x6e8) ||
    (code >= 0x6ea && code <= 0x6ed) || (code >= 0x20d0 && code <= 0x20f0) ||
    (code >= 0xfe00 && code <= 0xfe0f) || (code >= 0xfe20 && code <= 0xfe2f) ||
    (code >= 0x1ab0 && code <= 0x1aff) || (code >= 0x1dc0 && code <= 0x1dff)
  );
}

function dateLong(d) {
  // '2026-11-09' -> '9 November 2026' (from the string alone).
  const y = d.slice(0, 4);
  const m = (d.charCodeAt(5) - 48) * 10 + (d.charCodeAt(6) - 48);
  const dd = (d.charCodeAt(8) - 48) * 10 + (d.charCodeAt(9) - 48);
  return dd + ' ' + MONTHS[m - 1] + ' ' + y;
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// Validate a date value: YYYY-MM-DD, a real day from 1970-01-01 to 2099-12-31.
function validDate(v) {
  if (v.length !== 10) return false;
  if (v.charCodeAt(4) !== 45 || v.charCodeAt(7) !== 45) return false;
  for (let i = 0; i < 10; i++) {
    if (i === 4 || i === 7) continue;
    const c = v.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  const y = (v.charCodeAt(0) - 48) * 1000 + (v.charCodeAt(1) - 48) * 100 + (v.charCodeAt(2) - 48) * 10 + (v.charCodeAt(3) - 48);
  const m = (v.charCodeAt(5) - 48) * 10 + (v.charCodeAt(6) - 48);
  const d = (v.charCodeAt(8) - 48) * 10 + (v.charCodeAt(9) - 48);
  if (y < 1970 || y > 2099) return false;
  if (m < 1 || m > 12) return false;
  let dim = DAYS_IN_MONTH[m - 1];
  if (m === 2 && isLeap(y)) dim = 29;
  if (d < 1 || d > dim) return false;
  return true;
}

// A template name / slug key: [a-z0-9-]+ (layout) or a slug [a-z0-9]+(-[a-z0-9]+)* <= 64.
function isTemplateName(v) {
  if (v.length === 0) return false;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45)) return false;
  }
  return true;
}
function isSlugKey(v) {
  if (v.length === 0 || v.length > 64) return false;
  // [a-z0-9]+(-[a-z0-9]+)* : no leading/trailing '-', no '--'.
  let prevDash = true; // treat start as a dash so a leading '-' fails
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c === 45) {
      if (prevDash) return false;
      prevDash = true;
    } else if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
      prevDash = false;
    } else return false;
  }
  return !prevDash;
}

// ---- front matter ----

const FM_KEYS = new Set(['title', 'summary', 'date', 'tags', 'draft', 'layout', 'slug']);

// Parse one front-matter value for a known key. Returns the value, or an
// error string (the part after 'refused <path>: ').
function fmValue(key, raw) {
  // raw has trailing spaces/tabs already dropped.
  if (key === 'title' || key === 'summary') {
    if (raw.charCodeAt(0) === 34) {
      // quoted: must end with '"'; content scanned for escapes / stray quotes.
      if (raw.length < 2 || raw.charCodeAt(raw.length - 1) !== 34) {
        return { err: 'a quoted string is not closed' };
      }
      let val = '';
      for (let i = 1; i < raw.length - 1; i++) {
        const ch = raw[i];
        if (ch === '\\') {
          const nxt = raw[i + 1];
          if (nxt === '"' || nxt === '\\') {
            val += nxt;
            i++;
          } else {
            return { err: 'a quoted string holds an escape other than \\" or \\\\' };
          }
        } else if (ch === '"') {
          return { err: 'a quoted string holds a stray quote' };
        } else {
          val += ch;
        }
      }
      return { value: val };
    }
    if (raw.charCodeAt(0) === 91) return { err: 'a bare string opens on [' };
    return { value: raw };
  }
  if (key === 'date') {
    return validDate(raw) ? { value: raw } : { err: 'not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
  }
  if (key === 'tags') {
    if (raw.charCodeAt(0) !== 91 || raw.charCodeAt(raw.length - 1) !== 93) {
      return { err: 'not a list [a, b]' };
    }
    const inner = raw.slice(1, -1).trim();
    if (inner === '') return { value: [] };
    const parts = inner.split(',');
    const tags = [];
    for (let p of parts) {
      p = p.trim();
      if (p === '' || p.indexOf('"') !== -1 || p.indexOf('[') !== -1 || p.indexOf(']') !== -1) {
        return { err: 'an empty tag, or one holding " [ or ]' };
      }
      tags.push(p);
    }
    return { value: tags };
  }
  if (key === 'draft') {
    if (raw === 'true') return { value: true };
    if (raw === 'false') return { value: false };
    return { err: 'true or false' };
  }
  if (key === 'layout') {
    return isTemplateName(raw) ? { value: raw } : { err: 'not a template name' };
  }
  if (key === 'slug') {
    return isSlugKey(raw) ? { value: raw } : { err: 'not a slug' };
  }
  return { err: 'unknown key' };
}

// Parse front matter of a source (content already CRLF-normalised).
// Returns { fm, body } or { error } where error is the refusal reason.
function parseFrontMatter(content) {
  // First line must be exactly '---'.
  if (content.length < 3 || content[0] !== '-' || content[1] !== '-' || content[2] !== '-') {
    return { error: 'no front matter' };
  }
  if (content.length === 3) return { error: 'the front matter is not closed' };
  if (content[3] !== '\n') return { error: 'no front matter' };
  const lines = content.split('\n');
  // lines[0] === '---'. Find the closing '---'.
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { close = i; break; }
  }
  if (close === -1) return { error: 'the front matter is not closed' };
  const fm = {};
  const seen = new Set();
  for (let i = 1; i < close; i++) {
    const line = lines[i];
    const n = i + 1; // line number, counted from 1 at the opening '---'
    // blank (spaces and tabs only) or comment (opens on '#') -> skip.
    let j = 0;
    while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
    if (j === line.length) continue;
    if (line[j] === '#') continue;
    // key: value — key of a-z and '_', a colon, then either the end of the
    // line or exactly one space and the value.
    let k = j;
    while (k < line.length && ((line.charCodeAt(k) >= 97 && line.charCodeAt(k) <= 122) || line.charCodeAt(k) === 95)) k++;
    if (k === j || k >= line.length || line[k] !== ':') {
      return { error: 'line ' + n + ' is not "key: value"' };
    }
    const key = line.slice(j, k);
    let raw;
    if (k + 1 >= line.length) {
      raw = '';
    } else if (line[k + 1] === ' ') {
      // drop exactly one space; trailing spaces and tabs of the value dropped.
      let vend = line.length;
      while (vend > k + 2 && (line[vend - 1] === ' ' || line[vend - 1] === '\t')) vend--;
      raw = line.slice(k + 2, vend);
    } else {
      return { error: 'line ' + n + ' is not "key: value"' };
    }
    if (!FM_KEYS.has(key)) return { error: 'unknown key "' + key + '"' };
    if (seen.has(key)) return { error: 'key "' + key + '" is given twice' };
    seen.add(key);
    if (raw === '') return { error: 'key "' + key + '" has no value' };
    const r = fmValue(key, raw);
    if (r.err) return { error: 'key "' + key + '": ' + r.err };
    fm[key] = r.value;
  }
  if (fm.title === undefined) return { error: 'no title' };
  // body = everything after the closing '---' line (and its newline, if any).
  const body = lines.slice(close + 1).join('\n');
  return { fm, body };
}

// ---- Markdown ----

const ESCAPABLE = new Set([92, 96, 42, 95, 91, 93, 40, 41, 35, 43, 45, 46, 33, 62]); // \ ` * _ [ ] ( ) # + - . ! >

function isBlank(line) {
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}
function trimST(s) {
  let a = 0, b = s.length;
  while (a < b && (s.charCodeAt(a) === 32 || s.charCodeAt(a) === 9)) a++;
  while (b > a && (s.charCodeAt(b - 1) === 32 || s.charCodeAt(b - 1) === 9)) b--;
  return s.slice(a, b);
}

// Fence open: ``` + optional language [A-Za-z0-9_+-]* + spaces/tabs only.
// Returns the language ('' if none) or null.
function fenceOpen(line) {
  if (line.charCodeAt(0) !== 96 || line.charCodeAt(1) !== 96 || line.charCodeAt(2) !== 96) return null;
  let i = 3;
  let lang = '';
  while (i < line.length) {
    const c = line.charCodeAt(i);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 43 || c === 45) {
      lang += line[i];
      i++;
    } else break;
  }
  while (i < line.length) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return null;
    i++;
  }
  return lang;
}
function fenceClose(line) {
  if (line.charCodeAt(0) !== 96 || line.charCodeAt(1) !== 96 || line.charCodeAt(2) !== 96) return false;
  for (let i = 3; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}
// Heading: 1-6 '#', at least one space/tab, then text (trimmed both ends, non-empty).
function matchHeading(line) {
  let h = 0;
  while (h < line.length && line.charCodeAt(h) === 35) h++;
  if (h === 0 || h > 6) return null;
  if (h >= line.length) return null;
  const c = line.charCodeAt(h);
  if (c !== 32 && c !== 9) return null;
  const text = trimST(line.slice(h));
  if (text === '') return null;
  return { level: h, text };
}
function isHr(line) {
  if (line === '---' || line === '***') return true;
  if (line.length < 3) return false;
  const first = line[0];
  if (first !== '-' && first !== '*') return false;
  for (let i = 0; i < 3; i++) if (line[i] !== first) return false;
  for (let i = 3; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}
// List item: '- ' / '* ' (bullet) or digits + '. ' (ordered). Text trimmed.
function matchListItem(line) {
  const c0 = line.charCodeAt(0);
  if ((c0 === 45 || c0 === 42) && line.charCodeAt(1) === 32) {
    return { ordered: false, num: 0, text: trimST(line.slice(2)) };
  }
  if (c0 >= 48 && c0 <= 57) {
    let i = 0;
    let num = 0;
    while (i < line.length) {
      const c = line.charCodeAt(i);
      if (c < 48 || c > 57) break;
      num = num * 10 + (c - 48);
      i++;
    }
    if (i > 0 && line.charCodeAt(i) === 46 && line.charCodeAt(i + 1) === 32) {
      return { ordered: true, num, text: trimST(line.slice(i + 2)) };
    }
  }
  return null;
}
// Continuation of a list item: 2+ spaces then a non-space, non-tab char.
function isContinuation(line) {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) === 32) i++;
  if (i < 2) return false;
  if (i >= line.length) return false;
  const c = line.charCodeAt(i);
  return c !== 32 && c !== 9;
}

// ---- link resolution ----

function hasScheme(t) {
  const c0 = t.charCodeAt(0);
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122))) return false;
  for (let i = 1; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c === 58) return true; // ':'
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46)) return false;
  }
  return false;
}

// Normalise a relative link target against a source directory.
// Returns the normalised path, or null if it pops above the root / is empty.
function normaliseLink(pathPart, srcDir) {
  const segs = srcDir === '' ? [] : srcDir.split('/');
  const parts = pathPart.split('/');
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') {
      if (segs.length === 0) return null;
      segs.pop();
    } else segs.push(p);
  }
  if (segs.length === 0) return null;
  return segs.join('/');
}

// Resolve one link target. ctx: { dir, pageUrls (Map src->url), staticPaths (Set),
// base, srcPath, broken (Map key->true, shared) , report (array) }.
// Returns the href to use.
function resolveLink(target, ctx) {
  if (hasScheme(target)) return target;
  const c0 = target.charCodeAt(0);
  if (c0 === 47 || c0 === 35) return target; // '/' or '#'
  let frag = null;
  let pathPart = target;
  const hash = target.indexOf('#');
  if (hash !== -1) {
    pathPart = target.slice(0, hash);
    frag = target.slice(hash + 1);
  }
  const norm = normaliseLink(pathPart, ctx.dir);
  let href = null;
  if (norm !== null) {
    const pageUrl = ctx.pageUrls.get(norm);
    if (pageUrl !== undefined) href = pageUrl;
    else if (ctx.staticPaths.has(norm)) href = ctx.base + '/' + norm;
  }
  if (href === null) {
    // broken: kept as written, reported once per source+target.
    const key = ctx.srcPath + '\n' + target;
    if (!ctx.broken.has(key)) {
      ctx.broken.set(key, true);
      ctx.report.push('broken-link ' + ctx.srcPath + ' -> ' + target);
    }
    return target;
  }
  return frag === null ? href : href + '#' + frag;
}

// Find the next '**' at or after `from`, skipping '\' + escapable pairs.
// Returns the index, or -1.
function findStrongClose(s, from) {
  const n = s.length;
  let k = from;
  while (k < n - 1) {
    const ck = s.charCodeAt(k);
    if (ck === 92 && k + 1 < n && ESCAPABLE.has(s.charCodeAt(k + 1))) { k += 2; continue; }
    if (ck === 42 && s.charCodeAt(k + 1) === 42) return k;
    k++;
  }
  return -1;
}

// ---- inline rendering ----

// Render the inline Markdown of s into out (an array of strings).
// ctx is the link-resolution context (see resolveLink).
// The plain-text scan also does the HTML escaping inline, so a run is
// scanned once instead of once here and once in esc().
function renderInline(s, ctx, out) {
  const n = s.length;
  let i = 0;
  while (i < n) {
    // Fast path: emit a run of plain characters up to the next special char.
    let j = i;
    while (j < n) {
      const c = s.charCodeAt(j);
      if (c === 92 || c === 96 || c === 42 || c === 91 || c === 38 || c === 60 || c === 62 || c === 34 || c === 39) break;
      j++;
    }
    if (j > i) {
      out.push(s.slice(i, j));
      i = j;
      if (i >= n) break;
    }
    const c = s.charCodeAt(i);
    if (c === 38) { out.push('&amp;'); i += 1; continue; }
    if (c === 60) { out.push('&lt;'); i += 1; continue; }
    if (c === 62) { out.push('&gt;'); i += 1; continue; }
    if (c === 34) { out.push('&quot;'); i += 1; continue; }
    if (c === 39) { out.push('&#39;'); i += 1; continue; }
    if (c === 92) {
      // backslash escape: the escaped char is written as-is, except '>'.
      if (i + 1 < n && ESCAPABLE.has(s.charCodeAt(i + 1))) {
        out.push(s.charCodeAt(i + 1) === 62 ? '&gt;' : s[i + 1]);
        i += 2;
      } else {
        out.push('\\');
        i += 1;
      }
      continue;
    }
    if (c === 96) {
      // code span: next backtick; none or adjacent -> literal.
      const next = s.indexOf('`', i + 1);
      if (next === -1 || next === i + 1) {
        out.push('`');
        i += 1;
      } else {
        out.push('<code>', esc(s.slice(i + 1, next)), '</code>');
        i = next + 1;
      }
      continue;
    }
    if (c === 42) {
      if (s.charCodeAt(i + 1) === 42) {
        // strong: next '**', skipping escaped characters.
        const next = findStrongClose(s, i + 2);
        if (next === -1 || next === i + 2) {
          out.push('**');
          i += 2;
        } else {
          out.push('<strong>');
          renderInline(s.slice(i + 2, next), ctx, out);
          out.push('</strong>');
          i = next + 2;
        }
      } else {
        // emphasis: next single '*', skipping '**' pairs and escaped characters.
        let k = i + 1;
        let closer = -1;
        while (k < n) {
          const ck = s.charCodeAt(k);
          if (ck === 92 && k + 1 < n && ESCAPABLE.has(s.charCodeAt(k + 1))) { k += 2; continue; }
          if (ck === 42) {
            if (s.charCodeAt(k + 1) === 42) { k += 2; continue; }
            closer = k;
            break;
          }
          k++;
        }
        if (closer === -1) {
          out.push('*');
          i += 1;
        } else {
          out.push('<em>');
          renderInline(s.slice(i + 1, closer), ctx, out);
          out.push('</em>');
          i = closer + 1;
        }
      }
      continue;
    }
    if (c === 91) {
      // link: first ']' not escaped (escape-aware scan), then '(' + target + ')'.
      let j2 = i + 1;
      let close = -1;
      while (j2 < n) {
        const cj = s.charCodeAt(j2);
        if (cj === 92 && j2 + 1 < n && ESCAPABLE.has(s.charCodeAt(j2 + 1))) { j2 += 2; continue; }
        if (cj === 93) { close = j2; break; }
        j2++;
      }
      if (close === -1 || s.charCodeAt(close + 1) !== 40) {
        out.push('[');
        i += 1;
        continue;
      }
      const rp = s.indexOf(')', close + 2);
      if (rp === -1) {
        out.push('[');
        i += 1;
        continue;
      }
      const target = s.slice(close + 2, rp);
      if (target === '' || /\s/.test(target)) {
        out.push('[');
        i += 1;
        continue;
      }
      out.push('<a href="', esc(resolveLink(target, ctx)), '">');
      renderInline(s.slice(i + 1, close), ctx, out);
      out.push('</a>');
      i = rp + 1;
      continue;
    }
    // unreachable for the fast-path chars, but keep it safe
    out.push(esc(s[i]));
    i += 1;
  }
}

// Count words in a body: runs of characters other than whitespace.
function countWords(body) {
  let count = 0;
  let inWord = false;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    const ws = c === 32 || c === 9 || c === 10 || c === 13;
    if (ws) inWord = false;
    else if (!inWord) { inWord = true; count++; }
  }
  return count;
}

// Render a page body to HTML. ctx is the link context (see resolveLink).
// Returns { html, excerpt, toc }.
function renderMarkdown(body, ctx) {
  const lines = body.split('\n');
  const out = [];
  const toc = [];
  const headingIds = new Set();
  let excerpt = '';
  let excerptDone = false;
  const n = lines.length;
  let i = 0;
  while (i < n) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    const lang = fenceOpen(line);
    if (lang !== null) {
      const bodyLines = [];
      i++;
      while (i < n && !fenceClose(lines[i])) {
        bodyLines.push(lines[i]);
        i++;
      }
      if (i < n) i++; // skip the closing line
      out.push('<pre><code');
      if (lang !== '') out.push(' class="language-', lang, '"');
      out.push('>');
      for (const bl of bodyLines) {
        out.push(esc(bl), '\n');
      }
      out.push('</code></pre>\n');
      continue;
    }
    const h = matchHeading(line);
    if (h !== null) {
      // heading id: slug of the text as written, unique in this page.
      const base = slugOf(h.text);
      let id = base;
      let k = 2;
      while (headingIds.has(id)) { id = base + '-' + k; k++; }
      headingIds.add(id);
      out.push('<h', String(h.level), ' id="', id, '">');
      if (h.level === 2 || h.level === 3) {
        const parts = [];
        renderInline(h.text, ctx, parts);
        const inner = parts.join('');
        out.push(inner);
        toc.push({ level: h.level, id, html: inner });
      } else {
        renderInline(h.text, ctx, out);
      }
      out.push('</h', String(h.level), '>\n');
      i++;
      continue;
    }
    if (isHr(line)) {
      out.push('<hr>\n');
      i++;
      continue;
    }
    if (line.charCodeAt(0) === 62) {
      // blockquote: consecutive '>' lines; drop '>' and one space, trim, drop empties.
      const qlines = [];
      while (i < n && lines[i].charCodeAt(0) === 62) {
        let t = lines[i].slice(1);
        if (t.charCodeAt(0) === 32) t = t.slice(1);
        t = trimST(t);
        if (t !== '') qlines.push(t);
        i++;
      }
      if (qlines.length === 0) {
        out.push('<blockquote>\n</blockquote>\n');
      } else {
        out.push('<blockquote>\n<p>');
        renderInline(qlines.join('\n'), ctx, out);
        out.push('</p>\n</blockquote>\n');
      }
      continue;
    }
    const lm = matchListItem(line);
    if (lm !== null) {
      const ordered = lm.ordered;
      const startNum = lm.num;
      const items = [];
      while (i < n) {
        const m = matchListItem(lines[i]);
        if (m !== null && m.ordered === ordered) {
          items.push(m.text);
          i++;
          while (i < n && isContinuation(lines[i])) {
            items[items.length - 1] += '\n' + trimST(lines[i]);
            i++;
          }
        } else break;
      }
      if (ordered) {
        out.push(startNum === 1 ? '<ol>\n' : '<ol start="' + startNum + '">\n');
      } else {
        out.push('<ul>\n');
      }
      for (const it of items) {
        out.push('<li>');
        renderInline(it, ctx, out);
        out.push('</li>\n');
      }
      out.push(ordered ? '</ol>\n' : '</ul>\n');
      continue;
    }
    // paragraph: until a blank line, a fence, a heading or a thematic break.
    const plines = [];
    while (i < n) {
      const l = lines[i];
      if (isBlank(l)) break;
      if (fenceOpen(l) !== null) break;
      if (matchHeading(l) !== null) break;
      if (isHr(l)) break;
      plines.push(trimST(l));
      i++;
    }
    out.push('<p>');
    if (!excerptDone) {
      const parts = [];
      renderInline(plines.join('\n'), ctx, parts);
      excerpt = parts.join('');
      excerptDone = true;
      out.push(excerpt);
    } else {
      renderInline(plines.join('\n'), ctx, out);
    }
    out.push('</p>\n');
  }
  return { html: out.join(''), excerpt, toc };
}

// ---- templates ----

// A path is names joined by '.', each [A-Za-z0-9_]+ starting with a letter or '_'.
// Returns the names, or null.
function parsePath(s) {
  if (s === '') return null;
  const parts = s.split('.');
  for (const p of parts) {
    if (p === '') return null;
    const c0 = p.charCodeAt(0);
    if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 95)) return null;
    for (let i = 1; i < p.length; i++) {
      const c = p.charCodeAt(i);
      if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95)) return null;
    }
  }
  return parts;
}
function isName(s) {
  if (s === '') return false;
  const c0 = s.charCodeAt(0);
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 95)) return false;
  for (let i = 1; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95)) return false;
  }
  return true;
}

// Parse one {% %} tag's trimmed content.
// Returns a tag descriptor, or { err: 'tag' } / { err: 'path', pathText }.
function parseTag(content) {
  const toks = content.split(' ');
  const first = toks[0];
  if (first === 'if') {
    if (toks.length === 2) {
      const path = parsePath(toks[1]);
      if (path) return { kind: 'if', path, neg: false };
      return { err: 'path', pathText: toks[1] };
    }
    if (toks.length === 3 && toks[1] === 'not') {
      const path = parsePath(toks[2]);
      if (path) return { kind: 'if', path, neg: true };
      return { err: 'path', pathText: toks[2] };
    }
    return { err: 'tag' };
  }
  if (first === 'else' && toks.length === 1) return { kind: 'else' };
  if (first === 'endif' && toks.length === 1) return { kind: 'endif' };
  if (first === 'for' && toks.length === 4 && toks[2] === 'in') {
    if (!isName(toks[1])) return { err: 'tag' };
    const path = parsePath(toks[3]);
    if (path) return { kind: 'for', name: toks[1], path };
    return { err: 'path', pathText: toks[3] };
  }
  if (first === 'endfor' && toks.length === 1) return { kind: 'endfor' };
  if (first === 'include' && toks.length === 2) {
    const q = toks[1];
    if (q.length >= 2 && q.charCodeAt(0) === 34 && q.charCodeAt(q.length - 1) === 34) {
      const name = q.slice(1, -1);
      if (isTemplateName(name)) return { kind: 'include', name };
    }
    return { err: 'tag' };
  }
  return { err: 'tag' };
}

// Parse a template source into a node tree. Returns { nodes } or { error }.
function parseTemplate(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const b1 = src.indexOf('{{', i);
    const b2 = src.indexOf('{%', i);
    let next = -1;
    let kind = '';
    if (b1 !== -1 && (b2 === -1 || b1 < b2)) { next = b1; kind = 'var'; }
    else if (b2 !== -1) { next = b2; kind = 'tag'; }
    if (next === -1) {
      tokens.push({ t: 'text', s: src.slice(i) });
      break;
    }
    if (next > i) tokens.push({ t: 'text', s: src.slice(i, next) });
    if (kind === 'var') {
      if (src.charCodeAt(next + 2) === 123) {
        // '{{{'
        const end = src.indexOf('}}}', next + 3);
        if (end === -1) return { error: 'a {{{ is not closed' };
        const content = trimST(src.slice(next + 3, end));
        const path = parsePath(content);
        if (!path) return { error: '"' + content + '" is not a path' };
        tokens.push({ t: 'var', path, raw: true });
        i = end + 3;
      } else {
        const end = src.indexOf('}}', next + 2);
        if (end === -1) return { error: 'a {{ is not closed' };
        const content = trimST(src.slice(next + 2, end));
        const path = parsePath(content);
        if (!path) return { error: '"' + content + '" is not a path' };
        tokens.push({ t: 'var', path, raw: false });
        i = end + 2;
      }
    } else {
      const end = src.indexOf('%}', next + 2);
      if (end === -1) return { error: 'a {% is not closed' };
      const content = trimST(src.slice(next + 2, end));
      const tag = parseTag(content);
      if (tag.err) {
        if (tag.err === 'path') return { error: '"' + tag.pathText + '" is not a path' };
        return { error: '{% ' + content + ' %} is not a tag' };
      }
      tokens.push({ t: 'tag', tag });
      i = end + 2;
    }
  }
  // Standalone-line rule: a {% %} tag alone on its line (only spaces/tabs
  // beside it) takes the whole line with it, its '\n' included. The text
  // beside the tag is the neighbouring text token; a neighbouring var/tag
  // means the line holds that construct's source, so it is not standalone.
  for (let k = 0; k < tokens.length; k++) {
    if (tokens[k].t !== 'tag') continue;
    const prev = tokens[k - 1];
    const nextT = tokens[k + 1];
    let before = 'X';
    if (prev && prev.t === 'text') {
      const li = prev.s.lastIndexOf('\n');
      before = li === -1 ? prev.s : prev.s.slice(li + 1);
    } else if (!prev) {
      before = '';
    }
    let after = 'X';
    if (nextT && nextT.t === 'text') {
      const fi = nextT.s.indexOf('\n');
      after = fi === -1 ? nextT.s : nextT.s.slice(0, fi);
    } else if (!nextT) {
      after = '';
    }
    if (/^[ \t]*$/.test(before) && /^[ \t]*$/.test(after)) {
      if (prev && prev.t === 'text') {
        const li = prev.s.lastIndexOf('\n');
        prev.s = li === -1 ? '' : prev.s.slice(0, li + 1);
      }
      if (nextT && nextT.t === 'text') {
        const fi = nextT.s.indexOf('\n');
        nextT.s = fi === -1 ? '' : nextT.s.slice(fi + 1);
      }
    }
  }
  // Build the tree.
  const root = [];
  const stack = [];
  let current = root;
  for (const tok of tokens) {
    if (tok.t === 'text') {
      if (tok.s !== '') current.push({ t: 'text', s: tok.s });
    } else if (tok.t === 'var') {
      current.push({ t: 'var', path: tok.path, raw: tok.raw });
    } else {
      const tag = tok.tag;
      if (tag.kind === 'for') {
        const node = { t: 'for', name: tag.name, path: tag.path, body: [] };
        current.push(node);
        stack.push({ node, body: node.body, kind: 'for', hasElse: false });
        current = node.body;
      } else if (tag.kind === 'if') {
        const node = { t: 'if', path: tag.path, neg: tag.neg, thenBody: [], elseBody: null };
        current.push(node);
        stack.push({ node, body: node.thenBody, kind: 'if', hasElse: false });
        current = node.thenBody;
      } else if (tag.kind === 'else') {
        const top = stack[stack.length - 1];
        if (!top || top.kind !== 'if' || top.hasElse) return { error: 'an else outside an if' };
        top.node.elseBody = [];
        top.body = top.node.elseBody;
        top.hasElse = true;
        current = top.node.elseBody;
      } else if (tag.kind === 'endif') {
        const top = stack[stack.length - 1];
        if (!top || top.kind !== 'if') return { error: 'an endif with no open if' };
        stack.pop();
        current = stack.length === 0 ? root : stack[stack.length - 1].body;
      } else if (tag.kind === 'endfor') {
        const top = stack[stack.length - 1];
        if (!top || top.kind !== 'for') return { error: 'an endfor with no open for' };
        stack.pop();
        current = stack.length === 0 ? root : stack[stack.length - 1].body;
      } else if (tag.kind === 'include') {
        current.push({ t: 'include', name: tag.name });
      }
    }
  }
  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    return { error: top.kind === 'for' ? 'a for is not closed' : 'a if is not closed' };
  }
  return { nodes: root };
}

function ownProp(v, name) {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== 'object') return undefined;
  return Object.hasOwn(v, name) ? v[name] : undefined;
}

// Resolve a path. First name: the innermost loop's 'loop' object, else the
// innermost loop variable of that name, else the page's values. Each next name
// is an own property of the value so far.
function resolvePath(path, scope, loops) {
  const first = path[0];
  let v;
  if (first === 'loop') {
    v = loops.length > 0 ? loops[loops.length - 1].loopObj : undefined;
  } else {
    let found = false;
    for (let k = loops.length - 1; k >= 0; k--) {
      if (loops[k].name === first) { v = loops[k].value; found = true; break; }
    }
    if (!found) v = ownProp(scope, first);
  }
  for (let i = 1; i < path.length; i++) {
    v = ownProp(v, path[i]);
    if (v === undefined) break;
  }
  return v;
}

function writeValue(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (Array.isArray(v)) {
    let out = '';
    for (let i = 0; i < v.length; i++) {
      if (i > 0) out += ', ';
      out += writeValue(v[i]);
    }
    return out;
  }
  return '';
}

function isTruthy(v) {
  if (v === undefined || v === null || v === false) return false;
  if (v === '') return false;
  if (v === 0) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

// Render nodes into out (an array of strings).
// scope: the page's values; loops: enclosing for bindings; depth: include depth (layout = 0).
function renderNodes(nodes, scope, loops, depth, templates, out) {
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    if (node.t === 'text') {
      out.push(node.s);
    } else if (node.t === 'var') {
      const s = writeValue(resolvePath(node.path, scope, loops));
      out.push(node.raw ? s : esc(s));
    } else if (node.t === 'for') {
      const arr = resolvePath(node.path, scope, loops);
      if (Array.isArray(arr)) {
        const len = arr.length;
        for (let idx = 0; idx < len; idx++) {
          loops.push({
            name: node.name,
            value: arr[idx],
            loopObj: { index: idx + 1, first: idx === 0, last: idx === len - 1, length: len },
          });
          renderNodes(node.body, scope, loops, depth, templates, out);
          loops.pop();
        }
      }
    } else if (node.t === 'if') {
      let truthy = isTruthy(resolvePath(node.path, scope, loops));
      if (node.neg) truthy = !truthy;
      if (truthy) renderNodes(node.thenBody, scope, loops, depth, templates, out);
      else if (node.elseBody) renderNodes(node.elseBody, scope, loops, depth, templates, out);
    } else if (node.t === 'include') {
      if (depth < 9) {
        const tpl = templates.get(node.name);
        if (tpl) renderNodes(tpl.nodes, scope, loops, depth + 1, templates, out);
      }
    }
  }
}

// ---- build pipeline ----

function dirOf(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

export function run(input) {
  const site = input.site || {};
  const title = site.title || '';
  const baseUrl = site.base_url || '';
  const base = baseUrl.replace(/\/+$/, '');
  const perPage = Math.max(1, site.per_page | 0);
  const recentCount = Math.max(0, site.recent | 0);
  const templatesIn = input.templates || {};
  const filesIn = input.files || {};

  const report = [];
  const out = {};

  // 1. Files sorted by path (code-unit order, stable).
  const files = filesIn.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // 2. Templates parsed in code-unit order of name; one that does not parse
  // is reported and left out.
  const templateNames = Object.keys(templatesIn).sort();
  const templates = new Map();
  for (const name of templateNames) {
    const parsed = parseTemplate(templatesIn[name]);
    if (parsed.error) report.push('template "' + name + '": ' + parsed.error);
    else templates.set(name, parsed);
  }

  // 3. Sources: front matter, then the build checks in order.
  const sources = [];
  const staticFiles = [];
  for (const f of files) {
    const p = f.path;
    if (p.endsWith('.md')) {
      const content = f.content.replace(/\r\n?/g, '\n');
      const r = parseFrontMatter(content);
      if (r.error) {
        report.push('refused ' + p + ': ' + r.error);
        continue;
      }
      const fm = r.fm;
      if (p.startsWith('tags/')) {
        report.push('refused ' + p + ": tags/ is the generator's own");
        continue;
      }
      if (p.startsWith('page/')) {
        report.push('refused ' + p + ": page/ is the generator's own");
        continue;
      }
      const isPost = p.startsWith('posts/');
      if (isPost && fm.date === undefined) {
        report.push('refused ' + p + ': a post needs a date');
        continue;
      }
      const layoutName = fm.layout !== undefined ? fm.layout : (isPost ? 'post' : 'page');
      if (!templates.has(layoutName)) {
        report.push('refused ' + p + ': layout "' + layoutName + '" is no template that parses');
        continue;
      }
      if (fm.draft === true) {
        report.push('draft ' + p);
        continue;
      }
      sources.push({ path: p, fm, body: r.body, isPost, layoutName });
    } else {
      staticFiles.push(f);
    }
  }

  // 4. Permalinks: a post sits in posts/, a page in its source's directory.
  // A slug is unique in its own (permalink) directory, in source order.
  // At the root, posts, tags and page are taken from the start.
  const dirSlugs = new Map();
  dirSlugs.set('', new Set(['posts', 'tags', 'page']));
  const pageUrls = new Map();
  for (const s of sources) {
    const srcDir = dirOf(s.path);
    const dir = s.isPost ? 'posts' : srcDir;
    let taken = dirSlugs.get(dir);
    if (!taken) {
      taken = new Set();
      dirSlugs.set(dir, taken);
    }
    const baseSlug = s.fm.slug !== undefined ? s.fm.slug : slugOf(s.fm.title);
    let slug = baseSlug;
    let k = 2;
    while (taken.has(slug)) {
      slug = baseSlug + '-' + k;
      k++;
    }
    taken.add(slug);
    s.slug = slug;
    s.dir = srcDir;
    s.url = base + '/' + (dir === '' ? '' : dir + '/') + slug + '/';
    s.outPath = (dir === '' ? '' : dir + '/') + slug + '/index.html';
    pageUrls.set(s.path, s.url);
  }

  // 5. Render each body to HTML (links need the page urls and static paths).
  const staticPaths = new Set();
  for (const f of staticFiles) staticPaths.add(f.path);
  const broken = new Map();
  for (const s of sources) {
    const ctx = { dir: s.dir, pageUrls, staticPaths, base, srcPath: s.path, broken, report };
    const r = renderMarkdown(s.body, ctx);
    s.content = r.html;
    s.excerpt = r.excerpt;
    s.toc = r.toc;
    const words = countWords(s.body);
    s.readingMinutes = Math.max(1, Math.ceil(words / 200));
  }

  // 6. Collections: posts newest date first, equal dates by slug.
  const posts = sources.filter((s) => s.isPost);
  posts.sort((a, b) => {
    if (a.fm.date !== b.fm.date) return a.fm.date < b.fm.date ? 1 : -1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  const newerOf = new Map();
  const olderOf = new Map();
  for (let i = 0; i < posts.length; i++) {
    newerOf.set(posts[i], i > 0 ? posts[i - 1] : null);
    olderOf.set(posts[i], i < posts.length - 1 ? posts[i + 1] : null);
  }

  // 7. Tags: only posts' tags count. Each slug once, first spelling kept,
  // walking posts in collection order. A tag's posts are in collection order.
  const tagMap = new Map();
  for (const p of posts) {
    const tagList = p.fm.tags || [];
    const seenSlugs = new Set();
    for (const name of tagList) {
      const slug = slugOf(name);
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      let t = tagMap.get(slug);
      if (!t) {
        t = { name, slug, url: base + '/tags/' + slug + '/', posts: [] };
        tagMap.set(slug, t);
      }
      t.posts.push(p);
    }
  }
  const tags = Array.from(tagMap.values());
  tags.sort((a, b) => {
    if (a.posts.length !== b.posts.length) return b.posts.length - a.posts.length;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });

  // 8. Cards and page values.
  function tagCardsOf(s) {
    const list = s.fm.tags || [];
    const cards = [];
    const seen = new Set();
    for (const name of list) {
      const slug = slugOf(name);
      if (seen.has(slug)) continue;
      seen.add(slug);
      const t = tagMap.get(slug);
      // The name is the tag's own (first) spelling where a post has that tag,
      // else this source's own spelling.
      cards.push({ name: t ? t.name : name, slug, url: t ? t.url : '' });
    }
    return cards;
  }
  function makeCard(s) {
    return {
      title: s.fm.title,
      url: s.url,
      date: s.fm.date !== undefined ? s.fm.date : '',
      date_long: s.fm.date !== undefined ? dateLong(s.fm.date) : '',
      summary: s.fm.summary !== undefined ? s.fm.summary : '',
      excerpt: s.excerpt,
      reading_minutes: s.readingMinutes,
      tags: tagCardsOf(s),
    };
  }
  function neighbourCard(p) {
    if (p === null) return null;
    return {
      title: p.fm.title,
      url: p.url,
      date: p.fm.date !== undefined ? p.fm.date : '',
      date_long: p.fm.date !== undefined ? dateLong(p.fm.date) : '',
    };
  }
  for (const s of sources) {
    // One card per source, reused by the index, tag and recent lists and by
    // the page itself (the page value is the card plus its own fields).
    const card = makeCard(s);
    s.card = card;
    s.pageVal = card;
    card.slug = s.slug;
    card.content = s.content;
    card.toc = s.toc;
    card.newer = s.isPost ? neighbourCard(newerOf.get(s)) : null;
    card.older = s.isPost ? neighbourCard(olderOf.get(s)) : null;
    card.is_post = s.isPost;
  }

  // site.base_url in templates is <base>: the base_url with trailing slashes dropped.
  const siteVal = { title, base_url: base };
  const tagsVal = tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recentVal = posts.slice(0, recentCount).map((p) => p.card);

  function renderTo(tplName, scope, outPath) {
    const tpl = templates.get(tplName);
    if (!tpl) return;
    const parts = [];
    renderNodes(tpl.nodes, scope, [], 0, templates, parts);
    out[outPath] = parts.join('');
  }

  // 9. Pages through their layout.
  for (const s of sources) {
    renderTo(s.layoutName, { site: siteVal, tags: tagsVal, recent: recentVal, page: s.pageVal }, s.outPath);
  }

  // 10. Index pages: per_page posts a page, at least one even with no posts.
  const totalPages = Math.max(1, Math.ceil(posts.length / perPage));
  if (templates.has('index')) {
    for (let pg = 1; pg <= totalPages; pg++) {
      const pagePosts = posts.slice((pg - 1) * perPage, pg * perPage);
      const pager = {
        number: pg,
        total: totalPages,
        url: pg === 1 ? base + '/' : base + '/page/' + pg + '/',
        newer_url: pg === 1 ? '' : pg === 2 ? base + '/' : base + '/page/' + (pg - 1) + '/',
        older_url: pg === totalPages ? '' : base + '/page/' + (pg + 1) + '/',
      };
      renderTo(
        'index',
        { site: siteVal, tags: tagsVal, recent: recentVal, posts: pagePosts.map((p) => p.card), pager },
        pg === 1 ? 'index.html' : 'page/' + pg + '/index.html'
      );
    }
  }

  // 11. Tag pages and the tags index.
  if (templates.has('tag')) {
    for (const t of tags) {
      renderTo(
        'tag',
        {
          site: siteVal,
          tags: tagsVal,
          recent: recentVal,
          tag: { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => p.card) },
        },
        'tags/' + t.slug + '/index.html'
      );
    }
  }
  if (templates.has('tags')) {
    renderTo('tags', { site: siteVal, tags: tagsVal, recent: recentVal }, 'tags/index.html');
  }

  // 12. Static files, unless a built page has their path.
  for (const f of staticFiles) {
    if (Object.prototype.hasOwnProperty.call(out, f.path)) {
      report.push('shadowed ' + f.path + ': a built page has its path');
    } else {
      out[f.path] = f.content;
    }
  }

  // 13. Report: lines sorted in code-unit order, then the built line.
  report.sort();
  const nPages = sources.length - posts.length;
  report.push(
    'built ' + nPages + ' pages, ' + posts.length + ' posts, ' + tags.length + ' tags and ' + staticFiles.length + ' static files'
  );
  out['build-report.txt'] = report.map((l) => l + '\n').join('');
  return out;
}
