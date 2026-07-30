#!/usr/bin/env node
/* upperdeckripmaster3030 — fbx2glb: pull usable geometry out of an FBX, with no dependencies.
 *
 * Mixamo and every mainstream DCC export FBX. The game reads GLB (js/ronin-glb.js) and OBJ
 * (js/ronin-obj.js). This closes that gap the same way those two do — by parsing the container
 * itself rather than pulling in a library.
 *
 *   node scripts/fbx2glb.mjs character.fbx models/ronin.glb     # → GLB for Ronin3D.registerModel
 *   node scripts/fbx2glb.mjs character.fbx models/ronin.obj     # → OBJ for scripts/bake-fighter.mjs
 *   node scripts/fbx2glb.mjs character.fbx --list               # just say what's inside
 *
 * ── What crosses over, and what deliberately does not ────────────────────────────────────
 * ACROSS: mesh geometry (positions + normals), the per-object NAMES the rigid-part rig matches
 * joints on, the full FBX transform chain (translation, the rotation/scaling pivot and offset
 * pairs, pre- and post-rotation, per-node rotation order, and the geometric transform) baked
 * into world space, and a Z-up → Y-up correction when the file declares Z-up.
 *
 * NOT ACROSS: skin weights, bones, animation, materials, UVs. That is a decision, not a
 * shortcut. The fighter pipeline builds its OWN 11-bone skeleton and weights it automatically
 * (scripts/bake-fighter.mjs --skin), and every pose in the game comes from ronin.js's IK — a
 * Mixamo rig and Mixamo animation clips would fight it, not help it. So download from Mixamo
 * in **T-pose with no animation**: the mesh is the part worth having.
 *
 * ── Format notes worth keeping ───────────────────────────────────────────────────────────
 * Binary FBX is a tree of length-prefixed node records. Every record declares its own end
 * offset, so the parser seeks to that offset rather than trusting its own cursor — a property
 * type we mis-size then corrupts one node instead of the whole file. Records use uint32 header
 * words below FBX version 7500 and uint64 from 7500 up; the sibling-list terminator is a
 * zeroed record, 13 bytes in the uint32 layout and 25 in the uint64 one.
 *
 * Array properties are zlib-DEFLATEd when their encoding word is 1. Node.js hands back a
 * Buffer that is a view into a larger pool at an arbitrary byte offset, which a Float64Array
 * view cannot straddle — so array payloads are copied into a fresh ArrayBuffer before being
 * read. Skipping that copy throws "start offset of Float64Array should be a multiple of 8" on
 * some files and silently reads garbage on others.
 *
 * ASCII FBX (Mixamo offers it alongside binary) is handled too, by a separate tokenizer that
 * produces the same node tree, so everything downstream is shared.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { inflateSync } from 'zlib';
import { basename, dirname, extname } from 'path';

/* ══ binary FBX ══════════════════════════════════════════════════════════════════════════ */

class Reader {
  constructor(buf) { this.b = buf; this.p = 0; }
  u8() { return this.b.readUInt8(this.p++); }
  i16() { const v = this.b.readInt16LE(this.p); this.p += 2; return v; }
  i32() { const v = this.b.readInt32LE(this.p); this.p += 4; return v; }
  u32() { const v = this.b.readUInt32LE(this.p); this.p += 4; return v; }
  i64() { const v = this.b.readBigInt64LE(this.p); this.p += 8; return Number(v); }
  u64() { const v = this.b.readBigUInt64LE(this.p); this.p += 8; return Number(v); }
  f32() { const v = this.b.readFloatLE(this.p); this.p += 4; return v; }
  f64() { const v = this.b.readDoubleLE(this.p); this.p += 8; return v; }
  str(n) { const s = this.b.toString('latin1', this.p, this.p + n); this.p += n; return s; }
  bytes(n) { const s = this.b.subarray(this.p, this.p + n); this.p += n; return s; }
}

const ARR_T = { f: Float32Array, d: Float64Array, l: BigInt64Array, i: Int32Array, b: Int8Array };

function readArrayProp(r, code) {
  const len = r.u32(), enc = r.u32(), clen = r.u32();
  let raw = r.bytes(clen);
  if (enc === 1) raw = inflateSync(raw);
  else if (enc !== 0) throw new Error(`unknown FBX array encoding ${enc}`);
  const Arr = ARR_T[code], need = len * Arr.BYTES_PER_ELEMENT;
  if (raw.length < need) throw new Error(`FBX array short: ${raw.length} bytes for ${len} '${code}'`);
  // copy into a fresh, correctly-aligned buffer — see the header note
  const ab = new ArrayBuffer(need);
  Buffer.from(ab).set(raw.subarray(0, need));
  const view = new Arr(ab);
  return code === 'l' ? Array.from(view, Number) : view;
}

function readProp(r) {
  const code = String.fromCharCode(r.u8());
  switch (code) {
    case 'Y': return r.i16();
    case 'C': return r.u8() !== 0;
    case 'I': return r.i32();
    case 'F': return r.f32();
    case 'D': return r.f64();
    case 'L': return r.i64();
    case 'S': { const n = r.u32(); return r.bytes(n).toString('latin1'); }
    case 'R': { const n = r.u32(); return r.bytes(n); }
    case 'f': case 'd': case 'l': case 'i': case 'b': return readArrayProp(r, code);
    default: throw new Error(`unknown FBX property type '${code}' (0x${code.charCodeAt(0).toString(16)}) at ${r.p - 1}`);
  }
}

function readNode(r, wide) {
  const end = wide ? r.u64() : r.u32();
  const nProps = wide ? r.u64() : r.u32();
  const propLen = wide ? r.u64() : r.u32();
  const nameLen = r.u8();
  if (end === 0) return null;                          // zeroed record = end of this sibling list
  const name = r.str(nameLen);
  const propEnd = r.p + propLen;
  const props = [];
  for (let i = 0; i < nProps; i++) props.push(readProp(r));
  r.p = propEnd;                                        // the declared length wins over our cursor
  const children = [];
  while (r.p < end) { const c = readNode(r, wide); if (!c) break; children.push(c); }
  r.p = end;
  return { name, props, children };
}

function parseBinary(buf) {
  const version = buf.readUInt32LE(23);
  const wide = version >= 7500;
  const r = new Reader(buf); r.p = 27;
  const root = { name: '', props: [], children: [] };
  const stop = buf.length - (wide ? 25 : 13);
  while (r.p < stop) { const n = readNode(r, wide); if (!n) break; root.children.push(n); }
  return { version, root, ascii: false };
}

/* ══ ASCII FBX ═══════════════════════════════════════════════════════════════════════════ */

function parseAscii(text) {
  let i = 0; const n = text.length;
  const isSpace = c => c === ' ' || c === '\t' || c === '\r' || c === '\n';
  function skipTrivia() {                               // whitespace and ; comments, newlines included
    for (;;) {
      while (i < n && isSpace(text[i])) i++;
      if (text[i] === ';') { while (i < n && text[i] !== '\n') i++; continue; }
      break;
    }
  }
  /* Property lists end at a newline — unless the line ended on a comma, which is how the
   * writer wraps a long `a:` array across hundreds of lines. Tracking that one flag is the
   * whole difference between reading a 90k-vertex mesh and reading its first eight numbers. */
  function readProps() {
    const out = []; let more = false;
    for (;;) {
      while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\r')) i++;
      if (i >= n) break;
      const c = text[i];
      if (c === '\n') { if (!more) break; i++; continue; }
      if (c === '{' || c === '}') break;
      if (c === ',') { i++; more = true; continue; }
      if (c === ';') { while (i < n && text[i] !== '\n') i++; continue; }
      more = false;
      if (c === '"') { i++; const s = i; while (i < n && text[i] !== '"') i++; out.push(text.slice(s, i)); i++; continue; }
      if (c === '*') { i++; const s = i; while (i < n && text[i] >= '0' && text[i] <= '9') i++; out.push({ count: +text.slice(s, i) }); continue; }
      const s = i;
      while (i < n && !isSpace(text[i]) && text[i] !== ',' && text[i] !== '{' && text[i] !== '}') i++;
      const tok = text.slice(s, i);
      if (!tok.length) { i++; continue; }
      const num = Number(tok);
      out.push(Number.isNaN(num) ? tok : num);
    }
    return out;
  }
  function readList(depth) {
    const out = [];
    for (;;) {
      skipTrivia();
      if (i >= n) break;
      if (text[i] === '}') { if (depth > 0) { i++; } else i++; break; }
      const s = i;
      while (i < n && text[i] !== ':' && !isSpace(text[i]) && text[i] !== '{') i++;
      const name = text.slice(s, i);
      if (!name.length) { i++; continue; }
      while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
      if (text[i] === ':') i++;
      const props = readProps();
      let children = [];
      while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\r' || text[i] === '\n')) {
        if (text[i] === '\n') break;                     // a `{` must sit on the same line as the name
        i++;
      }
      if (text[i] === '{') { i++; children = readList(depth + 1); }
      const node = { name, props, children };
      // `Vertices: *90 { a: 1,2,3… }` — fold the `a` child up so callers see one array property
      if (children.length === 1 && children[0].name === 'a') {
        node.props = [Float64Array.from(children[0].props.filter(v => typeof v === 'number'))];
        node.children = [];
      } else if (props.length === 1 && props[0] && props[0].count != null && !children.length) {
        node.props = [new Float64Array(0)];
      }
      if (node.props.length && node.props[0] && node.props[0].count != null) node.props.shift();
      out.push(node);
    }
    return out;
  }
  const root = { name: '', props: [], children: readList(0) };
  const m = /FBXVersion:\s*(\d+)/.exec(text);
  return { version: m ? +m[1] : 0, root, ascii: true };
}

export function parseFBX(buf) {
  if (buf.toString('latin1', 0, 20) === 'Kaydara FBX Binary  ') return parseBinary(buf);
  const head = buf.toString('latin1', 0, Math.min(buf.length, 4096));
  if (/FBXHeaderExtension|FBXVersion/.test(head)) return parseAscii(buf.toString('latin1'));
  throw new Error('not an FBX file (no binary magic, no ASCII FBX header)');
}

/* ══ tree helpers ════════════════════════════════════════════════════════════════════════ */

const kids = (nd, name) => nd ? nd.children.filter(c => c.name === name) : [];
const kid = (nd, name) => nd ? nd.children.find(c => c.name === name) : null;
const num = v => (typeof v === 'number' ? v : 0);

// object names are "Name\0\x01Class" in binary and "Class::Name" in ASCII
function cleanName(s) {
  if (typeof s !== 'string') return '';
  const z = s.indexOf('\0');
  if (z >= 0) return s.slice(0, z);
  const c = s.indexOf('::');
  return c >= 0 ? s.slice(c + 2) : s;
}

/* FBX 6.x writes a vertex array as thousands of individual scalar properties; 7.x writes one
 * typed-array property. Normalise here so nothing downstream has to know which era it is in. */
function arrayOf(node) {
  if (!node || !node.props.length) return null;
  const p0 = node.props[0];
  if (typeof p0 === 'string') return null;
  if (p0 != null && typeof p0 !== 'number' && p0.length != null) return p0;     // already an array
  if (typeof p0 !== 'number') return null;
  const out = new Float64Array(node.props.length);
  for (let i = 0; i < node.props.length; i++) out[i] = num(node.props[i]);
  return out;
}
const asInt = a => (a && a.BYTES_PER_ELEMENT === 4 && a instanceof Int32Array) ? a : (a ? Int32Array.from(a) : null);

/* A property row is [name, type, subtype, flags, …values] in Properties70 and
 * [name, type, subtype, …values] in Properties60 — the flags column simply is not there.
 * Rather than branch on the version, take everything from the first numeric column on; the
 * leading columns are always strings, so this reads both layouts without having to know which. */
function propsOf(nd) {
  const out = {};
  const bag = kid(nd, 'Properties70') || kid(nd, 'Properties60');
  if (!bag) return out;
  for (const p of bag.children) {
    if (p.name !== 'P' && p.name !== 'Property') continue;
    const key = p.props[0];
    if (typeof key !== 'string') continue;
    let i = 0;
    while (i < p.props.length && typeof p.props[i] !== 'number') i++;
    out[key] = i < p.props.length ? p.props.slice(i).filter(v => typeof v === 'number') : [];
  }
  return out;
}

/* Object identity moved between eras: 7.x rows are [id, "name\0\x01Class", "SubClass"] and are
 * linked by that numeric id, while 6.x rows are ["name\0\x01Class", "SubClass"] and are linked
 * by the raw name string. Keying on props[0] verbatim works for both — the connection table
 * quotes exactly the same value. */
function objInfo(nd) {
  if (typeof nd.props[0] === 'number')
    return { key: nd.props[0], name: cleanName(nd.props[1]), type: nd.props[2] || '' };
  return { key: nd.props[0], name: cleanName(nd.props[0]), type: nd.props[1] || '' };
}

/* ══ matrices (column-major, m[col*4+row] — same convention as js/ronin-glb.js) ══════════ */

const M = {
  I: () => { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul: (a, b) => { const o = new Float64Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  T: (x, y, z) => { const m = M.I(); m[12] = x; m[13] = y; m[14] = z; return m; },
  S: (x, y, z) => { const m = M.I(); m[0] = x; m[5] = y; m[10] = z; return m; },
  Rx: a => { const m = M.I(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
  Ry: a => { const m = M.I(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
  Rz: a => { const m = M.I(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
};

M.inv = a => {                                          // full 4×4 inverse (pivots can be sheared)
  const m = a, inv = new Float64Array(16);
  inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
  inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
  inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
  inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
  inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
  inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
  inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
  inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
  inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
  inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
  inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
  inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];
  inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
  inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
  inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
  inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];
  let det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
  if (!det) return M.I();
  det = 1 / det;
  for (let i = 0; i < 16; i++) inv[i] *= det;
  return inv;
};

const D2R = Math.PI / 180;
/* FBX RotationOrder enum → the order the three axis matrices multiply in, left to right.
 * eEulerXYZ (0) means "rotate about X, then Y, then Z", which for column vectors composes as
 * Rz·Ry·Rx — the reverse of how the name reads. Getting this backwards leaves a model that
 * looks right in T-pose and is wrong the moment any node carries a compound rotation. */
const EULER_ORDER = ['ZYX', 'YZX', 'XZY', 'ZXY', 'YXZ', 'XYZ'];
function eulerM(deg, order) {
  const o = EULER_ORDER[order] || EULER_ORDER[0];
  const R = { X: M.Rx(num(deg[0]) * D2R), Y: M.Ry(num(deg[1]) * D2R), Z: M.Rz(num(deg[2]) * D2R) };
  return M.mul(M.mul(R[o[0]], R[o[1]]), R[o[2]]);
}

/* The FBX node transform, in full. Shortened versions of this are the classic source of
 * "the arm is in the right place but rotated about the wrong point" bugs, so it is spelled out:
 *   World = T · Roff · Rp · Rpre · R · Rpost⁻¹ · Rp⁻¹ · Soff · Sp · S · Sp⁻¹
 * The geometric transform is applied to the mesh only and is NOT inherited by children. */
function localMatrix(p) {
  const v3 = (k, d) => { const a = p[k]; return a && a.length >= 3 ? [num(a[0]), num(a[1]), num(a[2])] : [d, d, d]; };
  const t = v3('Lcl Translation', 0), r = v3('Lcl Rotation', 0), s = v3('Lcl Scaling', 1);
  const order = p.RotationOrder && p.RotationOrder.length ? num(p.RotationOrder[0]) : 0;
  const roff = v3('RotationOffset', 0), rp = v3('RotationPivot', 0);
  const soff = v3('ScalingOffset', 0), sp = v3('ScalingPivot', 0);
  const pre = v3('PreRotation', 0), post = v3('PostRotation', 0);
  let m = M.T(t[0], t[1], t[2]);
  m = M.mul(m, M.T(roff[0], roff[1], roff[2]));
  m = M.mul(m, M.T(rp[0], rp[1], rp[2]));
  m = M.mul(m, eulerM(pre, order));
  m = M.mul(m, eulerM(r, order));
  m = M.mul(m, M.inv(eulerM(post, order)));
  m = M.mul(m, M.T(-rp[0], -rp[1], -rp[2]));
  m = M.mul(m, M.T(soff[0], soff[1], soff[2]));
  m = M.mul(m, M.T(sp[0], sp[1], sp[2]));
  m = M.mul(m, M.S(s[0], s[1], s[2]));
  m = M.mul(m, M.T(-sp[0], -sp[1], -sp[2]));
  return m;
}
function geometricMatrix(p) {
  const v3 = (k, d) => { const a = p[k]; return a && a.length >= 3 ? [num(a[0]), num(a[1]), num(a[2])] : [d, d, d]; };
  const t = v3('GeometricTranslation', 0), r = v3('GeometricRotation', 0), s = v3('GeometricScaling', 1);
  if (!t[0] && !t[1] && !t[2] && !r[0] && !r[1] && !r[2] && s[0] === 1 && s[1] === 1 && s[2] === 1) return null;
  const order = p.RotationOrder && p.RotationOrder.length ? num(p.RotationOrder[0]) : 0;
  return M.mul(M.mul(M.T(t[0], t[1], t[2]), eulerM(r, order)), M.S(s[0], s[1], s[2]));
}

const xfP = (m, x, y, z) => [m[0]*x + m[4]*y + m[8]*z + m[12], m[1]*x + m[5]*y + m[9]*z + m[13], m[2]*x + m[6]*y + m[10]*z + m[14]];
function xfN(m, x, y, z) {                              // normals ride the inverse-transpose
  const o = [m[0]*x + m[4]*y + m[8]*z, m[1]*x + m[5]*y + m[9]*z, m[2]*x + m[6]*y + m[10]*z];
  const l = Math.hypot(o[0], o[1], o[2]) || 1;
  return [o[0] / l, o[1] / l, o[2] / l];
}
const normalMatrix = m => { const inv = M.inv(m), o = new Float64Array(16); // transpose of the inverse
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = inv[r * 4 + c];
  o[3] = o[7] = o[11] = 0; o[12] = o[13] = o[14] = 0; o[15] = 1; return o; };

/* ══ geometry extraction ═════════════════════════════════════════════════════════════════ */

// pick the layer-element value for polygon-vertex `pv` of polygon `poly`, vertex `vi`
function layerPick(map, ref, data, index, pv, vi, poly, comps) {
  let k;
  if (map === 'ByPolygonVertex') k = pv;
  else if (map === 'ByVertex' || map === 'ByVertice' || map === 'ByVertices') k = vi;
  else if (map === 'ByPolygon') k = poly;
  else k = 0;                                            // AllSame
  if (ref === 'IndexToDirect' || ref === 'Index') { if (!index || k >= index.length) return null; k = index[k]; }
  const b = k * comps;
  if (b < 0 || b + comps > data.length) return null;
  return data.subarray ? data.subarray(b, b + comps) : data.slice(b, b + comps);
}

export function extract(parsed, opts = {}) {
  const { root } = parsed;
  const objects = kid(root, 'Objects');
  if (!objects) throw new Error('FBX has no Objects section');

  // ── connections: child key → parent key (object-object links only) ──
  // keys stay verbatim — numeric ids in 7.x, raw name strings in 6.x — so one map serves both
  const parentOf = new Map();
  const conns = kid(root, 'Connections');
  if (conns) for (const c of conns.children) {
    if (c.name !== 'C' && c.name !== 'Connect') continue;
    if (c.props[0] !== 'OO') continue;                    // skip OP (property) links
    if (!parentOf.has(c.props[1])) parentOf.set(c.props[1], c.props[2]);
  }

  // ── models: key → { name, local, geom } ──
  const models = new Map();
  for (const m of kids(objects, 'Model')) {
    const info = objInfo(m), p = propsOf(m);
    models.set(info.key, { ...info, local: localMatrix(p), geom: geometricMatrix(p) });
  }
  const worldCache = new Map();
  function world(key, seen = new Set()) {
    if (worldCache.has(key)) return worldCache.get(key);
    const md = models.get(key);
    if (!md || seen.has(key)) return M.I();
    seen.add(key);
    const pk = parentOf.get(key);
    const w = (pk != null && models.has(pk)) ? M.mul(world(pk, seen), md.local) : md.local;
    worldCache.set(key, w);
    return w;
  }

  // ── axis system: bring a Z-up file into the Y-up world the renderer assumes ──
  let axisFix = null, upAxis = 1, unitScale = 1;
  const gs = kid(root, 'GlobalSettings') || kid(kid(root, 'Objects'), 'GlobalSettings');
  if (gs) {
    const p = propsOf(gs);
    if (p.UpAxis && p.UpAxis.length) upAxis = num(p.UpAxis[0]);
    if (p.UnitScaleFactor && p.UnitScaleFactor.length) unitScale = num(p.UnitScaleFactor[0]) || 1;
    const sign = p.UpAxisSign && p.UpAxisSign.length ? num(p.UpAxisSign[0]) : 1;
    if (upAxis === 2) axisFix = M.Rx(-Math.PI / 2 * (sign >= 0 ? 1 : -1));   // Z-up → Y-up
    else if (upAxis === 0) axisFix = M.Rz(Math.PI / 2 * (sign >= 0 ? 1 : -1)); // X-up → Y-up
  }

  /* ── where the mesh lives depends on the era ──
   * 7.x keeps geometry in its own `Geometry` object, connected to a `Model` that carries the
   * name and transform. 6.x has no `Geometry` object at all — the vertex arrays hang directly
   * off the `Model`, which is then both the geometry and its own owner. Collect both shapes
   * into one list so the triangulation below is written once. */
  const sources = [];
  for (const g of kids(objects, 'Geometry')) {
    const info = objInfo(g);
    if (info.type && info.type !== 'Mesh') { continue; }
    sources.push({ node: g, info, ownerKey: parentOf.get(info.key) });
  }
  for (const mn of kids(objects, 'Model')) {
    if (!kid(mn, 'Vertices')) continue;                   // 6.x: mesh data inline on the Model
    const info = objInfo(mn);
    sources.push({ node: mn, info, ownerKey: info.key });
  }

  const meshes = [];
  let skipped = 0;
  for (const src of sources) {
    const g = src.node;
    const V = arrayOf(kid(g, 'Vertices')), PI = asInt(arrayOf(kid(g, 'PolygonVertexIndex')));
    if (!V || !PI || !V.length || !PI.length) { skipped++; continue; }

    // normals layer (optional)
    let nMap = '', nRef = '', N = null, NI = null;
    const nl = kid(g, 'LayerElementNormal');
    if (nl) {
      nMap = (kid(nl, 'MappingInformationType') || {}).props?.[0] || '';
      nRef = (kid(nl, 'ReferenceInformationType') || {}).props?.[0] || '';
      N = arrayOf(kid(nl, 'Normals'));
      NI = asInt(arrayOf(kid(nl, 'NormalsIndex')));
      if (N && !N.length) N = null;
    }

    // the Model this geometry hangs off supplies the name and the world transform
    const md = src.ownerKey != null ? models.get(src.ownerKey) : null;
    let W = md ? world(md.key) : M.I();
    if (md && md.geom) W = M.mul(W, md.geom);
    if (axisFix) W = M.mul(axisFix, W);
    const NM = normalMatrix(W);
    // a mirrored transform flips winding; without this the model renders inside-out
    const det = W[0]*(W[5]*W[10] - W[6]*W[9]) - W[4]*(W[1]*W[10] - W[2]*W[9]) + W[8]*(W[1]*W[6] - W[2]*W[5]);
    const flip = det < 0;

    const pos = [], nrm = [], idx = [];
    const dedupe = new Map();
    const push = (vi, pv, poly) => {
      const p = xfP(W, V[vi*3], V[vi*3+1], V[vi*3+2]);
      let nz = null;
      if (N) { const s = layerPick(nMap, nRef, N, NI, pv, vi, poly, 3);
               if (s) nz = xfN(NM, s[0], s[1], s[2]); }
      if (!nz) nz = [0, 0, 0];                            // filled in per-face below
      const key = `${p[0]},${p[1]},${p[2]},${nz[0]},${nz[1]},${nz[2]}`;
      let k = dedupe.get(key);
      if (k === undefined) { k = pos.length / 3; dedupe.set(key, k);
        pos.push(p[0], p[1], p[2]); nrm.push(nz[0], nz[1], nz[2]); }
      return k;
    };

    let poly = 0, ring = [];
    for (let pv = 0; pv < PI.length; pv++) {
      let vi = PI[pv];
      const last = vi < 0;
      if (last) vi = ~vi;                                 // negative marks the polygon's last corner
      ring.push([vi, pv]);
      if (!last) continue;
      for (let f = 1; f + 1 < ring.length; f++) {         // fan-triangulate
        const tri = [ring[0], ring[f], ring[f + 1]];
        if (flip) tri.reverse();
        for (const [v, p] of tri) idx.push(push(v, p, poly));
      }
      ring = []; poly++;
    }
    if (ring.length >= 3) {                               // unterminated final polygon — take it anyway
      for (let f = 1; f + 1 < ring.length; f++) {
        const tri = [ring[0], ring[f], ring[f + 1]];
        if (flip) tri.reverse();
        for (const [v, p] of tri) idx.push(push(v, p, poly));
      }
    }
    if (!idx.length) { skipped++; continue; }

    const P = Float32Array.from(pos), NRM = Float32Array.from(nrm);
    if (!N) faceNormals(P, NRM, idx);                     // no normals layer → derive per face
    meshes.push({
      name: (md && md.name) || src.info.name || `part${meshes.length}`,
      pos: P, nrm: NRM, idx: Uint32Array.from(idx),
    });
  }
  if (!meshes.length) throw new Error('no mesh geometry found in FBX');
  return { meshes, skipped, upAxis, unitScale, version: parsed.version, ascii: parsed.ascii };
}

// average face normals onto shared vertices, then normalise — smooth enough for a fighter body
function faceNormals(P, N, idx) {
  N.fill(0);
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b+1] - P[a+1], uz = P[b+2] - P[a+2];
    const vx = P[c] - P[a], vy = P[c+1] - P[a+1], vz = P[c+2] - P[a+2];
    const cx = uy*vz - uz*vy, cy = uz*vx - ux*vz, cz = ux*vy - uy*vx;
    for (const o of [a, b, c]) { N[o] += cx; N[o+1] += cy; N[o+2] += cz; }
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i+1], N[i+2]);
    if (l) { N[i] /= l; N[i+1] /= l; N[i+2] /= l; } else N[i+1] = 1;
  }
}

/* ══ writers ═════════════════════════════════════════════════════════════════════════════ */

const pad4 = n => (n % 4 ? 4 - (n % 4) : 0);

export function toGLB(meshes) {
  const json = { asset: { version: '2.0', generator: 'upperdeckripmaster3030 fbx2glb' },
                 scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [] };
  const blobs = []; let off = 0;
  const addView = (buf, target) => {
    const padded = pad4(off);
    if (padded) { blobs.push(Buffer.alloc(padded)); off += padded; }
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) });
    blobs.push(buf); off += buf.length;
    return json.bufferViews.length - 1;
  };
  meshes.forEach((m, i) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < m.pos.length; v += 3) for (let c = 0; c < 3; c++) {
      const x = m.pos[v + c]; if (x < lo[c]) lo[c] = x; if (x > hi[c]) hi[c] = x; }
    const pv = addView(Buffer.from(m.pos.buffer, m.pos.byteOffset, m.pos.byteLength), 34962);
    const nv = addView(Buffer.from(m.nrm.buffer, m.nrm.byteOffset, m.nrm.byteLength), 34962);
    const iv = addView(Buffer.from(m.idx.buffer, m.idx.byteOffset, m.idx.byteLength), 34963);
    const pa = json.accessors.push({ bufferView: pv, componentType: 5126, count: m.pos.length / 3, type: 'VEC3', min: lo, max: hi }) - 1;
    const na = json.accessors.push({ bufferView: nv, componentType: 5126, count: m.nrm.length / 3, type: 'VEC3' }) - 1;
    const ia = json.accessors.push({ bufferView: iv, componentType: 5125, count: m.idx.length, type: 'SCALAR' }) - 1;
    json.meshes.push({ name: m.name, primitives: [{ attributes: { POSITION: pa, NORMAL: na }, indices: ia, mode: 4 }] });
    // world transforms are already baked into the positions, so nodes stay at identity
    json.nodes.push({ name: m.name, mesh: i });
    json.scenes[0].nodes.push(i);
  });
  const bin = Buffer.concat(blobs);
  json.buffers.push({ byteLength: bin.length });
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  if (pad4(jsonBuf.length)) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length), 0x20)]);   // spaces
  const binPad = pad4(bin.length);
  const binBuf = binPad ? Buffer.concat([bin, Buffer.alloc(binPad)]) : bin;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binBuf.length, 0); bh.writeUInt32LE(0x004E4942, 4);
  return Buffer.concat([head, jh, jsonBuf, bh, binBuf]);
}

export function toOBJ(meshes) {
  const out = ['# upperdeckripmaster3030 — converted from FBX by scripts/fbx2glb.mjs'];
  let vBase = 1, nBase = 1;
  const f = x => (Math.round(x * 1e6) / 1e6).toString();
  for (const m of meshes) {
    out.push(`o ${m.name}`);
    for (let i = 0; i < m.pos.length; i += 3) out.push(`v ${f(m.pos[i])} ${f(m.pos[i+1])} ${f(m.pos[i+2])}`);
    for (let i = 0; i < m.nrm.length; i += 3) out.push(`vn ${f(m.nrm[i])} ${f(m.nrm[i+1])} ${f(m.nrm[i+2])}`);
    for (let i = 0; i + 2 < m.idx.length; i += 3) {
      const a = m.idx[i] + vBase, b = m.idx[i+1] + vBase, c = m.idx[i+2] + vBase;
      const an = m.idx[i] + nBase, bn = m.idx[i+1] + nBase, cn = m.idx[i+2] + nBase;
      out.push(`f ${a}//${an} ${b}//${bn} ${c}//${cn}`);
    }
    vBase += m.pos.length / 3; nBase += m.nrm.length / 3;
  }
  return out.join('\n') + '\n';
}

/* ══ CLI ═════════════════════════════════════════════════════════════════════════════════ */

function main(argv) {
  const args = argv.filter(a => a !== '--list');
  const listOnly = argv.includes('--list');
  if (!args.length) {
    console.error('usage: fbx2glb.mjs <in.fbx> [out.glb|out.obj] [--list]');
    process.exit(1);
  }
  const inPath = args[0];
  const buf = readFileSync(inPath);
  const parsed = parseFBX(buf);
  const r = extract(parsed);
  const tris = r.meshes.reduce((s, m) => s + m.idx.length / 3, 0);
  const verts = r.meshes.reduce((s, m) => s + m.pos.length / 3, 0);
  console.log(`${basename(inPath)} — FBX ${r.version}${r.ascii ? ' (ASCII)' : ''} · up-axis ${'XYZ'[r.upAxis] || '?'} · unit ${r.unitScale}`);
  console.log(`${r.meshes.length} mesh part${r.meshes.length === 1 ? '' : 's'} · ${tris | 0} tris · ${verts | 0} verts${r.skipped ? ` · ${r.skipped} skipped` : ''}`);
  for (const m of r.meshes) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.pos.length; i += 3) for (let c = 0; c < 3; c++) {
      const x = m.pos[i + c]; if (x < lo[c]) lo[c] = x; if (x > hi[c]) hi[c] = x; }
    const sz = [hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]].map(v => v.toFixed(2)).join(' × ');
    console.log(`  ${m.name.padEnd(28)} ${String(m.idx.length / 3 | 0).padStart(7)} tris   ${sz}`);
  }
  if (r.meshes.length === 1) {
    console.log('\n  note: one unnamed part → the rigid-part rig has nothing to attach and it will stand');
    console.log('        rigid. Run it through: node scripts/bake-fighter.mjs <obj> <out.obj> --segment');
  }
  if (listOnly || args.length < 2) return;

  const outPath = args[1];
  mkdirSync(dirname(outPath), { recursive: true });
  const ext = extname(outPath).toLowerCase();
  if (ext === '.obj') writeFileSync(outPath, toOBJ(r.meshes));
  else writeFileSync(outPath, toGLB(r.meshes));
  const sz = readFileSync(outPath).length;
  console.log(`\nwrote ${outPath} — ${(sz / 1048576).toFixed(2)} MB`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
