/*
 * mod menu for eggy car
 * loaded after c2runtime.js. uses:
 *  - global variables: myCoins, myScore, acuDistance, SCORE_PER_PIXEL, MAGNET_TIME, FREEZE_TIME,
 *    MAX_VIR_SPEED, COM_BALANCE_FORCE, gameSequence, SEQ_GP
 *  - the function plugin, to run the game's own functions by name
 *  - a wrapper around rt.trigger, to stop specific game functions from firing
 *  - the hud layer's text objects, so displayed numbers update right away
 */
(function () {
  "use strict";
  if (window.EggyMods) return;

  var INF_TIME = 1000000;
  var rt = null;
  var ready = false;
  var FN_MATCH = null;   // function plugin OnFunction condition
  var FN_CALL = null;    // function plugin CallFunction action
  var caller = null;     // fake "this" for FN_CALL: needs runtime and a system type
  var originals = {};
  var lastSeq = null;
  var enterTimer = null;
  var allowEnd = false;  // lets the end run button through while invincible is on
  var extraEggs = 0;
  var speedFactor = 1;
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

  // Runs a game function by name. Errors go to the console only.
  function callGameFunction(name, params) {
    if (!ready) return false;
    try {
      FN_CALL.call(caller, name, params || []);
      return true;
    } catch (err) {
      console.error("[mod menu] " + name + " failed:", err);
      return false;
    }
  }

  // Finds text objects on the hud layer and runs fn on each one.
  function forEachHudText(fn) {
    var layout = rt && rt.running_layout;
    if (!layout || !layout.layers) return;
    for (var i = 0; i < layout.layers.length; i++) {
      var layer = layout.layers[i];
      if (layer.name !== "hud") continue;
      for (var j = 0; j < layer.instances.length; j++) {
        var inst = layer.instances[j];
        if (inst && typeof inst.text === "string") fn(inst);
      }
    }
  }

  // Swallow game functions while a mod is on, and track run-ending calls.
  function installTriggerHook() {
    var original = rt.trigger;
    rt.trigger = function (method, inst, value) {
      if (method === FN_MATCH && typeof value === "string") {
        var name = value.toLowerCase();
        if (name === "end_game") extraEggs = 0;
        if (state.invincible && !allowEnd && (
            name === "collided with track" ||
            name === "end_game" ||
            name === "egg_broken" ||
            name === "spawn_eggbroke_particles")) {
          return false;
        }
        if ((state.infMagnet || state.infFreeze) && name === "on_powerbar_finished") return false;
      }
      return original.apply(this, arguments);
    };
  }

  // Starts a power-up at once with infinite duration, using the game's own parameters.
  function startPowerUp(type) {
    setVar(type === "MAGNET" ? "MAGNET_TIME" : "FREEZE_TIME", INF_TIME);
    callGameFunction("Activate_aPowerBar", [type, INF_TIME]);
  }

  // Ends a power-up at once, restoring its duration.
  function stopPowerUp(type) {
    setVar(type === "MAGNET" ? "MAGNET_TIME" : "FREEZE_TIME", originals[type]);
    callGameFunction("On_PowerBar_Finished", [type]);
  }

  function setCoins(n) {
    if (!ready) return false;
    var oldStr = String(getVar("myCoins"));
    setVar("myCoins", n);
    callGameFunction("Update_Coins");
    forEachHudText(function (inst) {
      if (inst.text === oldStr) { inst.text = String(n); inst.text_changed = true; }
    });
    return true;
  }

  function setScore(n) {
    if (!ready) return false;
    var perPixel = getVar("SCORE_PER_PIXEL");
    setVar("myScore", n);
    if (perPixel) setVar("acuDistance", n / perPixel);
    forEachHudText(function (inst) {
      if (/^\d+\s*m$/.test(inst.text)) { inst.text = n + "m"; inst.text_changed = true; }
    });
    return true;
  }

  function setSpeed(factor) {
    speedFactor = factor;
    applySpeed();
  }

  // Runs every frame so the game can't reset the values.
  function applySpeed() {
    if (!ready || speedFactor === 1) return;
    if (originals.MAX_VIR_SPEED !== undefined) setVar("MAX_VIR_SPEED", originals.MAX_VIR_SPEED * speedFactor);
    if (originals.COM_BALANCE_FORCE !== undefined) setVar("COM_BALANCE_FORCE", originals.COM_BALANCE_FORCE * speedFactor);
  }

  function endRun() {
    if (!ready) return false;
    allowEnd = true;
    var ok = callGameFunction("End_Game");
    allowEnd = false;
    return ok;
  }

  function tryInit() {
    var r = window.cr_getC2Runtime && window.cr_getC2Runtime();
    if (!r || !r.all_global_vars || !r.running_layout) return false;
    rt = r;
    if (typeof cr === "undefined" || !cr.plugins_ || !cr.plugins_.Function) return false;
    if (!findGlobal("myCoins") || !findGlobal("MAGNET_TIME") || !findGlobal("FREEZE_TIME")) return false;

    FN_MATCH = cr.plugins_.Function.prototype.cnds.OnFunction;
    FN_CALL = cr.plugins_.Function.prototype.acts.CallFunction;
    caller = { runtime: rt, type: { name: "system", families: [] } };

    originals.MAGNET = getVar("MAGNET_TIME");
    originals.FREEZE = getVar("FREEZE_TIME");
    originals.MAX_VIR_SPEED = getVar("MAX_VIR_SPEED");
    originals.COM_BALANCE_FORCE = getVar("COM_BALANCE_FORCE");
    lastSeq = getVar("gameSequence");
    installTriggerHook();
    ready = true;
    return true;
  }

  // ---------- ui ----------

  var CSS = [
    "#em-panel{position:fixed;top:12px;right:12px;width:230px;z-index:99999;",
    "font:13px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;",
    "background:#000;border:1px solid #fff;border-radius:8px;",
    "user-select:none;-webkit-user-select:none;text-transform:lowercase}",
    "#em-panel *{text-transform:lowercase;box-shadow:none;text-shadow:none}",
    "#em-panel .em-head{display:flex;align-items:center;justify-content:space-between;padding:8px 8px 8px 12px;",
    "cursor:move;border-bottom:1px solid #fff;font-weight:700}",
    "#em-panel .em-min{width:24px;height:24px;border:1px solid #fff;border-radius:6px;background:#000;",
    "color:#fff;font-size:16px;line-height:20px;cursor:pointer;padding:0}",
    "#em-panel .em-body{padding:8px 12px 12px;max-height:75vh;overflow:auto}",
    "#em-panel.em-collapsed .em-body{display:none}",
    "#em-panel .em-sec{font-size:11px;opacity:.6;margin:10px 0 4px}",
    "#em-panel label{display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer}",
    "#em-panel input[type=checkbox]{width:15px;height:15px;accent-color:#fff;margin:0}",
    "#em-panel .em-row{display:flex;gap:6px;margin-bottom:6px;align-items:center}",
    "#em-panel input[type=number]{flex:1;min-width:0;padding:5px 7px;border-radius:6px;border:1px solid #fff;",
    "background:#000;color:#fff;font:inherit;outline:none}",
    "#em-panel input[type=range]{flex:1;accent-color:#fff}",
    "#em-panel .em-val{width:44px;text-align:right;font-size:12px}",
    "#em-panel button.em-btn{padding:5px 9px;border:1px solid #fff;border-radius:6px;background:#000;",
    "color:#fff;font:inherit;cursor:pointer;white-space:nowrap}",
    "#em-panel button.em-btn:hover{background:#fff;color:#000}",
    "#em-panel button.em-danger{width:100%;margin-top:4px}"
  ].join("");

  var panel, minBtn;

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function addToggle(parent, key, label, onChange) {
    var lab = el("label");
    var cb = el("input", { type: "checkbox" });
    cb.addEventListener("change", function () {
      if (!ready) { cb.checked = false; return; }
      state[key] = cb.checked;
      onChange(cb.checked);
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(label));
    parent.appendChild(lab);
    return cb;
  }

  function addButton(parent, label, onClick, extraClass) {
    var b = el("button", { type: "button", "class": "em-btn" + (extraClass ? " " + extraClass : "") }, label);
    b.addEventListener("click", onClick);
    parent.appendChild(b);
    return b;
  }

  function addNumberSetter(parent, name, label, onApply) {
    var row = el("div", { "class": "em-row" });
    var input = el("input", { type: "number", min: "0", step: "1", placeholder: name });
    row.appendChild(input);
    addButton(row, label, function () {
      var n = Math.floor(Number(input.value));
      if (input.value === "" || !isFinite(n) || n < 0) return;
      onApply(n);
    });
    parent.appendChild(row);
  }

  function addSpeedSlider(parent) {
    var row = el("div", { "class": "em-row" });
    var input = el("input", { type: "range", min: "50", max: "200", step: "5", value: "100" });
    var val = el("span", { "class": "em-val" }, "100%");
    input.addEventListener("input", function () {
      var pct = Number(input.value);
      val.textContent = pct + "%";
      setSpeed(pct / 100);
    });
    row.appendChild(input);
    row.appendChild(val);
    parent.appendChild(row);
  }

  // Keeps typing and clicks in the menu away from the game's input handlers
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
      if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      node.style.left = Math.min(Math.max(0, e.clientX - dx), window.innerWidth - 60) + "px";
      node.style.top = Math.min(Math.max(0, e.clientY - dy), window.innerHeight - 40) + "px";
    });
    var stop = function () { dragging = false; };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  function buildPanel() {
    var style = el("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    panel = el("div", { id: "em-panel" });
    stopInputLeak(panel);

    var head = el("div", { "class": "em-head" });
    head.appendChild(el("span", null, "mod menu"));
    minBtn = el("button", { type: "button", "class": "em-min", title: "minimize" }, "–");
    head.appendChild(minBtn);
    panel.appendChild(head);

    var body = el("div", { "class": "em-body" });

    body.appendChild(el("div", { "class": "em-sec" }, "cheats"));
    var invCb = addToggle(body, "invincible", "invincible egg", function () {});
    var magCb = addToggle(body, "infMagnet", "infinite magnet", function (on) {
      if (on) startPowerUp("MAGNET"); else stopPowerUp("MAGNET");
    });
    var frzCb = addToggle(body, "infFreeze", "infinite freeze egg", function (on) {
      if (on) startPowerUp("FREEZE"); else stopPowerUp("FREEZE");
    });

    body.appendChild(el("div", { "class": "em-sec" }, "eggs"));
    addButton(body, "spawn extra egg", function () {
      if (callGameFunction("Spawn_aEgg")) extraEggs++;
    });

    body.appendChild(el("div", { "class": "em-sec" }, "speed and accel"));
    addSpeedSlider(body);

    body.appendChild(el("div", { "class": "em-sec" }, "set values"));
    addNumberSetter(body, "coins", "set coins", setCoins);
    addNumberSetter(body, "score", "set score", setScore);

    body.appendChild(el("div", { "class": "em-sec" }, "run"));
    addButton(body, "end run", endRun, "em-danger");

    panel.appendChild(body);
    document.body.appendChild(panel);

    minBtn.addEventListener("click", function () {
      var collapsed = panel.classList.toggle("em-collapsed");
      minBtn.textContent = collapsed ? "+" : "–";
      minBtn.title = collapsed ? "maximize" : "minimize";
    });

    makeDraggable(panel, head);

    // keep speed applied every frame
    (function frame() { applySpeed(); requestAnimationFrame(frame); })();

    setInterval(function () {
      if (!ready && tryInit()) {
        if (state.infMagnet) startPowerUp("MAGNET");
        if (state.infFreeze) startPowerUp("FREEZE");
      }
      invCb.checked = state.invincible;
      magCb.checked = state.infMagnet;
      frzCb.checked = state.infFreeze;
      if (ready) checkNewRun();
    }, 500);
  }

  // A new run rebuilds the power bar and resets the extra egg count.
  function checkNewRun() {
    var seq = getVar("gameSequence");
    var gp = getVar("SEQ_GP");
    if (seq === gp && lastSeq !== gp) {
      extraEggs = 0;
      clearTimeout(enterTimer);
      enterTimer = setTimeout(function () {
        if (state.infFreeze) startPowerUp("FREEZE");
        else if (state.infMagnet) startPowerUp("MAGNET");
      }, 600);
    }
    lastSeq = seq;
  }

  // ---------- start ----------

  window.EggyMods = {
    state: state,
    setCoins: setCoins,
    setScore: setScore,
    setSpeed: setSpeed,
    endRun: endRun,
    spawnEgg: function () { return callGameFunction("Spawn_aEgg"); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildPanel);
  } else {
    buildPanel();
  }
})();
