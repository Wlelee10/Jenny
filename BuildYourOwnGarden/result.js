/* =========================================
   BUILD YOUR OWN GARDEN
   RESULT
   FINISH → 완성한 정원 / AI LIBRARY / HUMAN GALLERY (파일 인덱스)
========================================= */

(() => {
  const result = document.querySelector("#result");
  if (!result) return;

  const $ = (selector) => result.querySelector(selector);

  const folders = [...result.querySelectorAll(".folder")];
  const resultCanvas = $("#resultCanvas");
  const titleInput = $("#gardenTitle");
  const titleField = $("#titleField");
  const creatorInput = $("#gardenCreator");
  const creatorField = $("#creatorField");
  const resultTime = $("#resultTime");
  const resultTotal = $("#resultTotal");
  const resultSelected = $("#resultSelected");
  const resultRejected = $("#resultRejected");
  const saveButton = $("#saveButton");
  const saveNote = $("#saveNote");
  const aiLibraryGrid = $("#aiLibraryGrid");
  const galleryGrid = $("#galleryGrid");
  const galleryEmpty = $("#galleryEmpty");
  const saveDialog = $("#saveDialog");
  const dialogClose = $("#dialogClose");
  const downloadButton = $("#downloadButton");
  const viewGalleryButton = $("#viewGalleryButton");
  const backButton = $("#backButton");
  const viewer = $("#viewer");
  const viewerFrame = viewer.querySelector(".viewer-frame");
  const viewerFigure = viewer.querySelector(".viewer-figure");
  const viewerImage = $("#viewerImage");
  const viewerCaption = $("#viewerCaption");
  const viewerLikeSlot = $("#viewerLikeSlot");
  const viewerNavs = [...viewer.querySelectorAll(".viewer-nav")];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
  const POLL_MS = 5000;           // 휴먼 갤러리 새로고침 간격 (다른 사람이 저장한 정원)
  const LOCAL_KEY = "byog-gardens";
  const LIKED_KEY = "byog-liked";  // 이 브라우저에서 좋아요를 누른 정원들

  let finished = null;            // builder.js가 넘겨준 결과
  let stageClone = null;
  let activeTab = "build";
  let savedEntry = null;
  let savedBlob = null;
  let pollTimer = null;
  let hideBuilderTimer = null;
  let titleFocusTimer;
  let arriveTimer = null;

  const pad2 = (n) => String(n).padStart(2, "0");

  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = pad2(Math.floor((seconds % 3600) / 60));
    const rest = pad2(seconds % 60);
    return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
  }

  /* =========================================
     STORE
     config.js에 Supabase가 설정되어 있으면 → 모든 방문자가 같은 휴먼 갤러리 (GitHub Pages에서도)
     아니면 server.py로 열었을 때 → 그 서버를 함께 씀
     둘 다 아니면 → 이 브라우저 안에만 저장
  ========================================= */

  const cloud = window.GARDEN_CLOUD ?? {};
  const cloudBase = String(cloud.url ?? "").trim().replace(/\/+$/, "");
  const cloudKey = String(cloud.key ?? "").trim();
  const CLOUD_BUCKET = "gardens";

  // 예전 형식(eyJ… JWT) 키는 Authorization에도 넣고, 새 형식(sb_publishable_…) 키는 apikey로만 보냄
  const cloudHeaders = (extra = {}) => ({
    apikey: cloudKey,
    ...(cloudKey.startsWith("eyJ") ? { Authorization: `Bearer ${cloudKey}` } : {}),
    ...extra
  });
  const cloudImage = (file) => `${cloudBase}/storage/v1/object/public/${CLOUD_BUCKET}/${encodeURIComponent(file)}`;
  const fromCloud = (row) => ({
    id: String(row.id),
    title: row.title,
    creator: row.creator || "",
    fragments: row.fragments,
    seconds: row.seconds,
    image: cloudImage(row.image),
    likes: Number(row.likes) || 0,
    createdAt: Date.parse(row.created_at)
  });

  function newFileName() {
    const id = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${id}.jpg`;
  }

  // 제목 없이 저장된 정원을 한 번 정리 (이 브라우저에 저장된 것)
  try {
    const PURGED_KEY = "byog-untitled-purged";
    if (!localStorage.getItem(PURGED_KEY)) {
      const list = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
      const kept = list.filter((entry) => String(entry.title ?? "").trim() && entry.title !== "UNTITLED GARDEN");
      if (kept.length !== list.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(kept));
      localStorage.setItem(PURGED_KEY, "1");
    }
  } catch {
    // 저장소를 쓸 수 없으면 건너뜀
  }

  const store = {
    mode: null,
    likesShared: null, // Supabase에 likes 칸과 like_garden 함수가 있으면 true (모두가 같은 숫자를 봄)

    async detect() {
      if (this.mode) return this.mode;
      if (cloudBase && cloudKey) {
        this.mode = "cloud";
        return this.mode;
      }
      try {
        const response = await fetch("api/gardens", { cache: "no-store" });
        const type = response.headers.get("content-type") ?? "";
        this.mode = response.ok && type.includes("json") ? "server" : "local";
      } catch {
        this.mode = "local";
      }
      return this.mode;
    },

    async list() {
      if ((await this.detect()) === "cloud") {
        // 있는 칸은 모두 (likes · creator 칸이 아직 없는 서버여도 그대로 동작)
        const response = await fetch(
          `${cloudBase}/rest/v1/gardens?select=*&order=created_at.asc`,
          { headers: cloudHeaders(), cache: "no-store" }
        );
        if (!response.ok) throw new Error("Could not load the gallery.");
        const rows = await response.json();
        if (rows.length) this.likesShared = "likes" in rows[0];
        else this.likesShared ??= true;
        return rows.map(fromCloud);
      }
      if (this.mode === "server") {
        const response = await fetch("api/gardens", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load the gallery.");
        return response.json();
      }
      try {
        return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
      } catch {
        return [];
      }
    },

    // 좋아요 +1 / -1 → 새 숫자 (모두가 공유할 수 없으면 null)
    async like(id, on) {
      if (this.mode !== "cloud" || !this.likesShared) return null;
      const response = await fetch(`${cloudBase}/rest/v1/rpc/like_garden`, {
        method: "POST",
        headers: cloudHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ garden_id: id, delta: on ? 1 : -1 })
      });
      if (!response.ok) throw new Error("Could not update the like.");
      const count = await response.json();
      return typeof count === "number" ? count : null;
    },

    async save(entry, board) {
      if ((await this.detect()) === "cloud") {
        // 1. 이미지 올리기 (1600px JPEG — 화질은 유지하면서 가볍게)
        const blob = await new Promise((resolve) => board.toBlob(resolve, "image/jpeg", 0.92));
        const file = newFileName();
        const upload = await fetch(`${cloudBase}/storage/v1/object/${CLOUD_BUCKET}/${file}`, {
          method: "POST",
          headers: cloudHeaders({ "Content-Type": "image/jpeg", "x-upsert": "false" }),
          body: blob
        });
        if (!upload.ok) throw new Error("The garden image could not be uploaded.");

        // 2. 목록에 한 줄 추가
        const row = {
          title: entry.title,
          fragments: entry.fragments,
          seconds: entry.seconds,
          image: file
        };
        if (entry.creator) row.creator = entry.creator;
        const send = (body) => fetch(`${cloudBase}/rest/v1/gardens`, {
          method: "POST",
          headers: cloudHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
          body: JSON.stringify(body)
        });
        let insert = await send(row);
        // 서버에 creator 칸이 아직 없으면 이름 없이라도 저장
        if (!insert.ok && row.creator) {
          delete row.creator;
          insert = await send(row);
        }
        if (!insert.ok) throw new Error("The garden could not be saved.");
        const [saved] = await insert.json();
        return fromCloud(saved);
      }

      if (this.mode === "server") {
        const response = await fetch("api/gardens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...entry, image: board.toDataURL("image/png") })
        });
        if (!response.ok) throw new Error("The garden could not be saved.");
        return response.json();
      }

      // 이 브라우저에만: 용량을 줄인 JPEG로 저장
      const small = document.createElement("canvas");
      small.width = 720;
      small.height = 720;
      small.getContext("2d").drawImage(board, 0, 0, 720, 720);

      const saved = {
        ...entry,
        id: `local-${Date.now()}`,
        image: small.toDataURL("image/jpeg", 0.86),
        createdAt: Date.now()
      };

      const list = await this.list();
      list.push(saved);
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
      } catch {
        throw new Error("Browser storage is full.");
      }
      return saved;
    }
  };

  /* =========================================
     ENTER: 빌더의 캔버스가 폴더 속 자리로 날아감
  ========================================= */

  document.addEventListener("garden:finished", (event) => {
    finished = event.detail;

    const sourceRect = finished.canvas.getBoundingClientRect();

    // 캔버스 내용 그대로 복제 (자르기 중 흔적은 제외) — 다시 FINISH하면 새로 복제
    stageClone?.remove();
    stageClone = finished.canvas.querySelector(".canvas-stage").cloneNode(true);
    stageClone.removeAttribute("id");
    stageClone.querySelectorAll(".crop-ghost, .cut-ghost").forEach((ghost) => ghost.remove());
    stageClone.querySelectorAll(".canvas-item").forEach((item) => {
      item.classList.remove("is-lifted");
      item.removeAttribute("data-uid");
      item.style.clipPath = "";
    });
    resultCanvas.style.backgroundColor = finished.background;
    resultCanvas.appendChild(stageClone);

    // 숫자 (멈춘 값)
    resultTime.textContent = finished.time || formatTime(finished.seconds);
    resultTotal.textContent = finished.total;
    resultSelected.textContent = pad2(finished.fragments);
    resultRejected.textContent = pad2(finished.total - finished.fragments);

    // 항상 BUILD 폴더가 앞에서 시작
    activeTab = "build";
    folders.forEach((folder) => folder.classList.toggle("is-active", folder.dataset.folder === "build"));
    stopGallery();
    backButton.hidden = false;

    result.hidden = false;
    result.classList.remove("is-returning");
    fitStage();
    buildLibrary();
    store.detect();

    const targetRect = resultCanvas.getBoundingClientRect();
    const quick = reduceMotion.matches;

    // 빌더는 사라지고, 폴더와 글자가 캔버스 주변으로 서서히 나타남
    // (캔버스는 날아가는 중에도 보여야 하므로 바탕과 글자만 흐리게 시작)
    // 앞 폴더가 다 채워질 때까지 뒤 폴더(AI LIBRARY 등)는 비치지 않게 숨김
    finished.builder.classList.remove("is-returning");
    finished.builder.classList.add("is-leaving");
    result.classList.add("is-entering", "is-arriving");
    result.offsetWidth;
    requestAnimationFrame(() => result.classList.remove("is-entering"));

    clearTimeout(arriveTimer);
    arriveTimer = setTimeout(() => result.classList.remove("is-arriving"), quick ? 0 : 1300);

    // FINISH 누르자마자 이름 칸에 커서가 깜빡이며 입력 대기
    clearTimeout(titleFocusTimer);
    titleFocusTimer = setTimeout(() => {
      if (savedEntry || result.hidden || activeTab !== "build") return;
      titleInput.focus({ preventScroll: true });
    }, 0);

    // 캔버스: 빌더 자리 → 폴더 속 자리 (FLIP)
    flyCanvas(sourceRect, targetRect, false);

    clearTimeout(hideBuilderTimer);
    hideBuilderTimer = setTimeout(() => {
      finished.builder.hidden = true;
    }, quick ? 0 : 900);
  });

  // from/to 화면 위치 사이를 캔버스가 날아감 (back = 빌더로 돌아가는 방향)
  function flyCanvas(sourceRect, targetRect, back) {
    const quick = reduceMotion.matches;
    const dx = sourceRect.left - targetRect.left;
    const dy = sourceRect.top - targetRect.top;
    const scale = sourceRect.width / targetRect.width;
    const away = `translate(${dx}px, ${dy}px) scale(${scale})`;
    const frames = [
      { transform: away, boxShadow: "0 0 0 rgba(0,0,0,0)" },
      { transform: "none", boxShadow: "0 30px 50px -40px rgba(0,0,0,0.35)" }
    ];

    return resultCanvas.animate(back ? frames.reverse() : frames, {
      duration: quick ? 1 : back ? 900 : 1100,
      easing: EASE,
      fill: back ? "forwards" : "none"
    });
  }

  /* =========================================
     BACK TO CANVAS
     저장하기 전까지는 캔버스로 돌아가 이어서 수정할 수 있음
  ========================================= */

  backButton.addEventListener("click", () => {
    if (savedEntry) {
      buildAnother();
      return;
    }
    if (!finished || savedEntry || result.classList.contains("is-returning")) return;

    const quick = reduceMotion.matches;
    const builder = finished.builder;
    const fromRect = resultCanvas.getBoundingClientRect();

    // BUILD 폴더를 앞으로 (다른 탭을 보고 있었다면)
    activeTab = "build";
    folders.forEach((folder) => folder.classList.toggle("is-active", folder.dataset.folder === "build"));
    stopGallery();
    closeDialog();

    // 빌더를 다시 보이게 하고 캔버스 자리를 잼
    clearTimeout(hideBuilderTimer);
    builder.hidden = false;
    builder.classList.add("is-returning");
    builder.offsetWidth;
    builder.classList.remove("is-leaving");
    const toRect = finished.canvas.getBoundingClientRect();

    result.classList.add("is-returning");
    const flight = flyCanvas(toRect, fromRect, true);

    // 애니메이션이 끝나면(또는 탭이 가려져 멈춰 있어도 시간이 지나면) 한 번만 마무리
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      result.hidden = true;
      result.classList.remove("is-returning");
      flight.cancel();
      builder.classList.remove("is-returning");
      document.dispatchEvent(new CustomEvent("garden:resume"));
    };

    flight.finished.then(finish, finish);
    setTimeout(finish, quick ? 0 : 1000);
  });

  // 복제한 1000×1000 캔버스를 자리 크기에 맞춤
  function fitStage() {
    if (!stageClone) return;
    const size = resultCanvas.clientWidth;
    stageClone.style.transform = `scale(${size / 1000})`;
  }

  new ResizeObserver(fitStage).observe(resultCanvas);

  /* =========================================
     BUILD ANOTHER GARDEN
     저장한 뒤: 빈 캔버스의 빌더로 바로 돌아가 새 정원을 만듦 (조각은 라이브러리에 그대로)
  ========================================= */

  // 흰 화면에 0과 1로 된 원이 도는 로딩 (첫 화면의 로딩 원과 같은 모양)
  function showAnotherLoading() {
    const overlay = document.createElement("div");
    overlay.className = "another-loading";
    overlay.setAttribute("role", "progressbar");
    overlay.setAttribute("aria-label", "Loading");
    const ring = document.createElement("div");
    ring.className = "another-ring";
    const RING = 18;
    const chars = [];
    for (let i = 0; i < RING; i++) {
      const span = document.createElement("span");
      const angle = (i / RING) * 360;
      span.style.transform = `translate(-50%, -50%) rotate(${angle}deg) translateY(calc(-19 * var(--u))) rotate(${-angle}deg)`;
      span.textContent = Math.random() < 0.5 ? "0" : "1";
      ring.appendChild(span);
      chars.push(span);
    }
    overlay.appendChild(ring);
    document.body.appendChild(overlay);

    // 진한 글자가 원을 따라 옮겨 가고 뒤로 옅어지는 꼬리
    let head = 0;
    const timer = setInterval(() => {
      head = (head + 1) % RING;
      chars.forEach((span, i) => {
        const t = ((head - i + RING) % RING) / (RING - 1);
        const shade = Math.round(17 + (215 - 17) * Math.min(1, t * 1.25));
        span.style.color = `rgb(${shade}, ${shade}, ${shade})`;
      });
      if (Math.random() < 0.35) {
        const span = chars[Math.floor(Math.random() * RING)];
        span.textContent = span.textContent === "0" ? "1" : "0";
      }
    }, 70);

    overlay.offsetWidth;
    overlay.classList.add("is-visible");
    return {
      hide(quick) {
        overlay.classList.add("is-leaving");
        setTimeout(() => {
          clearInterval(timer);
          overlay.remove();
        }, quick ? 0 : 460);
      }
    };
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  let buildingAnother = false;

  async function buildAnother() {
    if (!finished || buildingAnother || result.classList.contains("is-returning")) return;
    buildingAnother = true;
    const builder = finished.builder;
    const quick = reduceMotion.matches;

    // 1. 로딩 화면이 먼저 다 덮음 (저장한 정원 이미지가 남아 보이지 않게)
    const loading = showAnotherLoading();
    const shownAt = performance.now();
    await wait(quick ? 0 : 300);

    // 2. 덮인 뒤에서: 결과 화면을 치우고 빌더를 빈 캔버스로
    closeDialog();
    if (!viewer.hidden) closeViewer();
    stopGallery();
    clearTimeout(hideBuilderTimer);
    result.hidden = true;
    resetResult();
    builder.hidden = false;
    builder.classList.remove("is-leaving");
    document.dispatchEvent(new CustomEvent("garden:new"));

    // 3. 화면이 다 그려지고, 로딩이 너무 짧게 깜빡이지 않도록 조금 기다렸다가 걷음
    await nextFrame();
    await wait(Math.max(0, (quick ? 300 : 1100) - (performance.now() - shownAt)));
    loading.hide(quick);
    buildingAnother = false;
  }

  // 다음 정원을 위해 결과 화면을 처음 상태로
  function resetResult() {
    finished = null;
    savedEntry = null;
    savedBlob = null;
    stageClone?.remove();
    stageClone = null;
    titleInput.value = "";
    creatorInput.value = "";
    titleInput.readOnly = false;
    creatorInput.readOnly = false;
    markTitle();
    fitTitle();
    saveButton.disabled = false;
    saveButton.textContent = "SAVE & SHARE";
    saveButton.classList.remove("is-saved");
    saveNote.textContent = "";
    backButton.textContent = "[ BACK TO CANVAS ]";
    backButton.disabled = false;
    backButton.hidden = false;
    activeTab = "build";
    folders.forEach((folder) => folder.classList.toggle("is-active", folder.dataset.folder === "build"));
    galleryGrid.querySelectorAll(".card.is-mine").forEach((card) => card.classList.remove("is-mine"));
  }

  /* =========================================
     FOLDER TABS
     마우스를 올리면 파일이 살짝 올라오고,
     누르면 위로 꺼냈다가 맨 앞에 꽂힘
  ========================================= */

  function showTab(name) {
    if (name === activeTab) return;
    if (!viewer.hidden) closeViewer();

    const next = folders.find((folder) => folder.dataset.folder === name);
    const quick = reduceMotion.matches;
    activeTab = name;

    // 꺼내는 동안 뒤에 있다가 가장 높이 올라왔을 때 맨 앞으로
    next.classList.add("is-pulling");
    next.animate(
      [
        { transform: "translateY(-10px)" },
        { transform: "translateY(-46px)", offset: 0.42 },
        { transform: "translateY(0)" }
      ],
      { duration: quick ? 1 : 620, easing: "cubic-bezier(0.45, 0, 0.2, 1)" }
    );

    setTimeout(() => {
      folders.forEach((folder) => folder.classList.toggle("is-active", folder === next));
      next.classList.remove("is-pulling");
    }, quick ? 0 : 250);

    if (name === "gallery") startGallery();
    else stopGallery();
  }

  folders.forEach((folder) => {
    folder.querySelector(".folder-tab").addEventListener("click", () => showTab(folder.dataset.folder));
  });

  /* =========================================
     AI LIBRARY: #01 ~ #200 + 파일 이름
  ========================================= */

  let libraryBuilt = false;

  function buildLibrary() {
    if (libraryBuilt) return;
    libraryBuilt = true;

    const types = typeof gardenTypes !== "undefined" ? gardenTypes : [];
    const fragment = document.createDocumentFragment();
    let number = 1;

    types.forEach((type) => {
      for (let i = 0; i < 4; i++) {
        const label = number < 100 ? pad2(number) : String(number);
        const name = `${type}_garden`;
        fragment.appendChild(makeCard({
          src: `images-medium/${encodeURIComponent(`#${label} ${name}.jpg`)}`,
          full: `images-large/${encodeURIComponent(`#${label} ${name}.jpg`)}`, // 원본 해상도 (확대 보기)
          alt: `${name.replaceAll("_", " ")} ${label}`,
          lines: [`#${label}`, name]
        }));
        number++;
      }
    });

    aiLibraryGrid.appendChild(fragment);
  }

  // 설명 한 줄 (문자열, 또는 { text, kind } — kind: title · by · meta)
  // 제목과 이름은 사용자 입력 → 글자로만 넣음
  function captionLine(line) {
    const row = document.createElement("span");
    row.textContent = typeof line === "string" ? line : line.text;
    if (line.kind) row.className = `caption-${line.kind}`;
    return row;
  }

  function makeCard({ src, full, alt, lines, id, lazy = true }) {
    const card = document.createElement("figure");
    card.className = "card";
    if (id) card.dataset.id = id;
    card.viewer = { src, full, alt, lines }; // 확대 보기에서 씀

    const frame = document.createElement("div");
    frame.className = "card-image";

    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.loading = lazy ? "lazy" : "eager";
    image.decoding = "async";
    image.draggable = false;
    image.addEventListener("load", () => card.classList.add("is-loaded"), { once: true });
    if (image.complete && image.naturalWidth) card.classList.add("is-loaded");

    const caption = document.createElement("figcaption");
    caption.append(...lines.map(captionLine));

    frame.appendChild(image);
    card.append(frame, caption);
    return card;
  }

  /* =========================================
     HUMAN GALLERY
     저장된 순서대로. 다른 사람이 저장하면 몇 초 안에 나타남
  ========================================= */

  const shownGardens = new Set();
  const gardenEntries = new Map(); // id → { likes }
  const pendingLikes = new Set();  // 서버 응답을 기다리는 중

  let liked;
  try {
    liked = new Set(JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]"));
  } catch {
    liked = new Set();
  }

  function saveLiked() {
    try {
      localStorage.setItem(LIKED_KEY, JSON.stringify([...liked]));
    } catch {
      // 저장소를 쓸 수 없으면 이번 방문 동안만 기억
    }
  }

  // 좋아요 수: 공유되면 서버 숫자, 아니면 이 브라우저에서 누른 것만
  function likeCount(id) {
    if (store.likesShared) return gardenEntries.get(id)?.likes ?? 0;
    return liked.has(id) ? 1 : 0;
  }

  const HEART = "M12 20.6s-7.4-4.5-9.4-9C1.2 8.3 3.1 4.6 6.7 4.6c2 0 3.6 1.1 5.3 3.1 1.7-2 3.3-3.1 5.3-3.1 3.6 0 5.5 3.7 4.1 7C19.4 16.1 12 20.6 12 20.6z";

  function makeLikeButton(id) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "like-button";
    button.dataset.likeId = id;
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART}" /></svg><span class="like-count"></span>`;
    paintLike(button);
    return button;
  }

  function paintLike(button) {
    const id = button.dataset.likeId;
    const on = liked.has(id);
    button.classList.toggle("is-liked", on);
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? "Unlike" : "Like");
    button.querySelector(".like-count").textContent = String(likeCount(id));
  }

  function paintLikes(id) {
    result.querySelectorAll(`.like-button[data-like-id="${CSS.escape(id)}"]`).forEach(paintLike);
  }

  async function toggleLike(id, button) {
    if (pendingLikes.has(id)) return;
    const on = !liked.has(id);
    const entry = gardenEntries.get(id) ?? { likes: 0 };
    gardenEntries.set(id, entry);

    // 먼저 화면에 바로 반영
    if (on) liked.add(id);
    else liked.delete(id);
    if (store.likesShared) entry.likes = Math.max(0, entry.likes + (on ? 1 : -1));
    saveLiked();
    paintLikes(id);
    if (on && button && !reduceMotion.matches) {
      result.querySelectorAll(`.like-button[data-like-id="${CSS.escape(id)}"]`).forEach((b) => {
        b.classList.remove("is-popping");
        void b.offsetWidth;
        b.classList.add("is-popping");
      });
    }

    pendingLikes.add(id);
    try {
      const count = await store.like(id, on);
      if (count !== null) entry.likes = count;
    } catch {
      // 실패하면 되돌림
      if (on) liked.delete(id);
      else liked.add(id);
      if (store.likesShared) entry.likes = Math.max(0, entry.likes + (on ? -1 : 1));
      saveLiked();
    } finally {
      pendingLikes.delete(id);
      paintLikes(id);
    }
  }

  async function refreshGallery() {
    let list;
    try {
      list = await store.list();
    } catch {
      return;
    }

    list.forEach((entry) => {
      // 이미 있는 카드는 좋아요 수만 새로 (내가 누르고 응답을 기다리는 중이면 그대로)
      if (!pendingLikes.has(entry.id)) gardenEntries.set(entry.id, { likes: entry.likes ?? 0 });

      if (shownGardens.has(entry.id)) {
        paintLikes(entry.id);
        return;
      }
      shownGardens.add(entry.id);

      const card = makeCard({
        id: entry.id,
        src: entry.image,
        alt: entry.title,
        lazy: false,
        // 제목(굵고 크게) / Created by 이름 / 사용 개수 – 걸린 시간
        lines: [
          { text: entry.title, kind: "title" },
          ...(entry.creator ? [{ text: `Created by ${entry.creator}`, kind: "by" }] : []),
          { text: `${entry.fragments} /200 fragments – ${formatTime(entry.seconds)}`, kind: "meta" }
        ]
      });
      card.classList.add("card-human");
      // 제목 옆 오른쪽 끝에 하트
      const head = document.createElement("div");
      head.className = "caption-head";
      const caption = card.querySelector("figcaption");
      head.append(caption.querySelector(".caption-title"), makeLikeButton(entry.id));
      caption.prepend(head);
      if (savedEntry && entry.id === savedEntry.id) card.classList.add("is-mine");
      galleryGrid.appendChild(card);
    });

    galleryEmpty.hidden = shownGardens.size > 0;
  }

  function startGallery() {
    refreshGallery();
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshGallery, POLL_MS);
  }

  function stopGallery() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  /* =========================================
     VIEWER: 사진을 누르면 살짝 확대되어 크게 보임
     < > (또는 키보드 ← →, 밀기)로 다음 장, 어두운 곳을 누르면 다시 갤러리로
  ========================================= */

  let viewerGrid = null;
  let viewerIndex = 0;

  const viewerCards = () => (viewerGrid ? [...viewerGrid.querySelectorAll(".card")] : []);

  function fillViewer(card) {
    const { src, full, alt, lines } = card.viewer;
    viewerImage.src = src;
    viewerImage.alt = alt;

    // 원본 해상도가 있으면: 받아지는 대로 같은 자리에 바꿔 끼움
    if (full) {
      const sharp = new Image();
      sharp.decoding = "async";
      sharp.onload = () => {
        if (viewerImage.dataset.want === full) viewerImage.src = full;
      };
      sharp.src = full;
    }
    viewerImage.dataset.want = full ?? "";
    viewerCaption.replaceChildren(...lines.map(captionLine));
    viewerCaption.classList.toggle("is-human", lines.some((line) => line.kind));
    viewerLikeSlot.replaceChildren();
    if (viewerGrid === galleryGrid && card.dataset.id) {
      viewerLikeSlot.appendChild(makeLikeButton(card.dataset.id));
    }
    const cards = viewerCards();
    viewerNavs[0].disabled = viewerIndex <= 0;
    viewerNavs[1].disabled = viewerIndex >= cards.length - 1;
  }

  // 카드의 사진 자리 → 확대 자리 (FLIP)
  function frameFlight(card) {
    const from = card.querySelector(".card-image").getBoundingClientRect();
    const to = viewerFrame.getBoundingClientRect();
    if (!from.width || !to.width) return null;
    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
  }

  function openViewer(grid, card) {
    viewerGrid = grid;
    viewerIndex = viewerCards().indexOf(card);
    if (viewerIndex < 0) return;

    fillViewer(card);
    viewer.hidden = false;

    const quick = reduceMotion.matches;
    viewer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: quick ? 1 : 300, easing: "ease" });
    const away = frameFlight(card);
    if (away) {
      viewerFrame.animate([{ transform: away }, { transform: "none" }], { duration: quick ? 1 : 460, easing: EASE });
    }
    [viewerCaption, viewerLikeSlot].forEach((element) => element.animate(
      [{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }],
      { duration: quick ? 1 : 520, easing: "ease" }
    ));
  }

  function stepViewer(dir) {
    const cards = viewerCards();
    const next = viewerIndex + dir;
    if (viewer.hidden || next < 0 || next >= cards.length) return;
    viewerIndex = next;
    fillViewer(cards[next]);
    if (!reduceMotion.matches) {
      viewerFigure.animate(
        [{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: "none" }],
        { duration: 340, easing: EASE }
      );
    }
  }

  let closingViewer = false;

  function closeViewer() {
    if (viewer.hidden || closingViewer) return;
    const quick = reduceMotion.matches;
    const card = viewerCards()[viewerIndex];

    // 지금 보고 있는 사진의 카드가 보이도록 스크롤 → 그 자리로 돌아가며 작아짐
    card?.scrollIntoView({ block: "nearest" });
    const away = card ? frameFlight(card) : null;

    closingViewer = true;
    const fade = viewer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: quick ? 1 : 300, easing: "ease", fill: "forwards" });
    if (away) viewerFrame.animate([{ transform: "none" }, { transform: away }], { duration: quick ? 1 : 360, easing: EASE, fill: "forwards" });

    const done = () => {
      viewer.hidden = true;
      closingViewer = false;
      viewer.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      viewerGrid = null;
    };
    fade.finished.then(done, done);
  }

  [aiLibraryGrid, galleryGrid].forEach((grid) => {
    grid.addEventListener("click", (event) => {
      const like = event.target.closest(".like-button");
      if (like) {
        toggleLike(like.dataset.likeId, like);
        return;
      }
      const image = event.target.closest(".card-image");
      if (image) openViewer(grid, image.closest(".card"));
    });
  });

  viewer.addEventListener("click", (event) => {
    const like = event.target.closest(".like-button");
    if (like) {
      toggleLike(like.dataset.likeId, like);
      return;
    }
    const nav = event.target.closest(".viewer-nav");
    if (nav) {
      if (!nav.disabled) stepViewer(Number(nav.dataset.dir));
      return;
    }
    // 사진과 글자 밖(어두운 곳)을 누르면 닫힘
    if (!event.target.closest(".viewer-frame, .viewer-caption, .viewer-like-slot")) closeViewer();
  });

  window.addEventListener("keydown", (event) => {
    if (viewer.hidden) return;
    if (event.key === "Escape") closeViewer();
    else if (event.key === "ArrowRight") stepViewer(1);
    else if (event.key === "ArrowLeft") stepViewer(-1);
  });

  // 터치: 사진을 좌우로 밀어서 넘김
  let swipeStart = null;
  viewerFrame.addEventListener("pointerdown", (event) => {
    swipeStart = { x: event.clientX, y: event.clientY };
  });
  viewerFrame.addEventListener("pointerup", (event) => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) stepViewer(dx < 0 ? 1 : -1);
  });

  // 다른 탭을 보다가 돌아왔을 때 바로 새로고침
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && activeTab === "gallery") refreshGallery();
  });

  /* =========================================
     TITLE
  ========================================= */

  // 입력한 글자 길이에 맞춰 괄호가 따라오도록
  const measure = document.createElement("canvas").getContext("2d");

  function fitField(input) {
    const style = getComputedStyle(input);
    measure.font = `${style.fontSize} ${style.fontFamily}`;
    const text = input.value || input.placeholder;
    const spacing = parseFloat(style.letterSpacing) || 0;
    const width = measure.measureText(text).width + spacing * text.length + 4;
    input.style.width = `${Math.ceil(width)}px`;
  }

  const fitTitle = () => {
    fitField(titleInput);
    fitField(creatorInput);
  };
  // 폰트(Inter Tight)가 다 받아지면 글자 폭이 바뀌므로 다시 맞춤
  document.fonts?.ready.then(fitTitle);

  function markTitle() {
    titleField.classList.toggle("is-empty", !titleInput.value.trim());
    creatorField.classList.toggle("is-empty", !creatorInput.value.trim());
  }

  titleInput.addEventListener("input", () => {
    fitTitle();
    markTitle();
    if (titleInput.value.trim() && !savedEntry) saveNote.textContent = "";
  });
  creatorInput.addEventListener("input", () => {
    fitTitle();
    markTitle();
  });
  titleField.addEventListener("animationend", () => titleField.classList.remove("is-nudged"));
  // 이름에서 Enter → 만든 사람 칸으로, 만든 사람에서 Enter → 입력 끝
  titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") creatorInput.focus();
  });
  creatorInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") creatorInput.blur();
  });
  fitTitle();

  /* =========================================
     SAVE & SHARE
  ========================================= */

  const gardenTitle = () => titleInput.value.trim() || "UNTITLED GARDEN"; // 대문자 · 소문자 그대로

  async function toBlob(board) {
    return new Promise((resolve, reject) => {
      try {
        board.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("empty"))), "image/png");
      } catch (error) {
        reject(error);
      }
    });
  }

  saveButton.addEventListener("click", async () => {
    if (!finished || savedEntry || saveButton.disabled) return;

    // 이름이 없으면 저장하지 않고 이름 칸으로 안내
    if (!titleInput.value.trim()) {
      titleField.classList.remove("is-nudged");
      void titleField.offsetWidth;
      titleField.classList.add("is-nudged");
      saveNote.textContent = "Name your garden before saving.";
      titleInput.focus();
      return;
    }

    saveButton.disabled = true;
    backButton.disabled = true;
    saveButton.textContent = "SAVING…";
    saveNote.textContent = "";

    try {
      const board = await finished.render(1600);
      savedBlob = await toBlob(board); // file:// 로 열면 여기서 막힘

      savedEntry = await store.save({
        title: gardenTitle(),
        creator: creatorInput.value.trim(),
        fragments: finished.fragments,
        seconds: finished.seconds
      }, board);

      titleInput.value = savedEntry.title;
      titleInput.readOnly = true;
      creatorInput.readOnly = true;
      markTitle();
      // 저장 후: [ BACK TO CANVAS ] → [ BUILD ANOTHER GARDEN ]
      backButton.textContent = "[ BUILD ANOTHER GARDEN ]";
      backButton.hidden = false;
      backButton.disabled = false;
      fitTitle();
      saveButton.textContent = "SAVED";
      saveButton.classList.add("is-saved");
      if (store.mode === "local") saveNote.textContent = "Saved in this browser only.";
      openDialog();
    } catch (error) {
      saveButton.disabled = false;
      backButton.disabled = false;
      saveButton.textContent = "SAVE & SHARE";
      // 서버에 아예 닿지 못하면 브라우저마다 "Load failed"(사파리) · "Failed to fetch"(크롬)처럼 알아보기 어려운 말이 나오므로 바꿔 줌
      saveNote.textContent = error?.name === "SecurityError"
        ? "Open the site through server.py to save."
        : error instanceof TypeError
          ? "The gallery server could not be reached. Please try again in a moment."
          : error?.message || "The garden could not be saved.";
    }
  });

  /* ---------- 저장 완료 팝업 ---------- */

  function openDialog() {
    saveDialog.hidden = false;
    saveDialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease" });
    saveDialog.firstElementChild.animate(
      [{ opacity: 0, transform: "translateY(12px) scale(0.97)" }, { opacity: 1, transform: "none" }],
      { duration: 420, easing: EASE }
    );
    downloadButton.focus();
  }

  function closeDialog() {
    saveDialog.hidden = true;
  }

  dialogClose.addEventListener("click", closeDialog);
  saveDialog.addEventListener("click", (event) => {
    if (event.target === saveDialog) closeDialog();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !saveDialog.hidden) closeDialog();
  });

  downloadButton.addEventListener("click", () => {
    if (!savedBlob) return;
    const link = document.createElement("a");
    const name = gardenTitle().toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "") || "garden";
    link.href = URL.createObjectURL(savedBlob);
    link.download = `${name}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // 사파리는 다운로드를 조금 늦게 시작하므로 넉넉히 기다렸다가 정리
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  });

  viewGalleryButton.addEventListener("click", async () => {
    closeDialog();
    showTab("gallery");
    await refreshGallery();

    // 내 정원으로 스크롤해서 표시
    const mine = galleryGrid.querySelector(`[data-id="${CSS.escape(savedEntry.id)}"]`);
    if (mine) {
      mine.classList.add("is-mine");
      setTimeout(() => mine.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "center" }), 450);
    }
  });
})();
