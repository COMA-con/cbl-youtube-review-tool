"use strict";

const SLOT_COUNT = 15;
const SESSION_KEY = "cblYoutubeReviewTool.v11.settings";
const SHARE_PREFIX = "r=";

const RATE_BY_CODE = {
  "05": 0.5,
  "075": 0.75,
  "10": 1,
  "125": 1.25,
  "15": 1.5,
  "20": 2
};

const CODE_BY_RATE = new Map(Object.entries(RATE_BY_CODE).map(([code, rate]) => [rate, code]));

const state = {
  settingsSlots: [],
  reviewTiles: [],
  reviewTime: 0,
  rateCode: "10",
  isPlaying: false,
  youtubeReady: false,
  mode: "settings",
  shareUrl: "",
  sharedWarnings: [],
  expandedTileId: null,
  toolbarTimer: null,
  loadedFromShare: false
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  createSettingsSlots();
  bindEvents();
  bootFromLocation();
  startReviewClock();
});

window.onYouTubeIframeAPIReady = () => {
  state.youtubeReady = true;
  state.reviewTiles.forEach((tile) => createOrCuePlayer(tile));
};

function bindElements() {
  elements.settingsMode = document.getElementById("settingsMode");
  elements.slotList = document.getElementById("slotList");
  elements.settingsRateSelect = document.getElementById("settingsRateSelect");
  elements.shareUrlOutput = document.getElementById("shareUrlOutput");
  elements.shareResult = document.getElementById("shareResult");
  elements.copyShareUrlButton = document.getElementById("copyShareUrlButton");
  elements.previewReviewButtonBottom = document.getElementById("previewReviewButtonBottom");
  elements.jsonOutput = document.getElementById("jsonOutput");
  elements.jsonResult = document.getElementById("jsonResult");
  elements.importJsonInput = document.getElementById("importJsonInput");
  elements.fatalErrorMode = document.getElementById("fatalErrorMode");
  elements.fatalErrorMessage = document.getElementById("fatalErrorMessage");
  elements.reviewMode = document.getElementById("reviewMode");
  elements.reviewWarnings = document.getElementById("reviewWarnings");
  elements.reviewGrid = document.getElementById("reviewGrid");
  elements.allHiddenMessage = document.getElementById("allHiddenMessage");
  elements.reviewToolbar = document.getElementById("reviewToolbar");
  elements.reviewTimeDisplay = document.getElementById("reviewTimeDisplay");
  elements.reviewStateDisplay = document.getElementById("reviewStateDisplay");
  elements.reviewCountDisplay = document.getElementById("reviewCountDisplay");
  elements.reviewRateSelect = document.getElementById("reviewRateSelect");
  elements.expandOverlay = document.getElementById("expandOverlay");
  elements.expandHost = document.getElementById("expandHost");
  elements.expandTitle = document.getElementById("expandTitle");
}

function createSettingsSlots() {
  const template = document.getElementById("slotTemplate");
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".slot-card");
    const slot = {
      index,
      card,
      urlInput: fragment.querySelector(".slot-url"),
      startInput: fragment.querySelector(".slot-start"),
      status: fragment.querySelector(".slot-status"),
      videoId: "",
      startSeconds: 0,
      startValid: true,
      urlValid: false
    };

    fragment.querySelector(".slot-title").textContent = `動画${index + 1}`;
    slot.urlInput.addEventListener("input", () => {
      validateSettingSlot(slot);
      saveSessionSettings();
    });
    slot.startInput.addEventListener("input", () => {
      validateSettingSlot(slot);
      saveSessionSettings();
    });

    state.settingsSlots.push(slot);
    elements.slotList.appendChild(fragment);
  }
}

function bindEvents() {
  document.getElementById("buildShareUrlButton").addEventListener("click", buildShareUrlFromSettings);
  document.getElementById("buildShareUrlButtonBottom").addEventListener("click", buildShareUrlFromSettings);
  document.getElementById("copyShareUrlButton").addEventListener("click", copyShareUrl);
  document.getElementById("previewReviewButton").addEventListener("click", previewReviewFromSettings);
  document.getElementById("previewReviewButtonBottom").addEventListener("click", previewReviewFromSettings);
  document.getElementById("fatalBackToSettingsButton").addEventListener("click", showSettingsMode);
  document.getElementById("exportJsonButton").addEventListener("click", exportJson);
  elements.importJsonInput.addEventListener("change", importJson);
  elements.settingsRateSelect.addEventListener("change", saveSessionSettings);

  document.getElementById("playAllButton").addEventListener("click", playAll);
  document.getElementById("pauseAllButton").addEventListener("click", pauseAll);
  document.getElementById("back5Button").addEventListener("click", () => shiftReviewTime(-5));
  document.getElementById("forward5Button").addEventListener("click", () => shiftReviewTime(5));
  document.getElementById("back30Button").addEventListener("click", () => shiftReviewTime(-30));
  document.getElementById("forward30Button").addEventListener("click", () => shiftReviewTime(30));
  document.getElementById("resyncButton").addEventListener("click", resyncAll);
  document.getElementById("muteAllButton").addEventListener("click", muteAll);
  document.getElementById("editSettingsButton").addEventListener("click", showSettingsMode);
  elements.reviewRateSelect.addEventListener("change", () => {
    state.rateCode = elements.reviewRateSelect.value;
    applyRateToPlayers();
    updateReviewUi();
  });
  document.getElementById("closeExpandButton").addEventListener("click", closeExpandedTile);
  elements.expandOverlay.addEventListener("click", (event) => {
    if (event.target === elements.expandOverlay) {
      closeExpandedTile();
    }
  });

  elements.reviewMode.addEventListener("mousemove", showToolbarTemporarily);
  elements.reviewMode.addEventListener("touchstart", showToolbarTemporarily, { passive: true });
  window.addEventListener("resize", updateReviewLayout);
  document.addEventListener("keydown", handleShortcut);
}

function bootFromLocation() {
  const shared = getSharedHashValue();
  if (shared !== null) {
    const result = parseSharedPayload(shared);
    if (!result.ok) {
      showFatalError(result.message);
      return;
    }
    startReview(result.videos, {
      rateCode: result.rateCode,
      warnings: result.warnings,
      fromShare: true
    });
    return;
  }

  restoreSessionSettings();
  showSettingsMode();
}

function getSharedHashValue() {
  const rawHash = window.location.hash.replace(/^#/, "");
  if (!rawHash.startsWith(SHARE_PREFIX)) {
    return null;
  }
  return rawHash.slice(SHARE_PREFIX.length);
}

function parseSharedPayload(encoded) {
  let payload = "";
  try {
    payload = decodeURIComponent(encoded);
  } catch (error) {
    return { ok: false, message: brokenShareMessage() };
  }

  const sections = payload.split("~");
  if (sections.length !== 3 || sections[0] !== "1") {
    return { ok: false, message: brokenShareMessage() };
  }

  const warnings = [];
  let rateCode = sections[1];
  if (!RATE_BY_CODE[rateCode]) {
    rateCode = "10";
    warnings.push("再生速度コードが壊れていたため、1.0倍で開きました。");
  }

  const rawItems = sections[2] ? sections[2].split(",").slice(0, SLOT_COUNT) : [];
  const videos = [];
  rawItems.forEach((item, index) => {
    const dotIndex = item.indexOf(".");
    if (dotIndex <= 0) {
      warnings.push(`#${index + 1} の動画情報が壊れていたため除外しました。`);
      return;
    }
    const videoId = item.slice(0, dotIndex);
    const startCode = item.slice(dotIndex + 1);
    if (!isVideoId(videoId)) {
      warnings.push(`#${index + 1} のVideo IDが壊れていたため除外しました。`);
      return;
    }

    let startSeconds = parseInt(startCode, 36);
    if (!Number.isFinite(startSeconds) || startSeconds < 0 || !/^[0-9a-z]+$/i.test(startCode)) {
      startSeconds = 0;
      warnings.push(`#${index + 1} の開始位置が壊れていたため0秒扱いにしました。`);
    }
    videos.push({ id: videoId, start: startSeconds, sourceIndex: index });
  });

  if (videos.length === 0) {
    return {
      ok: false,
      message: "有効な動画がありません。\n共有URLに含まれる動画情報が壊れている可能性があります。\n設定担当者に共有URLを作り直してもらってください。"
    };
  }

  return { ok: true, videos, rateCode, warnings };
}

function brokenShareMessage() {
  return "共有URLの設定を読み込めませんでした。\nURLが途中で切れているか、古い形式の可能性があります。\n設定担当者に共有URLを作り直してもらってください。";
}

function showFatalError(message) {
  state.mode = "error";
  elements.settingsMode.hidden = true;
  elements.reviewMode.hidden = true;
  elements.fatalErrorMode.hidden = false;
  elements.fatalErrorMessage.textContent = message;
  document.body.classList.remove("is-reviewing");
}

function showSettingsMode() {
  closeExpandedTile();
  pauseAll();
  if (state.mode === "review" && state.reviewTiles.length > 0) {
    populateSettingsFromReviewTiles();
  }
  destroyReviewTiles();
  state.mode = "settings";
  state.loadedFromShare = false;
  elements.fatalErrorMode.hidden = true;
  elements.reviewMode.hidden = true;
  elements.settingsMode.hidden = false;
  document.body.classList.remove("is-reviewing");
  updateAllSettingSlots();
}

function populateSettingsFromReviewTiles() {
  state.settingsSlots.forEach((slot) => {
    slot.urlInput.value = "";
    slot.startInput.value = "";
  });
  state.reviewTiles.slice(0, SLOT_COUNT).forEach((tile, index) => {
    const slot = state.settingsSlots[index];
    slot.urlInput.value = `https://www.youtube.com/watch?v=${tile.videoId}`;
    slot.startInput.value = tile.startSeconds > 0 ? formatTime(tile.startSeconds) : "";
  });
  elements.settingsRateSelect.value = state.rateCode;
  updateAllSettingSlots();
}

function validateSettingSlot(slot) {
  const url = slot.urlInput.value.trim();
  const startText = slot.startInput.value.trim();
  const startResult = parseSettingStartTime(startText);
  slot.videoId = url ? extractYouTubeVideoId(url) : "";
  slot.urlValid = Boolean(slot.videoId);
  slot.startSeconds = startResult.seconds;
  slot.startValid = startResult.valid;
  slot.urlInput.classList.toggle("is-invalid", Boolean(url && !slot.urlValid));
  slot.startInput.classList.toggle("is-invalid", !slot.startValid);

  if (!url) {
    slot.status.textContent = "未入力";
    slot.status.className = "slot-status";
  } else if (!slot.urlValid) {
    slot.status.textContent = "警告: YouTube Video IDを抽出できません。共有URLから除外します。";
    slot.status.className = "slot-status warning";
  } else if (!slot.startValid) {
    slot.status.textContent = `OK: ${slot.videoId} / 開始位置は0秒扱い`;
    slot.status.className = "slot-status warning";
  } else {
    slot.status.textContent = `OK: ${slot.videoId} / ${formatTime(slot.startSeconds)}`;
    slot.status.className = "slot-status ok";
  }
}

function updateAllSettingSlots() {
  state.settingsSlots.forEach(validateSettingSlot);
}

function parseSettingStartTime(value) {
  const text = String(value || "").trim();
  if (!text) {
    return { seconds: 0, valid: true };
  }
  if (/^\d+$/.test(text)) {
    return { seconds: 0, valid: false };
  }

  const parts = text.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d{1,2}$/.test(part))) {
    return { seconds: 0, valid: false };
  }
  const nums = parts.map(Number);
  const seconds = nums[nums.length - 1];
  const minutes = nums[nums.length - 2];
  const hours = parts.length === 3 ? nums[0] : 0;
  if (minutes > 59 || seconds > 59) {
    return { seconds: 0, valid: false };
  }
  return { seconds: hours * 3600 + minutes * 60 + seconds, valid: true };
}

function collectSettingsForShare() {
  updateAllSettingSlots();
  const videos = [];
  const excluded = [];
  const zeroed = [];
  state.settingsSlots.forEach((slot) => {
    const url = slot.urlInput.value.trim();
    if (!url) {
      return;
    }
    if (!slot.urlValid) {
      excluded.push(slot.index + 1);
      return;
    }
    if (!slot.startValid) {
      zeroed.push(slot.index + 1);
    }
    videos.push({ id: slot.videoId, start: slot.startSeconds, sourceIndex: slot.index });
  });
  return { videos, excluded, zeroed, rateCode: elements.settingsRateSelect.value || "10" };
}

function buildShareUrlFromSettings() {
  const result = collectSettingsForShare();
  if (result.videos.length === 0) {
    showShareResult("有効なYouTube動画が1本もありません。URLを確認してください。", "warning");
    elements.copyShareUrlButton.hidden = true;
    elements.previewReviewButtonBottom.hidden = true;
    return null;
  }

  const payload = createPayload(result.videos, result.rateCode);
  const baseUrl = window.location.href.split("#")[0];
  state.shareUrl = `${baseUrl}#${SHARE_PREFIX}${encodeURIComponent(payload)}`;
  elements.shareUrlOutput.value = state.shareUrl;
  elements.copyShareUrlButton.hidden = false;
  elements.previewReviewButtonBottom.hidden = false;

  const lengthLevel = state.shareUrl.length >= 2000 ? "警告" : state.shareUrl.length >= 1500 ? "注意" : "通常";
  const message = [
    "共有URLを作成しました。",
    `有効動画: ${result.videos.length}本`,
    `除外: ${formatSlotList(result.excluded)}`,
    `開始位置0秒扱い: ${formatSlotList(result.zeroed)}`,
    `URL長: ${state.shareUrl.length}文字 (${lengthLevel})`
  ];

  copyText(state.shareUrl).then((copied) => {
    message.push(copied ? "クリップボードにコピーしました。" : "自動コピーに失敗しました。「共有URLをコピー」ボタンを押してください。");
    showShareResult(message.join("\n"), state.shareUrl.length >= 2000 ? "warning" : "ok");
  });

  return result;
}

function createPayload(videos, rateCode) {
  const safeRateCode = RATE_BY_CODE[rateCode] ? rateCode : "10";
  const items = videos.slice(0, SLOT_COUNT).map((video) => `${video.id}.${Math.max(0, Math.floor(video.start)).toString(36)}`);
  return `1~${safeRateCode}~${items.join(",")}`;
}

function previewReviewFromSettings() {
  const result = buildShareUrlFromSettings();
  if (!result || result.videos.length === 0) {
    return;
  }
  startReview(result.videos, {
    rateCode: result.rateCode,
    warnings: result.zeroed.length ? [`開始位置が不正な動画を0秒扱いにしました: ${formatSlotList(result.zeroed)}`] : [],
    fromShare: false
  });
}

function copyShareUrl() {
  const text = elements.shareUrlOutput.value.trim();
  if (!text) {
    showShareResult("コピーする共有URLがありません。先に共有URLを作成してください。", "warning");
    return;
  }
  copyText(text).then((copied) => {
    showShareResult(copied ? "共有URLをコピーしました。" : "コピーに失敗しました。手動で選択してコピーしてください。", copied ? "ok" : "warning");
  });
}

async function copyText(text) {
  if (!navigator.clipboard || !window.isSecureContext) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    return false;
  }
}

function formatSlotList(numbers) {
  return numbers.length ? numbers.map((n) => `動画${n}`).join(", ") : "なし";
}

function showShareResult(message, type) {
  elements.shareResult.textContent = message;
  elements.shareResult.className = `result-message ${type}`;
}

function saveSessionSettings() {
  if (state.loadedFromShare) {
    return;
  }
  const settings = {
    rateCode: elements.settingsRateSelect.value,
    slots: state.settingsSlots.map((slot) => ({
      url: slot.urlInput.value,
      startText: slot.startInput.value
    }))
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(settings));
}

function restoreSessionSettings() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) {
    updateAllSettingSlots();
    return;
  }
  try {
    const settings = JSON.parse(raw);
    if (RATE_BY_CODE[settings.rateCode]) {
      elements.settingsRateSelect.value = settings.rateCode;
    }
    if (Array.isArray(settings.slots)) {
      settings.slots.slice(0, SLOT_COUNT).forEach((item, index) => {
        state.settingsSlots[index].urlInput.value = item.url || "";
        state.settingsSlots[index].startInput.value = item.startText || "";
      });
    }
  } catch (error) {
    sessionStorage.removeItem(SESSION_KEY);
  }
  updateAllSettingSlots();
}

function exportJson() {
  const settings = {
    version: "1.1",
    rateCode: elements.settingsRateSelect.value,
    slots: state.settingsSlots.map((slot) => ({
      url: slot.urlInput.value,
      startText: slot.startInput.value
    }))
  };
  elements.jsonOutput.value = JSON.stringify(settings, null, 2);
  showJsonResult("JSONを出力しました。", "ok");
}

function importJson(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const settings = JSON.parse(String(reader.result));
      if (RATE_BY_CODE[settings.rateCode]) {
        elements.settingsRateSelect.value = settings.rateCode;
      }
      if (Array.isArray(settings.slots)) {
        settings.slots.slice(0, SLOT_COUNT).forEach((item, index) => {
          state.settingsSlots[index].urlInput.value = item.url || "";
          state.settingsSlots[index].startInput.value = item.startText || "";
        });
      }
      updateAllSettingSlots();
      saveSessionSettings();
      showJsonResult("JSONを読み込みました。", "ok");
    } catch (error) {
      showJsonResult("JSONの形式が正しくありません。", "warning");
    } finally {
      event.target.value = "";
    }
  };
  reader.onerror = () => {
    showJsonResult("JSONファイルを読み込めませんでした。", "warning");
    event.target.value = "";
  };
  reader.readAsText(file, "utf-8");
}

function showJsonResult(message, type) {
  elements.jsonResult.textContent = message;
  elements.jsonResult.className = `result-message ${type}`;
}

function startReview(videos, options) {
  closeExpandedTile();
  destroyReviewTiles();
  state.mode = "review";
  state.loadedFromShare = Boolean(options.fromShare);
  state.rateCode = RATE_BY_CODE[options.rateCode] ? options.rateCode : "10";
  state.reviewTime = 0;
  state.isPlaying = false;
  state.sharedWarnings = options.warnings || [];

  elements.settingsMode.hidden = true;
  elements.fatalErrorMode.hidden = true;
  elements.reviewMode.hidden = false;
  document.body.classList.add("is-reviewing");
  elements.reviewRateSelect.value = state.rateCode;

  videos.slice(0, SLOT_COUNT).forEach((video, order) => {
    const tile = createReviewTile(video, order);
    state.reviewTiles.push(tile);
    elements.reviewGrid.appendChild(tile.card);
  });

  if (state.reviewTiles.length === 0) {
    showFatalError("有効な動画がありません。\n共有URLに含まれる動画情報が壊れている可能性があります。\n設定担当者に共有URLを作り直してもらってください。");
    return;
  }

  muteAll();
  updateReviewWarnings();
  updateReviewUi();
  updateReviewLayout();
  showToolbarTemporarily();
  state.reviewTiles.forEach((tile) => createOrCuePlayer(tile));
}

function createReviewTile(video, order) {
  const template = document.getElementById("reviewTileTemplate");
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".review-tile");
  const playerHost = fragment.querySelector(".tile-player");
  const tile = {
    id: `tile-${order}`,
    order,
    videoId: video.id,
    startSeconds: Math.max(0, Math.floor(video.start || 0)),
    sourceIndex: video.sourceIndex ?? order,
    card,
    shell: fragment.querySelector(".tile-player-shell"),
    playerHost,
    placeholder: fragment.querySelector(".tile-placeholder"),
    numberLabel: fragment.querySelector(".tile-number"),
    muteLabel: fragment.querySelector(".tile-mute"),
    audioButton: fragment.querySelector(".tile-audio-button"),
    expandButton: fragment.querySelector(".tile-expand-button"),
    hideButton: fragment.querySelector(".tile-hide-button"),
    youtubeLink: fragment.querySelector(".tile-youtube-link"),
    errorMessage: fragment.querySelector(".tile-error"),
    player: null,
    ready: false,
    error: "",
    hidden: false,
    muted: true
  };

  playerHost.id = `yt-player-${order}-${Date.now()}`;
  tile.numberLabel.textContent = `#${order + 1}`;
  tile.youtubeLink.href = `https://www.youtube.com/watch?v=${tile.videoId}`;
  tile.youtubeLink.hidden = true;

  tile.audioButton.addEventListener("click", () => focusAudio(tile));
  tile.expandButton.addEventListener("click", () => openExpandedTile(tile));
  tile.hideButton.addEventListener("click", () => hideTile(tile));
  tile.card.addEventListener("dblclick", (event) => {
    if (!event.target.closest("button, a")) {
      openExpandedTile(tile);
    }
  });
  return tile;
}

function createOrCuePlayer(tile) {
  if (!state.youtubeReady || !window.YT || !window.YT.Player || tile.hidden || tile.error) {
    return;
  }

  const playerVars = {
    enablejsapi: 1,
    playsinline: 1,
    rel: 0,
    start: tile.startSeconds
  };
  const origin = getYouTubeOrigin();
  if (origin) {
    playerVars.origin = origin;
  }

  tile.placeholder.textContent = "読み込み中";
  tile.player = new YT.Player(tile.playerHost, {
    videoId: tile.videoId,
    playerVars,
    events: {
      onReady: () => {
        tile.ready = true;
        tile.placeholder.hidden = true;
        if (tile.muted) {
          tile.player.mute();
        } else {
          tile.player.unMute();
        }
        tile.player.setPlaybackRate(currentRate());
        tile.player.seekTo(tile.startSeconds + state.reviewTime, true);
        updateReviewUi();
      },
      onStateChange: () => {
        updateReviewTimeFromMaster();
        updateReviewUi();
      },
      onError: (event) => {
        tile.ready = false;
        tile.error = youtubeErrorMessage(event.data);
        tile.card.classList.add("has-error");
        tile.errorMessage.textContent = tile.error;
        tile.errorMessage.hidden = false;
        tile.placeholder.textContent = "再生エラー";
        tile.youtubeLink.hidden = false;
        updateReviewUi();
      }
    }
  });
}

function destroyReviewTiles() {
  state.reviewTiles.forEach((tile) => destroyTilePlayer(tile));
  state.reviewTiles = [];
  elements.reviewGrid.innerHTML = "";
  elements.expandHost.innerHTML = "";
  elements.allHiddenMessage.hidden = true;
}

function destroyTilePlayer(tile) {
  try {
    if (tile.player && typeof tile.player.stopVideo === "function") {
      tile.player.stopVideo();
    }
    if (tile.player && typeof tile.player.destroy === "function") {
      tile.player.destroy();
    }
  } catch (error) {
    // YouTube iframe cleanup can fail if the frame already disappeared.
  }
  tile.player = null;
  tile.ready = false;
}

function hideTile(tile) {
  tile.hidden = true;
  if (state.expandedTileId === tile.id) {
    closeExpandedTile();
  }
  destroyTilePlayer(tile);
  tile.card.remove();
  const remaining = activeTiles().length;
  if (remaining === 0) {
    state.isPlaying = false;
  }
  elements.allHiddenMessage.hidden = remaining !== 0;
  updateReviewUi();
  updateReviewLayout();
}

function activeTiles() {
  return state.reviewTiles.filter((tile) => !tile.hidden);
}

function controllableTiles() {
  return state.reviewTiles.filter((tile) => !tile.hidden && tile.ready && !tile.error && tile.player);
}

function playAll() {
  resyncAll();
  controllableTiles().forEach((tile) => tile.player.playVideo());
  state.isPlaying = true;
  updateReviewUi();
  showToolbarTemporarily();
}

function pauseAll() {
  updateReviewTimeFromMaster();
  controllableTiles().forEach((tile) => tile.player.pauseVideo());
  state.isPlaying = false;
  updateReviewUi();
  showToolbarTemporarily();
}

function shiftReviewTime(delta) {
  updateReviewTimeFromMaster();
  state.reviewTime = Math.max(0, state.reviewTime + delta);
  resyncAll();
  showToolbarTemporarily();
}

function resyncAll() {
  controllableTiles().forEach((tile) => {
    tile.player.seekTo(tile.startSeconds + state.reviewTime, true);
    tile.player.setPlaybackRate(currentRate());
  });
  updateReviewUi();
}

function muteAll() {
  state.reviewTiles.forEach((tile) => setTileMute(tile, true));
  updateReviewUi();
  showToolbarTemporarily();
}

function focusAudio(tile) {
  if (!tile || tile.hidden) {
    return;
  }
  state.reviewTiles.forEach((candidate) => setTileMute(candidate, candidate.id !== tile.id));
  updateReviewUi();
  showToolbarTemporarily();
}

function setTileMute(tile, muted) {
  tile.muted = muted;
  if (tile.player && tile.ready) {
    if (muted) {
      tile.player.mute();
    } else {
      tile.player.unMute();
    }
  }
}

function openExpandedTile(tile) {
  if (!tile || tile.hidden) {
    return;
  }
  closeExpandedTile();
  state.expandedTileId = tile.id;
  elements.expandTitle.textContent = `#${tile.order + 1} 拡大表示`;
  elements.expandHost.appendChild(tile.shell);
  elements.expandOverlay.hidden = false;
  tile.card.classList.add("is-expanded-source");
  focusAudio(tile);
  updateReviewUi();
}

function closeExpandedTile(restore = true) {
  if (!state.expandedTileId) {
    elements.expandOverlay.hidden = true;
    return;
  }
  const tile = state.reviewTiles.find((candidate) => candidate.id === state.expandedTileId);
  if (tile && restore && !tile.hidden) {
    tile.card.insertBefore(tile.shell, tile.card.firstChild);
    tile.card.classList.remove("is-expanded-source");
  }
  state.expandedTileId = null;
  elements.expandOverlay.hidden = true;
  updateReviewUi();
}

function currentRate() {
  return RATE_BY_CODE[state.rateCode] || 1;
}

function applyRateToPlayers() {
  controllableTiles().forEach((tile) => tile.player.setPlaybackRate(currentRate()));
}

function getMasterTile() {
  const candidates = controllableTiles();
  if (candidates.length === 0) {
    return null;
  }
  const unmuted = candidates.find((tile) => !tile.muted);
  if (unmuted) {
    return unmuted;
  }
  if (state.expandedTileId) {
    const expanded = candidates.find((tile) => tile.id === state.expandedTileId);
    if (expanded) {
      return expanded;
    }
  }
  return candidates[0];
}

function updateReviewTimeFromMaster() {
  if (!state.isPlaying) {
    return;
  }
  const master = getMasterTile();
  if (!master || !master.player || typeof master.player.getCurrentTime !== "function") {
    return;
  }
  const current = master.player.getCurrentTime();
  if (Number.isFinite(current)) {
    state.reviewTime = Math.max(0, current - master.startSeconds);
  }
}

function startReviewClock() {
  window.setInterval(() => {
    if (state.mode === "review" && state.isPlaying) {
      updateReviewTimeFromMaster();
    }
    updateReviewUi();
  }, 500);
}

function updateReviewUi() {
  if (state.mode !== "review") {
    return;
  }
  const active = activeTiles();
  const ready = controllableTiles();
  elements.reviewTimeDisplay.textContent = formatTime(state.reviewTime);
  elements.reviewStateDisplay.textContent = state.isPlaying ? "再生中" : "停止中";
  elements.reviewCountDisplay.textContent = `${active.length}本 / 準備${ready.length}本`;
  elements.reviewRateSelect.value = state.rateCode;
  elements.allHiddenMessage.hidden = active.length !== 0;
  active.forEach((tile) => {
    tile.card.classList.toggle("is-audio-on", !tile.muted);
    tile.card.classList.toggle("is-expanded-source", tile.id === state.expandedTileId);
    tile.muteLabel.textContent = tile.muted ? "ミュート" : "音声ON";
    tile.audioButton.textContent = tile.muted ? "音声ON" : "音声ON中";
  });
  updateReviewWarnings();
}

function updateReviewWarnings() {
  const warnings = [...state.sharedWarnings];
  if (window.location.protocol === "file:") {
    warnings.push("file://で開いています。YouTubeエラー153を避けるため localhost または公開URLから開いてください。");
  }
  elements.reviewWarnings.hidden = warnings.length === 0;
  elements.reviewWarnings.textContent = warnings.join(" / ");
}

function updateReviewLayout() {
  if (state.mode !== "review" || state.expandedTileId) {
    return;
  }
  const count = activeTiles().length;
  if (count === 0) {
    return;
  }
  const rect = elements.reviewGrid.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  let best = { cols: 1, rows: count, tileWidth: width, tileHeight: Math.min(height, width * 9 / 16), area: 0 };

  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    let tileWidth = width / cols;
    let tileHeight = tileWidth * 9 / 16;
    if (rows * tileHeight > height) {
      tileHeight = height / rows;
      tileWidth = tileHeight * 16 / 9;
    }
    const area = tileWidth * tileHeight;
    const betterArea = area > best.area + 0.5;
    const betterShape = Math.abs(area - best.area) <= 0.5 && rows < best.rows;
    if (betterArea || betterShape) {
      best = { cols, rows, tileWidth, tileHeight, area };
    }
  }

  elements.reviewGrid.style.setProperty("--cols", String(best.cols));
  elements.reviewGrid.style.setProperty("--tile-width", `${Math.floor(best.tileWidth)}px`);
  elements.reviewGrid.style.setProperty("--tile-height", `${Math.floor(best.tileHeight)}px`);
}

function showToolbarTemporarily() {
  if (state.mode !== "review") {
    return;
  }
  elements.reviewToolbar.classList.remove("is-hidden");
  window.clearTimeout(state.toolbarTimer);
  state.toolbarTimer = window.setTimeout(() => {
    if (state.mode === "review") {
      elements.reviewToolbar.classList.add("is-hidden");
    }
  }, 3000);
}

function handleShortcut(event) {
  const target = event.target;
  if (target && target.closest && target.closest("input, textarea, select")) {
    return;
  }
  if (event.key === "Escape") {
    closeExpandedTile();
    event.preventDefault();
    return;
  }
  if (state.mode !== "review") {
    return;
  }
  if (event.code === "Space") {
    state.isPlaying ? pauseAll() : playAll();
    event.preventDefault();
  } else if (event.key === "ArrowLeft") {
    shiftReviewTime(-5);
    event.preventDefault();
  } else if (event.key === "ArrowRight") {
    shiftReviewTime(5);
    event.preventDefault();
  } else if (event.key.toLowerCase() === "r") {
    resyncAll();
    event.preventDefault();
  }
}

function extractYouTubeVideoId(input) {
  const trimmed = String(input || "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return isVideoId(id) ? id : "";
      }
      const match = url.pathname.match(/^\/(embed|live|shorts)\/([a-zA-Z0-9_-]{11})/);
      return match ? match[2] : "";
    }
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return isVideoId(id) ? id : "";
    }
  } catch (error) {
    const match = trimmed.match(/(?:v=|youtu\.be\/|embed\/|live\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : "";
  }
  return "";
}

function isVideoId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{11}$/.test(value);
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function getYouTubeOrigin() {
  if (!window.location.origin || window.location.origin === "null" || window.location.protocol === "file:") {
    return undefined;
  }
  return window.location.origin;
}

function youtubeErrorMessage(code) {
  const messages = {
    2: "URLまたはVideo IDが正しくありません。",
    5: "この動画はHTML5プレイヤーで再生できません。\nライブアーカイブ処理中、ブラウザ制限、著作権・年齢・地域制限、またはYouTube側の制限の可能性があります。",
    100: "動画が削除済み、非公開、またはURLが間違っている可能性があります。",
    101: "この動画は投稿者またはYouTube側の制限により、埋め込み再生できません。\nYouTube本体で開いてください。",
    150: "この動画は投稿者またはYouTube側の制限により、埋め込み再生できません。\nYouTube本体で開いてください。",
    153: "YouTubeに参照元情報が渡っていない可能性があります。\nlocalhostまたは公開URLから開いてください。\n広告ブロックやプライバシー系拡張機能も確認してください。"
  };
  return messages[code] || `YouTube読み込みエラーです。コード: ${code}`;
}
