/* ==========================================================================
   TEAM WORDLE - game logic
   Plain script (no modules) so it works when opened directly from file://
   ========================================================================== */

(function () {
  "use strict";

  var WORD_LEN     = 5;
  var MAX_ATTEMPTS = CONFIG.maxAttempts;
  var POINTS       = CONFIG.pointsPerWord;
  var LOW_CLOCK    = 30;          // seconds at which the clock turns red
  var SOLVE_PAUSE  = 1400;        // ms held after a solved word
  var MISS_PAUSE   = 2400;        // ms held after a missed word

  var KB_ROWS = [
    ["Q","W","E","R","T","Y","U","I","O","P"],
    ["A","S","D","F","G","H","J","K","L"],
    ["ENTER","Z","X","C","V","B","N","M","BACK"]
  ];

  /* ---------------------------------------------------------------- state */

  var state = null;      // null until a game starts
  var clockHandle = null;
  var lastTick = 0;
  var pendingTimeout = null;

  /* ------------------------------------------------------------- elements */

  function $(id) { return document.getElementById(id); }

  var elScreens = {
    start:    $("screen-start"),
    game:     $("screen-game"),
    turnover: $("screen-turnover"),
    result:   $("screen-result")
  };

  var elBoard     = $("board");
  var elKeyboard  = $("keyboard");
  var elClock     = $("clock");
  var elTurnLabel = $("turn-label");
  var elProgress  = $("progress");
  var elMessage   = $("message");
  var elPanelA    = $("panel-a");
  var elPanelB    = $("panel-b");
  var elVeil      = $("pause-veil");
  var elMinutes   = $("minutes-input");

  /* -------------------------------------------------------------- helpers */

  function teamConf(key) { return key === "A" ? CONFIG.teamA : CONFIG.teamB; }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function formatTime(seconds) {
    var s = Math.max(0, Math.ceil(seconds));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" + r : String(r));
  }

  function showScreen(name) {
    Object.keys(elScreens).forEach(function (k) {
      elScreens[k].classList.toggle("hidden", k !== name);
    });
  }

  function rosterHTML(members) {
    if (!members || !members.length) {
      return '<ul class="roster"><li class="empty">No names added yet</li></ul>';
    }
    var items = members.map(function (m) {
      return "<li>" + escapeHTML(String(m)) + "</li>";
    }).join("");
    return '<ul class="roster">' + items + "</ul>";
  }

  function escapeHTML(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ----------------------------------------------------------- start screen */

  function buildStartScreen() {
    var mins = Math.max(1, Math.round(CONFIG.turnSeconds / 60));
    elMinutes.value = mins;

    $("start-team-a").innerHTML =
      "<h3>" + escapeHTML(CONFIG.teamA.name) + "</h3>" + rosterHTML(CONFIG.teamA.members);
    $("start-team-b").innerHTML =
      "<h3>" + escapeHTML(CONFIG.teamB.name) + "</h3>" + rosterHTML(CONFIG.teamB.members);

    $("start-team-label").textContent = CONFIG.teamA.name;
    $("rule-attempts").textContent = MAX_ATTEMPTS;
    $("rule-points").textContent = "+" + POINTS;
  }

  /* ---------------------------------------------------------- board + keys */

  function buildBoard() {
    elBoard.innerHTML = "";
    for (var r = 0; r < MAX_ATTEMPTS; r++) {
      var row = document.createElement("div");
      row.className = "board-row";
      row.dataset.row = r;
      for (var c = 0; c < WORD_LEN; c++) {
        var tile = document.createElement("div");
        tile.className = "tile";
        row.appendChild(tile);
      }
      elBoard.appendChild(row);
    }
  }

  function buildKeyboard() {
    elKeyboard.innerHTML = "";
    KB_ROWS.forEach(function (keys) {
      var row = document.createElement("div");
      row.className = "kb-row";
      keys.forEach(function (k) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "key" + (k.length > 1 ? " wide" : "");
        btn.textContent = k === "BACK" ? "⌫" : k;
        btn.dataset.key = k;
        row.appendChild(btn);
      });
      elKeyboard.appendChild(row);
    });
  }

  function clearBoardAndKeys() {
    var rows = elBoard.querySelectorAll(".board-row");
    for (var r = 0; r < rows.length; r++) {
      rows[r].classList.remove("shake");
      var tiles = rows[r].children;
      for (var c = 0; c < tiles.length; c++) {
        tiles[c].textContent = "";
        tiles[c].className = "tile";
      }
    }
    var keys = elKeyboard.querySelectorAll(".key");
    for (var i = 0; i < keys.length; i++) {
      keys[i].classList.remove("correct", "present", "absent");
    }
  }

  /* -------------------------------------------------------------- panels */

  function buildPanels() {
    [["A", elPanelA], ["B", elPanelB]].forEach(function (pair) {
      var key = pair[0], node = pair[1];
      var conf = teamConf(key);
      node.innerHTML =
        '<div class="panel-name">' + escapeHTML(conf.name) + "</div>" +
        '<div class="panel-score" data-score>0</div>' +
        '<div class="panel-score-label">points</div>' +
        "<hr>" +
        rosterHTML(conf.members) +
        '<div class="panel-tag" data-tag></div>';
    });
  }

  function updatePanels() {
    [["A", elPanelA], ["B", elPanelB]].forEach(function (pair) {
      var key = pair[0], node = pair[1];
      var active = state && state.current === key;
      node.classList.toggle("active", !!active);
      node.querySelector("[data-score]").textContent = state ? state.teams[key].score : 0;
      node.querySelector("[data-tag]").textContent = active ? "▸ ACTIVE" : "";
    });
  }

  /* --------------------------------------------------------- wordle logic */

  // Two-pass scoring so repeated letters behave like real Wordle:
  // exact positions are claimed first, then the leftovers feed the yellows.
  function evaluate(guess, answer) {
    var result = new Array(WORD_LEN);
    var remaining = {};
    var i, ch;

    for (i = 0; i < WORD_LEN; i++) {
      if (guess[i] === answer[i]) {
        result[i] = "correct";
      } else {
        ch = answer[i];
        remaining[ch] = (remaining[ch] || 0) + 1;
      }
    }

    for (i = 0; i < WORD_LEN; i++) {
      if (result[i]) continue;
      ch = guess[i];
      if (remaining[ch] > 0) {
        result[i] = "present";
        remaining[ch]--;
      } else {
        result[i] = "absent";
      }
    }
    return result;
  }

  var RANK = { absent: 0, present: 1, correct: 2 };

  function paintKeys(guess, marks) {
    for (var i = 0; i < WORD_LEN; i++) {
      var ch = guess[i];
      var mark = marks[i];
      var prev = state.keyState[ch];
      if (prev && RANK[prev] >= RANK[mark]) continue;
      state.keyState[ch] = mark;
      var btn = elKeyboard.querySelector('.key[data-key="' + ch + '"]');
      if (btn) {
        btn.classList.remove("correct", "present", "absent");
        btn.classList.add(mark);
      }
    }
  }

  /* ---------------------------------------------------------- game set-up */

  function startGame(seconds) {
    var pool = shuffle(WORDS);
    var half = Math.floor(pool.length / 2);

    state = {
      phase: "playing",
      current: "A",
      paused: false,
      locked: false,
      row: 0,
      guess: "",
      keyState: {},
      teams: {
        A: makeTeamState(pool.slice(0, half), seconds),
        B: makeTeamState(pool.slice(half), seconds)
      }
    };

    buildPanels();
    beginTurn("A");
  }

  function makeTeamState(pool, seconds) {
    return {
      pool: pool,
      index: 0,
      score: 0,
      solved: [],
      missed: [],
      time: seconds,
      answer: null
    };
  }

  function beginTurn(key) {
    state.current = key;
    state.phase = "playing";
    state.paused = false;
    state.locked = false;
    elVeil.classList.add("hidden");
    $("btn-pause").textContent = "Pause";

    var conf = teamConf(key);
    elTurnLabel.textContent = conf.name.toUpperCase() + "’S TURN";
    elTurnLabel.className = "turn-label " + key.toLowerCase();

    showScreen("game");
    updatePanels();
    loadWord();
    renderClock();
    startClock();
  }

  function loadWord() {
    var t = state.teams[state.current];

    if (t.index >= t.pool.length) {
      endTurn("Every word in the pool was played.");
      return;
    }

    t.answer = t.pool[t.index];
    t.index++;
    state.row = 0;
    state.guess = "";
    state.keyState = {};
    state.locked = false;

    clearBoardAndKeys();
    setMessage("", "");
    renderProgress();
    renderCurrentRow();
  }

  /* ------------------------------------------------------------- rendering */

  function rowNode(r) {
    return elBoard.querySelector('.board-row[data-row="' + r + '"]');
  }

  function renderCurrentRow() {
    var row = rowNode(state.row);
    if (!row) return;
    for (var i = 0; i < WORD_LEN; i++) {
      var tile = row.children[i];
      var ch = state.guess[i] || "";
      var had = tile.textContent;
      tile.textContent = ch;
      tile.classList.toggle("filled", !!ch);
      if (ch && !had) {
        // retrigger the pop animation
        tile.classList.remove("filled");
        void tile.offsetWidth;
        tile.classList.add("filled");
      }
    }
  }

  function renderClock() {
    var t = state.teams[state.current];
    elClock.textContent = formatTime(t.time);
    elClock.classList.toggle("low", t.time <= LOW_CLOCK && state.phase === "playing");
  }

  function renderProgress() {
    var t = state.teams[state.current];
    elProgress.textContent = "Word " + t.index + " · Solved " + t.solved.length;
  }

  function setMessage(text, kind) {
    elMessage.textContent = text;
    elMessage.className = "message" + (kind ? " " + kind : "");
  }

  /* ----------------------------------------------------------------- clock */

  function startClock() {
    stopClock();
    lastTick = Date.now();
    clockHandle = setInterval(tick, 200);
  }

  function stopClock() {
    if (clockHandle) { clearInterval(clockHandle); clockHandle = null; }
  }

  // Delta-based so a throttled tab does not drift, and so pausing or a
  // between-word reveal costs the team nothing.
  function tick() {
    var now = Date.now();
    var delta = (now - lastTick) / 1000;
    lastTick = now;

    if (state.phase !== "playing" || state.paused || state.locked) return;

    var t = state.teams[state.current];
    t.time -= delta;

    if (t.time <= 0) {
      t.time = 0;
      renderClock();
      timeUp();
      return;
    }
    renderClock();
  }

  function timeUp() {
    var t = state.teams[state.current];
    var answer = t.answer;

    // Hard stop: the word in progress scores nothing.
    if (answer && t.solved.indexOf(answer) === -1 && t.missed.indexOf(answer) === -1) {
      t.missed.push(answer);
    }
    endTurn("Time ran out." + (answer ? " The word was " + answer + "." : ""));
  }

  /* ------------------------------------------------------------ turn flow */

  function endTurn(reason) {
    stopClock();
    clearPending();
    state.phase = "turnover";

    var key = state.current;
    var t = state.teams[key];
    var conf = teamConf(key);

    if (key === "A") {
      $("turnover-title").textContent = conf.name + "’s turn is over";
      $("turnover-reason").textContent = reason || "";
      $("turnover-score").textContent = t.score;
      $("turnover-breakdown").innerHTML = breakdownHTML(t);
      $("btn-next-turn").textContent = "Start " + CONFIG.teamB.name;
      showScreen("turnover");
    } else {
      showResult();
    }
  }

  function breakdownHTML(t) {
    var solved = t.solved.length
      ? '<span class="w-solved">' + t.solved.join(", ") + "</span>"
      : '<span class="w-missed">none</span>';
    var missed = t.missed.length
      ? '<span class="w-missed">' + t.missed.join(", ") + "</span>"
      : "none";
    return (
      '<div class="row"><b>Solved (' + t.solved.length + ")</b>" + solved + "</div>" +
      '<div class="row"><b>Missed (' + t.missed.length + ")</b>" + missed + "</div>"
    );
  }

  function showResult() {
    var a = state.teams.A, b = state.teams.B;
    var nameA = CONFIG.teamA.name, nameB = CONFIG.teamB.name;
    var tie = a.score === b.score;
    var aWins = a.score > b.score;

    $("result-title").textContent = tie
      ? "It’s a tie — " + a.score + " all!"
      : (aWins ? nameA : nameB) + " wins!";

    document.querySelector(".trophy").textContent = tie ? "🤝" : "🏆";

    $("result-a").innerHTML = resultTeamHTML(nameA, a);
    $("result-b").innerHTML = resultTeamHTML(nameB, b);
    $("result-a").classList.toggle("win", !tie && aWins);
    $("result-b").classList.toggle("win", !tie && !aWins);

    $("result-breakdown-a").innerHTML = "<b>" + escapeHTML(nameA) + "</b>" + breakdownHTML(a);
    $("result-breakdown-b").innerHTML = "<b>" + escapeHTML(nameB) + "</b>" + breakdownHTML(b);

    state.phase = "result";
    showScreen("result");
  }

  function resultTeamHTML(name, t) {
    return (
      '<div class="rt-name">' + escapeHTML(name) + "</div>" +
      '<div class="rt-score">' + t.score + "</div>" +
      '<div class="rt-meta">' + t.solved.length + " solved · " + t.missed.length + " missed</div>"
    );
  }

  /* --------------------------------------------------------------- input */

  function typeLetter(ch) {
    if (!canType()) return;
    if (state.guess.length >= WORD_LEN) return;
    state.guess += ch;
    renderCurrentRow();
  }

  function backspace() {
    if (!canType()) return;
    if (!state.guess.length) return;
    state.guess = state.guess.slice(0, -1);
    renderCurrentRow();
  }

  function canType() {
    return state && state.phase === "playing" && !state.paused && !state.locked;
  }

  function submitGuess() {
    if (!canType()) return;

    if (state.guess.length < WORD_LEN) {
      var row = rowNode(state.row);
      if (row) {
        row.classList.remove("shake");
        void row.offsetWidth;
        row.classList.add("shake");
      }
      setMessage("Needs " + WORD_LEN + " letters", "bad");
      return;
    }

    var t = state.teams[state.current];
    var guess = state.guess;
    var marks = evaluate(guess, t.answer);

    var node = rowNode(state.row);
    for (var i = 0; i < WORD_LEN; i++) {
      node.children[i].classList.add(marks[i]);
    }
    paintKeys(guess, marks);

    if (guess === t.answer) {
      t.score += POINTS;
      t.solved.push(t.answer);
      updatePanels();
      renderProgress();
      setMessage("CORRECT  +" + POINTS, "good");
      hold(SOLVE_PAUSE);
      return;
    }

    state.row++;
    state.guess = "";

    if (state.row >= MAX_ATTEMPTS) {
      t.missed.push(t.answer);
      setMessage("The word was " + t.answer, "bad");
      hold(MISS_PAUSE);
      return;
    }

    setMessage("", "");
    renderCurrentRow();
  }

  // Freeze input and the clock for the between-word reveal, then move on.
  function hold(ms) {
    state.locked = true;
    clearPending();
    var fire = function () {
      pendingTimeout = null;
      if (!state || state.phase !== "playing") return;
      // Paused mid-reveal: wait, so the revealed answer is still on screen
      // when play resumes rather than being swapped out behind the veil.
      if (state.paused) { pendingTimeout = setTimeout(fire, 200); return; }
      loadWord();
    };
    pendingTimeout = setTimeout(fire, ms);
  }

  function clearPending() {
    if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
  }

  function setPaused(on) {
    if (!state || state.phase !== "playing") return;
    state.paused = on;
    elVeil.classList.toggle("hidden", !on);
    $("btn-pause").textContent = on ? "Resume" : "Pause";
  }

  /* ---------------------------------------------------------- event wiring */

  document.addEventListener("keydown", function (e) {
    if (elScreens.game.classList.contains("hidden")) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.key === "Escape") {
      setPaused(!state.paused);
      e.preventDefault();
      return;
    }
    if (state && state.paused) return;

    if (e.key === "Enter") { submitGuess(); e.preventDefault(); return; }
    if (e.key === "Backspace") { backspace(); e.preventDefault(); return; }
    if (/^[a-zA-Z]$/.test(e.key)) { typeLetter(e.key.toUpperCase()); e.preventDefault(); }
  });

  elKeyboard.addEventListener("click", function (e) {
    var btn = e.target.closest(".key");
    if (!btn) return;
    var k = btn.dataset.key;
    if (k === "ENTER") submitGuess();
    else if (k === "BACK") backspace();
    else typeLetter(k);
  });

  $("btn-start").addEventListener("click", function () {
    var mins = parseInt(elMinutes.value, 10);
    if (!isFinite(mins) || mins < 1) {
      mins = Math.max(1, Math.round(CONFIG.turnSeconds / 60));
      elMinutes.value = mins;
    }
    startGame(mins * 60);
  });

  $("btn-pause").addEventListener("click", function () { setPaused(!state.paused); });
  $("btn-resume").addEventListener("click", function () { setPaused(false); });

  $("btn-next-turn").addEventListener("click", function () { beginTurn("B"); });

  $("btn-replay").addEventListener("click", function () {
    stopClock();
    clearPending();
    state = null;
    buildStartScreen();
    showScreen("start");
  });

  /* ------------------------------------------------------------------ boot */

  buildBoard();
  buildKeyboard();
  buildStartScreen();
  buildPanels();
  showScreen("start");

  // Exposed for quick console checks (e.g. TW.evaluate("LLAMA","HELLO")).
  window.TW = { evaluate: evaluate };
})();
