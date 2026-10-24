/* =========================================
   BUILD YOUR OWN GARDEN
   SOUND — 파일 없이 브라우저에서 바로 합성하는 작은 효과음
   hover(): 버튼에 마우스를 올릴 때 / start(): START를 누를 때 / land(): fragment가 바닥에 쌓일 때
   (브라우저 규칙상 화면을 한 번 누르거나 키를 누른 뒤부터 소리가 남)
========================================= */

(() => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let master = null;
  let noise = null;
  let lastLand = 0;

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
    // 아주 작은 유리 톡
    hover() {
      if (!ready()) return;
      tone({ freq: 1760, gain: 0.03, decay: 0.07 });
      tone({ freq: 2640, gain: 0.008, decay: 0.05 });
    },

    // 맑은 두 음 + 아래로 빨려 들어가는 바람
    start() {
      if (!ready()) return;
      tone({ freq: 659.3, gain: 0.05, attack: 0.01, decay: 1.4 });
      tone({ freq: 987.8, gain: 0.035, attack: 0.01, decay: 1.2, at: 0.09 });
      tone({ freq: 1318.5, gain: 0.012, attack: 0.01, decay: 0.9, at: 0.09 });
      hiss({ from: 2600, to: 380, q: 0.8, gain: 0.05, attack: 0.25, decay: 1.3, at: 0.05 });
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
  const HOVER = ".start-button, .opening-skip, .opening-sound, #finishButton, .save-button, .back-button, .folder-tab, .dialog-button";
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    const button = event.target.closest?.(HOVER);
    if (!button || button.disabled || button.contains(event.relatedTarget)) return;
    sound.hover();
  });
})();
