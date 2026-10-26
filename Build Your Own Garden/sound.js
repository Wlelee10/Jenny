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

  window.gardenSound = sound;

  // 버튼에 마우스를 올리면 (들어올 때 한 번)
  const HOVER = ".start-button, #finishButton, .save-button, .back-button, .folder-tab, .dialog-button, .tool, .layers-group, .filter-arrow, .filter-track button";
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    const button = event.target.closest?.(HOVER);
    if (!button || button.disabled || button.contains(event.relatedTarget)) return;
    if (button.matches(".start-button")) sound.startHover();
    else sound.hover();
  });

  // 버튼을 누르면 (START는 따로 정한 소리가 있음)
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const button = event.target.closest?.(HOVER);
    if (!button || button.disabled || button.matches(".start-button")) return;
    sound.click();
  });
})();
