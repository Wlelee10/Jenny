/* =========================================
   BUILD YOUR OWN GARDEN
   INTRO INTERACTION
========================================= */

/* =========================================
   IMAGE RETRY
   이미지 하나가 일시적으로 못 받아지면(인터넷 순간 끊김 · 동시 요청이 많을 때)
   깨진 아이콘을 보여주지 않고 잠시 뒤 다시 받음 (최대 4번)
========================================= */

document.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  const src = image.currentSrc || image.src;
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;
  const tries = Number(image.dataset.retries || 0);
  if (tries >= 4) return;
  image.dataset.retries = String(tries + 1);
  image.classList.add("is-retrying");
  const base = src.replace(/([?&])retry=\d+$/, "").replace(/[?&]$/, "");
  setTimeout(() => {
    image.src = `${base}${base.includes("?") ? "&" : "?"}retry=${tries + 1}`;
  }, 500 * 2 ** tries);
}, true);

document.addEventListener("load", (event) => {
  if (event.target instanceof HTMLImageElement) event.target.classList.remove("is-retrying");
}, true);

const grid = document.querySelector("#gardenGrid");
const mosaic = document.querySelector("#mosaicWindow");
const scene = document.querySelector("#mosaicScene");
const world = document.querySelector("#world");
const abyss = document.querySelector("#abyss");
const portalLine = document.querySelector("#portalLine");
const fragmentLayer = document.querySelector("#fragmentLayer");
const startButton = document.querySelector("#startButton");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* =========================================
   OPENING
   영상은 22초 07프레임부터 흰 화면 + BGM만 남음
   → 그 순간 영상은 화면에서 사라지고(BGM은 계속) 실제 페이지에서
     200장의 이미지가 화면 가득 깔렸다가 글자 자리로 모이며 첫 페이지가 됨 (ASSEMBLY)
   소리 있는 자동 재생이 막히면 소리 없이 재생 + [ SOUND ON ]
========================================= */

const opening = document.querySelector("#opening");
const openingVideo = document.querySelector("#openingVideo");
const openingSound = document.querySelector("#openingSound");
const openingPlay = document.querySelector("#openingPlay");
const openingSkip = document.querySelector("#openingSkip");
const openingGate = document.querySelector("#openingGate");

const ASSEMBLE_AT = (22 * 24 + 7) * 1001 / 24000; // 22초 07프레임 (23.976fps) ≈ 22.314초
// 검색창 장면은 196번째 프레임(8.175초)에서 다음 장면으로 바뀜 — 그 프레임부터 화면 가득
const FRAMED_UNTIL = (196 - 0.5) * 1001 / 24000;

// 검색창 장면: 영상 속 마우스(1920px 영상에서 높이 약 85px)가 실제 마우스 크기(약 30px)가 되도록 0.36배
// 화면이 좁으면 검색창(영상에서 폭 1456px)이 화면 안에 들어오도록 더 작게
function fitFramedVideo() {
  const scale = Math.min(0.36, (window.innerWidth * 0.92) / 1456);
  opening?.style.setProperty("--video-scale", scale.toFixed(4));
}
fitFramedVideo();
window.addEventListener("resize", fitFramedVideo);
let assemblyStarted = false;

// 흰 화면이 시작되는 순간: 영상은 숨기고 BGM은 그대로 흐르게 둔 채 첫 페이지를 만들기 시작
function beginAssembly() {
  if (assemblyStarted) return;
  assemblyStarted = true;
  opening?.classList.add("is-listening");
  if (openingSkip) openingSkip.hidden = true;
  if (openingPlay) openingPlay.hidden = true;
  assembleIntro();
}

// 영상을 쓸 수 없거나(오류 · 재생 막힘에서 건너뛰기) 다 끝났을 때
function endOpening() {
  if (!assemblyStarted) {
    openingVideo?.pause();
    if (opening) opening.hidden = true;
    beginAssembly();
  }
  // BGM까지 끝났으면 영상 층을 치움
  if (!openingVideo || openingVideo.paused || openingVideo.ended) opening?.remove();
}

// 검색창 장면 → 화면 가득: 화면에 실제로 그려지는 영상 프레임의 시간으로 판단 (프레임 정확)
function watchFrames() {
  if (!openingVideo || !opening?.isConnected) return;
  const framed = (time) => opening.classList.toggle("is-framed", time < FRAMED_UNTIL);
  if ("requestVideoFrameCallback" in openingVideo) {
    const onFrame = (_, meta) => {
      framed(meta.mediaTime);
      if (opening.isConnected && !assemblyStarted) openingVideo.requestVideoFrameCallback(onFrame);
    };
    openingVideo.requestVideoFrameCallback(onFrame);
  } else {
    const tick = () => {
      framed(openingVideo.currentTime);
      if (opening.isConnected && !assemblyStarted) requestAnimationFrame(tick);
    };
    tick();
  }
}

// 영상 시간이 22초 07프레임(첫 페이지 만들기)에 닿는 순간을 지켜봄
function watchOpening() {
  if (assemblyStarted || !openingVideo) return;
  if (openingVideo.currentTime >= ASSEMBLE_AT - 0.01) {
    beginAssembly();
    return;
  }
  requestAnimationFrame(watchOpening);
}

// 소리: 처음부터 켜진 상태가 기본. 버튼을 누르면 [ SOUND OFF ](회색) ↔ [ SOUND ON ]
let soundOffByUser = false;

function paintSound() {
  if (!openingSound || !openingVideo) return;
  const off = openingVideo.muted;
  openingSound.textContent = off ? "[ SOUND OFF ]" : "[ SOUND ON ]";
  openingSound.classList.toggle("is-off", off);
  openingSound.setAttribute("aria-pressed", String(!off));
}

function setOpeningSound(on) {
  if (!openingVideo) return;
  openingVideo.muted = !on;
  if (on) openingVideo.removeAttribute("muted");
  // 멈춰 있었으면(자동 재생이 막혔으면) 누른 김에 재생
  if (openingVideo.paused && !openingVideo.ended && !assemblyStarted) {
    openingPlay.hidden = true;
    openingVideo.play().catch(() => { openingPlay.hidden = false; });
  }
  paintSound();
}

// 사파리 · 크롬 모두 소리 없는 자동 재생만 확실히 허용하므로 항상 소리 없이 시작 → [ SOUND ON ]
async function playMuted() {
  openingVideo.muted = true;
  openingVideo.setAttribute("muted", "");
  if (openingVideo.paused) await openingVideo.play();
}

// 재생 여부는 play()의 답이 아니라 실제 상태로 판단
// (사파리는 autoplay로 이미 재생 중일 때 play() 요청을 "취소됨"으로 거절하기도 함)
function showPlayIfStopped() {
  if (!document.body.classList.contains("is-opening")) return;
  if (!openingVideo.paused) return;
  openingPlay.hidden = false;
}

/* =========================================
   GATE ART: 서로를 향해 뻗는 두 손 (점)
   참고 이미지의 점을 하나하나 그대로 옮김 (gate-dots.json: 위치 · 크기, 화면 폭 기준 비율)
   → 화면 폭에 맞춰 같은 배치로 다시 그림 (세로는 화면 가운데 기준)
========================================= */

const gateArt = document.querySelector("#gateArt");
let gateDots = null;

fetch("gate-dots.json")
  .then((response) => response.json())
  .then((data) => {
    gateDots = data;
    drawGateArt();
  })
  .catch(() => {});

// 손 하나의 경계 (참고 이미지 단위: 가로 = 1)
function handBounds(dots, right) {
  const box = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
  for (let i = 0; i < dots.length; i += 3) {
    const x = dots[i] / 10000;
    if ((x >= 0.47) !== right) continue;
    const y = dots[i + 1] / 10000;
    box.l = Math.min(box.l, x);
    box.r = Math.max(box.r, x);
    box.t = Math.min(box.t, y);
    box.b = Math.max(box.b, y);
  }
  return box;
}

function drawGateArt() {
  if (!gateArt?.isConnected || !gateDots) return;
  const width = gateArt.clientWidth;
  const height = gateArt.clientHeight;
  if (!width || !height) return;

  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  gateArt.width = Math.round(width * ratio);
  gateArt.height = Math.round(height * ratio);
  const context = gateArt.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  // 손 크기 k (참고 이미지 폭 1 → k px): 화면이 세로로 길수록 크게
  const k = Math.max(width, height * 2);
  const gate = document.querySelector("#openingGate");
  const copy = document.querySelector(".gate-copy");
  const cx = width / 2;
  const cy = height * 0.42;
  gate?.style.setProperty("--gate-cy", `${cy.toFixed(1)}px`);
  copy?.style.setProperty("--k", `${k.toFixed(1)}px`);

  // 글 · 버튼(빛 포함) 영역 — 여기에 가까운 점일수록 투명
  let area = { l: cx - 0.2 * k, r: cx + 0.2 * k, t: cy - 0.05 * k, b: cy + 0.05 * k };
  if (copy) {
    const rect = copy.getBoundingClientRect();
    const glow = 0.012 * k;
    area = { l: rect.left - glow, r: rect.right + glow, t: rect.top - glow, b: rect.bottom + glow };
  }
  const FADE = 0.16 * k; // 이 거리만큼 멀어지면 완전히 진해짐

  // 왼손: 손끝이 가운데에서 0.092k 왼쪽, 세로 중심은 글보다 살짝 위
  // 오른손: 손끝이 가운데에서 0.066k 오른쪽, 세로 중심은 글보다 0.113k 아래
  const dots = gateDots.dots;
  const L = handBounds(dots, false);
  const R = handBounds(dots, true);
  const leftDX = cx - 0.092 * k - L.r * k;
  const leftDY = cy - 0.009 * k - ((L.t + L.b) / 2) * k;
  const rightDX = cx + 0.066 * k - R.l * k;
  const rightDY = cy + 0.113 * k - ((R.t + R.b) / 2) * k;

  context.fillStyle = "#111111";
  for (let i = 0; i < dots.length; i += 3) {
    const fx = dots[i] / 10000;
    const right = fx >= 0.47;
    const x = fx * k + (right ? rightDX : leftDX);
    const y = (dots[i + 1] / 10000) * k + (right ? rightDY : leftDY);
    const r = ((dots[i + 2] / 100000) * k) / 2;
    if (x < -r || x > width + r || y < -r || y > height + r) continue;

    const dx = Math.max(area.l - x, 0, x - area.r);
    const dy = Math.max(area.t - y, 0, y - area.b);
    const t = Math.min(1, Math.hypot(dx, dy) / FADE);
    context.globalAlpha = 0.05 + 0.95 * t * t * (3 - 2 * t);

    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

if (gateArt) {
  window.addEventListener("resize", drawGateArt);
  // 글꼴이 다 받아지면 글 크기가 바뀌므로 다시
  document.fonts?.ready.then(drawGateArt);
}

async function playOpening() {
  if (!opening || !openingVideo) {
    requestAnimationFrame(endOpening);
    return;
  }

  // 파일을 아예 불러올 수 없을 때만 건너뜀 (느리게 받아지는 중이면 기다림)
  openingVideo.addEventListener("ended", endOpening);
  openingVideo.addEventListener("error", endOpening);
  openingSound.hidden = false;
  paintSound();
  openingVideo.addEventListener("volumechange", paintSound);
  openingSound.addEventListener("click", (event) => {
    event.stopPropagation();
    const on = openingVideo.muted;
    soundOffByUser = !on;
    setOpeningSound(on);
  });
  openingPlay.addEventListener("click", () => setOpeningSound(!soundOffByUser));

  // [ SKIP ] → 영상 · 소리 없이 바로 완성된 첫 페이지 (START를 바로 누를 수 있음)
  openingSkip?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (assemblyStarted) return;
    assemblyStarted = true;
    openingVideo.pause();
    opening.remove();
    document.body.classList.add("is-skipped");
    document.body.classList.remove("is-opening");
  });

  // 실제로 재생되기 시작하면 PLAY는 숨김
  openingVideo.addEventListener("playing", () => {
    openingPlay.hidden = true;
    paintSound();
  });

  /* ---------- 시작 준비 ----------
     모든 브라우저: 처음엔 LOADING. 아래가 다 끝나야 시작
       1. 영상 앞부분(바로 재생할 만큼)
       2. 인트로 이미지 200장 + 조각 이미지 200장 (받고 미리 풀어 둠)
       3. 인트로 유리 효과를 화면 뒤에서 미리 한 번 그려 봄 (사파리의 첫 호버가 느린 것 방지)
     → 그동안 소개글을 읽음. 다 되면 [ Click to show your creativity ] — 누르면 영상이 소리와 함께 바로 시작
     (자동 재생이 되는 브라우저도 글을 읽을 수 있도록 항상 눌러서 시작) */

  const openingLoader = document.querySelector("#openingLoader");
  const openingEnter = document.querySelector("#openingEnter");
  const READY_AHEAD = 2.5;
  const PREPARE_LIMIT = 30000; // 아주 느린 연결이어도 30초 뒤에는 시작할 수 있게
  const preparedAt = performance.now();
  let suspended = false;  // 브라우저가 충분히 받았다고 보고 잠시 멈춤
  let waiting = true;     // 재생 중 받는 것을 기다리는지
  let started = false;    // 영상이 소리와 함께 시작됨
  let gateReady = false;  // [ CLICK TO ENTER ] 상태
  let warm = "no";        // 유리 미리 그리기: no → running → done

  opening.classList.add("is-gated");
  openingGate.hidden = false;
  openingSound.hidden = true;

  const hideGate = () => {
    opening.classList.remove("is-gated");
    openingGate.hidden = true;
    openingSound.hidden = false;
    paintSound();
  };

  const showEnter = () => {
    gateReady = true;
    openingLoader.classList.remove("is-visible");
    openingEnter.hidden = false;
  };

  // 처음부터 재생 (gesture: 사용자가 누른 순간인지)
  const startVideo = async (gesture) => {
    if (started || assemblyStarted) return;
    openingVideo.muted = gesture ? soundOffByUser : false;
    try {
      openingVideo.currentTime = 0;
    } catch {
      // 아직 준비 중이면 처음부터 재생됨
    }
    try {
      await openingVideo.play();
      started = true;
      hideGate();
    } catch {
      openingVideo.pause();
      endOpening(); // 눌러도 재생할 수 없으면(파일 문제 등) 첫 페이지로
    }
  };

  openingEnter.addEventListener("click", (event) => {
    event.stopPropagation();
    if (gateReady) startVideo(true);
  });
  // 준비된 뒤에는 Enter 키로도 시작
  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && gateReady && !started && opening.isConnected && !assemblyStarted) startVideo(true);
  });

  const videoProgress = () => {
    if (suspended || openingVideo.readyState >= 4) return 1;
    let ahead = 0;
    const { buffered, currentTime, duration } = openingVideo;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= currentTime + 0.1 && buffered.end(i) > currentTime) ahead = buffered.end(i) - currentTime;
    }
    const target = Math.min(READY_AHEAD, (duration || READY_AHEAD) - currentTime);
    return Math.min(1, target > 0 ? ahead / target : 1);
  };

  const imageProgress = () => {
    // 인트로 글자 이미지만 기다림 (조각 이미지는 START 뒤에 필요해서 영상이 나오는 동안 뒤에서 받음)
    const images = document.querySelectorAll("#gardenGrid img");
    if (!images.length) return 0;
    let done = 0;
    images.forEach((image) => {
      if (image.complete && image.naturalWidth) done++;
    });
    return done / images.length;
  };

  const prepare = () => {
    if (!opening.isConnected || assemblyStarted) return;
    const video = videoProgress();
    const images = imageProgress();
    const timedOut = performance.now() - preparedAt > PREPARE_LIMIT;

    // 이미지가 다 받아지면 유리 효과를 화면 뒤에서 한 번 그려 봄
    if ((images >= 1 || timedOut) && warm === "no") {
      warm = "running";
      warmUpIntro().then(() => { warm = "done"; });
    }

    const progress = video * 0.4 + images * 0.5 + (warm === "done" ? 0.1 : 0);
    openingLoader.style.setProperty("--progress", progress.toFixed(3));

    if (!started && !gateReady && ((video >= 1 && images >= 1 && warm === "done") || timedOut)) showEnter();
  };

  ["progress", "loadedmetadata", "loadeddata", "canplay", "canplaythrough"].forEach((type) => {
    openingVideo.addEventListener(type, prepare);
  });
  openingVideo.addEventListener("suspend", () => {
    if (openingVideo.readyState >= 3) suspended = true;
    prepare();
  });
  openingVideo.addEventListener("waiting", () => { waiting = true; prepare(); });
  openingVideo.addEventListener("playing", () => { waiting = false; prepare(); });
  const prepareTimer = setInterval(() => {
    if (!opening.isConnected || assemblyStarted) {
      clearInterval(prepareTimer);
      openingLoader?.classList.remove("is-visible");
      return;
    }
    prepare();
  }, 200);

  // 영상 받기 시작: 사파리는 멈춘 영상을 잘 받아 두지 않으므로 소리 없이 아주 잠깐 재생했다 멈춤
  // (흰 입장 화면이 덮고 있어 보이지 않음)
  openingVideo.muted = true;
  openingVideo.play().then(() => {
    if (started) return;
    openingVideo.pause();
    openingVideo.currentTime = 0;
  }).catch(() => {});
  prepare();

  requestAnimationFrame(watchOpening);
  watchFrames();
}

playOpening();

/* =========================================
   SQUIRCLE (애플 앱 아이콘 모양: 연속 곡률 모서리)
   반지름은 짧은 변의 22.37%, 스무딩 60% (Figma의 iOS 아이콘 값)
   이미지 크기가 제각각이라 px 단위 clip-path로 그때그때 만듦
========================================= */

function squirclePath(x, y, w, h, r) {
  const s = 0.6;
  const p = Math.min((1 + s) * r, w / 2, h / 2);
  const alpha = (45 * s * Math.PI) / 180;
  const beta = (90 * (1 - s) * Math.PI) / 180;
  const arc = Math.sin(beta / 2) * r * Math.SQRT2;
  const c = r * Math.tan((Math.PI / 2 - beta) / 4) * Math.cos(alpha);
  const d = c * Math.tan(alpha);
  const b = Math.max(0, (p - arc - c - d) / 3);
  const a = 2 * b;
  const n = (v) => v.toFixed(2);
  const R = `a${n(r)} ${n(r)} 0 0 1`;

  return (
    `M${n(x + p)} ${n(y)}H${n(x + w - p)}` +
    `c${n(a)} 0 ${n(a + b)} 0 ${n(a + b + c)} ${n(d)}${R} ${n(arc)} ${n(arc)}c${n(d)} ${n(c)} ${n(d)} ${n(b + c)} ${n(d)} ${n(a + b + c)}` +
    `V${n(y + h - p)}` +
    `c0 ${n(a)} 0 ${n(a + b)} ${n(-d)} ${n(a + b + c)}${R} ${n(-arc)} ${n(arc)}c${n(-c)} ${n(d)} ${n(-(b + c))} ${n(d)} ${n(-(a + b + c))} ${n(d)}` +
    `H${n(x + p)}` +
    `c${n(-a)} 0 ${n(-(a + b))} 0 ${n(-(a + b + c))} ${n(-d)}${R} ${n(-arc)} ${n(-arc)}c${n(-d)} ${n(-c)} ${n(-d)} ${n(-(b + c))} ${n(-d)} ${n(-(a + b + c))}` +
    `V${n(y + p)}` +
    `c0 ${n(-a)} 0 ${n(-(a + b))} ${n(d)} ${n(-(a + b + c))}${R} ${n(arc)} ${n(-arc)}c${n(c)} ${n(-d)} ${n(b + c)} ${n(-d)} ${n(a + b + c)} ${n(-d)}Z`
  );
}

// 상자(boxW × boxH) 안에 contain으로 그려진 이미지의 실제 모양대로 둥글게 자름
// amount: 1 = 완전히 둥글게, 0 = 사각형
function roundImage(image, boxW, boxH, amount = 1) {
  if (amount <= 0.001) {
    image.style.clipPath = "";
    return;
  }
  const aspect = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 1;
  let w = boxW;
  let h = boxW / aspect;
  if (h > boxH) {
    h = boxH;
    w = boxH * aspect;
  }
  const r = Math.min(w, h) * 0.2237 * amount;
  image.style.clipPath = `path("${squirclePath((boxW - w) / 2, (boxH - h) / 2, w, h, r)}")`;
}

window.gardenRoundImage = roundImage;

/* =========================================
   PIXEL LETTERS
   "BUILD. / YOUR OWN / GARDEN"을 칸으로 그림 → 칸 하나 = 이미지 한 장 (정확히 200칸)
   1·3줄은 오른쪽, 2줄은 왼쪽에 맞춤
========================================= */

const GLYPHS = {
  B: ["###.", "#..#", "###.", "#..#", "###."],
  U: ["#..#", "#..#", "#..#", "#..#", ".##."],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  L: ["#..", "#..", "#..", "#..", "###"],
  D: ["###.", "#..#", "#..#", "#..#", "###."],
  ".": [".", ".", ".", ".", "#"],
  Y: ["#...#", ".#.#.", "..#..", "..#..", "..#.."],
  O: [".##.", "#..#", "#..#", "#..#", ".##."],
  R: ["###.", "#..#", "###.", "#.#.", "#..#"],
  W: ["#...#", "#...#", "#.#.#", "#.#.#", ".#.#."],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#"],
  G: ["####", "#...", "#.##", "#..#", "####"],
  A: [".##.", "#..#", "####", "#..#", "#..#"],
  E: ["###", "#..", "###", "#..", "###"]
};

const LINES = [
  { text: "BUILD.", align: "right" },
  { text: "YOUR OWN", align: "left" },
  { text: "GARDEN", align: "right" }
];

const GLYPH_H = 5;
const LETTER_GAP = 0.5;     // 글자 사이 (칸 단위)
const WORD_GAP = 1.5;       // 단어 사이
const LINE_GAP = 0.6;       // 줄 사이
const RIGHT_OVERHANG = 1;   // 1·3줄이 2줄보다 오른쪽으로 더 나감

function layoutLetters() {
  let letterCount = 0;
  const measured = LINES.map((line) => {
    const cells = [];
    let x = 0;
    [...line.text].forEach((char, index) => {
      if (char === " ") {
        x += WORD_GAP - LETTER_GAP;
        return;
      }
      if (index > 0 && line.text[index - 1] !== " ") x += LETTER_GAP;
      const glyph = GLYPHS[char];
      const letter = letterCount++;
      glyph.forEach((row, r) => {
        [...row].forEach((mark, c) => {
          if (mark === "#") cells.push({ col: x + c, row: r, letter, char, lc: c, lr: r });
        });
      });
      x += glyph[0].length;
    });
    return { ...line, cells, width: x };
  });

  const columns = Math.max(...measured.map((line) => line.width + (line.align === "left" ? RIGHT_OVERHANG : 0)));
  const cells = [];

  measured.forEach((line, index) => {
    const offset = line.align === "right" ? columns - line.width : 0;
    const top = index * (GLYPH_H + LINE_GAP);
    line.cells.forEach((cell) => cells.push({ ...cell, col: cell.col + offset, row: cell.row + top }));
  });

  cells.sort((a, b) => a.row - b.row || a.col - b.col);
  return { cells, columns, rows: LINES.length * GLYPH_H + (LINES.length - 1) * LINE_GAP };
}

/* =========================================
   어떤 이미지를 어느 칸에 놓을지
   밝은 이미지는 흐린 유리에 묻혀 그 칸이 비어 보이므로:
   - 어두운 이미지일수록 글자 윤곽이 드러나는 칸(끝, 모서리, 사선)에
   - 밝은 이미지는 주변이 다른 이미지로 둘러싸인 칸에, 한 글자에 2장까지, 서로 붙지 않게
   - 속이 비어 보이기 쉬운 O, R과 마침표에는 밝은 이미지를 놓지 않음
========================================= */

// 이미지별 밝기 (#01 ~ #200, 0~255, images-small의 평균 밝기)
const IMAGE_LIGHTNESS = [
  81, 89, 106, 80, 75, 89, 63, 90, 67, 53, 58, 67, 94, 127, 117, 111, 63, 72, 61, 109,
  155, 149, 118, 142, 173, 180, 93, 153, 73, 122, 83, 78, 87, 94, 71, 88, 100, 87, 95, 69,
  86, 88, 106, 90, 98, 83, 98, 58, 84, 99, 91, 86, 103, 118, 108, 127, 113, 106, 103, 45,
  136, 171, 162, 143, 113, 70, 125, 69, 71, 86, 60, 74, 86, 57, 51, 60, 63, 66, 88, 62,
  90, 166, 145, 70, 72, 99, 76, 92, 100, 114, 106, 121, 98, 133, 111, 104, 103, 87, 140, 70,
  81, 110, 98, 107, 120, 126, 121, 79, 126, 115, 124, 110, 169, 152, 142, 94, 59, 108, 108, 94,
  94, 103, 108, 104, 36, 50, 53, 81, 81, 110, 83, 58, 78, 98, 86, 129, 46, 61, 45, 79,
  144, 126, 126, 97, 69, 76, 89, 93, 143, 121, 77, 125, 123, 66, 76, 80, 105, 92, 102, 90,
  81, 85, 60, 90, 158, 123, 79, 104, 62, 65, 72, 68, 99, 99, 91, 113, 67, 87, 64, 78,
  95, 92, 88, 116, 84, 89, 95, 87, 88, 72, 82, 122, 73, 92, 82, 109, 110, 75, 79, 70
];
const BRIGHT = 125;
const NO_BRIGHT = new Set(["O", "R", "."]);

function placeImages(cells) {
  const key = (letter, c, r) => `${letter}:${c}:${r}`;
  const filled = new Set(cells.map((cell) => key(cell.letter, cell.lc, cell.lr)));
  const neighbors = (cell) => {
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if ((dx || dy) && filled.has(key(cell.letter, cell.lc + dx, cell.lr + dy))) count++;
      }
    }
    return count;
  };

  // 둘러싸인 칸부터 (같으면 여러 글자에 고르게 퍼지도록 섞음)
  const spread = (i) => (i * 73) % cells.length;
  const slots = cells
    .map((cell, i) => ({ cell, i, around: neighbors(cell) }))
    .sort((a, b) => b.around - a.around || spread(a.i) - spread(b.i));

  const brightLeft = {};
  cells.forEach((cell) => {
    brightLeft[cell.letter] = NO_BRIGHT.has(cell.char) ? 0 : 2;
  });

  // 밝은 이미지끼리 붙어 있으면 그 부분이 통째로 비어 보임
  const brightAt = new Set();
  const touchesBright = (cell) => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (brightAt.has(key(cell.letter, cell.lc + dx, cell.lr + dy))) return true;
      }
    }
    return false;
  };

  // 밝은 이미지부터 자리를 잡음
  const order = IMAGE_LIGHTNESS.map((_, i) => i).sort((a, b) => IMAGE_LIGHTNESS[b] - IMAGE_LIGHTNESS[a]);
  const taken = new Set();
  const cellForImage = [];

  order.forEach((image) => {
    const bright = IMAGE_LIGHTNESS[image] > BRIGHT;
    const slot =
      slots.find((s) => !taken.has(s.i) && (!bright || (brightLeft[s.cell.letter] > 0 && !touchesBright(s.cell)))) ??
      slots.find((s) => !taken.has(s.i));
    taken.add(slot.i);
    if (bright) {
      brightLeft[slot.cell.letter] -= 1;
      brightAt.add(key(slot.cell.letter, slot.cell.lc, slot.cell.lr));
    }
    cellForImage[image] = slot.cell;
  });

  return cellForImage;
}

const letters = layoutLetters();
const cellForImage = placeImages(letters.cells);
const COLUMNS = letters.columns;
const ROWS = letters.rows;

if (letters.cells.length !== 200) console.warn("Pixel letters need 200 cells:", letters.cells.length);

grid.style.setProperty("--cols", COLUMNS);
grid.style.setProperty("--rows", ROWS);

/* =========================================
   50 GARDEN TYPES
   4 images per type = 200 images
========================================= */

const gardenTypes = [
  "Absurd_fantasy", "Alien", "Aquarium_tunnel", "Balloon", "Burning_ice",
  "Cake", "Ceramic", "Cheese", "Construction_site", "Crystal",
  "Dinosaur", "Dreamcore", "Dragon", "Eyeball", "Faceless_statue",
  "Floating_island", "Food_market", "Future", "Galaxy", "Ghost",
  "Glass", "Glitch", "Giant_hand", "Inflatable", "Invisible",
  "Laundry", "Liquid_sky", "Mechanical_flower", "Melting", "Missile",
  "Mosaic", "Moon", "Mushroom", "Mutant_flower", "Nightmare",
  "Paper_cut", "Poison_flower", "Rainbow", "Robot", "Shadow",
  "Skeleton", "Snow_mountain", "space", "Surreal", "Tiny_world",
  "Toy", "Treasure", "Underwater", "Volcano", "Weird_wonderland"
];

/* =========================================
   CREATE 200 TILES
========================================= */

let imageNumber = 1;
const fragment = document.createDocumentFragment();

gardenTypes.forEach((type) => {
  for (let i = 0; i < 4; i++) {
    const formattedNumber =
      imageNumber < 100
        ? String(imageNumber).padStart(2, "0")
        : String(imageNumber);

    const fileName = `#${formattedNumber} ${type}_garden.jpg`;
    const imagePath = `images-small/${encodeURIComponent(fileName)}`;

    const cell = cellForImage[imageNumber - 1];
    const tile = document.createElement("div");
    tile.className = "garden-tile";
    tile.dataset.number = imageNumber;
    tile.dataset.col = cell.col;
    tile.dataset.row = cell.row;
    tile.style.setProperty("--col", cell.col);
    tile.style.setProperty("--row", cell.row);

    const imageWrapper = document.createElement("div");
    imageWrapper.className = "tile-image";

    const image = document.createElement("img");
    image.src = imagePath;
    image.alt = `${type.replaceAll("_", " ")} garden`;
    image.draggable = false;
    image.decoding = "async";

    image.addEventListener("error", () => {
      console.warn("Image could not be loaded:", fileName);
    });

    imageWrapper.appendChild(image);
    tile.appendChild(imageWrapper);
    fragment.appendChild(tile);

    imageNumber++;
  }
});

grid.appendChild(fragment);

/* =========================================
   CREATE 200 FRAGMENTS
   fragments/#01.png ~ #200.png (타일과 1:1)
========================================= */

const fragmentElements = [];
const fragmentFragment = document.createDocumentFragment();

for (let number = 1; number <= gardenTypes.length * 4; number++) {
  const formattedNumber =
    number < 100 ? String(number).padStart(2, "0") : String(number);

  const fileName = `#${formattedNumber}.png`;

  const piece = document.createElement("div");
  piece.className = "fragment";

  const image = document.createElement("img");
  image.src = `fragments-small/${encodeURIComponent(fileName)}`;
  image.alt = "";
  image.draggable = false;
  image.decoding = "async";

  image.addEventListener("error", () => {
    console.warn("Fragment could not be loaded:", fileName);
  });

  piece.appendChild(image);
  fragmentFragment.appendChild(piece);
  fragmentElements.push(piece);
}

fragmentLayer.appendChild(fragmentFragment);

/* =========================================
   SIZE
   글자 전체가 창 안에 들어가도록 한 칸 크기를 정함
========================================= */

let isFalling = false;
let isAssembling = false;
const tiles = [...grid.children];

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function fitGrid() {
  if (isFalling) return;
  const cell = Math.floor(Math.min(mosaic.clientWidth / COLUMNS, mosaic.clientHeight / ROWS) * 10) / 10;
  scene.style.setProperty("--cell", `${Math.max(cell, 4)}px`);

  // 유리의 흐림도 칸 크기에 맞춰 줄임 (창이 작아져도 글자가 보이게) — 큰 화면(칸 37px 이상)에서는 그대로
  // 크롬은 같은 값을 사파리보다 2.5~3배 강하게 흐리므로 1/3로 맞춤
  const engine = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent) ? 1 : 0.34;
  const ratio = Math.pow(clamp(cell / 37.5, 0.25, 1), 1.3) * engine;
  document.documentElement.style.setProperty("--frost-blur", `${(9 * ratio).toFixed(2)}px`);
  document.documentElement.style.setProperty("--edge-blur", `${(16 * ratio).toFixed(2)}px`);
}

fitGrid();
window.addEventListener("resize", fitGrid);

/* =========================================
   GLASS HOVER
   이미지 위에 있을 때만: 그 이미지가 살짝 커지고
   유리에 그 이미지보다 살짝 큰 동그란 구멍이 열림 (구멍은 부드럽게 따라감)
========================================= */

const glass = document.querySelector("#glass");
const panel = document.querySelector(".garden-panel");

const ACTIVE_SCALE = 1.6;   // .garden-tile.is-active 크기와 같게
const HOLE_MARGIN = 1.2;    // 커진 이미지보다 이만큼 더 큰 구멍

const hole = { x: -999, y: -999, r: 0, tx: -999, ty: -999, tr: 0 };
const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
let activeTile = null;

function setActiveTile(tile) {
  if (tile === activeTile) return;
  activeTile?.classList.remove("is-active");
  activeTile = tile;
  activeTile?.classList.add("is-active");
}

panel.addEventListener("pointermove", (event) => {
  if (isFalling || isAssembling) return;

  const panelRect = panel.getBoundingClientRect();
  parallax.tx = clamp(((event.clientX - panelRect.left) / panelRect.width - 0.5) * 2, -1, 1);
  parallax.ty = clamp(((event.clientY - panelRect.top) / panelRect.height - 0.5) * 2, -1, 1);

  setActiveTile(nearestTile(event.clientX, event.clientY));
});

// 커서에서 가장 가까운 이미지 (이미지 가장자리에서 REACH칸 안쪽이면 반응)
const REACH = 0.75;

function nearestTile(x, y) {
  const rect = grid.getBoundingClientRect();
  const cell = rect.width / COLUMNS;
  const px = (x - rect.left) / cell;
  const py = (y - rect.top) / cell;
  const size = 0.92; // .garden-tile 크기 (칸 대비)

  let best = null;
  let bestDistance = REACH;
  tiles.forEach((tile) => {
    const col = Number(tile.dataset.col);
    const row = Number(tile.dataset.row);
    const dx = Math.max(col - px, 0, px - (col + size));
    const dy = Math.max(row - py, 0, py - (row + size));
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance || (distance === 0 && best === null)) {
      bestDistance = distance;
      best = tile;
    }
  });
  return best;
}

// 구멍: 이미지 한가운데, 완전히 맑은 부분이 커진 이미지보다 살짝 크게
// (마스크는 반지름의 62%까지 완전히 투명 → 그 바깥으로 서서히 서리)
// 이미지가 패럴랙스로 움직이므로 매 프레임 다시 잼
function aimHole() {
  if (!activeTile) {
    hole.tr = 0;
    return;
  }
  const panelRect = panel.getBoundingClientRect();
  const rect = activeTile.getBoundingClientRect();
  hole.tx = rect.left + rect.width / 2 - panelRect.left;
  hole.ty = rect.top + rect.height / 2 - panelRect.top;
  hole.tr = ((rect.width * ACTIVE_SCALE) / 2) * HOLE_MARGIN / 0.62;
  if (hole.r < 1) {
    hole.x = hole.tx;
    hole.y = hole.ty;
  }
}

panel.addEventListener("pointerleave", () => {
  setActiveTile(null);
  hole.tr = 0;
  parallax.tx = parallax.ty = 0;
});

function animateGlass() {
  if (isFalling) return;

  aimHole();

  const instant = reduceMotion.matches;
  const follow = instant ? 1 : 0.24;
  hole.x += (hole.tx - hole.x) * follow;
  hole.y += (hole.ty - hole.y) * follow;
  hole.r += (hole.tr - hole.r) * (instant ? 1 : 0.2);
  if (hole.tr === 0 && hole.r < 0.5) hole.r = 0;

  parallax.x += (parallax.tx - parallax.x) * (instant ? 0 : 0.06);
  parallax.y += (parallax.ty - parallax.y) * (instant ? 0 : 0.06);

  glass.style.setProperty("--hx", `${hole.x.toFixed(1)}px`);
  glass.style.setProperty("--hy", `${hole.y.toFixed(1)}px`);
  // 반지름 0인 그라디언트는 사파리에서 유리 전체를 지워 버리므로 최소 1px
  glass.style.setProperty("--hr", `${Math.max(hole.r, 1).toFixed(1)}px`);
  glass.classList.toggle("has-hole", hole.r > 2);
  glass.style.setProperty("--par-x", parallax.x.toFixed(4));
  glass.style.setProperty("--par-y", parallax.y.toFixed(4));
  glass.style.setProperty("--light-x", `${(30 - parallax.x * 26).toFixed(2)}%`);
  glass.style.setProperty("--light-y", `${(22 - parallax.y * 20).toFixed(2)}%`);
  scene.style.setProperty("--par-x", parallax.x.toFixed(4));
  scene.style.setProperty("--par-y", parallax.y.toFixed(4));

  requestAnimationFrame(animateGlass);
}

animateGlass();

// 시작 전 준비: 인트로가 흰 입장 화면 뒤에 있는 동안 이미지를 미리 풀고,
// 유리 구멍(호버 효과)을 몇 번 그려 봐서 첫 호버가 바로 부드럽게 반응하도록
function warmUpIntro() {
  return new Promise((resolve) => {
    if (isFalling || !document.body.classList.contains("is-opening")) {
      resolve();
      return;
    }
    document.body.classList.add("is-warming");
    const images = [...document.querySelectorAll("#gardenGrid img")];
    const decoded = Promise.all(images.map((image) => (image.decode ? image.decode().catch(() => {}) : null)));
    const picks = tiles.filter((_, index) => index % 25 === 3);
    let index = 0;
    const step = () => {
      if (index < picks.length && document.body.classList.contains("is-opening")) {
        setActiveTile(picks[index++]);
        setTimeout(step, 120);
        return;
      }
      setActiveTile(null);
      setTimeout(() => {
        document.body.classList.remove("is-warming");
        resolve();
      }, 400);
    };
    Promise.race([decoded, new Promise((r) => setTimeout(r, 8000))]).then(step);
  });
}


/* =========================================
   ASSEMBLY (오프닝 영상의 흰 화면에서 첫 페이지로)
   1. 흰 화면 위로 200장이 화면 가득 격자로 촤라락 깔림 (왼쪽 위 → 오른쪽 아래 물결)
   2. 회색 판 · 유리 · 글자가 서서히 생기고, 동시에 이미지들이 BUILD YOUR OWN GARDEN 글자 자리로 이동
========================================= */

const SPREAD_WAVE = 900;      // ms. 깔리는 물결이 화면을 가로지르는 시간
const SPREAD_EACH = 520;      // ms. 한 장이 나타나는 시간
const SPREAD_HOLD = 300;      // ms. 다 깔린 뒤 잠깐 머묾
const GATHER_EACH = 1350;     // ms. 한 장이 글자 자리로 가는 시간
const GATHER_SPREAD = 450;    // ms. 출발 시간의 차이 (가까운 것부터)

function assembleIntro() {
  const body = document.body;
  body.classList.add("is-assembling");
  body.classList.remove("is-opening");

  if (reduceMotion.matches) {
    body.classList.remove("is-assembling");
    return;
  }

  isAssembling = true;
  setActiveTile(null);
  fitGrid();

  // 화면을 빈칸 없이 꽉 채우는 격자: 200을 나누어 떨어지는 가로×세로 중 칸이 가장 정사각형에 가까운 것
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const count = tiles.length;
  let cols = 1;
  let best = Infinity;
  for (let c = 1; c <= count; c++) {
    if (count % c) continue;
    const r = count / c;
    const off = Math.abs(Math.log((vw / c) / (vh / r)));
    if (off < best) {
      best = off;
      cols = c;
    }
  }
  const rows = count / cols;
  const cellW = vw / cols;
  const cellH = vh / rows;
  const size = Math.min(cellW, cellH) * 0.92;

  const plans = tiles.map((tile, index) => {
    const rect = tile.getBoundingClientRect(); // 글자 속 자리
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = (col + 0.5) * cellW - (rect.left + rect.width / 2);
    const y = (row + 0.5) * cellH - (rect.top + rect.height / 2);
    const scale = size / rect.width;
    return {
      tile,
      from: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(4)})`,
      appear: ((col / cols + row / rows) / 2) * SPREAD_WAVE + Math.random() * 70,
      distance: Math.hypot(x, y)
    };
  });

  const gatherAt = SPREAD_WAVE + SPREAD_EACH + SPREAD_HOLD;
  const far = Math.max(...plans.map((plan) => plan.distance), 1);

  plans.forEach((plan) => {
    // 1. 그 자리에서 살짝 커지며 나타남 (안쪽 이미지 층에서 — 위치는 2번 애니메이션이 잡고 있음)
    plan.tile.firstElementChild.animate(
      [{ opacity: 0, transform: "scale(0.55)" }, { opacity: 1, transform: "none" }],
      { duration: SPREAD_EACH, delay: plan.appear, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" }
    );
    // 2. 화면 격자 자리 → 글자 자리 (가까운 것부터 출발)
    plan.tile.animate(
      [{ transform: plan.from }, { transform: "none" }],
      {
        duration: GATHER_EACH,
        delay: gatherAt + (plan.distance / far) * GATHER_SPREAD,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        fill: "backwards"
      }
    );
  });

  // 이미지들이 움직이기 시작할 때 판 · 유리 · 글자가 생김
  setTimeout(() => body.classList.add("is-gathering"), gatherAt);

  setTimeout(() => {
    tiles.forEach((tile) => tile.getAnimations({ subtree: true }).forEach((animation) => animation.cancel()));
    body.classList.remove("is-assembling", "is-gathering");
    isAssembling = false;
  }, gatherAt + GATHER_SPREAD + GATHER_EACH + 120);
}


/* =========================================
   COLLAPSE
   [ START ] → 이미지가 무너져 떨어지고 카메라가 따라 내려감
   → 투명한 선을 통과할 때마다 번쩍
   → 선 아래로 같은 번호의 fragment가 나와 바닥에 쌓임
========================================= */

const GRAVITY = 2000;           // px/s²
const AIR_DRAG = 1.7;           // 공기 저항 (최고 속도 ≈ GRAVITY / AIR_DRAG)
const WAVE = 1.05;              // 초. 글자 전체가 무너지는 데 걸리는 시간 (왼쪽 아래 → 오른쪽 위)
const CAMERA_DELAY = 0.25;      // 초. 이미지가 먼저 움직이고 카메라가 뒤따름
const CAMERA_DURATION = 2.0;    // 초. 인트로 → 선과 바닥이 보이는 곳까지 (떨어지는 속도에 맞춤)
const MEMBRANE_DRAG = 0.4;      // 선을 통과하면서 느려지는 정도 (작을수록 많이 느려짐)
const FRAGMENT_SIZE = () => clamp(window.innerWidth * 0.0215, 18, 40); // fragment 최종 크기(px)
const PILE_OVERLAP = 0.7;       // 쌓일 때 겹치는 정도 (작을수록 촘촘하게 쌓임)
const BIN = 6;                  // 바닥 높이 계산 단위(px)
const REPOSE = 0.45;            // 더미가 버티는 경사 (클수록 뾰족하게, 작을수록 넓게 퍼짐)
const ROLL_SPEED = 260;         // 더미를 타고 굴러 내려가는 속도(px/s)

startButton.addEventListener("click", () => {
  if (isFalling || isAssembling) return;
  window.gardenSound?.start();

  startCollapse();
});

// 뒤로 가기로 돌아왔을 때 무너진 상태로 남아 있지 않게
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function startCollapse() {
  isFalling = true;
  setActiveTile(null);

  const scrollStart = window.scrollY;
  document.body.classList.add("is-falling"); // 아래 공간(abyss)이 나타남

  /* ---------- 1. 세계 좌표 측정 ---------- */

  const lineY = portalLine.getBoundingClientRect().top + scrollStart;
  const layerWidth = fragmentLayer.clientWidth;
  const layerHeight = fragmentLayer.clientHeight;

  const cameraEnd = abyss.offsetTop + abyss.offsetHeight - window.innerHeight;

  // 타일은 선보다 위에서만 보이고, 선에 가까워질수록 막 속으로 스며들듯 흐려짐
  // (선 아래로는 fragment가 대신 번져 나옴)
  const sceneTop = scene.getBoundingClientRect().top + scrollStart;
  const clipY = lineY - sceneTop;
  const maskImage =
    `linear-gradient(to bottom, #000 calc(100vh + ${(clipY - 46).toFixed(1)}px), ` +
    `rgba(0, 0, 0, 0.4) calc(100vh + ${(clipY - 16).toFixed(1)}px), ` +
    `transparent calc(100vh + ${clipY.toFixed(1)}px))`;

  // 마스크를 창 밖까지 넓힐 수 없는 브라우저(사파리)는 자르지 않고,
  // 이미지 하나하나가 띠 안에서 완전히 사라지도록 함 (아래 setHaze)
  // (사파리는 no-clip을 지원한다고 답하지만 실제로는 창 밖을 잘라 버림)
  const isSafari = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
  const softEdge = !isSafari && CSS.supports("mask-clip", "no-clip");

  // 떨어지며 창 밖으로 벗어나는 타일도 보이도록 마스크를 넉넉하게
  if (softEdge) Object.assign(scene.style, {
    webkitMaskImage: maskImage,
    maskImage,
    webkitMaskSize: "calc(100% + 200vw) calc(100% + 200vh)",
    maskSize: "calc(100% + 200vw) calc(100% + 200vh)",
    webkitMaskPosition: "-100vw -100vh",
    maskPosition: "-100vw -100vh",
    webkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    webkitMaskClip: "no-clip",
    maskClip: "no-clip"
  });

  // 바닥의 높이 지도 (fragment가 쌓인 높이)
  const floor = new Float32Array(Math.ceil(layerWidth / BIN) + 1);

  /* ---------- 2. 타일마다 물리 정보 ---------- */

  const fragmentSize = FRAGMENT_SIZE();

  const bodies = [...grid.children].map((tile, index) => {
    const rect = tile.getBoundingClientRect();
    const col = Number(tile.dataset.col);
    const row = Number(tile.dataset.row);

    return {
      tile,
      piece: fragmentElements[index],
      state: "waiting", // waiting → falling → transit → fragment → (rolling) → resting

      w: rect.width,
      h: rect.height,
      baseX: rect.left + rect.width / 2,
      baseY: rect.top + scrollStart + rect.height / 2,

      x: 0,
      y: 0,
      rotation: 0,
      restRotation: 0,
      scale: 1,

      // 물결처럼 차례로: 아래 줄 · 왼쪽부터 대각선으로 무너짐
      delay:
        (((ROWS - 1 - row) / (ROWS - 1)) * 0.55 + (col / COLUMNS) * 0.45) * WAVE +
        Math.random() * 0.04,

      // 거의 곧게 떨어지고, 종이처럼 살짝 좌우로 흔들리며 천천히 기울어짐
      vx: (Math.random() - 0.5) * 16,
      vy: 0,
      vr: (Math.random() - 0.5) * 36,
      swayAmp: 5 + Math.random() * 7,             // px
      swayRate: 2.4 + Math.random() * 1.6,        // rad/s
      swayPhase: Math.random() * Math.PI * 2,

      wobble: (Math.random() - 0.5) * 3,
      fragmentScale: fragmentSize / rect.width
    };
  });

  /* ---------- 3. 도우미 ---------- */

  function halfExtents(body, rotation = body.rotation) {
    const angle = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(angle));
    const cos = Math.abs(Math.cos(angle));
    const w = (body.w * body.scale) / 2;
    const h = (body.h * body.scale) / 2;

    return { hw: w * cos + h * sin, hh: w * sin + h * cos };
  }

  function binRange(centerX, halfWidth) {
    return [
      clamp(Math.floor((centerX - halfWidth) / BIN), 0, floor.length - 1),
      clamp(Math.floor((centerX + halfWidth) / BIN), 0, floor.length - 1)
    ];
  }

  // 가운데 60% 폭만 보고 높이를 정함 → 이웃 조각 사이로 살짝 파고들어 자연스럽게 겹침
  function surfaceUnder(centerX, halfWidth) {
    const [from, to] = binRange(centerX, halfWidth * 0.6);
    let top = 0;
    for (let k = from; k <= to; k++) top = Math.max(top, floor[k]);
    return top;
  }

  let energy = 0;
  let nearby = 0; // 이번 프레임에 띠 가까이 있는 이미지 수
  let glow = 0;   // 이미션 밝기
  let glowPeak = false; // 첫 이미지가 들어가는 순간의 번쩍임

  // 아직 움직이는 조각마다 "멈출 때까지 남은 시간"을 같은 물리로 미리 계산 → 가장 늦은 것
  function timeToRest(body) {
    if (body.state === "resting") return 0;
    if (body.state === "rolling") return 0.05;

    const tileHalf = halfExtents(body).hh;
    const restHalf = (body.h * body.fragmentScale) / 2;
    const floorY = lineY + layerHeight - surfaceUnder(body.baseX + body.x, restHalf) - restHalf;
    let y = body.baseY + body.y;
    let vy = body.vy;
    let crossed = body.state === "fragment";
    let t = body.state === "waiting" ? Math.max(0, body.delay - elapsed) : 0;
    const step = 1 / 60;

    for (let i = 0; i < 900 && y < floorY; i++) {
      vy += (GRAVITY - AIR_DRAG * vy) * step;
      y += vy * step;
      if (!crossed && y - tileHalf >= lineY) {
        vy *= MEMBRANE_DRAG;
        crossed = true;
      }
      t += step;
    }
    return t + 0.05;
  }

  function timeToSettle() {
    let remaining = 0;
    for (const body of bodies) remaining = Math.max(remaining, timeToRest(body));
    return remaining;
  }

  // 이미지가 띠 안을 지날 때 아주 살짝 더 밝아짐
  function flashAt() {
    energy = Math.min(energy + 0.08, 1);
    if (!glowPeak) {
      glowPeak = "rising";
      // 첫 이미지가 통과하는 순간부터 떨어지는 소리 — 마지막 조각이 자리 잡을 때 끝나도록 늘려서
      window.gardenSound?.fall(timeToSettle());
    }
  }

  // 띠에 가까워질수록 이미지가 옅어지고 흐려짐 → fragment는 흐리게 나타났다가 선명해짐
  const APPROACH = 90; // 선 위 이 거리부터 반응
  const EMERGE = 60;   // 선 아래 이 거리에서 완전히 선명

  function setHaze(element, amount, fadeTo) {
    const key = Math.round(amount * 20);
    if (element._haze === key) return;
    element._haze = key;
    element.style.opacity = key ? String(1 - (1 - fadeTo) * amount) : "";
    element.style.filter = key ? `blur(${(amount * 2.2).toFixed(2)}px)` : "";
  }

  /* ---------- 4. 바닥에 닿았을 때 ---------- */

  function land(body) {
    const { hw, hh } = halfExtents(body);
    let centerX = body.baseX + body.x;

    // 좌우 벽
    if (centerX - hw < 0) {
      body.x += hw - centerX;
      body.vx = Math.abs(body.vx) * 0.4;
      centerX = hw;
    } else if (centerX + hw > layerWidth) {
      body.x -= centerX + hw - layerWidth;
      body.vx = -Math.abs(body.vx) * 0.4;
      centerX = layerWidth - hw;
    }

    const surface = surfaceUnder(centerX, hw);
    const restY = layerHeight - surface - hh; // fragment-layer 안에서의 중심 위치
    const localY = body.baseY + body.y - lineY;

    if (localY < restY || body.vy <= 0) return;


    body.y = restY + lineY - body.baseY;

    // 빠르게 떨어졌으면 한 번 튕김
    if (body.vy > 260) {
      body.vy *= -0.22;
      body.vx *= 0.6;
      body.vr *= -0.4;
      return;
    }

    // 경사가 가파르면 더미를 타고 아래로 굴러감
    const target = downhillFrom(centerX, hw);

    if (Math.abs(target - centerX) > BIN) {
      body.state = "rolling";
      body.targetX = target;
      body.vx = body.vy = body.vr = 0;
      return;
    }

    settle(body, centerX);
  }

  // 옆이 충분히 낮으면 그쪽으로 한 칸씩 내려감 (완만해지면 멈춤 → 둥근 더미)
  function downhillFrom(centerX, hw) {
    let x = centerX;
    let here = surfaceUnder(x, hw);

    for (let i = 0; i < 400; i++) {
      const leftX = clamp(x - BIN, hw, layerWidth - hw);
      const rightX = clamp(x + BIN, hw, layerWidth - hw);
      const left = surfaceUnder(leftX, hw);
      const right = surfaceUnder(rightX, hw);

      const goLeft = left < right || (left === right && Math.random() < 0.5);
      const nextX = goLeft ? leftX : rightX;
      const next = goLeft ? left : right;

      if (next > here - BIN * REPOSE) break;

      x = nextX;
      here = next;
    }

    return x;
  }

  function roll(body, dt) {
    const { hw, hh } = halfExtents(body);
    const centerX = body.baseX + body.x;
    const distance = body.targetX - centerX;
    const maxStep = ROLL_SPEED * dt;
    const step = Math.sign(distance) * Math.min(Math.abs(distance), maxStep);
    const newX = centerX + step;

    body.x += step;
    body.rotation += step * 1.4; // 구르면서 회전
    body.y = layerHeight - surfaceUnder(newX, hw) - hh + lineY - body.baseY;

    if (Math.abs(distance) <= maxStep) {
      // 도착하면 다시 확인 (그 사이 다른 조각이 쌓였을 수 있음)
      const next = downhillFrom(newX, hw);
      if (Math.abs(next - newX) > BIN) body.targetX = next;
      else settle(body, newX);
    }
  }

  // 자리 잡기: 비스듬히 기대어 멈춤
  function settle(body, centerX) {
    body.state = "resting";
    body.vx = body.vy = body.vr = 0;

    const nearest = Math.round(body.rotation / 90) * 90;
    body.restRotation = nearest + clamp(body.rotation - nearest, -14, 14);

    // 바닥 높이 갱신: 가운데가 높고 가장자리가 낮은 둥근 모양
    const rest = halfExtents(body, body.restRotation);
    const surface = surfaceUnder(centerX, rest.hw);
    const [from, to] = binRange(centerX, rest.hw);
    const peak = rest.hh * 2 * PILE_OVERLAP;

    for (let k = from; k <= to; k++) {
      const offset = ((k + 0.5) * BIN - centerX) / rest.hw;
      const height = surface + peak * (1 - 0.7 * offset * offset);
      floor[k] = Math.max(floor[k], height);
    }
  }

  /* ---------- 5. 물리 한 스텝 ---------- */

  let elapsed = 0;

  function simulate(dt) {
    elapsed += dt;
    let active = 0;

    bodies.forEach((body) => {
      if (body.state === "resting") {
        // 멈춘 뒤 기울기만 부드럽게 정리
        body.rotation += (body.restRotation - body.rotation) * Math.min(1, dt * 10);
        return;
      }

      active++;

      if (body.state === "rolling") {
        roll(body, dt);
        return;
      }

      if (body.state === "waiting") {
        const untilFall = body.delay - elapsed;

        if (untilFall > 0) {
          // 떨어지기 직전: 블록이 불안하게 흔들림
          if (untilFall < 0.18) {
            body.rotation = Math.sin(elapsed * 55) * body.wobble * (1 - untilFall / 0.18);
          }
          return;
        }

        body.state = "falling";
      }

      body.vy += (GRAVITY - AIR_DRAG * body.vy) * dt;
      body.y += body.vy * dt;

      // 선을 지나기 전까지는 좌우로 살짝 흔들림
      const sway = body.state === "fragment"
        ? 0
        : body.swayAmp * body.swayRate * Math.cos(body.swayRate * elapsed + body.swayPhase);
      body.x += (body.vx + sway) * dt;
      body.vr *= body.state === "fragment" ? 0.985 : 0.995;
      body.rotation += body.vr * dt;

      const centerY = body.baseY + body.y;
      const { hh } = halfExtents(body);

      if (body.state === "falling" || body.state === "transit") {
        const gap = lineY - (centerY + hh);
        if (gap < APPROACH) nearby++;
        if (softEdge) {
          setHaze(body.tile.firstChild, clamp(1 - gap / APPROACH, 0, 1), 0.6);
        } else {
          // 가운데가 변환 높이에 닿을 때 완전히 사라짐
          setHaze(body.tile.firstChild, clamp(1 - (lineY - centerY) / (APPROACH + hh), 0, 1), 0);
        }
      }
      if (body.state === "transit" || body.state === "fragment") {
        const depth = centerY - lineY;
        setHaze(body.piece.firstChild, clamp(1 - depth / EMERGE, 0, 1), 0.7);
      }

      // 선에 닿는 순간: 선이 밝아짐 + fragment 등장
      if (body.state === "falling" && centerY + hh >= lineY) {
        body.state = "transit";
        roundImage(body.piece.querySelector("img"), body.w, body.h);
        body.piece.classList.add("is-visible");
        flashAt();
      }

      // 완전히 통과: 타일은 사라지고 fragment만 남아 느려짐
      if (body.state === "transit" && centerY - hh >= lineY) {
        body.state = "fragment";
        body.tile.style.visibility = "hidden";
        body.vy *= MEMBRANE_DRAG;
        body.vx *= 0.6;
        body.vr *= 0.5;
      }

      if (body.state === "fragment") {
        body.scale += (body.fragmentScale - body.scale) * Math.min(1, dt * 6);
        land(body);
      }
    });

    // 가까이 온 이미지가 많을수록 띠가 아주 조금 밝아짐
    const target = Math.min(nearby / 14, 1) * 0.8;
    energy += (Math.max(target, energy * Math.pow(0.2, dt)) - energy) * Math.min(1, dt * 4);

    // 이미션: 첫 이미지가 들어가면 빠르게 최고 밝기로 → 이후 지나가는 양만큼만 남기며 천천히 잦아듦
    if (glowPeak === "rising") {
      glow += (1 - glow) * Math.min(1, dt * 14);
      if (glow > 0.97) glowPeak = "done";
    } else if (glowPeak === "done") {
      const rest = Math.min(nearby / 14, 1) * 0.45;
      glow += (rest - glow) * Math.min(1, dt * (rest < glow ? 0.9 : 3));
    }
    nearby = 0;
    return active;
  }

  /* ---------- 6. 그리기 ---------- */

  function render() {
    const progress = clamp((elapsed - CAMERA_DELAY) / CAMERA_DURATION, 0, 1);
    const cameraY = scrollStart + (cameraEnd - scrollStart) * easeInOutCubic(progress);
    world.style.transform = `translate3d(0, ${(scrollStart - cameraY).toFixed(1)}px, 0)`;

    portalLine.style.setProperty("--energy", Math.max(0, energy).toFixed(3));
    portalLine.style.setProperty("--glow", Math.max(0, glow).toFixed(3));

    bodies.forEach((body) => {
      const transform =
        `rotate(${body.rotation.toFixed(2)}deg)`;

      if (body.state === "waiting" || body.state === "falling" || body.state === "transit") {
        body.tile.style.transform =
          `translate3d(${body.x.toFixed(1)}px, ${body.y.toFixed(1)}px, 0) ${transform}`;
      }

      if (body.state !== "waiting" && body.state !== "falling") {
        const left = body.baseX + body.x - body.w / 2;
        const top = body.baseY + body.y - lineY - body.h / 2;

        body.piece.style.width = `${body.w}px`;
        body.piece.style.height = `${body.h}px`;
        body.piece.style.transform =
          `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0) ` +
          `${transform} scale(${body.scale.toFixed(3)})`;
      }
    });
  }

  function finish() {
    // 애니메이션이 멈춰도 빛이 그 밝기로 굳지 않게: 천천히 잦아들도록 넘김
    portalLine.classList.add("is-resting");
    portalLine.style.setProperty("--energy", "0");
    portalLine.style.setProperty("--glow", "0");

    // 다음 단계(builder.js)가 쌓인 조각을 그대로 이어받을 수 있도록 알림
    document.dispatchEvent(new CustomEvent("garden:landed", {
      detail: {
        pieces: bodies.map((body) => ({
          element: body.piece,
          rotation: body.rotation,
          width: body.w * body.scale,
          height: body.h * body.scale
        }))
      }
    }));
  }

  /* ---------- 7. 실행 ---------- */

  // 동작 줄이기 설정: 애니메이션 없이 결과(쌓인 상태)만 바로 보여줌
  if (reduceMotion.matches) {
    for (let i = 0; i < 60 * 20 && simulate(1 / 60) > 0; i++);
    elapsed = CAMERA_DELAY + CAMERA_DURATION;
    energy = 0;
    bodies.forEach((body) => { body.rotation = body.restRotation; });
    render();
    finish();
    return;
  }

  let lastTime = performance.now();
  let settledAt = null;

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;

    const active = simulate(dt);
    render();

    // 모두 자리 잡고 기울기 정리까지 끝나면 멈춤
    if (active === 0 && elapsed > CAMERA_DELAY + CAMERA_DURATION) {
      settledAt ??= elapsed;
      if (elapsed - settledAt > 0.6) {
        finish();
        return;
      }
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
