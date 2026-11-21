/*
 * Eggy Car mod menu
 * Loaded after c2runtime.js. Talks to the running Construct 2 runtime through
 *  - global variables (rt.all_global_vars), e.g. myCoins, myScore, MAGNET_TIME, FREEZE_TIME
 *  - the Function plugin, to run the game's own functions by name (Update_Coins, Spawn_aEgg, ...)
 *  - a wrapper around rt.trigger, to stop specific game functions from firing (invincible egg,
 *    infinite power-ups)
 */
(function () {
  "use strict";
  if (window.EggyMods) return;

  var INF_TIME = 1000000;
  var rt = null;
  var ready = false;
  var FN_MATCH = null;   // Function plugin OnFunction condition
  var FN_CALL = null;    // Function plugin CallFunction action
  var originals = {};    // original power-up durations, read once at startup
  var state = { invincible: false, infMagnet: false, infFreeze: false };

  // ---------- runtime helpers ----------

  function findGlobal(name) {
    var list = rt && rt.all_global_vars;
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].name === name) return list[i];
    }
    return null;
  }

  function getVar(name) {
    var v = findGlobal(name);
    return v ? v.data : undefined;
  }

  function setVar(name, value) {
    var v = findGlobal(name);
    if (!v) return false;
    v.data = value;
    return true;
  }

  function callGameFunction(name) {
    if (!ready) return false;
    FN_CALL.call({ runtime: rt }, name, []);
    return true;
  }

  // Hook trigger so specific game functions can be swallowed while a mod is on.
  function installTriggerHook() {
    var original = rt.trigger;
    rt.trigger = function (method, inst, value) {
      if (method === FN_MATCH && typeof value === "string") {
        var name = value.toLowerCase();
        // "Collided with track" is what makes the egg break; skipping it = invincible egg
        if (state.invincible && name === "collided with track") return false;
        // Stop the power bar from finishing while an infinite power-up is on
        if ((state.infMagnet || state.infFreeze) && name === "on_powerbar_finished") return false;
      }
      return original.apply(this, arguments);
    };
  }

  function applyPowerUps() {
    if (!ready) return;
    setVar("MAGNET_TIME", state.infMagnet ? INF_TIME : originals.MAGNET_TIME);
    setVar("FREEZE_TIME", state.infFreeze ? INF_TIME : originals.FREEZE_TIME);
  }

  function setCoins(n) {
    if (!ready) return false;
    setVar("myCoins", n);
    callGameFunction("Update_Coins");
    return true;
  }

  function setScore(n) {
    if (!ready) return false;
    setVar("myScore", n);
    callGameFunction("Update_Score");
    return true;
  }

  function tryInit() {
    var r = window.cr_getC2Runtime && window.cr_getC2Runtime();
    if (!r || !r.all_global_vars || !r.running_layout) return false;
    rt = r;
    if (typeof cr === "undefined" || !cr.plugins_ || !cr.plugins_.Function) return false;
    if (!findGlobal("myCoins") || !findGlobal("MAGNET_TIME") || !findGlobal("FREEZE_TIME")) return false;

    FN_MATCH = cr.plugins_.Function.prototype.cnds.OnFunction;
    FN_CALL = cr.plugins_.Function.prototype.acts.CallFunction;
    originals.MAGNET_TIME = getVar("MAGNET_TIME");
    originals.FREEZE_TIME = getVar("FREEZE_TIME");
    installTriggerHook();
    ready = true;
    return true;
  }

  // ---------- UI ----------

  var CSS = [
    "#em-panel{position:fixed;top:12px;right:12px;width:230px;z-index:99999;",
    "font:13px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;",
    "background:rgba(20,28,40,.72);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);",
    "border:1px solid rgba(255,255,255,.22);border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.35);",
    "user-select:none;-webkit-user-select:none;touch-action:auto}",
    "#em-panel .em-head{display:flex;align-items:center;justify-content:space-between;padding:9px 10px 9px 12px;",
    "cursor:move;border-bottom:1px solid rgba(255,255,255,.15);font-weight:700;letter-spacing:.2px}",
    "#em-panel .em-min{width:24px;height:24px;border:0;border-radius:7px;background:rgba(255,255,255,.18);",
    "color:#fff;font-size:16px;line-height:22px;cursor:pointer;padding:0}",
    "#em-panel .em-body{padding:10px 12px 12px;max-height:70vh;overflow:auto}",
    "#em-panel.em-collapsed .em-body{display:none}",
    "#em-panel .em-status{font-size:11px;opacity:.7;margin-bottom:8px}",
    "#em-panel .em-sec{font-size:11px;text-transform:uppercase;letter-spacing:.8px;opacity:.6;margin:10px 0 6px}",
    "#em-panel label{display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer}",
    "#em-panel input[type=checkbox]{width:16px;height:16px;accent-color:#7fd6ff;margin:0}",
    "#em-panel .em-row{display:flex;gap:6px;margin-bottom:6px}",
    "#em-panel input[type=number]{flex:1;min-width:0;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.25);",
    "background:rgba(0,0,0,.25);color:#fff;font:inherit;outline:none}",
    "#em-panel button.em-btn{padding:6px 10px;border:0;border-radius:8px;background:rgba(127,214,255,.25);",
    "color:#fff;font:inherit;font-weight:600;cursor:pointer;white-space:nowrap}",
    "#em-panel button.em-btn:hover{background:rgba(127,214,255,.4)}",
    "#em-panel button.em-btn:disabled,#em-panel input:disabled{opacity:.4;cursor:not-allowed}"
  ].join("");

  var panel, body, statusEl, minBtn;

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function addToggle(parent, key, label) {
    var lab = el("label");
    var cb = el("input", { type: "checkbox" });
    cb.addEventListener("change", function () {
      state[key] = cb.checked;
      applyPowerUps();
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(label));
    parent.appendChild(lab);
    return cb;
  }

  function addButton(parent, label, onClick) {
    var b = el("button", { type: "button", "class": "em-btn" }, label);
    b.addEventListener("click", onClick);
    parent.appendChild(b);
    return b;
  }

  function addNumberSetter(parent, placeholder, label, onApply) {
    var row = el("div", { "class": "em-row" });
    var input = el("input", { type: "number", min: "0", step: "1", placeholder: placeholder });
    row.appendChild(input);
    addButton(row, label, function () {
      var n = Math.floor(Number(input.value));
      if (!isFinite(n) || n < 0) { flash("Enter a whole number"); return; }
      if (!onApply(n)) flash("Game not ready yet");
      else flash(placeholder.charAt(0).toUpperCase() + placeholder.slice(1) + " set to " + n);
    });
    parent.appendChild(row);
    return input;
  }

  var flashTimer = null;
  function flash(msg) {
    statusEl.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(refreshStatus, 1600);
  }

  function refreshStatus() {
    statusEl.textContent = ready ? "Connected to game" : "Waiting for game to load...";
  }

  function buildPanel() {
    var style = el("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    panel = el("div", { id: "em-panel" });
    stopInputLeak(panel);

    var head = el("div", { "class": "em-head" });
    head.appendChild(el("span", null, "Eggy Mods"));
    minBtn = el("button", { type: "button", "class": "em-min", title: "Minimize" }, "–");
    head.appendChild(minBtn);
    panel.appendChild(head);

    body = el("div", { "class": "em-body" });
    statusEl = el("div", { "class": "em-status" });
    body.appendChild(statusEl);

    body.appendChild(el("div", { "class": "em-sec" }, "Cheats"));
    var invCb = addToggle(body, "invincible", "Invincible egg");
    var magCb = addToggle(body, "infMagnet", "Infinite magnet");
    var frzCb = addToggle(body, "infFreeze", "Infinite freeze egg");

    body.appendChild(el("div", { "class": "em-sec" }, "Eggs"));
    addButton(body, "Spawn extra egg", function () {
      if (!callGameFunction("Spawn_aEgg")) flash("Game not ready yet");
      else flash("Extra egg spawned");
    });

    body.appendChild(el("div", { "class": "em-sec" }, "Set values"));
    addNumberSetter(body, "coins", "Set coins", setCoins);
    addNumberSetter(body, "score", "Set score", setScore);

    panel.appendChild(body);
    document.body.appendChild(panel);

    // Minimize / maximize
    minBtn.addEventListener("click", function () {
      var collapsed = panel.classList.toggle("em-collapsed");
      minBtn.textContent = collapsed ? "+" : "–";
      minBtn.title = collapsed ? "Maximize" : "Minimize";
    });

    // Drag by header
    makeDraggable(panel, head);

    // Keep the 'ready' state visible and keep toggles in sync
    refreshStatus();
    setInterval(function () {
      if (!ready && tryInit()) {
        applyPowerUps();
      }
      refreshStatus();
    }, 500);

    // Re-apply power-up durations periodically so they stay set
    setInterval(applyPowerUps, 500);

    return { invCb: invCb, magCb: magCb, frzCb: frzCb };
  }

  // Keep typing and clicks in the menu from reaching the game's input handlers
  function stopInputLeak(node) {
    ["keydown", "keyup", "keypress", "pointerdown", "mousedown", "touchstart", "wheel"].forEach(function (type) {
      node.addEventListener(type, function (e) { e.stopPropagation(); }, false);
    });
  }

  function makeDraggable(node, handle) {
    var dragging = false, dx = 0, dy = 0;
    handle.addEventListener("pointerdown", function (e) {
      if (e.target === minBtn) return;
      dragging = true;
      var r = node.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      node.style.right = "auto";
      node.style.left = r.left + "px";
      node.style.top = r.top + "px";
      handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var x = Math.min(Math.max(0, e.clientX - dx), window.innerWidth - 60);
      var y = Math.min(Math.max(0, e.clientY - dy), window.innerHeight - 40);
      node.style.left = x + "px";
      node.style.top = y + "px";
    });
    var stop = function () { dragging = false; };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  // ---------- start ----------

  function start() {
    var ui = buildPanel();
    // Sync checkboxes with state (in case something toggled them)
    setInterval(function () {
      ui.invCb.checked = state.invincible;
      ui.magCb.checked = state.infMagnet;
      ui.frzCb.checked = state.infFreeze;
    }, 500);
  }

  window.EggyMods = {
    state: state,
    setCoins: setCoins,
    setScore: setScore,
    spawnEgg: function () { return callGameFunction("Spawn_aEgg"); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
