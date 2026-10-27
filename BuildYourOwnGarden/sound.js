/* =========================================
   BUILD YOUR OWN GARDEN
   SOUND — 파일 없이 브라우저에서 바로 합성하는 작은 효과음
   hover(): 버튼에 마우스를 올릴 때 / start(): START를 누를 때 / land(): fragment가 바닥에 쌓일 때
   START 버튼의 호버음 · 클릭음, 조각이 떨어지는 소리는 직접 만든 파일 (sounds/)
   (브라우저 규칙상 화면을 한 번 누르거나 키를 누른 뒤부터 소리가 남)
========================================= */

(() => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let master = null;
  let noise = null;
  let lastLand = 0;

  // 파일 효과음: 미리 받아 두었다가 바로 재생
  const FILES = {
    startHover: "sounds/start-hover.mp3",
    startClick: "sounds/start-click.mp3",
    fragmentsFall: "sounds/fragments-fall.mp3"
  };
  const buffers = {};
  const fallback = {};
  Object.entries(FILES).forEach(([key, src]) => {
    const audio = new Audio(src);
    audio.preload = "auto";
    fallback[key] = audio;
  });

  function loadBuffers() {
    Object.entries(FILES).forEach(([key, src]) => {
      if (buffers[key] !== undefined) return;
      buffers[key] = null;
      fetch(src)
        .then((response) => response.arrayBuffer())
        .then((data) => new Promise((resolve, reject) => context.decodeAudioData(data, resolve, reject)))
        .then((buffer) => { buffers[key] = buffer; })
        .catch(() => { delete buffers[key]; });
    });
  }

  function playFile(key, volume = 1) {
    const ctx = ready();
    if (ctx && buffers[key]) {
      const source = ctx.createBufferSource();
      const amp = ctx.createGain();
      source.buffer = buffers[key];
      amp.gain.value = volume;
      source.connect(amp).connect(master);
      source.start();
      return;
    }
    // 아직 준비 전이면 일반 오디오로
    const audio = fallback[key];
    if (!audio) return;
    try {
      audio.currentTime = 0;
      audio.volume = volume;
      audio.play().catch(() => {});
    } catch {
      // 재생할 수 없으면 조용히 넘어감
    }
  }

  function ready() {
    if (!AudioContext) return null;
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.9;
      master.connect(context.destination);

      // 잡음 1초 (바람 · 톡 소리 재료)
      noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      loadBuffers();
    }
    if (context.state === "suspended") context.resume().catch(() => {});
    return context.state === "running" ? context : null;
  }

  // 처음 누르는 순간 소리를 켤 수 있게 함
  ["pointerdown", "keydown", "touchstart"].forEach((type) => {
    window.addEventListener(type, ready, { capture: true, passive: true });
  });

  // 부드럽게 울렸다 사라지는 음 하나
  function tone({ freq, type = "sine", gain, attack = 0.004, decay, at = 0, glide = 0 }) {
    const t = context.currentTime + at;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(freq * glide, t + decay);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  // 걸러낸 잡음 (톡 · 바람)
  function hiss({ from, to = from, q = 1, gain, attack = 0.003, decay, at = 0 }) {
    const t = context.currentTime + at;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const amp = context.createGain();
    source.buffer = noise;
    source.playbackRate.value = 0.8 + Math.random() * 0.4;
    filter.type = "bandpass";
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    source.connect(filter).connect(amp).connect(master);
    source.start(t, Math.random() * 0.5);
    source.stop(t + attack + decay + 0.05);
  }

  const sound = {
    startHover() {
      playFile("startHover");
    },

    // 아주 작은 유리 톡 (START 외의 버튼)
    hover() {
      if (!ready()) return;
      tone({ freq: 1760, gain: 0.05, decay: 0.07 });
      tone({ freq: 2640, gain: 0.013, decay: 0.05 });
    },

    // 누를 때: 건조하고 단단한 기계식 "틱" — 음이 올라가지 않는 짧은 전기 스위치 소리
    click() {
      if (!ready()) return;
      hiss({ from: 4200, q: 0.9, gain: 0.05, attack: 0.0008, decay: 0.016 });
      tone({ freq: 170, gain: 0.06, attack: 0.001, decay: 0.045, glide: 0.75 });
      tone({ freq: 3150, gain: 0.007, attack: 0.001, decay: 0.022 });
    },

    start() {
      playFile("startClick");
      // 사파리: 나중에(누른 순간이 아닐 때) 재생할 수 있도록 지금 한 번 깨워 둠
      const audio = fallback.fragmentsFall;
      if (audio) {
        audio.muted = true;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }).catch(() => { audio.muted = false; });
      }
    },

    // 첫 이미지가 transition zone을 통과할 때 시작해서, seconds 뒤(조각이 다 쌓일 때) 끝나도록
    // 음 높이는 그대로 두고 길이만 늘림
    fall(seconds) {
      const audio = fallback.fragmentsFall;
      const duration = audio?.duration;
      if (!audio || !Number.isFinite(duration) || !seconds) {
        playFile("fragmentsFall");
        return;
      }
      const rate = Math.min(1, Math.max(0.35, duration / seconds));
      audio.preservesPitch = true;
      audio.webkitPreservesPitch = true;
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
      audio.muted = false;
      audio.volume = 1;
      try {
        audio.currentTime = 0;
      } catch {
        // 아직 준비 중이면 처음부터 재생됨
      }
      audio.play().catch(() => playFile("fragmentsFall"));
    },

    // fragment가 바닥에 닿는 작은 톡 (세게 떨어질수록 조금 더 또렷)
    land(speed = 600) {
      if (!context || context.state !== "running") return;
      const now = performance.now();
      if (now - lastLand < 28) return; // 한꺼번에 쏟아질 때 겹쳐서 커지지 않게
      lastLand = now;
      const strength = Math.min(1, speed / 1400);
      const pitch = 420 + Math.random() * 520;
      tone({ freq: pitch, type: "triangle", gain: 0.012 + strength * 0.02, decay: 0.09, glide: 0.7 });
      hiss({ from: 1800 + Math.random() * 1800, q: 1.4, gain: 0.015 + strength * 0.025, decay: 0.05 });
    }
  };

  /* ---------- 로딩 화면 배경음: 전자음 ----------
     낮게 깔리는 전자 드론 + 데이터가 흐르는 듯한 작은 삐빅 소리
     (브라우저 규칙상 화면을 한 번 누른 뒤부터 들림) */
  const gate = { bus: null, nodes: [], timer: 0, on: false };

  function panned(pan) {
    const node = context.createStereoPanner ? context.createStereoPanner() : context.createGain();
    if (node.pan) node.pan.value = pan;
    node.connect(gate.bus);
    return node;
  }

  // 짧은 전자 삐빅 하나
  function blip(freq, at, gain, pan = 0, length = 0.035, type = "square") {
    const t = context.currentTime + at;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(amp).connect(panned(pan));
    osc.start(t);
    osc.stop(t + length + 0.03);
  }

  const DATA_NOTES = [880, 1046.5, 1318.5, 1568, 1760, 2093, 2637];

  function dataLoop() {
    if (!gate.on) return;
    const pan = Math.random() * 1.6 - 0.8;
    if (Math.random() < 0.28) {
      // 데이터 묶음: 빠르게 이어지는 삐빅들
      const count = 3 + Math.floor(Math.random() * 5);
      const base = DATA_NOTES[Math.floor(Math.random() * DATA_NOTES.length)];
      for (let i = 0; i < count; i++) {
        const note = base * (Math.random() < 0.5 ? 1 : 1.5);
        blip(note, i * 0.045, 0.02, pan);
      }
    } else {
      blip(DATA_NOTES[Math.floor(Math.random() * DATA_NOTES.length)], 0, 0.028, pan, 0.06, "sine");
    }
    gate.timer = setTimeout(dataLoop, 180 + Math.random() * 520);
  }

  function beginGate() {
    if (gate.on || !context) return;
    gate.on = true;
    const t = context.currentTime;
    gate.bus = context.createGain();
    gate.bus.gain.setValueAtTime(0.0001, t);
    gate.bus.gain.exponentialRampToValueAtTime(1, t + 2.5);
    gate.bus.connect(master);

    // 드론: 살짝 어긋난 두 톱니파 + 한 옥타브 위 사인, 천천히 열렸다 닫히는 필터
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 360;
    filter.Q.value = 5;
    const droneAmp = context.createGain();
    droneAmp.gain.value = 0.045;
    filter.connect(droneAmp).connect(gate.bus);
    const lfo = context.createOscillator();
    const lfoAmp = context.createGain();
    lfo.frequency.value = 0.07;
    lfoAmp.gain.value = 180;
    lfo.connect(lfoAmp).connect(filter.frequency);
    lfo.start();
    gate.nodes.push(lfo);
    [[55, "sawtooth", 1], [55.35, "sawtooth", 1], [110, "sine", 0.8], [164.8, "sine", 0.35]].forEach(([freq, type, level]) => {
      const osc = context.createOscillator();
      const amp = context.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      amp.gain.value = level;
      osc.connect(amp).connect(filter);
      osc.start();
      gate.nodes.push(osc);
    });
    dataLoop();
  }

  sound.gateStart = () => {
    if (!AudioContext || gate.on) return;
    if (ready()) {
      beginGate();
      return;
    }
    context?.resume().then(beginGate).catch(() => {});
  };

  // 시작 버튼을 누르면 영상 소리에 자리를 내주며 사라짐
  sound.gateStop = (seconds = 1.2) => {
    if (!gate.on) return;
    gate.on = false;
    clearTimeout(gate.timer);
    const t = context.currentTime;
    gate.bus.gain.cancelScheduledValues(t);
    gate.bus.gain.setValueAtTime(Math.max(gate.bus.gain.value, 0.0001), t);
    gate.bus.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    gate.nodes.forEach((node) => node.stop(t + seconds + 0.1));
    gate.nodes = [];
  };

  // 빈 곳을 꾸욱 누르는 동안: 0 · 1 이 생길 때마다 데이터 삐빅 (너무 촘촘하면 건너뜀)
  let lastBit = 0;
  sound.gateBit = (pan = 0) => {
    if (!gate.on) return;
    const now = performance.now();
    if (now - lastBit < 55) return;
    lastBit = now;
    const note = DATA_NOTES[Math.floor(Math.random() * DATA_NOTES.length)];
    blip(note * (Math.random() < 0.3 ? 2 : 1), 0, 0.022, pan, 0.03 + Math.random() * 0.03, Math.random() < 0.5 ? "square" : "sine");
  };

  // 손 점이 뒤집히는 물결: 손끝에서 바깥쪽으로 흘러가는 작은 틱들 (왼손은 왼쪽, 오른손은 오른쪽으로)
  sound.gateFlip = (sweep = 1.6) => {
    if (!gate.on) return;
    const STEPS = 10;
    for (let i = 0; i < STEPS; i++) {
      const p = i / (STEPS - 1);
      const freq = 1200 + p * 1400;
      blip(freq, p * sweep, 0.016, -0.2 - p * 0.7, 0.035, "triangle");
      blip(freq * 1.01, p * sweep + 0.012, 0.016, 0.2 + p * 0.7, 0.035, "triangle");
    }
  };

  // 손을 눌러 물결 두 번: 소나 같은 핑 두 번
  sound.gateRipple = (pan = 0, gap = 0.22) => {
    if (!gate.on) return;
    [0, 1].forEach((n) => {
      const t = context.currentTime + n * gap;
      const osc = context.createOscillator();
      const amp = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n ? 990 : 1320, t);
      osc.frequency.exponentialRampToValueAtTime(n ? 880 : 1180, t + 0.6);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(n ? 0.06 : 0.09, t + 0.006);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(amp).connect(panned(pan));
      osc.start(t);
      osc.stop(t + 0.75);
    });
  };

  // [ Show your Creativity ] 호버: 부드럽게 차오르는 전자 "우웅↗" (공명 필터 스윕 + 위로 미끄러지는 음)
  sound.enterHover = () => {
    if (!ready()) return;
    const t = context.currentTime;
    const osc = context.createOscillator();
    const sub = context.createOscillator();
    const filter = context.createBiquadFilter();
    const amp = context.createGain();
    osc.type = "sawtooth";
    sub.type = "sine";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(330, t + 0.22);
    sub.frequency.setValueAtTime(110, t);
    sub.frequency.exponentialRampToValueAtTime(165, t + 0.22);
    filter.type = "lowpass";
    filter.Q.value = 14;
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(2600, t + 0.2);
    filter.frequency.exponentialRampToValueAtTime(900, t + 0.38);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.045, t + 0.06);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(amp).connect(master);
    osc.start(t);
    sub.start(t);
    osc.stop(t + 0.45);
    sub.stop(t + 0.45);
    // 끝에 아주 작은 반짝임
    tone({ freq: 2637, gain: 0.008, attack: 0.002, decay: 0.08, at: 0.16 });
  };

  // [ Show your Creativity ] 클릭: 전원이 켜지듯 아래에서 위로 쭉 올라가는 소리 + 밝은 화음
  sound.enterClick = () => {
    if (!ready()) return;
    const t = context.currentTime;
    const osc = context.createOscillator();
    const filter = context.createBiquadFilter();
    const amp = context.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.45);
    filter.type = "lowpass";
    filter.Q.value = 8;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(4200, t + 0.45);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.06, t + 0.04);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(filter).connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + 0.65);
    hiss({ from: 6000, q: 0.8, gain: 0.04, attack: 0.001, decay: 0.03 });
    [523.25, 783.99, 1046.5, 1568].forEach((freq, i) => {
      tone({ freq, gain: 0.035 - i * 0.005, attack: 0.006, decay: 1.4, at: 0.42 });
    });
  };

  window.gardenSound = sound;

  // 버튼에 마우스를 올리면 (들어올 때 한 번)
  const HOVER = ".start-button, #finishButton, .save-button, .back-button, .folder-tab, .dialog-button, .tool, .layers-group, .filter-arrow, .filter-track button";
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    const button = event.target.closest?.(HOVER);
    if (!button || button.disabled || button.contains(event.relatedTarget)) return;
    // 이미 열려 있는 탭(BUILD · AI LIBRARY · HUMAN GALLERY)은 소리 없음
    if (button.matches(".folder-tab") && button.closest(".folder")?.classList.contains("is-active")) return;
    if (button.matches(".start-button")) sound.startHover();
    else sound.hover();
  });

  // 버튼을 누르면 (START는 따로 정한 소리가 있음)
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const button = event.target.closest?.(HOVER);
    if (!button || button.disabled || button.matches(".start-button")) return;
    if (button.matches(".folder-tab") && button.closest(".folder")?.classList.contains("is-active")) return;
    sound.click();
  });
})();
