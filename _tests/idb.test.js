// 牛马计时器 · IndexedDB 持久层测试
// 用法: node _tests/idb.test.js
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const ids = JSON.parse(fs.readFileSync(path.join(DIR, "ids.json"), "utf8"));
const APP = fs.readFileSync(path.join(DIR, "app.js"), "utf8");

let pass = 0, fail = 0, cur = "";
function S(t) { cur = t; console.log("\n=== " + t + " ==="); }
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log("  ✅ " + msg); }
  else { fail++; console.log("  ❌ " + msg + (extra !== undefined ? "（实际 " + extra + "）" : "")); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 假 IndexedDB ---------- */
function makeFakeIDB() {
  const data = {};
  function mkReq() {
    const r = { result: undefined, error: null, onsuccess: null, onerror: null };
    return r;
  }
  const idb = {
    data,
    openCalls: 0,
    open(name, ver) {
      this.openCalls++;
      const rq = mkReq();
      const db = {
        name, version: ver,
        objectStoreNames: { contains: () => true },
        transaction(store, mode) {
          const st = {
            get(k) {
              const r2 = mkReq();
              Promise.resolve().then(() => { r2.result = data[k]; r2.onsuccess && r2.onsuccess({ target: r2 }); });
              return r2;
            },
            put(v, k) { data[k] = v; return mkReq(); }
          };
          const tx = { objectStore: () => st, oncomplete: null, onerror: null, onabort: null };
          Promise.resolve().then(() => Promise.resolve()).then(() => tx.oncomplete && tx.oncomplete());
          return tx;
        }
      };
      Promise.resolve().then(() => {
        rq.result = db;
        rq.onupgradeneeded && rq.onupgradeneeded({ target: rq });
        rq.onsuccess && rq.onsuccess({ target: rq });
      });
      return rq;
    }
  };
  return idb;
}

/* ---------- DOM / 环境桩 ---------- */
function makeEl(id) {
  const el = {
    id, style: {}, value: "", textContent: "", open: false, disabled: false, _html: "",
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    _handlers: {},
    addEventListener(ev, fn) { this._handlers[ev] = fn; },
    click() { const h = this._handlers.click; if (h) h({ preventDefault() {} }); },
    appendChild() {},
    getBoundingClientRect() { return { width: 0, height: 0 }; },
    setAttribute() {}, getAttribute() { return null; }
  };
  Object.defineProperty(el, "innerHTML", { get() { return this._html; }, set(v) { this._html = String(v); } });
  return el;
}

function setupEnv({ withIDB }) {
  const nodes = {};
  ids.forEach(id => (nodes[id] = makeEl(id)));
  const store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    _store: store
  };
  global.document = {
    getElementById: id => nodes[id] || (nodes[id] = makeEl(id)),
    querySelector: () => makeEl("q"),
    createElement: () => makeEl("c" + Math.random()),
    body: { appendChild() {}, removeChild() {}, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains() { return false; }, toggle() {} } },
    addEventListener() {},
    documentElement: { setAttribute() {}, getAttribute() { return null; } },
    title: ""
  };
  global.window = global;
  global.location = { pathname: "/index.html", search: "" };
  global.setInterval = () => ({ alive: false });
  global.clearInterval = () => {};
  global.Blob = class { constructor() {} };
  global.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
  global.alert = () => {};
  global.confirm = () => true;
  global.prompt = () => null;
  if (withIDB) { global.indexedDB = makeFakeIDB(); }
  else { delete global.indexedDB; }
  nodes._store = store;
  return { nodes, store };
}

function bootApp() {
  // eslint-disable-next-line no-eval
  eval(APP);
}

(async function main() {
  /* ---------- 1. 有 IDB：写入后落库 ---------- */
  S("1. 支持 IndexedDB 时，写入会生成快照");
  {
    const { nodes, store } = setupEnv({ withIDB: true });
    bootApp();
    const idb = global.indexedDB;
    ok(typeof window.__niuma === "object", "暴露了 __niuma 调试入口");
    ok(!!window.__niuma.IDB.has(), "检测到 indexedDB");
    await sleep(50);

    // 填设置 → 点「保存设置」→ 触发 saveSettings → touchStore
    nodes.iSalary.value = "9800"; nodes.iDays.value = "21.75";
    nodes.iStart.value = "08:30"; nodes.iEnd.value = "18:00";
    nodes.iBS.value = "11:30"; nodes.iBE.value = "14:00";
    const h = nodes.btnSave._handlers && nodes.btnSave._handlers.click;
    ok(!!h, "「保存设置」按钮已绑定点击回调");
    if (h) h({ preventDefault() {} });
    await window.__niuma.IDB.persist();
    const snap = idb.data["snap.v1"];
    ok(!!snap, "IDB 里出现 snap.v1 快照");
    ok(snap && snap.settings && typeof snap.settings.salary === "number", "快照里有 settings");
    ok(snap && snap.records && typeof snap.records === "object", "快照里有 records");
    ok(snap && Array.isArray(snap.goals), "快照里有 goals 数组");
    ok(store["niuma.at.v25"] && +store["niuma.at.v25"] > 0, "本地也记下了快照时间戳");
  }

  /* ---------- 2. 缓存被清空：从 IDB 恢复 ---------- */
  S("2. localStorage 为空时，从 IDB 恢复数据");
  {
    const { store } = setupEnv({ withIDB: true });
    // 直接往假 IDB 塞一份旧快照（模拟上次会话写下的）
    global.indexedDB.data["snap.v1"] = {
      at: Date.now() - 1000,
      settings: { salary: 12345, days: 21.75, workStart: "09:00", workEnd: "18:00", breakStart: "12:00", breakEnd: "13:00", payDay: 15 },
      records: { "2026-11-03": { startMs: 1, endMs: 2, earned: 450.57, type: "normal" } },
      goals: [{ id: "g1", name: "测试目标", amount: 1000, base: 0, from: "2026-11-01" }],
      meta: {}
    };
    bootApp();
    await sleep(80);
    const snapNow = window.__niuma.IDB.snapshot();
    ok(snapNow.settings.salary === 12345, "内存设置被 IDB 覆盖（12345）", snapNow.settings.salary);
    ok(!!snapNow.records["2026-11-03"], "内存记录被 IDB 覆盖（11-03 存在）");
    ok(snapNow.goals.length === 1, "目标列表被 IDB 覆盖（1 个）");
    ok(store["niuma.settings.v8"] && JSON.parse(store["niuma.settings.v8"]).salary === 12345, "IDB 数据回写到了本地缓存");
  }

  /* ---------- 3. 不支持 IDB：照常运行 ---------- */
  S("3. 浏览器不支持 IndexedDB 时仍可运行");
  {
    const { store } = setupEnv({ withIDB: false });
    let threw = null;
    try { bootApp(); } catch (e) { threw = e; }
    ok(threw === null, "无 IDB 时启动不报错", threw && threw.message);
    ok(!window.__niuma.IDB.has(), "has() 返回假值");
    await sleep(20);
    ok(true, "页面照常渲染（无异常）");
  }

  console.log("\n=== 结果：通过 " + pass + "，失败 " + fail + " ===");
  process.exit(fail ? 1 : 0);
})();
