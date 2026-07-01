"use strict";

const SLOT_COUNT = 15;
const STORAGE_KEY = "cblYoutubeReviewTool.v1";
const SHARE_HASH_PREFIX = "cblreview=";

const appState = {
  slots: [],
  reviewTime: 0,
  rate: 1,
  isPlaying: false,
  selectedSlot: null,
  modalSlot: null,
  timerId: null,
  lastTickAt: null,
  youtubeReady: false
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  createSlots();
  bindGlobalEvents();
  loadInitialState();
  startClock();
  updateAllUi();
});

window.onYouTubeIframeAPIReady = () => {
  appState.youtubeReady = true;
  appState.slots.forEach((slot) => {
    if (slot.videoId) {
      createOrUpdatePlayer(slot.index);
    }
  });
};

function bindElements() {
  elements.videoGrid = document.getElementById("videoGrid");
  elements.reviewTimeDisplay = document.getElementById("reviewTimeDisplay");
  elements.playStateDisplay = document.getElementById("playStateDisplay");
  elements.rateDisplay = document.getElementById("rateDisplay");
  elements.loadedCountDisplay = document.getElementById("loadedCountDisplay");
  elements.reviewTimeInput = document.getElementById("reviewTimeInput");
  elements.rateSelect = document.getElementById("rateSelect");
  elements.jsonOutput = document.getElementById("jsonOutput");
  elements.shareWarning = document.getElementById("shareWarning");
  elements.modalOverlay = document.getElementById("modalOverlay");
  elements.modalTitle = document.getElementById("modalTitle");
  elements.modalPlayerHost = document.getElementById("modalPlayerHost");
}

function createSlots() {
  const template = document.getElementById("slotTemplate");
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".video-card");
    const slot = {
      index,
      player: null,
      playerName: "",
      url: "",
      videoId: "",
      startText: "",
      startSeconds: 0,
      startValid: true,
      status: "未読込",
      error: "",
      muted: true,
      ready: false,
      card,
      playerHost: fragment.querySelector(".player-host"),
      playerShell: fragment.querySelector(".player-shell"),
      slotLabel: fragment.querySelector(".slot-label"),
      nameInput: fragment.querySelector(".player-name-input"),
      urlInput: fragment.querySelector(".youtube-url-input"),
      startInput: fragment.querySelector(".start-time-input"),
      loadButton: fragment.querySelector(".load-video-button"),
      muteButton: fragment.querySelector(".mute-toggle-button"),
      expandButton: fragment.querySelector(".expand-button"),
      focusAudioButton: fragment.querySelector(".focus-audio-button"),
      startStatus: fragment.querySelector(".start-status"),
      actualStatus: fragment.querySelector(".actual-time-status"),
      muteStatus: fragment.querySelector(".mute-status"),
      loadStatus: fragment.querySelector(".load-status"),
      errorMessage: fragment.querySelector(".error-message")
    };

    slot.slotLabel.textContent = `${index + 1}枠`;
    slot.playerHost.id = `player-${index}`;

    bindSlotEvents(slot);
    appState.slots.push(slot);
    elements.videoGrid.appendChild(fragment);
  }
}

function bindSlotEvents(slot) {
  slot.nameInput.addEventListener("input", () => {
    slot.playerName = slot.nameInput.value.trim();
    saveSettingsToLocalStorage(false);
  });

  slot.urlInput.addEventListener("input", () => {
    slot.url = slot.urlInput.value.trim();
    validateUrlInput(slot);
    saveSettingsToLocalStorage(false);
  });

  slot.startInput.addEventListener("input", () => {
    applyStartInput(slot, slot.startInput.value);
    saveSettingsToLocalStorage(false);
    updateSlotUi(slot);
  });

  slot.loadButton.addEventListener("click", () => {
    loadSlotVideo(slot.index);
  });

  slot.muteButton.addEventListener("click", () => {
    toggleMute(slot.index);
  });

  slot.focusAudioButton.addEventListener("click", () => {
    focusAudio(slot.index);
  });

  slot.expandButton.addEventListener("click", () => {
    toggleModal(slot.index);
  });

  slot.playerShell.addEventListener("click", () => {
    if (slot.videoId) {
      toggleModal(slot.index);
    }
  });

  slot.card.addEventListener("click", (event) => {
    const interactive = event.target.closest("button, input, select, textarea, label, iframe");
    if (!interactive && slot.videoId) {
      toggleModal(slot.index);
    }
  });
}

function bindGlobalEvents() {
  document.getElementById("playAllButton").addEventListener("click", playAll);
  document.getElementById("pauseAllButton").addEventListener("click", pauseAll);
  document.getElementById("back5Button").addEventListener("click", () => shiftReviewTime(-5));
  document.getElementById("forward5Button").addEventListener("click", () => shiftReviewTime(5));
  document.getElementById("back10Button").addEventListener("click", () => shiftReviewTime(-10));
  document.getElementById("forward10Button").addEventListener("click", () => shiftReviewTime(10));
  document.getElementById("resyncButton").addEventListener("click", resyncAll);
  document.getElementById("jumpButton").addEventListener("click", jumpToReviewTime);
  document.getElementById("applyRateButton").addEventListener("click", applySelectedRate);
  document.getElementById("muteAllButton").addEventListener("click", () => setAllMute(true));
  document.getElementById("unmuteAllButton").addEventListener("click", () => setAllMute(false));
  document.getElementById("saveButton").addEventListener("click", () => saveSettingsToLocalStorage(true));
  document.getElementById("loadButton").addEventListener("click", () => restoreFromLocalStorage(true));
  document.getElementById("exportJsonButton").addEventListener("click", exportJson);
  document.getElementById("importJsonInput").addEventListener("change", importJsonFile);
  document.getElementById("shareLinkButton").addEventListener("click", createShareLink);
  document.getElementById("modalCloseButton").addEventListener("click", closeModal);
  document.getElementById("modalSoundOnlyButton").addEventListener("click", () => {
    if (appState.modalSlot !== null) {
      focusAudio(appState.modalSlot);
    }
  });
  elements.modalOverlay.addEventListener("click", (event) => {
    if (event.target === elements.modalOverlay) {
      closeModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

function loadInitialState() {
  const hashLoaded = restoreFromHash();
  if (!hashLoaded) {
    restoreFromLocalStorage(false);
  }
}

function defaultSettings() {
  return {
    version: 1,
    reviewTime: 0,
    rate: 1,
    slots: Array.from({ length: SLOT_COUNT }, () => ({
      playerName: "",
      url: "",
      startText: "",
      muted: true
    }))
  };
}

function collectSettings() {
  return {
    version: 1,
    reviewTime: appState.reviewTime,
    rate: appState.rate,
    slots: appState.slots.map((slot) => ({
      playerName: slot.nameInput.value.trim(),
      url: slot.urlInput.value.trim(),
      startText: slot.startInput.value.trim(),
      muted: slot.muted
    }))
  };
}

function applySettings(settings, options = {}) {
  const normalized = normalizeSettings(settings);
  appState.reviewTime = normalized.reviewTime;
  appState.rate = normalized.rate;
  elements.rateSelect.value = String(normalized.rate);
  elements.reviewTimeInput.value = formatTime(appState.reviewTime);

  normalized.slots.forEach((slotSettings, index) => {
    const slot = appState.slots[index];
    slot.nameInput.value = slotSettings.playerName;
    slot.urlInput.value = slotSettings.url;
    slot.startInput.value = slotSettings.startText;
    slot.playerName = slotSettings.playerName;
    slot.url = slotSettings.url;
    slot.muted = slotSettings.muted;
    applyStartInput(slot, slotSettings.startText);
    validateUrlInput(slot);
    if (slot.videoId) {
      createOrUpdatePlayer(index);
    } else {
      destroyPlayer(slot);
      slot.status = "未読込";
      slot.ready = false;
    }
    updateSlotUi(slot);
  });

  if (options.persist) {
    saveSettingsToLocalStorage(false);
  }
  updateAllUi();
}

function normalizeSettings(settings) {
  const base = defaultSettings();
  const source = settings && typeof settings === "object" ? settings : {};
  base.reviewTime = Math.max(0, Number(source.reviewTime) || 0);
  base.rate = [0.5, 0.75, 1, 1.25, 1.5, 2].includes(Number(source.rate)) ? Number(source.rate) : 1;

  const sourceSlots = Array.isArray(source.slots) ? source.slots : [];
  base.slots = base.slots.map((slot, index) => {
    const sourceSlot = sourceSlots[index] && typeof sourceSlots[index] === "object" ? sourceSlots[index] : {};
    return {
      playerName: String(sourceSlot.playerName || "").slice(0, 80),
      url: String(sourceSlot.url || "").slice(0, 500),
      startText: String(sourceSlot.startText || "").slice(0, 20),
      muted: sourceSlot.muted !== false
    };
  });
  return base;
}

function saveSettingsToLocalStorage(showMessage) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectSettings()));
  if (showMessage) {
    showShareMessage("設定をlocalStorageに保存しました。", false);
  }
}

function restoreFromLocalStorage(showMessage) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    if (showMessage) {
      showShareMessage("保存済み設定がありません。", true);
    }
    return false;
  }
  try {
    applySettings(JSON.parse(raw), { persist: false });
    if (showMessage) {
      showShareMessage("保存済み設定を読み込みました。", false);
    }
    return true;
  } catch (error) {
    if (showMessage) {
      showShareMessage("保存済み設定の読み込みに失敗しました。", true);
    }
    return false;
  }
}

function restoreFromHash() {
  const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  if (!hash.startsWith(SHARE_HASH_PREFIX)) {
    return false;
  }
  try {
    const encoded = hash.slice(SHARE_HASH_PREFIX.length);
    const json = decodeBase64Unicode(encoded);
    applySettings(JSON.parse(json), { persist: true });
    showShareMessage("共有リンクから設定を復元しました。", false);
    return true;
  } catch (error) {
    showShareMessage("共有リンクの読み込みに失敗しました。JSON読み込みを試してください。", true);
    return false;
  }
}

function exportJson() {
  elements.jsonOutput.value = JSON.stringify(collectSettings(), null, 2);
  showShareMessage("JSONを出力しました。", false);
}

function importJsonFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      applySettings(JSON.parse(String(reader.result)), { persist: true });
      showShareMessage("JSON設定を読み込みました。", false);
    } catch (error) {
      showShareMessage("JSONの形式が正しくありません。", true);
    } finally {
      event.target.value = "";
    }
  };
  reader.onerror = () => {
    showShareMessage("JSONファイルを読み込めませんでした。", true);
    event.target.value = "";
  };
  reader.readAsText(file, "utf-8");
}

function createShareLink() {
  const json = JSON.stringify(collectSettings());
  const encoded = encodeBase64Unicode(json);
  const baseUrl = window.location.protocol === "file:"
    ? window.location.href.split("#")[0]
    : `${window.location.origin}${window.location.pathname}`;
  const shareUrl = `${baseUrl}#${SHARE_HASH_PREFIX}${encoded}`;
  elements.jsonOutput.value = shareUrl;

  const lengthWarning = shareUrl.length > 6000
    ? "共有リンクがかなり長いため、Discordなどで途中で切れる可能性があります。JSON共有も併用してください。"
    : "共有リンクを作成しました。";
  showShareMessage(lengthWarning, shareUrl.length > 6000);

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
  }
}

function encodeBase64Unicode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Unicode(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function loadSlotVideo(index) {
  const slot = appState.slots[index];
  slot.url = slot.urlInput.value.trim();
  validateUrlInput(slot);
  applyStartInput(slot, slot.startInput.value);

  if (!slot.videoId) {
    slot.status = "エラー";
    slot.error = "YouTube動画IDを取得できません。URLを確認してください。";
    updateSlotUi(slot);
    saveSettingsToLocalStorage(false);
    return;
  }

  createOrUpdatePlayer(index);
  saveSettingsToLocalStorage(false);
}

function validateUrlInput(slot) {
  const value = slot.urlInput.value.trim();
  slot.url = value;
  slot.videoId = value ? extractYouTubeVideoId(value) : "";
  if (!value) {
    slot.error = "";
    slot.urlInput.classList.remove("is-invalid");
  } else if (!slot.videoId) {
    slot.error = "対応しているYouTube URLではありません。";
    slot.urlInput.classList.add("is-invalid");
  } else {
    slot.error = "";
    slot.urlInput.classList.remove("is-invalid");
  }
  updateSlotUi(slot);
}

function extractYouTubeVideoId(input) {
  const trimmed = input.trim();
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

function applyStartInput(slot, value) {
  slot.startText = String(value || "").trim();
  const result = parseTimeToSeconds(slot.startText);
  slot.startSeconds = result.seconds;
  slot.startValid = result.valid;
  slot.startInput.classList.toggle("is-invalid", !result.valid);
}

function parseTimeToSeconds(value) {
  const text = String(value || "").trim();
  if (!text) {
    return { seconds: 0, valid: true };
  }
  if (/^\d+$/.test(text)) {
    return { seconds: Number(text), valid: true };
  }
  const parts = text.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d{1,2}$/.test(part))) {
    return { seconds: 0, valid: false };
  }
  const numbers = parts.map(Number);
  const seconds = numbers[numbers.length - 1];
  const minutes = numbers[numbers.length - 2];
  const hours = parts.length === 3 ? numbers[0] : 0;
  if (seconds > 59 || minutes > 59) {
    return { seconds: 0, valid: false };
  }
  return { seconds: hours * 3600 + minutes * 60 + seconds, valid: true };
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function createOrUpdatePlayer(index) {
  const slot = appState.slots[index];
  if (!appState.youtubeReady || !window.YT || !window.YT.Player) {
    slot.status = "API待機中";
    updateSlotUi(slot);
    return;
  }

  if (slot.player) {
    slot.status = "読み込み中";
    slot.ready = false;
    slot.player.loadVideoById({
      videoId: slot.videoId,
      startSeconds: slot.startSeconds + appState.reviewTime
    });
    updateSlotUi(slot);
    return;
  }

  slot.status = "読み込み中";
  slot.ready = false;
  slot.player = new YT.Player(slot.playerHost.id, {
    videoId: slot.videoId,
    playerVars: {
      start: slot.startSeconds + appState.reviewTime,
      rel: 0,
      modestbranding: 1,
      playsinline: 1
    },
    events: {
      onReady: () => {
        slot.ready = true;
        slot.status = "読み込み済み";
        slot.player.setPlaybackRate(appState.rate);
        if (slot.muted) {
          slot.player.mute();
        } else {
          slot.player.unMute();
        }
        seekSlotToReviewTime(slot);
        updateAllUi();
      },
      onStateChange: () => {
        updateAllUi();
      },
      onError: (event) => {
        slot.ready = false;
        slot.status = "エラー";
        slot.error = youtubeErrorMessage(event.data);
        updateAllUi();
      }
    }
  });
  updateSlotUi(slot);
}

function destroyPlayer(slot) {
  if (slot.player && typeof slot.player.destroy === "function") {
    slot.player.destroy();
  }
  slot.player = null;
  slot.ready = false;
  slot.videoId = "";
  slot.playerHost.innerHTML = "";
}

function youtubeErrorMessage(code) {
  const messages = {
    2: "動画IDまたはパラメータが正しくありません。",
    5: "HTML5プレイヤーで再生できません。",
    100: "動画が見つからない、または非公開です。",
    101: "投稿者が埋め込み再生を許可していません。",
    150: "投稿者が埋め込み再生を許可していません。"
  };
  return messages[code] || `YouTube読み込みエラーです。コード: ${code}`;
}

function playAll() {
  resyncAll();
  eachReadyPlayer((slot) => {
    slot.player.playVideo();
  });
  appState.isPlaying = true;
  appState.lastTickAt = Date.now();
  updateAllUi();
}

function pauseAll() {
  syncReviewTimeFromFirstReadyPlayer();
  eachReadyPlayer((slot) => {
    slot.player.pauseVideo();
  });
  appState.isPlaying = false;
  appState.lastTickAt = null;
  elements.reviewTimeInput.value = formatTime(appState.reviewTime);
  updateAllUi();
}

function shiftReviewTime(deltaSeconds) {
  appState.reviewTime = Math.max(0, appState.reviewTime + deltaSeconds);
  elements.reviewTimeInput.value = formatTime(appState.reviewTime);
  resyncAll();
  saveSettingsToLocalStorage(false);
}

function jumpToReviewTime() {
  const result = parseTimeToSeconds(elements.reviewTimeInput.value);
  elements.reviewTimeInput.classList.toggle("is-invalid", !result.valid);
  if (!result.valid) {
    showShareMessage("反省会タイムの形式が正しくありません。例: 05:00", true);
    return;
  }
  appState.reviewTime = result.seconds;
  resyncAll();
  saveSettingsToLocalStorage(false);
}

function resyncAll() {
  eachReadyPlayer((slot) => {
    seekSlotToReviewTime(slot);
  });
  appState.lastTickAt = appState.isPlaying ? Date.now() : null;
  updateAllUi();
}

function seekSlotToReviewTime(slot) {
  if (!slot.ready || !slot.player || typeof slot.player.seekTo !== "function") {
    return;
  }
  const target = slot.startSeconds + appState.reviewTime;
  slot.player.seekTo(target, true);
  slot.player.setPlaybackRate(appState.rate);
}

function applySelectedRate() {
  appState.rate = Number(elements.rateSelect.value) || 1;
  eachReadyPlayer((slot) => {
    slot.player.setPlaybackRate(appState.rate);
  });
  saveSettingsToLocalStorage(false);
  updateAllUi();
}

function toggleMute(index) {
  const slot = appState.slots[index];
  setSlotMute(slot, !slot.muted);
  updateAllUi();
  saveSettingsToLocalStorage(false);
}

function setAllMute(muted) {
  appState.slots.forEach((slot) => setSlotMute(slot, muted));
  updateAllUi();
  saveSettingsToLocalStorage(false);
}

function focusAudio(index) {
  appState.selectedSlot = index;
  appState.slots.forEach((slot) => setSlotMute(slot, slot.index !== index));
  updateAllUi();
  saveSettingsToLocalStorage(false);
}

function setSlotMute(slot, muted) {
  slot.muted = muted;
  if (slot.ready && slot.player) {
    if (muted) {
      slot.player.mute();
    } else {
      slot.player.unMute();
    }
  }
}

function toggleModal(index) {
  if (appState.modalSlot === index) {
    closeModal();
    return;
  }
  openModal(index);
}

function openModal(index) {
  closeModal();
  const slot = appState.slots[index];
  if (!slot.videoId) {
    return;
  }
  appState.modalSlot = index;
  elements.modalTitle.textContent = `${slot.nameInput.value.trim() || `${index + 1}枠`} - 拡大表示`;
  elements.modalPlayerHost.appendChild(slot.playerShell);
  elements.modalOverlay.hidden = false;
  updateAllUi();
}

function closeModal() {
  if (appState.modalSlot === null) {
    return;
  }
  const slot = appState.slots[appState.modalSlot];
  const firstActionRow = slot.card.querySelector(".card-actions");
  slot.card.insertBefore(slot.playerShell, firstActionRow);
  appState.modalSlot = null;
  elements.modalOverlay.hidden = true;
  updateAllUi();
}

function eachReadyPlayer(callback) {
  appState.slots.forEach((slot) => {
    if (slot.ready && slot.player) {
      callback(slot);
    }
  });
}

function startClock() {
  appState.timerId = window.setInterval(() => {
    if (appState.isPlaying) {
      const now = Date.now();
      if (appState.lastTickAt === null) {
        appState.lastTickAt = now;
      }
      const elapsedSeconds = (now - appState.lastTickAt) / 1000;
      appState.reviewTime += elapsedSeconds * appState.rate;
      appState.lastTickAt = now;
      elements.reviewTimeInput.value = formatTime(appState.reviewTime);
    }
    updateAllUi();
  }, 1000);
}

function syncReviewTimeFromFirstReadyPlayer() {
  const firstReady = appState.slots.find((slot) => slot.ready && slot.player && typeof slot.player.getCurrentTime === "function");
  if (!firstReady) {
    return;
  }
  const current = firstReady.player.getCurrentTime();
  if (Number.isFinite(current)) {
    appState.reviewTime = Math.max(0, current - firstReady.startSeconds);
  }
}

function updateAllUi() {
  const loadedCount = appState.slots.filter((slot) => slot.ready).length;
  elements.reviewTimeDisplay.textContent = formatTime(appState.reviewTime);
  elements.playStateDisplay.textContent = appState.isPlaying ? "再生中" : "停止中";
  elements.rateDisplay.textContent = `${Number(appState.rate).toFixed(appState.rate % 1 === 0 ? 1 : 2)}x`;
  elements.loadedCountDisplay.textContent = `${loadedCount} / ${SLOT_COUNT}`;
  appState.slots.forEach(updateSlotUi);
}

function updateSlotUi(slot) {
  slot.card.classList.toggle("is-loaded", Boolean(slot.videoId && slot.player));
  slot.card.classList.toggle("has-error", Boolean(slot.error));
  slot.card.classList.toggle("is-selected", appState.selectedSlot === slot.index || appState.modalSlot === slot.index);
  slot.startStatus.textContent = `${formatTime(slot.startSeconds)}${slot.startValid ? "" : "（形式エラー: 0秒扱い）"}`;
  slot.actualStatus.textContent = getActualTimeText(slot);
  slot.muteStatus.textContent = slot.muted ? "ミュート中" : "音声ON";
  slot.loadStatus.textContent = slot.status;
  slot.errorMessage.textContent = slot.error;
  slot.muteButton.textContent = slot.muted ? "ミュート解除" : "ミュート";
}

function getActualTimeText(slot) {
  if (slot.ready && slot.player && typeof slot.player.getCurrentTime === "function") {
    const current = slot.player.getCurrentTime();
    if (Number.isFinite(current)) {
      return formatTime(current);
    }
  }
  return formatTime(slot.startSeconds + appState.reviewTime);
}

function showShareMessage(message, isWarning) {
  elements.shareWarning.textContent = message;
  elements.shareWarning.style.color = isWarning ? "var(--warning)" : "var(--ok)";
}
