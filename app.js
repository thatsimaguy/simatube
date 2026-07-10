const READ_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const WRITE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
const API_BASE = "https://www.googleapis.com/youtube/v3";
const WATCH_BASE = "https://www.youtube.com/watch";
const MIN_FEED_DURATION_SECONDS = 61;
const MAX_DISCOVERY_QUERIES = 4;
const MAX_SUBSCRIPTION_UPLOAD_CHANNELS = 12;
const MAX_SUBSCRIPTION_VIDEO_ROWS = 36;
const PLAYLIST_FETCH_BATCH_SIZE = 4;
const SUBSCRIPTION_PLAYLIST_TIMEOUT_MS = 9000;
const RECOVERY_SUBSCRIPTION_UPLOAD_CHANNELS = 6;
const BOOT_STABLE_DELAY_MS = 15000;
const REQUEST_TIMEOUT_MS = 20000;
const PLAYER_API_TIMEOUT_MS = 12000;
const GOOGLE_IDENTITY_TIMEOUT_MS = 10000;
const CACHE_CLEANUP_VERSION = "2026-07-v3";
const PERSONAL_CACHE_KEY = "yt_personal_cache_v1";
const PERSONAL_CACHE_VERSION = 1;
const PERSONAL_CACHE_FRESH_MS = 30 * 60 * 1000;
const PERSONAL_CACHE_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const INITIAL_VIDEO_ROWS = 12;
const VIDEO_ROWS_INCREMENT = 10;
const MAX_VIDEO_CACHE_ENTRIES = 240;
const MAX_CHANNEL_CACHE_ENTRIES = 120;
const MAX_CHANNEL_VIDEO_CACHES = 12;
const MAX_SEARCH_CACHE_ENTRIES = 8;
const MAX_COMMENTS_CACHE_ENTRIES = 6;
const MAX_SAVED_VIDEOS = 50;
const LIBRARY_INITIAL_VIDEO_ROWS = 6;
const INITIAL_SUBSCRIPTION_CHANNELS = 10;
const SUBSCRIPTION_CHANNEL_INCREMENT = 10;

const demoVideos = [
  {
    id: "jNQXAC9IVRw",
    title: "Me at the zoo",
    channelId: "UC4QobU6STFB0P71PMvOGN5A",
    channelTitle: "jawed",
    thumbnailUrl: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
    publishedAt: "2005-04-24T03:31:52Z",
    duration: "0:19",
    viewCount: "339M",
    likeCount: "16M",
    description: "The first video uploaded to YouTube.",
  },
  {
    id: "M7lc1UVf-VE",
    title: "YouTube Developers Live: Embedded Web Player Customization",
    channelId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    channelTitle: "Google for Developers",
    thumbnailUrl: "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg",
    publishedAt: "2012-06-25T17:16:31Z",
    duration: "15:32",
    viewCount: "1.1M",
    likeCount: "18K",
    description: "A player-focused YouTube developer video.",
  },
  {
    id: "ScMzIvxBSi4",
    title: "Big Buck Bunny 60fps 4K - Blender Foundation",
    channelId: "UCz75RVbH8q2jdBJ4SnwuZZQ",
    channelTitle: "Blender Foundation",
    thumbnailUrl: "https://i.ytimg.com/vi/ScMzIvxBSi4/hqdefault.jpg",
    publishedAt: "2014-11-10T14:15:00Z",
    duration: "10:34",
    viewCount: "67M",
    likeCount: "521K",
    description: "Open animation with bright visuals and smooth motion.",
  },
  {
    id: "aqz-KE-bpKQ",
    title: "Big Buck Bunny",
    channelId: "UCz75RVbH8q2jdBJ4SnwuZZQ",
    channelTitle: "Blender",
    thumbnailUrl: "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg",
    publishedAt: "2008-05-20T12:00:00Z",
    duration: "9:56",
    viewCount: "71M",
    likeCount: "403K",
    description: "A classic embeddable animation video.",
  },
];

const demoChannels = [
  {
    id: "UC4QobU6STFB0P71PMvOGN5A",
    title: "jawed",
    thumbnailUrl: "",
    uploadsPlaylistId: "",
  },
  {
    id: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    title: "Google for Developers",
    thumbnailUrl: "",
    uploadsPlaylistId: "",
  },
  {
    id: "UCz75RVbH8q2jdBJ4SnwuZZQ",
    title: "Blender Foundation",
    thumbnailUrl: "",
    uploadsPlaylistId: "",
  },
];

const app = document.querySelector("#app");
const sheetRoot = document.querySelector("#sheet-root");
const toast = document.querySelector("#toast");
const recoveringFromFastReload = beginBootGuard();
let googleIdentityLoadPromise = null;
let serverSessionRefreshPromise = null;
let pendingRenderFocus = null;
const storedSavedVideos = readArray("yt_saved_videos")
  .map(compactStoredVideo)
  .filter((video) => video?.id)
  .slice(0, MAX_SAVED_VIDEOS);
const storedSavedIds = readArray("yt_saved_ids")
  .filter((id) => typeof id === "string")
  .slice(0, MAX_SAVED_VIDEOS);

const state = {
  view: recoveringFromFastReload ? "home" : sanitizeView(readJson("yt_last_view", "home")),
  auth: {
    accessToken: "",
    scopes: new Set(),
    profile: null,
  },
  authResult: new URL(window.location.href).searchParams.get("auth") || "",
  config: normalizeConfig(window.YT_APP_CONFIG || {}),
  activeVideoId: readString("yt_active_video_id", demoVideos[0].id),
  homeFeed: [],
  searchResults: [],
  subscriptions: [],
  subscriptionVideos: [],
  subscriptionWarning: "",
  queue: [],
  comments: [],
  commentsByVideoId: {},
  commentsStatusByVideoId: {},
  commentsErrorByVideoId: {},
  commentsAbortController: null,
  commentsLoadingVideoId: "",
  likedVideos: [],
  likedVideosLoaded: false,
  ratings: {},
  subscriptionIdsByChannel: {},
  channelThumbnailsById: {},
  feedReasonsById: {},
  activeChannelId: readString("yt_active_channel_id", ""),
  channelCacheById: Object.fromEntries(demoChannels.map((channel) => [channel.id, channel])),
  channelVideosById: Object.fromEntries(demoChannels.map((channel) => [
    channel.id,
    demoVideos.filter((video) => video.channelId === channel.id),
  ])),
  videoCacheById: Object.fromEntries(demoVideos.map((video) => [video.id, video])),
  channelLoading: false,
  channelLoadingId: "",
  channelLoadVersion: 0,
  channelAbortController: null,
  channelLoadedIds: new Set(),
  channelSort: "latest",
  recentChannels: readArray("yt_recent_channels").map(compactStoredChannel).filter((channel) => channel?.id).slice(0, 12),
  savedIds: new Set([...storedSavedIds, ...storedSavedVideos.map((video) => video.id)]),
  savedVideos: storedSavedVideos,
  localHistory: readArray("yt_history").map(compactStoredVideo).filter((video) => video?.id).slice(0, 30),
  searchHistory: readArray("yt_search_history").filter((query) => typeof query === "string").slice(0, 20),
  onboarded: readBoolean("yt_onboarded", false),
  fullscreenControlsTimer: 0,
  fullscreenControlsHidden: false,
  installIntroDone: readBoolean("yt_install_intro_done", false),
  rememberSignIn: readBoolean("yt_remember_youtube_signin", false),
  reconnectFailed: false,
  demoMode: readBoolean("yt_demo_mode", false),
  recoveryMode: recoveringFromFastReload,
  feedLoading: false,
  subscriptionsLoaded: false,
  subscriptionLoadPromise: null,
  homeFeedLoaded: false,
  homeFeedLoadPromise: null,
  homeFeedLoadScheduled: false,
  usingCachedPersonalFeed: false,
  visibleRowsBySource: {},
  visibleSubscriptionChannels: INITIAL_SUBSCRIPTION_CHANNELS,
  pendingActions: new Set(),
  loading: "",
  error: "",
  query: "",
  searchLoadVersion: 0,
  searchStatus: "idle",
  searchCacheByQuery: Object.create(null),
  searchAbortController: null,
  commentsLoadVersion: 0,
  authVersion: 0,
  homeFilter: "all",
  player: null,
  playerVideoId: "",
  pendingAutoplayVideoId: "",
  playerReady: false,
  playerError: null,
  ytApiReady: false,
  playerApiLoadTimer: 0,
};

cacheVideos([...state.localHistory, ...state.savedVideos]);

await loadOptionalLocalConfig();
state.config = normalizeConfig(window.YT_APP_CONFIG || {});
boot();
clearOldServiceWorkers();
window.addEventListener("pagehide", (event) => {
  clearPlayerFullscreenControlsTimer();
  if (event.persisted) {
    state.player?.pauseVideo?.();
    return;
  }
  clearPlayerApiLoadTimer();
  destroyPlayer();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && state.view === "watch") {
    mountPlayer(false);
  }
});

function normalizeConfig(config) {
  return {
    youtubeApiKey: config.youtubeApiKey || "",
    googleOAuthClientId: config.googleOAuthClientId || "",
    serverOAuthEnabled: Boolean(config.serverOAuthEnabled),
    regionCode: config.regionCode || "US",
    maxSubscriptionChannels: clampNumber(config.maxSubscriptionChannels, 1, 50, 50),
    uploadsPerChannel: clampNumber(config.uploadsPerChannel, 1, 5, 2),
  };
}

async function loadOptionalLocalConfig() {
  try {
    const response = await fetch(`./config.local.js?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const code = await response.text();
    new Function(code)();
  } catch {
    // Local configuration is optional; production uses the generated runtime config.
  }
}

function boot() {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  window.onYouTubeIframeAPIReady = () => {
    clearPlayerApiLoadTimer();
    state.ytApiReady = true;
    if (state.view === "watch") {
      mountPlayer(state.pendingAutoplayVideoId === state.activeVideoId);
    }
  };

  state.feedLoading = shouldLoadInitialFeed();
  state.homeFeed = state.demoMode ? demoVideos : [];
  state.queue = state.homeFeed;
  initializeNavigationHistory();
  clearAuthResultFromUrl();
  render();
  window.requestAnimationFrame(resetScroll);
  setupPortraitOrientationLock();
  setupNetworkStatus();
  window.setTimeout(markBootStable, BOOT_STABLE_DELAY_MS);
  if (state.view === "channel" && state.activeChannelId) {
    loadActiveChannel({ quiet: true });
  }

  restoreServerSession().then((restored) => {
    if (restored) {
      return;
    }
    if (state.reconnectFailed) {
      state.feedLoading = false;
      render();
      return;
    }

    if (shouldRestoreSignIn()) {
      restoreSignIn();
      return;
    }

    if (hasApiAccess()) {
      loadPopularHome();
    }
  });
}

function setupPortraitOrientationLock() {
  tryLockPortraitOrientation();
  window.addEventListener("resize", tryLockPortraitOrientation);
  window.addEventListener("orientationchange", tryLockPortraitOrientation);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      tryLockPortraitOrientation();
    }
  });
}

function setupNetworkStatus() {
  const syncStatus = () => {
    document.documentElement.classList.toggle("offline", navigator.onLine === false);
    document.body.classList.toggle("offline", navigator.onLine === false);
  };
  syncStatus();
  window.addEventListener("offline", () => {
    syncStatus();
    showToast("You're offline. Watch history stays available.");
  });
  window.addEventListener("online", async () => {
    syncStatus();
    showToast("Back online.");
    if (state.config.serverOAuthEnabled && state.rememberSignIn && !state.auth.profile) {
      state.reconnectFailed = false;
      state.feedLoading = true;
      render();
      await restoreServerSession();
      return;
    }
    if (state.view === "home" && !state.homeFeed.length && hasApiAccess()) {
      loadPopularHome();
    }
  });
}

function tryLockPortraitOrientation() {
  try {
    screen.orientation?.lock?.("portrait")?.catch?.(() => {});
  } catch {
    // Normal browser tabs can reject orientation locks; the CSS blocker handles that case.
  }
}

async function restoreServerSession() {
  if (!state.config.serverOAuthEnabled) {
    return false;
  }

  const authVersion = state.authVersion;
  try {
    const session = await fetchServerSession();
    if (authVersion !== state.authVersion) {
      return false;
    }
    if (!session.authenticated) {
      if (["error", "invalid", "failed"].includes(state.authResult)) {
        showToast("Sign-in did not finish. Try again.");
        state.authResult = "";
      }
      if (state.rememberSignIn) {
        state.reconnectFailed = true;
        render();
      }
      return false;
    }

    applyServerSession(session);
    if (!await loadMe(authVersion)) {
      return false;
    }
    const cacheStatus = restorePersonalCache(state.auth.profile.id);
    state.onboarded = true;
    state.demoMode = false;
    state.rememberSignIn = true;
    state.reconnectFailed = false;
    state.feedLoading = !cacheStatus.restored
      && (state.view === "home" || state.view === "subscriptions");
    writeJson("yt_onboarded", true);
    writeJson("yt_demo_mode", false);
    writeJson("yt_remember_youtube_signin", true);
    render();
    scheduleInitialPersonalLoad(cacheStatus);
    if (state.authResult === "server") {
      showToast("Signed in.");
    }
    state.authResult = "";
    return true;
  } catch {
    if (authVersion !== state.authVersion) {
      return false;
    }
    if (navigator.onLine === false) {
      const cachedFeed = cachedOfflineHomeFeed();
      state.feedLoading = false;
      state.homeFeed = cachedFeed.length
        ? cachedFeed
        : state.localHistory.length ? state.localHistory : demoVideos;
      state.queue = state.homeFeed;
      render();
      return false;
    }
    if (state.authResult) {
      showToast(state.authResult === "server"
        ? "Sign-in could not be confirmed. Try again."
        : "Sign-in did not finish. Try again.");
      state.authResult = "";
    }
    if (state.rememberSignIn) {
      state.reconnectFailed = true;
      render();
    }
    return false;
  }
}

async function fetchServerSession() {
  const response = await fetchWithTimeout("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok && response.status !== 401) {
    throw new Error(payload.error || "Could not load server session.");
  }

  return payload;
}

async function fetchWithTimeout(input, options = {}, timeoutMs = 10000) {
  if (navigator.onLine === false) {
    throw new Error("You're offline. Try again when your connection returns.");
  }
  if (!("AbortController" in window) || options.signal) {
    return fetch(input, options);
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function applyServerSession(session) {
  state.auth.accessToken = session.accessToken || "";
  state.auth.scopes = new Set(session.scopes || []);
}

async function refreshServerAccessToken() {
  if (!state.config.serverOAuthEnabled) {
    return false;
  }
  if (serverSessionRefreshPromise) {
    return serverSessionRefreshPromise;
  }

  const authVersion = state.authVersion;
  const request = fetchServerSession()
    .then((session) => {
      if (!session.authenticated || authVersion !== state.authVersion) {
        return false;
      }
      applyServerSession(session);
      return true;
    })
    .finally(() => {
      if (serverSessionRefreshPromise === request) {
        serverSessionRefreshPromise = null;
      }
    });
  serverSessionRefreshPromise = request;
  return request;
}

async function beginServerSignIn() {
  state.rememberSignIn = true;
  state.demoMode = false;
  state.reconnectFailed = false;
  writeJson("yt_remember_youtube_signin", true);
  writeJson("yt_demo_mode", false);
  window.location.assign("/api/auth/start");
}

async function clearServerSession() {
  if (!state.config.serverOAuthEnabled) {
    return;
  }

  try {
    await fetchWithTimeout("/api/auth/logout", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    // Local sign-out should still proceed if the server request fails.
  }
}

function shouldRestoreSignIn() {
  return !state.config.serverOAuthEnabled
    && state.rememberSignIn
    && hasOAuthClient()
    && !state.auth.accessToken
    && !state.demoMode;
}

function shouldLoadInitialFeed() {
  return state.view === "home"
    && !state.demoMode
    && !shouldShowInstallIntro()
    && !shouldShowOnboarding()
    && !shouldShowReconnect()
    && (state.rememberSignIn || hasApiAccess());
}

function hasApiAccess() {
  return Boolean(state.config.youtubeApiKey || state.auth.accessToken);
}

function hasOAuthClient() {
  return Boolean(state.config.googleOAuthClientId);
}

function sanitizeView(view) {
  return ["home", "search", "watch", "subscriptions", "channel", "you"].includes(view) ? view : "home";
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function scheduleInitialPersonalLoad(cacheStatus = {}) {
  if (cacheStatus.subscriptionsFresh) {
    state.feedLoading = false;
    markBootStable();
    if (state.view === "home" && !cacheStatus.homeFresh) {
      scheduleHomeFeedEnrichment({ refresh: true });
    }
    return;
  }

  const start = () => loadSubscriptionsAndFeed({
    quiet: true,
    includeHome: state.view === "home",
    conservative: state.recoveryMode,
    refresh: Boolean(cacheStatus.restored),
    background: Boolean(cacheStatus.restored),
  });

  if (state.recoveryMode) {
    window.setTimeout(start, 1200);
    return;
  }

  waitForIdleFrame().then(start);
}

function readArray(key) {
  const value = readJson(key, []);
  return Array.isArray(value) ? value : [];
}

function readBoolean(key, fallback = false) {
  const value = readJson(key, fallback);
  return typeof value === "boolean" ? value : fallback;
}

function readString(key, fallback = "") {
  const value = readJson(key, fallback);
  return typeof value === "string" ? value : fallback;
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("Local storage is unavailable.");
  }
}

function readPersonalCache() {
  const cached = readJson(PERSONAL_CACHE_KEY, null);
  if (!cached || cached.version !== PERSONAL_CACHE_VERSION || !cached.profile?.id) {
    return null;
  }
  return cached;
}

function restorePersonalCache(profileId) {
  const cached = readPersonalCache();
  if (!cached || cached.profile.id !== profileId) {
    if (cached) {
      clearPersonalCache();
    }
    return { restored: false, subscriptionsFresh: false, homeFresh: false };
  }

  const now = Date.now();
  const subscriptionsUpdatedAt = Number(cached.subscriptionsUpdatedAt || 0);
  const homeUpdatedAt = Number(cached.homeUpdatedAt || 0);
  const subscriptionsUsable = subscriptionsUpdatedAt > 0
    && now - subscriptionsUpdatedAt <= PERSONAL_CACHE_MAX_STALE_MS;
  const homeUsable = homeUpdatedAt > 0
    && now - homeUpdatedAt <= PERSONAL_CACHE_MAX_STALE_MS;
  if (!subscriptionsUsable && !homeUsable) {
    clearPersonalCache();
    return { restored: false, subscriptionsFresh: false, homeFresh: false };
  }

  const subscriptions = subscriptionsUsable && Array.isArray(cached.subscriptions)
    ? cached.subscriptions.map(compactStoredChannel).filter((channel) => channel?.id).slice(0, 50)
    : [];
  const subscriptionVideos = subscriptionsUsable && Array.isArray(cached.subscriptionVideos)
    ? cached.subscriptionVideos.map(compactStoredVideo).filter((video) => video?.id).slice(0, MAX_SUBSCRIPTION_VIDEO_ROWS)
    : [];
  const homeFeed = homeUsable && Array.isArray(cached.homeFeed)
    ? cached.homeFeed.map(compactStoredVideo).filter((video) => video?.id).slice(0, 40)
    : [];
  const likedVideos = Array.isArray(cached.likedVideos)
    ? cached.likedVideos.map(compactStoredVideo).filter((video) => video?.id).slice(0, 25)
    : [];
  const subscriptionsFresh = subscriptionsUsable
    && cached.subscriptionsLoaded === true
    && now - subscriptionsUpdatedAt < PERSONAL_CACHE_FRESH_MS;
  const homeFresh = homeUsable
    && cached.homeFeedLoaded === true
    && homeFeed.length > 0
    && now - homeUpdatedAt < PERSONAL_CACHE_FRESH_MS;

  state.subscriptions = subscriptions;
  state.subscriptionVideos = subscriptionVideos;
  state.homeFeed = homeFeed.length ? homeFeed : subscriptionVideos.slice(0, 40);
  state.queue = state.homeFeed;
  state.likedVideos = likedVideos;
  state.likedVideosLoaded = cached.likedVideosLoaded === true || likedVideos.length > 0;
  state.subscriptionIdsByChannel = stringRecord(cached.subscriptionIdsByChannel);
  state.feedReasonsById = stringRecord(cached.feedReasonsById);
  state.subscriptionsLoaded = Boolean(subscriptionsUsable && cached.subscriptionsLoaded);
  state.homeFeedLoaded = homeFresh;
  state.feedLoading = false;
  state.usingCachedPersonalFeed = true;
  cacheChannels(subscriptions);
  cacheVideos([...subscriptionVideos, ...homeFeed, ...likedVideos]);

  return {
    restored: Boolean(cached.subscriptionsLoaded || cached.homeFeedLoaded || state.homeFeed.length),
    subscriptionsFresh,
    homeFresh,
  };
}

function savePersonalCache(options = {}) {
  const profile = state.auth.profile;
  if (!profile?.id) {
    return;
  }

  const previous = readPersonalCache();
  const sameProfile = previous?.profile?.id === profile.id ? previous : null;
  const now = Date.now();
  const homeFeed = state.homeFeed.slice(0, 40).map(compactStoredVideo);
  const feedReasonsById = Object.fromEntries(homeFeed
    .map((video) => [video.id, state.feedReasonsById[video.id] || ""])
    .filter(([, reason]) => reason));
  const payload = {
    version: PERSONAL_CACHE_VERSION,
    savedAt: now,
    subscriptionsUpdatedAt: options.subscriptions
      ? now
      : Number(sameProfile?.subscriptionsUpdatedAt || 0),
    homeUpdatedAt: options.home
      ? now
      : Number(sameProfile?.homeUpdatedAt || 0),
    profile: {
      ...profile,
      thumbnailUrl: compactAvatarUrl(profile.thumbnailUrl),
    },
    subscriptionsLoaded: state.subscriptionsLoaded,
    homeFeedLoaded: state.homeFeedLoaded,
    likedVideosLoaded: state.likedVideosLoaded,
    subscriptions: state.subscriptions.slice(0, 50).map(compactStoredChannel),
    subscriptionVideos: state.subscriptionVideos.slice(0, MAX_SUBSCRIPTION_VIDEO_ROWS).map(compactStoredVideo),
    homeFeed,
    likedVideos: state.likedVideos.slice(0, 25).map(compactStoredVideo),
    subscriptionIdsByChannel: state.subscriptionIdsByChannel,
    feedReasonsById,
  };

  try {
    localStorage.setItem(PERSONAL_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Personalized caching is an optimization; live data remains usable if storage is full.
  }
}

function clearPersonalCache() {
  try {
    localStorage.removeItem(PERSONAL_CACHE_KEY);
  } catch {
    // Private browsing can make local storage unavailable.
  }
}

function cachedOfflineHomeFeed() {
  const cached = readPersonalCache();
  if (!cached || Date.now() - Number(cached.homeUpdatedAt || 0) > PERSONAL_CACHE_MAX_STALE_MS) {
    return [];
  }
  const feed = Array.isArray(cached.homeFeed)
    ? cached.homeFeed.map(compactStoredVideo).filter((video) => video?.id).slice(0, 40)
    : [];
  if (feed.length) {
    state.feedReasonsById = stringRecord(cached.feedReasonsById);
    state.usingCachedPersonalFeed = true;
    cacheVideos(feed);
  }
  return feed;
}

function stringRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => key && typeof item === "string"));
}

function clearAuthResultFromUrl() {
  if (!state.authResult) {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("auth");
  if (url.hash === "#home" || url.hash === "#signin") {
    url.hash = "";
  }
  history.replaceState(navigationState(), "", `${url.pathname}${url.search}${url.hash}`);
}

function beginBootGuard() {
  try {
    const now = Date.now();
    const previous = Number(sessionStorage.getItem("yt_boot_pending_at") || 0);
    sessionStorage.setItem("yt_boot_pending_at", String(now));
    return previous > 0 && now - previous < BOOT_STABLE_DELAY_MS * 2;
  } catch {
    return false;
  }
}

function markBootStable() {
  try {
    sessionStorage.removeItem("yt_boot_pending_at");
  } catch {
    // Private browsing can make session storage unavailable.
  }
  state.recoveryMode = false;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function loadYouTubeIframeApi() {
  if (window.YT?.Player) {
    clearPlayerApiLoadTimer();
    state.ytApiReady = true;
    if (state.view === "watch" && state.pendingAutoplayVideoId === state.activeVideoId) {
      window.requestAnimationFrame(() => mountPlayer(true));
    }
    return;
  }

  if (document.querySelector('script[data-simatube-player-api]')) {
    return;
  }

  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.dataset.simatubePlayerApi = "";
  script.async = true;
  script.onerror = () => failPlayerApiLoad(script);
  document.head.append(script);
  clearPlayerApiLoadTimer();
  state.playerApiLoadTimer = window.setTimeout(
    () => failPlayerApiLoad(script),
    PLAYER_API_TIMEOUT_MS,
  );
}

function clearPlayerApiLoadTimer() {
  window.clearTimeout(state.playerApiLoadTimer);
  state.playerApiLoadTimer = 0;
}

function failPlayerApiLoad(script) {
  if (script.dataset.simatubeFailed === "true") {
    return;
  }
  if (window.YT?.Player) {
    clearPlayerApiLoadTimer();
    state.ytApiReady = true;
    if (state.view === "watch" && state.pendingAutoplayVideoId === state.activeVideoId) {
      window.requestAnimationFrame(() => mountPlayer(true));
    }
    return;
  }
  script.dataset.simatubeFailed = "true";
  script.remove();
  clearPlayerApiLoadTimer();
  state.ytApiReady = false;
  state.pendingAutoplayVideoId = "";
  const poster = document.querySelector(".poster-button");
  poster?.classList.remove("is-loading");
  poster?.removeAttribute("aria-busy");
  showToast("The player could not load. Tap to try again.");
}

function cancelPendingPlayerApiLoad() {
  clearPlayerApiLoadTimer();
  if (!window.YT?.Player) {
    const script = document.querySelector('script[data-simatube-player-api]');
    if (script) {
      script.dataset.simatubeFailed = "true";
      script.remove();
    }
    state.ytApiReady = false;
  }
}

async function clearOldServiceWorkers() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") {
    return;
  }
  if (readString("yt_cache_cleanup_version") === CACHE_CLEANUP_VERSION) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    writeJson("yt_cache_cleanup_version", CACHE_CLEANUP_VERSION);
  } catch {
    // Cache cleanup is best-effort; the app still works without it.
  }
}

function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (googleIdentityLoadPromise) {
    return googleIdentityLoadPromise;
  }

  document.querySelector('script[src="https://accounts.google.com/gsi/client"]')?.remove();
  googleIdentityLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    const timeoutId = window.setTimeout(() => {
      script.remove();
      googleIdentityLoadPromise = null;
      reject(new Error("Google sign-in took too long to load."));
    }, GOOGLE_IDENTITY_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timeoutId);
      googleIdentityLoadPromise = null;
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      script.remove();
      reject(new Error("Google sign-in is unavailable right now."));
    };
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      script.remove();
      googleIdentityLoadPromise = null;
      reject(new Error("Google sign-in could not load."));
    };
    document.head.append(script);
  });
  return googleIdentityLoadPromise;
}

async function requestToken(scopes, options = {}) {
  if (!hasOAuthClient()) {
    if (!options.quiet) {
      openSheet("Sign in needs setup", setupCopy(), [
        { label: "Open Google Cloud", href: "https://console.cloud.google.com/apis/credentials" },
        { label: "Close", action: closeSheet },
      ]);
    }
    throw new Error("Missing OAuth client ID.");
  }

  await loadGoogleIdentity();

  return new Promise((resolve, reject) => {
    const scope = scopes.join(" ");
    const prompt = options.prompt ?? (state.auth.accessToken ? "" : "consent");
    let settled = false;
    const finish = (handler, value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      handler(value);
    };
    const timeoutId = options.timeoutMs
      ? window.setTimeout(() => {
        finish(reject, new Error("Tap Sign in to reconnect SimaTube."));
      }, options.timeoutMs)
      : 0;
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: state.config.googleOAuthClientId,
      scope,
      prompt,
      include_granted_scopes: true,
      callback: (response) => {
        if (response.error) {
          finish(reject, new Error(response.error_description || response.error));
          return;
        }

        state.auth.accessToken = response.access_token;
        String(response.scope || scope).split(" ").filter(Boolean)
          .forEach((item) => state.auth.scopes.add(item));
        finish(resolve, response.access_token);
      },
    });

    try {
      tokenClient.requestAccessToken();
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function ensureReadAuth(options = {}) {
  if (state.auth.accessToken && state.auth.scopes.has(READ_SCOPE)) {
    return state.auth.accessToken;
  }

  return requestToken([READ_SCOPE], options);
}

async function ensureWriteAuth(options = {}) {
  if (state.auth.accessToken && state.auth.scopes.has(WRITE_SCOPE)) {
    return state.auth.accessToken;
  }

  return requestToken([READ_SCOPE, WRITE_SCOPE], options);
}

async function youtubeFetch(path, params = {}, options = {}) {
  if (navigator.onLine === false) {
    throw new Error("You're offline. Try again when your connection returns.");
  }
  const useAuth = options.auth || (!state.config.youtubeApiKey && Boolean(state.auth.accessToken));
  const url = new URL(`${API_BASE}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const headers = { ...(options.headers || {}) };
  if (useAuth && state.auth.accessToken) {
    headers.Authorization = `Bearer ${state.auth.accessToken}`;
  } else if (state.config.youtubeApiKey) {
    url.searchParams.set("key", state.config.youtubeApiKey);
  } else {
    throw new Error("Add an API key or sign in first.");
  }

  const controller = !options.signal && "AbortController" in window ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS)
    : 0;
  let response;

  try {
    response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body,
      signal: options.signal || controller?.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      if (options.signal?.aborted) {
        const cancelled = new Error("Request cancelled.");
        cancelled.name = "AbortError";
        throw cancelled;
      }
      throw new Error("YouTube took too long to respond. Try again.");
    }
    throw error;
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }

  if (response.status === 204) {
    return {};
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && useAuth && !options.retriedAfterRefresh) {
      const refreshed = await refreshServerAccessToken().catch(() => false);
      if (refreshed) {
        return youtubeFetch(path, params, { ...options, retriedAfterRefresh: true });
      }
    }

    const message = payload.error?.message || `YouTube API request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload;
}

async function listAll(path, params, options = {}, limit = 50) {
  const items = [];
  let pageToken = "";

  do {
    const payload = await youtubeFetch(path, { ...params, pageToken }, options);
    items.push(...(payload.items || []));
    pageToken = payload.nextPageToken || "";
  } while (pageToken && items.length < limit);

  return items.slice(0, limit);
}

async function loadPopularHome() {
  if (state.auth.accessToken || state.homeFeedLoaded || state.loading === "Loading Home") {
    return;
  }
  if (navigator.onLine === false) {
    const cachedFeed = cachedOfflineHomeFeed();
    state.feedLoading = false;
    state.homeFeed = cachedFeed.length
      ? cachedFeed
      : state.localHistory.length ? state.localHistory : demoVideos;
    state.queue = state.homeFeed;
    render();
    return;
  }

  state.feedLoading = true;
  setLoading("Loading Home");
  try {
    const popularVideos = await loadPopularVideos();
    const rankedPopular = rankHomeCandidates(popularVideos.map((video) => ({ video, source: "popular" })));
    state.homeFeed = rankedPopular.length ? rankedPopular : demoVideos;
    state.queue = state.homeFeed;
    state.homeFeedLoaded = true;
    state.usingCachedPersonalFeed = false;
    state.error = "";
  } catch (error) {
    state.error = error.message;
    state.homeFeed = demoVideos;
    state.queue = demoVideos;
    state.homeFeedLoaded = true;
  } finally {
    state.feedLoading = false;
    clearLoading();
  }
}

async function signIn() {
  if (state.config.serverOAuthEnabled) {
    await beginServerSignIn();
    return;
  }

  const authVersion = state.authVersion;
  setLoading("Signing in");
  try {
    await ensureReadAuth({ prompt: state.rememberSignIn ? "" : "consent" });
    if (!await loadMe(authVersion)) {
      return;
    }
    state.searchCacheByQuery = Object.create(null);
    state.searchResults = [];
    state.searchStatus = "idle";
    state.query = "";
    const cacheStatus = restorePersonalCache(state.auth.profile.id);
    if (!cacheStatus.subscriptionsFresh) {
      await loadSubscriptionsAndFeed({
        background: cacheStatus.restored,
        refresh: cacheStatus.restored,
      });
    } else {
      markBootStable();
      if (!cacheStatus.homeFresh) {
        scheduleHomeFeedEnrichment({ refresh: true });
      }
    }
    state.onboarded = true;
    state.demoMode = false;
    state.rememberSignIn = true;
    state.reconnectFailed = false;
    writeJson("yt_onboarded", true);
    writeJson("yt_demo_mode", false);
    writeJson("yt_remember_youtube_signin", true);
    state.view = "home";
    writeJson("yt_last_view", "home");
    updateNavigationHistory({ replaceHistory: true });
    resetScroll();
    showToast("Signed in.");
  } catch (error) {
    openSheet("Sign in did not finish", error.message, [{ label: "Close", action: closeSheet }]);
  } finally {
    clearLoading();
  }
}

async function signOut() {
  cancelPendingPlayerApiLoad();
  cancelSearchRequest();
  cancelCommentsRequest();
  cancelChannelRequest();
  clearPersonalCache();
  state.authVersion += 1;
  state.searchLoadVersion += 1;
  state.commentsLoadVersion += 1;
  state.channelLoadVersion += 1;
  await clearServerSession();
  state.auth.accessToken = "";
  state.auth.scopes.clear();
  state.auth.profile = null;
  state.subscriptions = [];
  state.subscriptionVideos = [];
  state.subscriptionWarning = "";
  state.subscriptionIdsByChannel = {};
  state.likedVideos = [];
  state.likedVideosLoaded = false;
  state.searchCacheByQuery = Object.create(null);
  state.searchResults = [];
  state.searchStatus = "idle";
  state.query = "";
  state.comments = [];
  state.commentsByVideoId = {};
  state.commentsStatusByVideoId = {};
  state.commentsErrorByVideoId = {};
  state.channelLoading = false;
  state.channelLoadingId = "";
  state.subscriptionsLoaded = false;
  state.homeFeedLoaded = false;
  state.subscriptionLoadPromise = null;
  state.homeFeedLoadPromise = null;
  state.homeFeedLoadScheduled = false;
  state.pendingActions.clear();
  state.rememberSignIn = false;
  state.reconnectFailed = false;
  state.feedLoading = false;
  state.usingCachedPersonalFeed = false;
  state.loading = "";
  state.homeFeed = demoVideos;
  state.queue = demoVideos;
  state.view = "home";
  writeJson("yt_remember_youtube_signin", false);
  writeJson("yt_last_view", "home");
  updateNavigationHistory({ replaceHistory: true });
  showToast("Signed out.");
  render();
  resetScroll();
}

function continueDemo() {
  clearPersonalCache();
  cancelSearchRequest();
  cancelCommentsRequest();
  cancelChannelRequest();
  state.authVersion += 1;
  state.searchLoadVersion += 1;
  state.commentsLoadVersion += 1;
  state.channelLoadVersion += 1;
  state.auth.accessToken = "";
  state.auth.scopes.clear();
  state.auth.profile = null;
  state.subscriptions = [];
  state.subscriptionVideos = [];
  state.subscriptionIdsByChannel = {};
  state.subscriptionsLoaded = false;
  state.subscriptionLoadPromise = null;
  state.homeFeedLoaded = false;
  state.homeFeedLoadPromise = null;
  state.homeFeedLoadScheduled = false;
  state.onboarded = true;
  state.demoMode = true;
  state.rememberSignIn = false;
  state.reconnectFailed = false;
  state.feedLoading = false;
  state.usingCachedPersonalFeed = false;
  state.likedVideos = [];
  state.likedVideosLoaded = false;
  state.searchCacheByQuery = Object.create(null);
  state.searchResults = [];
  state.searchStatus = "idle";
  state.query = "";
  state.homeFeed = demoVideos;
  state.queue = demoVideos;
  state.view = "home";
  cancelPendingPlayerApiLoad();
  writeJson("yt_onboarded", true);
  writeJson("yt_demo_mode", true);
  writeJson("yt_remember_youtube_signin", false);
  writeJson("yt_last_view", "home");
  updateNavigationHistory({ replaceHistory: true });
  showToast("Demo feed ready.");
  render();
  resetScroll();
}

async function restoreSignIn() {
  const authVersion = state.authVersion;
  state.feedLoading = true;
  setLoading("Reconnecting SimaTube");

  try {
    await ensureReadAuth({ prompt: "", quiet: true, timeoutMs: 7000 });
    if (!await loadMe(authVersion)) {
      return;
    }
    const cacheStatus = restorePersonalCache(state.auth.profile.id);
    if (!cacheStatus.subscriptionsFresh) {
      await loadSubscriptionsAndFeed({
        quiet: true,
        background: cacheStatus.restored,
        refresh: cacheStatus.restored,
      });
    } else {
      markBootStable();
      if (!cacheStatus.homeFresh) {
        scheduleHomeFeedEnrichment({ refresh: true });
      }
    }
    state.onboarded = true;
    state.demoMode = false;
    state.rememberSignIn = true;
    state.reconnectFailed = false;
    writeJson("yt_onboarded", true);
    writeJson("yt_demo_mode", false);
    writeJson("yt_remember_youtube_signin", true);
    showToast("Signed back in.");
  } catch {
    state.auth.accessToken = "";
    state.auth.scopes.clear();
    state.auth.profile = null;
    state.reconnectFailed = true;
    state.homeFeed = demoVideos;
    state.queue = demoVideos;
  } finally {
    state.feedLoading = false;
    clearLoading();
  }

  if (!state.auth.accessToken && hasApiAccess()) {
    loadPopularHome();
  }
}

async function loadMe(expectedAuthVersion = state.authVersion) {
  const payload = await youtubeFetch("/channels", {
    part: "snippet,contentDetails",
    mine: "true",
  }, { auth: true });

  const channel = payload.items?.[0];
  if (expectedAuthVersion !== state.authVersion) {
    return false;
  }
  if (!channel) {
    throw new Error("No YouTube channel was found for this account.");
  }

  state.auth.profile = {
    id: channel.id,
    title: channel.snippet?.title || "You",
    thumbnailUrl: avatarThumbnail(channel.snippet?.thumbnails),
    likedPlaylistId: channel.contentDetails?.relatedPlaylists?.likes || "",
  };
  return true;
}

function loadSubscriptionsAndFeed(options = {}) {
  if (state.subscriptionLoadPromise) {
    return state.subscriptionLoadPromise;
  }

  const authVersion = state.authVersion;
  const request = performSubscriptionLoad(options)
    .catch((error) => {
      if (authVersion !== state.authVersion) {
        return false;
      }
      state.feedLoading = false;
      state.loading = "";
      state.error = error.message;
      if (!options.quiet) {
        openSheet("Could not load subscriptions", error.message, [{ label: "Close", action: closeSheet }]);
      }
      return false;
    })
    .then((loaded) => {
      if (loaded && options.includeHome !== false) {
        scheduleHomeFeedEnrichment({ refresh: options.refresh });
      }
      return loaded;
    })
    .finally(() => {
      if (state.subscriptionLoadPromise === request) {
        state.subscriptionLoadPromise = null;
        if (state.view === "subscriptions" || state.view === "home") {
          render();
        }
      }
    });

  state.subscriptionLoadPromise = request;
  return request;
}

async function performSubscriptionLoad(options = {}) {
  const authVersion = state.authVersion;
  await ensureReadAuth(options.authOptions || {});
  if (authVersion !== state.authVersion || !state.auth.accessToken) {
    return false;
  }

  const hasVisibleContent = state.subscriptions.length || state.subscriptionVideos.length;
  const showBlockingLoader = !options.background && !hasVisibleContent;
  state.feedLoading = showBlockingLoader;
  state.error = "";
  state.subscriptionWarning = "";
  if (showBlockingLoader) {
    setLoading("Loading subscriptions");
  }

  try {
    const subs = await listAll("/subscriptions", {
      part: "snippet,contentDetails",
      mine: "true",
      maxResults: 50,
      order: "unread",
    }, { auth: true }, state.config.maxSubscriptionChannels);
    if (authVersion !== state.authVersion) {
      return false;
    }

    state.subscriptionIdsByChannel = {};
    subs.forEach((sub) => {
      const channelId = sub.snippet?.resourceId?.channelId;
      if (channelId && sub.id) {
        state.subscriptionIdsByChannel[channelId] = sub.id;
      }
    });

    const channelIds = subs.map((sub) => sub.snippet?.resourceId?.channelId).filter(Boolean);
    let channels = [];
    try {
      channels = await loadChannels(channelIds);
    } catch {
      channels = subs.map(normalizeSubscriptionChannel).filter(Boolean);
      cacheChannels(channels);
    }
    if (authVersion !== state.authVersion) {
      return false;
    }
    state.subscriptions = channels;

    const channelLimit = options.conservative
      ? RECOVERY_SUBSCRIPTION_UPLOAD_CHANNELS
      : MAX_SUBSCRIPTION_UPLOAD_CHANNELS;
    const uploadChannels = channels
      .filter((channel) => channel.uploadsPlaylistId)
      .slice(0, channelLimit);
    const playlistResults = await loadSubscriptionPlaylistItems(
      uploadChannels,
      state.config.uploadsPerChannel,
      authVersion,
    );
    if (authVersion !== state.authVersion) {
      return false;
    }

    const uploadVideoIds = playlistResults
      .flatMap((result) => result.status === "fulfilled" ? result.value.items || [] : [])
      .map((item) => item.contentDetails?.videoId)
      .filter(Boolean);

    if (uploadChannels.length && !playlistResults.some((result) => result.status === "fulfilled")) {
      state.subscriptionWarning = "Newest uploads could not load. Your channel list is still available.";
    }

    const uniqueVideoIds = [...new Set(uploadVideoIds)].slice(0, MAX_SUBSCRIPTION_VIDEO_ROWS);
    let subscribedVideos = [];
    try {
      subscribedVideos = await loadVideoDetails(uniqueVideoIds, { auth: true, refresh: options.refresh });
    } catch {
      subscribedVideos = [];
      state.subscriptionWarning = "Newest uploads could not load. Your channel list is still available.";
    }
    if (authVersion !== state.authVersion) {
      return false;
    }

    state.subscriptionVideos = subscribedVideos
      .filter((video) => !isLikelyShort(video))
      .slice(0, MAX_SUBSCRIPTION_VIDEO_ROWS);
    state.subscriptionsLoaded = true;
    cacheVideos(state.subscriptionVideos);

    if (!state.homeFeed.length && state.subscriptionVideos.length) {
      state.homeFeed = state.subscriptionVideos.slice(0, 40);
      state.feedReasonsById = Object.fromEntries(
        state.homeFeed.map((video) => [video.id, "From your channels"]),
      );
      if (state.view === "home" || !state.queue.length) {
        state.queue = state.homeFeed;
      }
    }

    state.error = "";
    savePersonalCache({ subscriptions: true });
    markBootStable();
    return true;
  } catch (error) {
    if (authVersion !== state.authVersion) {
      return false;
    }
    state.error = error.message;
    if (!options.quiet) {
      openSheet("Could not load subscriptions", error.message, [{ label: "Close", action: closeSheet }]);
    }
    return false;
  } finally {
    if (authVersion === state.authVersion) {
      state.feedLoading = false;
      if (state.loading === "Loading subscriptions" || state.loading === "Refreshing subscriptions") {
        state.loading = "";
      }
    }
  }
}

async function loadSubscriptionPlaylistItems(channels, uploadsPerChannel, authVersion = state.authVersion) {
  const results = [];

  for (let index = 0; index < channels.length; index += PLAYLIST_FETCH_BATCH_SIZE) {
    if (authVersion !== state.authVersion) {
      break;
    }
    const batch = channels.slice(index, index + PLAYLIST_FETCH_BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((channel) => youtubeFetch("/playlistItems", {
        part: "snippet,contentDetails",
        playlistId: channel.uploadsPlaylistId,
        maxResults: uploadsPerChannel,
      }, { auth: true, timeoutMs: SUBSCRIPTION_PLAYLIST_TIMEOUT_MS })),
    );
    results.push(...batchResults);

    if (index + PLAYLIST_FETCH_BATCH_SIZE < channels.length) {
      await new Promise((resolve) => window.setTimeout(resolve, 60));
    }
  }

  return results;
}

function waitForIdleFrame() {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(resolve, { timeout: 250 });
      return;
    }

    window.setTimeout(resolve, 50);
  });
}

function scheduleHomeFeedEnrichment(options = {}) {
  if ((state.homeFeedLoaded && !options.refresh)
    || state.homeFeedLoadPromise
    || state.homeFeedLoadScheduled
    || !state.auth.accessToken) {
    return;
  }

  state.homeFeedLoadScheduled = true;
  waitForIdleFrame().then(() => {
    state.homeFeedLoadScheduled = false;
    if (!state.auth.accessToken) {
      return false;
    }
    return loadPersonalHomeFeed(options);
  }).catch(() => {
    state.homeFeedLoadScheduled = false;
  });
}

function loadPersonalHomeFeed(options = {}) {
  if (!state.auth.accessToken) {
    return Promise.resolve(false);
  }
  if (state.homeFeedLoadPromise) {
    return state.homeFeedLoadPromise;
  }

  const authVersion = state.authVersion;
  const request = buildPersonalHomeFeed(state.subscriptionVideos, options)
    .then((feed) => {
      if (authVersion !== state.authVersion) {
        return false;
      }
      if (feed.length) {
        state.homeFeed = feed;
        state.usingCachedPersonalFeed = true;
        if (state.view === "home" || !state.queue.length) {
          state.queue = feed;
        }
        state.homeFeedLoaded = true;
        savePersonalCache({ home: true });
      }
      if (state.view === "home") {
        render();
      }
      return Boolean(feed.length);
    })
    .catch(() => false)
    .finally(() => {
      if (state.homeFeedLoadPromise === request) {
        state.homeFeedLoadPromise = null;
      }
    });

  state.homeFeedLoadPromise = request;
  return request;
}

async function buildPersonalHomeFeed(subscribedVideos = [], options = {}) {
  const likedVideos = await loadLikedVideoSeeds(options);
  state.likedVideos = likedVideos;

  const [discoveryResult, popularResult] = await Promise.allSettled([
    loadInterestDiscoveryVideos(),
    loadPopularVideos({ auth: true }),
  ]);
  const discoveryVideos = discoveryResult.status === "fulfilled" ? discoveryResult.value : [];
  const popularVideos = popularResult.status === "fulfilled" ? popularResult.value : [];

  const candidates = [
    ...subscribedVideos.map((video) => ({ video, source: "subscription" })),
    ...discoveryVideos.map((video) => ({ video, source: "interest" })),
    ...popularVideos.map((video) => ({ video, source: "popular" })),
  ];

  return rankHomeCandidates(candidates);
}

async function loadLikedVideoSeeds(options = {}) {
  if (state.likedVideosLoaded && !options.refresh) {
    return state.likedVideos;
  }
  try {
    const payload = await youtubeFetch("/videos", {
      part: "snippet,contentDetails,statistics",
      myRating: "like",
      maxResults: 25,
    }, { auth: true });
    const videos = (payload.items || []).map(normalizeVideoResource);
    const hydrated = await hydrateVideoChannelThumbnails(videos, { auth: true });
    state.likedVideos = hydrated;
    state.likedVideosLoaded = true;
    return hydrated;
  } catch {
    return state.likedVideos;
  }
}

async function loadPopularVideos(options = {}) {
  try {
    const payload = await youtubeFetch("/videos", {
      part: "snippet,contentDetails,statistics",
      chart: "mostPopular",
      regionCode: state.config.regionCode,
      maxResults: 25,
    }, options);
    const videos = (payload.items || []).map(normalizeVideoResource);
    return hydrateVideoChannelThumbnails(videos);
  } catch {
    return [];
  }
}

async function loadInterestDiscoveryVideos() {
  const queries = recommendationQueries();
  if (!queries.length || !hasApiAccess()) {
    return [];
  }

  const searchResults = await Promise.allSettled(
    queries.map((query) => youtubeFetch("/search", {
      part: "snippet",
      q: query,
      type: "video",
      videoEmbeddable: "true",
      maxResults: 8,
      regionCode: state.config.regionCode,
      order: "relevance",
    }, { auth: Boolean(state.auth.accessToken) })),
  );

  const ids = [...new Set(searchResults
    .flatMap((result) => result.status === "fulfilled" ? result.value.items || [] : [])
    .map((item) => item.id?.videoId)
    .filter(Boolean))];

  return loadVideoDetails(ids.slice(0, 30), { auth: Boolean(state.auth.accessToken) });
}

function recommendationQueries() {
  const sources = [
    ...state.searchHistory,
    ...state.localHistory.slice(0, 8).map(videoSearchSeed),
    ...state.likedVideos.slice(0, 8).map(videoSearchSeed),
  ];

  return [...new Set(sources
    .map(cleanRecommendationQuery)
    .filter(Boolean))]
    .slice(0, MAX_DISCOVERY_QUERIES);
}

function videoSearchSeed(video) {
  return `${video.channelTitle || ""} ${video.title || ""}`;
}

function cleanRecommendationQuery(value = "") {
  const cleaned = String(value)
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\b(official|video|clips?|shorts?|episode|full|new|latest|hd|4k)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.split(" ").slice(0, 5).join(" ");
}

function rankHomeCandidates(candidates) {
  const watchedIds = new Set(state.localHistory.map((video) => video.id));
  const unique = dedupeCandidates(candidates)
    .filter(({ video }) => video.id && !isLikelyShort(video))
    .filter(({ video }) => !watchedIds.has(video.id));

  const interestTerms = interestTokenSet();
  const scored = unique
    .map((candidate) => ({
      ...candidate,
      score: homeScore(candidate.video, candidate.source, interestTerms),
    }))
    .sort((a, b) => b.score - a.score);

  const diversified = diversifyByChannel(scored).slice(0, 40);
  state.feedReasonsById = Object.fromEntries(
    diversified.map(({ video, source }) => [video.id, feedReasonForSource(video, source)]),
  );
  return diversified.map(({ video }) => video);
}

function dedupeCandidates(candidates) {
  const sourcePriority = { interest: 3, subscription: 2, popular: 1 };
  const byId = new Map();

  candidates.forEach((candidate) => {
    const id = candidate.video?.id;
    if (!id) {
      return;
    }

    const existing = byId.get(id);
    if (!existing || (sourcePriority[candidate.source] || 0) > (sourcePriority[existing.source] || 0)) {
      byId.set(id, candidate);
    }
  });

  return [...byId.values()];
}

function homeScore(video, source, interestTerms) {
  const sourceScore = {
    interest: 78,
    subscription: 66,
    popular: 36,
  }[source] || 20;

  const ageDays = ageInDays(video.publishedAt);
  const recency = Math.max(0, 22 - Math.min(ageDays, 90) * 0.24);
  const views = Math.log10(Math.max(1, video.viewCountNumber || 0)) * 7;
  const likes = Math.log10(Math.max(1, video.likeCountNumber || 0)) * 5;
  const interest = interestMatchScore(video, interestTerms);
  const subscribed = state.subscriptionIdsByChannel[video.channelId] ? 12 : 0;

  return sourceScore + recency + views + likes + interest + subscribed + stableDailyJitter(video.id);
}

function interestTokenSet() {
  const text = [
    ...state.searchHistory,
    ...state.localHistory.slice(0, 10).map(videoSearchSeed),
    ...state.likedVideos.slice(0, 10).map(videoSearchSeed),
  ].join(" ").toLowerCase();

  return new Set(text
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3)
    .filter((token) => !["official", "video", "clips", "shorts", "full", "latest"].includes(token)));
}

function interestMatchScore(video, interestTerms) {
  if (!interestTerms.size) {
    return 0;
  }

  const haystack = [
    video.title,
    video.channelTitle,
    video.description,
    ...(video.tags || []),
  ].join(" ").toLowerCase();

  let matches = 0;
  interestTerms.forEach((term) => {
    if (haystack.includes(term)) {
      matches += 1;
    }
  });

  return Math.min(matches * 6, 36);
}

function feedReasonForSource(video, source) {
  if (state.subscriptionIdsByChannel[video.channelId]) {
    return "From your channels";
  }
  if (source === "interest") {
    return state.localHistory.length || state.searchHistory.length ? "Because you watched" : "Picked for you";
  }
  if (source === "popular") {
    return "Trending";
  }
  return "Recommended";
}

function diversifyByChannel(items) {
  const picked = [];
  const deferred = [];
  const channelCounts = new Map();

  items.forEach((item) => {
    const video = item.video || item;
    const count = channelCounts.get(video.channelId) || 0;
    const limit = picked.length < 16 ? 1 : 2;
    if (count < limit) {
      picked.push(item);
      channelCounts.set(video.channelId, count + 1);
    } else {
      deferred.push(item);
    }
  });

  return [...picked, ...deferred];
}

function isLikelyShort(video) {
  return Number(video.durationSeconds || 0) > 0 && Number(video.durationSeconds) < MIN_FEED_DURATION_SECONDS;
}

function ageInDays(dateValue) {
  if (!dateValue) {
    return 365;
  }
  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) {
    return 365;
  }
  return Math.max(0, (Date.now() - timestamp) / 86_400_000);
}

function stableDailyJitter(id = "") {
  const seed = `${new Date().toISOString().slice(0, 10)}:${id}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 100;
}

async function loadChannels(channelIds, options = {}) {
  const chunks = chunk([...new Set(channelIds.filter(Boolean))], 50);
  if (!chunks.length) {
    return [];
  }

  const responses = await Promise.allSettled(chunks.map((ids) => youtubeFetch("/channels", {
    part: "snippet,contentDetails,statistics",
    id: ids.join(","),
    maxResults: 50,
  }, {
    ...options,
    auth: options.auth ?? Boolean(state.auth.accessToken),
  })));
  const fulfilled = responses
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  if (!fulfilled.length) {
    const firstError = responses.find((result) => result.status === "rejected")?.reason;
    throw firstError instanceof Error ? firstError : new Error("Could not load channels.");
  }

  const channels = fulfilled.flatMap((payload) => payload.items || []).map(normalizeChannelResource);
  cacheChannels(channels);
  return channels;
}

async function loadVideoDetails(videoIds, options = {}) {
  const uniqueIds = [...new Set(videoIds.filter(Boolean))];
  const idsToLoad = options.refresh
    ? uniqueIds
    : uniqueIds.filter((id) => !state.videoCacheById[id]);
  const chunks = chunk(idsToLoad, 50);
  if (!chunks.length) {
    return uniqueIds.map((id) => state.videoCacheById[id]).filter(Boolean);
  }

  const responses = await Promise.allSettled(chunks.map((ids) => youtubeFetch("/videos", {
    part: "snippet,contentDetails,statistics",
    id: ids.join(","),
    maxResults: 50,
  }, options)));
  const fulfilled = responses
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  if (!fulfilled.length) {
    const firstError = responses.find((result) => result.status === "rejected")?.reason;
    throw firstError instanceof Error ? firstError : new Error("Could not load videos.");
  }

  const videos = fulfilled.flatMap((payload) => payload.items || []).map(normalizeVideoResource);
  const hydrated = await hydrateVideoChannelThumbnails(videos, options);
  cacheVideos(hydrated);
  return uniqueIds.map((id) => state.videoCacheById[id]).filter(Boolean);
}

async function loadChannelById(channelId, options = {}) {
  if (!channelId) {
    return null;
  }

  const cached = state.channelCacheById[channelId]
    || state.recentChannels.find((channel) => channel.id === channelId);
  if (cached?.uploadsPlaylistId && !options.refresh) {
    return cached;
  }

  if (!hasApiAccess()) {
    return cached || channelFromVideo(findVideoByChannel(channelId));
  }

  const [channel] = await loadChannels([channelId], options);
  return channel || cached || channelFromVideo(findVideoByChannel(channelId));
}

async function loadChannelVideos(channelId, options = {}) {
  if (!channelId) {
    return [];
  }

  if (state.channelVideosById[channelId]?.length
    && !options.refresh
    && (state.channelLoadedIds.has(channelId) || !hasApiAccess())) {
    return state.channelVideosById[channelId];
  }

  if (!hasApiAccess()) {
    return demoVideos.filter((video) => video.channelId === channelId);
  }

  const channel = await loadChannelById(channelId, options);
  if (!channel?.uploadsPlaylistId) {
    return [];
  }

  const payload = await youtubeFetch("/playlistItems", {
    part: "snippet,contentDetails",
    playlistId: channel.uploadsPlaylistId,
    maxResults: 30,
  }, {
    auth: Boolean(state.auth.accessToken),
    signal: options.signal,
  });

  const ids = [...new Set((payload.items || [])
    .map((item) => item.contentDetails?.videoId)
    .filter(Boolean))];
  const videos = (await loadVideoDetails(ids, {
    auth: Boolean(state.auth.accessToken),
    refresh: options.refresh,
    signal: options.signal,
  }))
    .filter((video) => !isLikelyShort(video));
  state.channelVideosById[channelId] = videos;
  pruneRecord(state.channelVideosById, MAX_CHANNEL_VIDEO_CACHES, new Set([channelId]));
  [...state.channelLoadedIds].forEach((loadedId) => {
    if (!Object.prototype.hasOwnProperty.call(state.channelVideosById, loadedId)) {
      state.channelLoadedIds.delete(loadedId);
    }
  });
  return videos;
}

function cancelChannelRequest() {
  state.channelAbortController?.abort();
  state.channelAbortController = null;
}

async function loadActiveChannel(options = {}) {
  const channelId = state.activeChannelId;
  if (!channelId) {
    return false;
  }
  if (state.channelLoadedIds.has(channelId) && !options.refresh) {
    state.error = "";
    return true;
  }
  if (state.channelLoading && state.channelLoadingId === channelId) {
    return false;
  }

  cancelChannelRequest();
  const controller = "AbortController" in window ? new AbortController() : null;
  const loadVersion = ++state.channelLoadVersion;
  const hasVideos = Boolean(state.channelVideosById[channelId]?.length);
  state.channelAbortController = controller;
  state.channelLoading = true;
  state.channelLoadingId = channelId;
  state.error = "";
  if (!hasVideos) {
    state.loading = "Loading channel";
    render();
  }

  try {
    const requestOptions = { ...options, signal: controller?.signal };
    const channel = await loadChannelById(channelId, requestOptions);
    if (loadVersion !== state.channelLoadVersion || channelId !== state.activeChannelId) {
      return false;
    }
    rememberChannel(channel);
    await loadChannelVideos(channelId, requestOptions);
    if (loadVersion !== state.channelLoadVersion || channelId !== state.activeChannelId) {
      return false;
    }
    state.channelLoadedIds.add(channelId);
    state.error = "";
    return true;
  } catch (error) {
    if (loadVersion !== state.channelLoadVersion || error?.name === "AbortError") {
      return false;
    }
    state.error = error.message;
    if (!options.quiet) {
      showToast("Channel could not refresh.");
    }
    return false;
  } finally {
    if (loadVersion === state.channelLoadVersion) {
      state.channelLoading = false;
      state.channelLoadingId = "";
      if (state.channelAbortController === controller) {
        state.channelAbortController = null;
      }
      if (state.loading === "Loading channel") {
        state.loading = "";
      }
      if (state.view === "channel") {
        render();
      }
    }
  }
}

function cancelSearchRequest() {
  state.searchAbortController?.abort();
  state.searchAbortController = null;
  if (state.searchStatus === "loading") {
    state.searchStatus = state.searchResults.length ? "loaded" : "idle";
  }
  if (state.loading === "Searching") {
    state.loading = "";
  }
}

function cacheSearchResults(queryKey, videos) {
  delete state.searchCacheByQuery[queryKey];
  state.searchCacheByQuery[queryKey] = videos;
  pruneRecord(state.searchCacheByQuery, MAX_SEARCH_CACHE_ENTRIES);
}

async function runSearch(query, options = {}) {
  const cleaned = String(query || "").trim();
  const loadVersion = ++state.searchLoadVersion;
  cancelSearchRequest();
  state.query = cleaned;
  state.error = "";

  if (!cleaned) {
    state.searchResults = [];
    state.searchStatus = "idle";
    render();
    return false;
  }

  rememberSearch(cleaned);
  const queryKey = cleaned.toLowerCase();
  const cached = state.searchCacheByQuery[queryKey];
  if (cached && !options.refresh) {
    state.searchResults = cached;
    state.searchStatus = "loaded";
    render();
    return true;
  }

  if (!hasApiAccess()) {
    state.searchResults = demoVideos.filter((video) => {
      const haystack = `${video.title} ${video.channelTitle}`.toLowerCase();
      return haystack.includes(queryKey);
    });
    state.searchStatus = "loaded";
    cacheSearchResults(queryKey, state.searchResults);
    render();
    return true;
  }

  const controller = "AbortController" in window ? new AbortController() : null;
  state.searchAbortController = controller;
  state.searchResults = [];
  state.searchStatus = "loading";
  state.loading = "Searching";
  render();

  try {
    const requestOptions = {
      auth: Boolean(state.auth.accessToken),
      signal: controller?.signal,
    };
    const search = await youtubeFetch("/search", {
      part: "snippet",
      q: cleaned,
      type: "video",
      videoEmbeddable: "true",
      maxResults: 25,
      regionCode: state.config.regionCode,
    }, requestOptions);

    const ids = (search.items || []).map((item) => item.id?.videoId).filter(Boolean);
    const results = await loadVideoDetails(ids, requestOptions);
    if (loadVersion !== state.searchLoadVersion) {
      return false;
    }
    state.searchResults = results.filter((video) => !isLikelyShort(video));
    state.searchStatus = "loaded";
    cacheSearchResults(queryKey, state.searchResults);
    return true;
  } catch (error) {
    if (loadVersion !== state.searchLoadVersion || error?.name === "AbortError") {
      return false;
    }
    state.searchStatus = "error";
    state.error = error.message;
    return false;
  } finally {
    if (loadVersion === state.searchLoadVersion) {
      if (state.searchAbortController === controller) {
        state.searchAbortController = null;
      }
      if (state.loading === "Searching") {
        state.loading = "";
      }
      if (state.view === "search") {
        render();
      }
    }
  }
}

function rememberSearch(query) {
  state.searchHistory = [
    query,
    ...state.searchHistory.filter((item) => item.toLowerCase() !== query.toLowerCase()),
  ].slice(0, 20);
  writeJson("yt_search_history", state.searchHistory);
}

function beginPendingAction(key) {
  if (state.pendingActions.has(key)) {
    return false;
  }
  state.pendingActions.add(key);
  return true;
}

function finishPendingAction(key) {
  state.pendingActions.delete(key);
}

function cancelCommentsRequest() {
  state.commentsAbortController?.abort();
  state.commentsAbortController = null;
  if (state.commentsLoadingVideoId) {
    if (state.commentsStatusByVideoId[state.commentsLoadingVideoId] === "loading") {
      state.commentsStatusByVideoId[state.commentsLoadingVideoId] = "idle";
    }
    state.pendingActions.delete(`comments:${state.commentsLoadingVideoId}`);
  }
  state.commentsLoadingVideoId = "";
}

function pruneCommentsCache() {
  const keys = Object.keys(state.commentsStatusByVideoId);
  let removeCount = Math.max(0, keys.length - MAX_COMMENTS_CACHE_ENTRIES);
  for (const key of keys) {
    if (!removeCount) {
      break;
    }
    if (key === state.activeVideoId) {
      continue;
    }
    delete state.commentsByVideoId[key];
    delete state.commentsStatusByVideoId[key];
    delete state.commentsErrorByVideoId[key];
    removeCount -= 1;
  }
}

async function loadComments(videoId) {
  cancelCommentsRequest();
  const actionKey = `comments:${videoId}`;
  if (!beginPendingAction(actionKey)) {
    return false;
  }
  const loadVersion = ++state.commentsLoadVersion;
  const controller = "AbortController" in window ? new AbortController() : null;
  state.commentsAbortController = controller;
  state.commentsLoadingVideoId = videoId;
  state.commentsStatusByVideoId[videoId] = "loading";
  state.commentsErrorByVideoId[videoId] = "";
  render();

  try {
    const payload = await youtubeFetch("/commentThreads", {
      part: "snippet",
      videoId,
      maxResults: 10,
      order: "relevance",
      textFormat: "plainText",
    }, {
      auth: Boolean(state.auth.accessToken),
      signal: controller?.signal,
    });

    const comments = (payload.items || []).map((item) => {
      const comment = item.snippet?.topLevelComment?.snippet || {};
      return {
        author: comment.authorDisplayName || "YouTube user",
        avatar: compactAvatarUrl(comment.authorProfileImageUrl || ""),
        text: comment.textDisplay || "",
        likes: Number(comment.likeCount || 0),
      };
    });
    if (loadVersion !== state.commentsLoadVersion || videoId !== state.activeVideoId) {
      return false;
    }
    state.commentsByVideoId[videoId] = comments;
    state.commentsStatusByVideoId[videoId] = "loaded";
    state.comments = comments;
    pruneCommentsCache();
    return true;
  } catch (error) {
    if (loadVersion !== state.commentsLoadVersion || error?.name === "AbortError") {
      return false;
    }
    state.commentsStatusByVideoId[videoId] = "error";
    state.commentsErrorByVideoId[videoId] = error.message;
    state.comments = state.commentsByVideoId[videoId] || [];
    pruneCommentsCache();
    return false;
  } finally {
    finishPendingAction(actionKey);
    if (loadVersion === state.commentsLoadVersion) {
      if (state.commentsAbortController === controller) {
        state.commentsAbortController = null;
      }
      state.commentsLoadingVideoId = "";
      if (state.view === "watch" && videoId === state.activeVideoId) {
        render();
      }
    }
  }
}

async function loadLikedVideos(options = {}) {
  if (!state.auth.profile) {
    return false;
  }
  if (state.likedVideosLoaded && !options.refresh) {
    return true;
  }
  const actionKey = "liked-videos";
  if (!beginPendingAction(actionKey)) {
    return false;
  }
  const authVersion = state.authVersion;
  render();
  try {
    await ensureReadAuth();
    const payload = await youtubeFetch("/videos", {
      part: "snippet,contentDetails,statistics",
      myRating: "like",
      maxResults: 25,
    }, { auth: true });
    const likedVideos = (await hydrateVideoChannelThumbnails((payload.items || [])
      .map(normalizeVideoResource)))
      .filter((video) => !isLikelyShort(video));
    if (authVersion !== state.authVersion) {
      return false;
    }
    state.likedVideos = likedVideos;
    state.likedVideosLoaded = true;
    savePersonalCache();
    return true;
  } catch (error) {
    if (authVersion !== state.authVersion) {
      return false;
    }
    openSheet("Liked videos unavailable", error.message, [{ label: "Close", action: closeSheet }]);
    return false;
  } finally {
    finishPendingAction(actionKey);
    if (authVersion === state.authVersion) {
      render();
    }
  }
}

async function rateActiveVideo() {
  const video = currentVideo();
  if (!video) {
    return;
  }

  const actionKey = `rating:${video.id}`;
  if (!beginPendingAction(actionKey)) {
    return;
  }

  setLoading("Updating rating");
  try {
    await ensureWriteAuth();
    const currentRating = state.ratings[video.id] || "none";
    const nextRating = currentRating === "like" ? "none" : "like";
    await youtubeFetch("/videos/rate", {
      id: video.id,
      rating: nextRating,
    }, { auth: true, method: "POST" });
    state.ratings[video.id] = nextRating;
    showToast(nextRating === "like" ? "Liked." : "Like removed.");
  } catch (error) {
    openSheet("Like needs permission", error.message, [{ label: "Close", action: closeSheet }]);
  } finally {
    finishPendingAction(actionKey);
    clearLoading();
  }
}

async function subscribeToActiveChannel(channelId = currentVideo()?.channelId) {
  const video = currentVideo();
  if (!channelId) {
    return;
  }

  const actionKey = `subscription:${channelId}`;
  if (!beginPendingAction(actionKey)) {
    return;
  }

  setLoading("Updating subscription");
  try {
    await ensureWriteAuth();
    const subscriptionId = state.subscriptionIdsByChannel[channelId];

    if (subscriptionId) {
      await youtubeFetch("/subscriptions", { id: subscriptionId }, { auth: true, method: "DELETE" });
      delete state.subscriptionIdsByChannel[channelId];
      state.subscriptions = state.subscriptions.filter((channel) => channel.id !== channelId);
      state.subscriptionVideos = state.subscriptionVideos.filter((item) => item.channelId !== channelId);
      state.homeFeed
        .filter((item) => item.channelId === channelId && state.feedReasonsById[item.id] === "From your channels")
        .forEach((item) => {
          state.feedReasonsById[item.id] = "Recommended";
        });
      showToast("Unsubscribed.");
    } else {
      const payload = await youtubeFetch("/subscriptions", { part: "snippet" }, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snippet: {
            resourceId: {
              kind: "youtube#channel",
              channelId,
            },
          },
        }),
      });

      state.subscriptionIdsByChannel[channelId] = payload.id;
      const channel = state.channelCacheById[channelId] || channelFromVideo(findVideoByChannel(channelId)) || channelFromVideo(video);
      if (channel && !state.subscriptions.some((item) => item.id === channelId)) {
        state.subscriptions = [channel, ...state.subscriptions];
      }
      showToast("Subscribed.");
    }

    savePersonalCache({ subscriptions: true });

  } catch (error) {
    openSheet("Subscribe needs permission", error.message, [{ label: "Close", action: closeSheet }]);
  } finally {
    finishPendingAction(actionKey);
    clearLoading();
  }
}

function normalizeVideoResource(item) {
  const snippet = item.snippet || {};
  const stats = item.statistics || {};
  const durationSeconds = parseDurationSeconds(item.contentDetails?.duration);
  return {
    id: item.id?.videoId || item.id || snippet.resourceId?.videoId || "",
    title: snippet.title || "Untitled video",
    channelId: snippet.channelId || "",
    channelTitle: snippet.channelTitle || "YouTube",
    thumbnailUrl: videoListThumbnail(snippet.thumbnails),
    posterUrl: videoPosterThumbnail(snippet.thumbnails),
    channelThumbnailUrl: compactAvatarUrl(state.channelThumbnailsById[snippet.channelId] || ""),
    publishedAt: snippet.publishedAt || "",
    duration: formatDuration(item.contentDetails?.duration),
    durationSeconds,
    viewCount: formatCount(stats.viewCount),
    viewCountNumber: Number(stats.viewCount || 0),
    likeCount: formatCount(stats.likeCount),
    likeCountNumber: Number(stats.likeCount || 0),
    description: snippet.description || "",
    tags: snippet.tags || [],
    categoryId: snippet.categoryId || "",
  };
}

function normalizeChannelResource(item) {
  const snippet = item.snippet || {};
  const stats = item.statistics || {};
  return {
    id: item.id || "",
    title: snippet.title || "Channel",
    description: snippet.description || "",
    thumbnailUrl: avatarThumbnail(snippet.thumbnails),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || "",
    subscriberCount: formatCount(stats.subscriberCount),
    subscriberCountNumber: Number(stats.subscriberCount || 0),
    videoCount: formatCount(stats.videoCount),
    videoCountNumber: Number(stats.videoCount || 0),
    viewCount: formatCount(stats.viewCount),
    viewCountNumber: Number(stats.viewCount || 0),
    publishedAt: snippet.publishedAt || "",
  };
}

function normalizeSubscriptionChannel(item) {
  const snippet = item.snippet || {};
  const id = snippet.resourceId?.channelId || "";
  if (!id) {
    return null;
  }

  return {
    id,
    title: snippet.title || "Channel",
    description: snippet.description || "",
    thumbnailUrl: avatarThumbnail(snippet.thumbnails),
    uploadsPlaylistId: "",
    subscriberCount: "",
    subscriberCountNumber: 0,
    videoCount: "",
    videoCountNumber: 0,
    viewCount: "",
    viewCountNumber: 0,
    publishedAt: snippet.publishedAt || "",
  };
}

function cacheChannels(channels = []) {
  channels.filter(Boolean).forEach((channel) => {
    const compact = compactStoredChannel(channel);
    if (compact.id && compact.thumbnailUrl) {
      state.channelThumbnailsById[compact.id] = compact.thumbnailUrl;
    }
    if (compact.id) {
      state.channelCacheById[compact.id] = {
        ...(state.channelCacheById[compact.id] || {}),
        ...compact,
      };
    }
  });
  pruneRecord(
    state.channelCacheById,
    MAX_CHANNEL_CACHE_ENTRIES,
    new Set([state.activeChannelId, state.auth.profile?.id, ...demoChannels.map((channel) => channel.id)].filter(Boolean)),
  );
}

function cacheVideos(videos = []) {
  videos.filter(Boolean).forEach((video) => {
    const compact = compactStoredVideo(video);
    if (!compact.id) {
      return;
    }
    state.videoCacheById[compact.id] = {
      ...(state.videoCacheById[compact.id] || {}),
      ...compact,
    };
  });
  pruneRecord(
    state.videoCacheById,
    MAX_VIDEO_CACHE_ENTRIES,
    new Set([state.activeVideoId, ...state.savedIds, ...demoVideos.map((video) => video.id)].filter(Boolean)),
  );
}

function pruneRecord(record, maxEntries, protectedKeys = new Set()) {
  const keys = Object.keys(record);
  let removeCount = Math.max(0, keys.length - maxEntries);
  for (const key of keys) {
    if (!removeCount) {
      break;
    }
    if (protectedKeys.has(key)) {
      continue;
    }
    delete record[key];
    removeCount -= 1;
  }
}

async function hydrateVideoChannelThumbnails(videos = [], options = {}) {
  const missingChannelIds = [...new Set(videos
    .map((video) => video.channelId)
    .filter((channelId) => channelId && !state.channelThumbnailsById[channelId]))];

  if (missingChannelIds.length) {
    try {
      await loadChannels(missingChannelIds, options);
    } catch {
      // Channel avatars are nice-to-have; keep the video list usable if this fails.
    }
  }

  videos.forEach((video) => {
    video.channelThumbnailUrl = video.channelThumbnailUrl || state.channelThumbnailsById[video.channelId] || "";
  });

  cacheVideos(videos);
  return videos;
}

function videoListThumbnail(thumbnails = {}) {
  return compactVideoThumbnailUrl(
    thumbnails.high?.url
      || thumbnails.medium?.url
      || thumbnails.standard?.url
      || thumbnails.maxres?.url
      || thumbnails.default?.url
      || "",
  );
}

function videoPosterThumbnail(thumbnails = {}) {
  return thumbnails.maxres?.url
    || thumbnails.standard?.url
    || thumbnails.high?.url
    || thumbnails.medium?.url
    || thumbnails.default?.url
    || "";
}

function avatarThumbnail(thumbnails = {}) {
  return compactAvatarUrl(
    thumbnails.medium?.url
      || thumbnails.default?.url
      || thumbnails.high?.url
      || thumbnails.standard?.url
      || thumbnails.maxres?.url
      || "",
  );
}

function compactVideoThumbnailUrl(url = "") {
  return String(url)
    .replace(/\/(?:maxresdefault|sddefault)(?=\.(?:jpg|webp)(?:$|\?))/i, "/hqdefault");
}

function compactAvatarUrl(url = "") {
  return String(url)
    .replace(/=s\d+(?=-|$)/i, "=s176")
    .replace(/=w\d+-h\d+(?=-|$)/i, "=s176");
}

function compactStoredVideo(video) {
  if (!video || typeof video !== "object") {
    return video;
  }
  const originalThumbnail = String(video.thumbnailUrl || "");
  return {
    ...video,
    thumbnailUrl: compactVideoThumbnailUrl(originalThumbnail),
    posterUrl: String(video.posterUrl || originalThumbnail),
    channelThumbnailUrl: compactAvatarUrl(video.channelThumbnailUrl || ""),
    tags: Array.isArray(video.tags) ? video.tags.slice(0, 32) : [],
  };
}

function compactStoredChannel(channel) {
  if (!channel || typeof channel !== "object") {
    return channel;
  }
  return {
    ...channel,
    thumbnailUrl: compactAvatarUrl(channel.thumbnailUrl || ""),
  };
}

function formatDuration(isoDuration = "") {
  const totalSeconds = parseDurationSeconds(isoDuration);
  if (!totalSeconds) {
    return "";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = hours ? [hours, minutes, seconds] : [minutes, seconds];
  return parts.map((part, index) => index === 0 ? String(part) : String(part).padStart(2, "0")).join(":");
}

function parseDurationSeconds(isoDuration = "") {
  const match = String(isoDuration).match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }

  return Number(match[1] || 0) * 86_400
    + Number(match[2] || 0) * 3600
    + Number(match[3] || 0) * 60
    + Number(match[4] || 0);
}

function formatCount(value) {
  const count = Number(value || 0);
  if (!count) {
    return "";
  }

  if (count >= 1_000_000_000) {
    return `${trimNumber(count / 1_000_000_000)}B`;
  }
  if (count >= 1_000_000) {
    return `${trimNumber(count / 1_000_000)}M`;
  }
  if (count >= 1_000) {
    return `${trimNumber(count / 1_000)}K`;
  }
  return String(count);
}

function trimNumber(value) {
  return value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
}

function timeAgo(dateValue) {
  if (!dateValue) {
    return "";
  }

  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  const units = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const unit = units.find(([, value]) => seconds >= value);
  if (!unit) {
    return "just now";
  }

  const amount = Math.floor(seconds / unit[1]);
  return `${amount} ${unit[0]}${amount === 1 ? "" : "s"} ago`;
}

function videoMeta(video) {
  return [
    video.channelTitle,
    video.viewCount ? `${video.viewCount} views` : "",
    timeAgo(video.publishedAt),
  ].filter(Boolean).join(" \u2022 ");
}

function videoStatsMeta(video) {
  return [
    video.viewCount ? `${video.viewCount} views` : "",
    timeAgo(video.publishedAt),
  ].filter(Boolean).join(" \u2022 ");
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentVideo() {
  return findVideo(state.activeVideoId)
    || state.queue[0]
    || state.homeFeed[0]
    || demoVideos[0];
}

function findVideo(videoId) {
  return state.videoCacheById[videoId] || [
    ...state.homeFeed,
    ...state.searchResults,
    ...state.queue,
    ...state.localHistory,
    ...state.savedVideos,
    ...state.likedVideos,
    ...state.subscriptionVideos,
    ...Object.values(state.channelVideosById).flat(),
    ...demoVideos,
  ].find((video) => video.id === videoId);
}

function findVideoByChannel(channelId) {
  return [
    ...state.homeFeed,
    ...state.searchResults,
    ...state.queue,
    ...state.localHistory,
    ...state.savedVideos,
    ...state.likedVideos,
    ...state.subscriptionVideos,
    ...Object.values(state.channelVideosById).flat(),
    ...demoVideos,
  ].find((video) => video.channelId === channelId);
}

function channelFromVideo(video) {
  if (!video?.channelId) {
    return null;
  }

  return {
    id: video.channelId,
    title: video.channelTitle || "Channel",
    thumbnailUrl: channelAvatarFor(video),
    uploadsPlaylistId: "",
    description: "",
    subscriberCount: "",
    videoCount: "",
    viewCount: "",
  };
}

function rememberChannel(channel) {
  if (!channel?.id) {
    return;
  }

  const compact = compactStoredChannel({
    id: channel.id,
    title: channel.title || "Channel",
    thumbnailUrl: channel.thumbnailUrl || "",
    uploadsPlaylistId: channel.uploadsPlaylistId || "",
    description: channel.description || "",
    subscriberCount: channel.subscriberCount || "",
    videoCount: channel.videoCount || "",
    viewCount: channel.viewCount || "",
    publishedAt: channel.publishedAt || "",
  });
  state.channelCacheById[channel.id] = {
    ...(state.channelCacheById[channel.id] || {}),
    ...compact,
  };
  state.recentChannels = [
    compact,
    ...state.recentChannels.filter((item) => item?.id && item.id !== channel.id),
  ].slice(0, 12);
  writeJson("yt_recent_channels", state.recentChannels);
}

function initializeNavigationHistory() {
  history.replaceState(navigationState(), "", location.href);
  window.addEventListener("popstate", handleNavigationPopState);
}

function navigationState() {
  return {
    simaTube: true,
    view: state.view,
    videoId: state.view === "watch" ? state.activeVideoId : "",
    channelId: state.view === "channel" ? state.activeChannelId : "",
  };
}

function updateNavigationHistory(options = {}) {
  if (options.fromHistory) {
    return;
  }
  const method = options.replaceHistory ? "replaceState" : "pushState";
  history[method](navigationState(), "", location.href);
}

function handleNavigationPopState(event) {
  const navigation = event.state;
  if (!navigation?.simaTube) {
    return;
  }

  closeSheet({ restoreFocus: false });
  closePlayerFullscreen();
  const view = sanitizeView(navigation.view);
  if (view === "watch" && navigation.videoId && findVideo(navigation.videoId)) {
    openWatch(navigation.videoId, state.queue, { fromHistory: true, remember: false });
    return;
  }
  if (view === "channel" && navigation.channelId) {
    openChannel(navigation.channelId, { fromHistory: true });
    return;
  }
  setView(view, { fromHistory: true });
}

function openWatch(videoId, queue = [], options = {}) {
  const video = findVideo(videoId);
  if (!video) {
    return;
  }

  const changed = state.view !== "watch" || state.activeVideoId !== videoId;
  const preserveFullscreen = Boolean(options.preserveFullscreen && isPlayerFullscreen());
  if (preserveFullscreen) {
    clearPlayerFullscreenControlsTimer();
  } else {
    closePlayerFullscreen();
  }
  if (options.autoplay) {
    state.pendingAutoplayVideoId = videoId;
  } else if (state.pendingAutoplayVideoId && state.pendingAutoplayVideoId !== videoId) {
    state.pendingAutoplayVideoId = "";
    cancelPendingPlayerApiLoad();
  }
  state.activeVideoId = videoId;
  state.queue = queue.length ? queue : state.homeFeed;
  state.commentsLoadVersion += 1;
  cancelCommentsRequest();
  state.comments = state.commentsByVideoId[videoId] || [];
  state.playerError = null;
  state.view = "watch";
  writeJson("yt_active_video_id", videoId);
  writeJson("yt_last_view", "watch");
  if (options.remember !== false) {
    addHistory(video);
  }
  if (changed) {
    updateNavigationHistory(options);
  }
  render();
  if (preserveFullscreen) {
    restorePlayerFullscreen();
  }
  if (options.autoplay && (!state.ytApiReady || !window.YT?.Player)) {
    loadYouTubeIframeApi();
  }
  resetScroll();
}

function openChannel(channelId, options = {}) {
  if (!channelId) {
    return;
  }

  const changed = state.view !== "channel" || state.activeChannelId !== channelId;
  if (changed) {
    state.channelLoadVersion += 1;
    cancelChannelRequest();
    state.channelLoading = false;
    state.channelLoadingId = "";
  }
  cancelPendingPlayerApiLoad();
  closePlayerFullscreen();
  state.activeChannelId = channelId;
  state.channelSort = "latest";
  state.error = "";
  state.view = "channel";
  writeJson("yt_active_channel_id", channelId);
  writeJson("yt_last_view", "channel");
  rememberChannel(state.channelCacheById[channelId] || channelFromVideo(findVideoByChannel(channelId)));
  if (changed) {
    updateNavigationHistory(options);
  }
  render();
  resetScroll();
  if (!state.channelLoadedIds.has(channelId)) {
    loadActiveChannel({ quiet: true });
  }
}

function addHistory(video) {
  const compact = compactStoredVideo(video);
  cacheVideos([compact]);
  state.localHistory = [
    compact,
    ...state.localHistory.filter((item) => item.id !== compact.id),
  ].slice(0, 30);
  writeJson("yt_history", state.localHistory);
  if (state.savedIds.has(compact.id)) {
    state.savedVideos = [
      compact,
      ...state.savedVideos.filter((item) => item.id !== compact.id),
    ].slice(0, MAX_SAVED_VIDEOS);
    writeJson("yt_saved_videos", state.savedVideos);
  }
  rememberChannel(channelFromVideo(compact));
}

function savedLibraryVideos() {
  const videos = [];
  const seen = new Set();
  const add = (video) => {
    if (!video?.id || !state.savedIds.has(video.id) || seen.has(video.id)) {
      return;
    }
    videos.push(compactStoredVideo(video));
    seen.add(video.id);
  };
  state.savedVideos.forEach((video) => add(state.videoCacheById[video.id] || video));
  [...state.savedIds].forEach((videoId) => add(findVideo(videoId)));
  return videos.slice(0, MAX_SAVED_VIDEOS);
}

function persistSavedLibrary() {
  state.savedVideos = savedLibraryVideos();
  writeJson("yt_saved_ids", [...state.savedIds]);
  writeJson("yt_saved_videos", state.savedVideos);
}

function toggleSaved(videoId) {
  if (state.savedIds.has(videoId)) {
    state.savedIds.delete(videoId);
    state.savedVideos = state.savedVideos.filter((video) => video.id !== videoId);
    showToast("Removed from saved.");
  } else {
    state.savedIds.add(videoId);
    const video = findVideo(videoId);
    if (video) {
      state.savedVideos = [
        compactStoredVideo(video),
        ...state.savedVideos.filter((item) => item.id !== videoId),
      ].slice(0, MAX_SAVED_VIDEOS);
    }
    showToast("Saved.");
  }

  persistSavedLibrary();
  render();
}

async function shareVideo(video) {
  const url = `${WATCH_BASE}?v=${encodeURIComponent(video.id)}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: video.title, url });
      return;
    }

    await navigator.clipboard.writeText(url);
    showToast("Link copied.");
  } catch {
    openSheet("Share", url, [
      { label: "Open YouTube", href: url },
      { label: "Close", action: closeSheet },
    ]);
  }
}

function setView(view, options = {}) {
  view = sanitizeView(view);
  const changed = state.view !== view;
  if (changed && state.view === "search") {
    state.searchLoadVersion += 1;
    cancelSearchRequest();
  }
  if (changed && state.view === "watch") {
    state.commentsLoadVersion += 1;
    cancelCommentsRequest();
  }
  if (changed && state.view === "channel") {
    state.channelLoadVersion += 1;
    cancelChannelRequest();
    state.channelLoading = false;
    state.channelLoadingId = "";
  }
  if (view !== "watch") {
    state.pendingAutoplayVideoId = "";
    cancelPendingPlayerApiLoad();
    closePlayerFullscreen();
  }
  state.view = view;
  state.error = "";
  if (changed) {
    state.loading = "";
  }
  writeJson("yt_last_view", view);
  if (changed) {
    updateNavigationHistory(options);
  }
  render();
  if (changed) {
    resetScroll();
  }

  if (view === "home" && !state.auth.accessToken && hasApiAccess()) {
    loadPopularHome();
  }
  if (view === "home" && state.auth.accessToken) {
    if (!state.subscriptionsLoaded) {
      loadSubscriptionsAndFeed({ quiet: true, includeHome: true });
    } else {
      scheduleHomeFeedEnrichment();
    }
  }
  if (view === "subscriptions" && state.auth.accessToken && !state.subscriptionsLoaded) {
    loadSubscriptionsAndFeed({ includeHome: false });
  }
  if (view === "channel" && state.activeChannelId && !state.channelLoadedIds.has(state.activeChannelId)) {
    loadActiveChannel({ quiet: true });
  }
}

function resetScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function filteredHomeFeed() {
  if (state.homeFilter === "today") {
    const oneDay = 24 * 60 * 60 * 1000;
    return state.homeFeed.filter((video) => Date.now() - new Date(video.publishedAt).getTime() < oneDay);
  }

  if (state.homeFilter === "saved") {
    return savedLibraryVideos();
  }

  if (state.homeFilter === "explore") {
    return state.homeFeed.filter((video) => !state.subscriptionIdsByChannel[video.channelId]);
  }

  if (state.homeFilter === "history") {
    return state.localHistory;
  }

  return state.homeFeed;
}

function setLoading(label) {
  state.loading = label;
  render();
}

function clearLoading() {
  state.loading = "";
  render();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2200);
}

function openSheet(title, body, actions = []) {
  if (!sheetRoot.childElementCount) {
    openSheet.lastFocus = document.activeElement;
    openSheet.lastFocusSignature = focusSignature(document.activeElement);
  }
  const actionHtml = actions.map((action, index) => {
    if (action.href) {
      return `<a class="sheet-action" href="${escapeHtml(action.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(action.label)}</a>`;
    }
    return `<button class="sheet-action" type="button" data-sheet-action="${index}">${escapeHtml(action.label)}</button>`;
  }).join("");

  sheetRoot.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" aria-describedby="sheet-body">
        <div class="sheet-grip" aria-hidden="true"></div>
        <h2 id="sheet-title">${escapeHtml(title)}</h2>
        <p id="sheet-body">${escapeHtml(body)}</p>
        <div class="sheet-actions">${actionHtml}</div>
      </section>
    </div>
  `;
  app.inert = true;
  document.documentElement.classList.add("sheet-open");
  document.body.classList.add("sheet-open");

  sheetRoot.querySelector(".sheet-actions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sheet-action]");
    if (!button) {
      return;
    }
    const action = actions[Number(button.dataset.sheetAction)];
    action?.action?.();
  }, { once: false });
  window.requestAnimationFrame(() => sheetRoot.querySelector(".sheet-action")?.focus());
}

function closeSheet(options = {}) {
  sheetRoot.replaceChildren();
  app.inert = false;
  document.documentElement.classList.remove("sheet-open");
  document.body.classList.remove("sheet-open");
  let restored = false;
  if (options.restoreFocus !== false
    && openSheet.lastFocus?.isConnected
    && openSheet.lastFocus !== document.body
    && openSheet.lastFocus !== app
    && !openSheet.lastFocus.disabled) {
    openSheet.lastFocus.focus({ preventScroll: true });
    pendingRenderFocus = null;
    restored = true;
  }
  if (!restored && options.restoreFocus !== false) {
    pendingRenderFocus = pendingRenderFocus || openSheet.lastFocusSignature;
    restoreRenderFocus();
  }
  if (options.restoreFocus === false) {
    pendingRenderFocus = null;
  }
  openSheet.lastFocus = null;
  openSheet.lastFocusSignature = null;
}

function setupCopy() {
  return "Owner setup: add the YouTube API key and Google OAuth client ID in Vercel. For local testing, put them in config.local.js. Google Cloud must allow this site URL as a JavaScript origin.";
}

function installCopy() {
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    return "In Safari, tap the Share button at the bottom of the screen, scroll if needed, tap Add to Home Screen, then tap Add.";
  }

  return "Open this site in your phone browser, use the browser menu, then choose Add to Home Screen or Install if your browser shows it.";
}

function isHomeScreenMode() {
  return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone);
}

function shouldShowOnboarding() {
  return !state.auth.profile && !state.onboarded && !state.demoMode;
}

function shouldShowInstallIntro() {
  return !state.installIntroDone && !isHomeScreenMode();
}

function shouldShowReconnect() {
  return state.reconnectFailed && state.rememberSignIn && !state.auth.profile;
}

function render() {
  captureRenderFocus();
  if (shouldShowInstallIntro()) {
    closePlayerFullscreen();
    destroyPlayer();
    app.innerHTML = renderInstallIntro();
    restoreRenderFocus();
    return;
  }

  if (shouldShowReconnect()) {
    closePlayerFullscreen();
    destroyPlayer();
    app.innerHTML = renderReconnectScreen();
    restoreRenderFocus();
    return;
  }

  if (shouldShowOnboarding()) {
    closePlayerFullscreen();
    destroyPlayer();
    app.innerHTML = renderOnboarding();
    restoreRenderFocus();
    return;
  }

  const existingWatchVideoId = app.querySelector(".player-shell")?.dataset.videoId;
  const descriptionExpanded = existingWatchVideoId === state.activeVideoId
    && Boolean(app.querySelector("#description-toggle")?.checked);
  const retainedPlayerShell = takeReusablePlayerShell();
  if (!retainedPlayerShell) {
    destroyPlayer();
  }

  app.innerHTML = `
    ${renderTopbar()}
    ${state.loading ? `<div class="loading-bar" role="status" aria-label="${escapeHtml(state.loading)}"><span aria-hidden="true"></span></div>` : ""}
    <section class="screen screen-${escapeHtml(state.view)}">${renderView()}</section>
    ${renderBottomNav()}
  `;

  if (retainedPlayerShell) {
    const nextPlayerShell = app.querySelector(".player-shell");
    nextPlayerShell?.replaceWith(retainedPlayerShell);
    setFullscreenButtonState(retainedPlayerShell.classList.contains("app-fullscreen"));
  } else if (state.view === "watch") {
    mountPlayer(state.pendingAutoplayVideoId === state.activeVideoId);
  }

  const descriptionToggle = app.querySelector("#description-toggle");
  if (descriptionToggle) {
    descriptionToggle.checked = descriptionExpanded;
  }
  restoreRenderFocus();
}

function focusSignature(element) {
  if (!(element instanceof HTMLElement) || !app.contains(element)) {
    return null;
  }
  if (element.matches("input, textarea, select")) {
    return {
      kind: "field",
      tag: element.tagName,
      id: element.id,
      name: element.getAttribute("name") || "",
      type: element.getAttribute("type") || "",
    };
  }

  const control = element.closest("[data-action]");
  if (!control) {
    return null;
  }
  return {
    kind: "action",
    tag: control.tagName,
    dataset: { ...control.dataset },
  };
}

function captureRenderFocus() {
  const signature = focusSignature(document.activeElement);
  if (signature) {
    pendingRenderFocus = signature;
  }
}

function restoreRenderFocus() {
  if (!pendingRenderFocus || sheetRoot.childElementCount) {
    return false;
  }

  let candidate = null;
  if (pendingRenderFocus.kind === "field") {
    candidate = [...app.querySelectorAll("input, textarea, select")].find((element) => (
      element.tagName === pendingRenderFocus.tag
      && element.id === pendingRenderFocus.id
      && (element.getAttribute("name") || "") === pendingRenderFocus.name
      && (element.getAttribute("type") || "") === pendingRenderFocus.type
    ));
  } else {
    candidate = [...app.querySelectorAll("[data-action]")].find((element) => (
      element.tagName === pendingRenderFocus.tag
      && Object.entries(pendingRenderFocus.dataset)
        .every(([key, value]) => element.dataset[key] === value)
    ));
  }

  if (!candidate) {
    pendingRenderFocus = null;
    return false;
  }
  if (candidate.disabled) {
    return false;
  }

  candidate.focus({ preventScroll: true });
  pendingRenderFocus = null;
  return true;
}

function takeReusablePlayerShell() {
  if (state.view !== "watch" || !state.player || state.playerError) {
    return null;
  }

  const shell = app.querySelector(".player-shell");
  if (!shell || shell.dataset.videoId !== state.activeVideoId || state.playerVideoId !== state.activeVideoId) {
    return null;
  }

  shell.remove();
  return shell;
}

function renderTopbar() {
  const signedIn = Boolean(state.auth.profile);
  return `
    <header class="topbar">
      <button class="brand" type="button" data-action="view" data-view="home" aria-label="Home">
        <span class="play-mark" aria-hidden="true"></span>
        <span class="brand-text">SimaTube</span>
      </button>
      <nav class="top-actions" aria-label="Quick actions">
        <button class="icon-button" type="button" data-action="view" data-view="search" aria-label="Search">${icon("search")}</button>
        <button class="avatar-button" type="button" data-action="${signedIn ? "view" : "signin"}" data-view="you" aria-label="Account">
          ${signedIn && state.auth.profile.thumbnailUrl ? `<img src="${escapeHtml(state.auth.profile.thumbnailUrl)}" alt="" decoding="async" data-image-fallback="profile" data-fallback-initial="${escapeHtml(channelInitial(state.auth.profile.title))}" />` : escapeHtml(channelInitial(state.auth.profile?.title || "H"))}
        </button>
      </nav>
    </header>
  `;
}

function renderView() {
  if (state.view === "search") {
    return renderSearch();
  }
  if (state.view === "watch") {
    return renderWatch();
  }
  if (state.view === "subscriptions") {
    return renderSubscriptions();
  }
  if (state.view === "channel") {
    return renderChannel();
  }
  if (state.view === "you") {
    return renderYou();
  }
  return renderHome();
}

function renderInstallIntro() {
  return `
    <section class="onboarding install-first">
      <div class="onboarding-brand">
        <span class="play-mark" aria-hidden="true"></span>
        <span>SimaTube</span>
      </div>
      <div class="install-first-copy">
        <p class="install-first-label">First, add it to your iPhone</p>
        <h1>Add to Home Screen</h1>
        <p>${escapeHtml(installCopy())}</p>
      </div>
      <div class="install-first-steps">
        <div><strong>${icon("share")}</strong><span>Tap Share in Safari.</span></div>
        <div><strong>+</strong><span>Choose Add to Home Screen.</span></div>
        <div><strong>${icon("check")}</strong><span>Open it from your Home Screen.</span></div>
      </div>
      <button class="done-button" type="button" data-action="install-intro-done">Done</button>
    </section>
  `;
}

function renderOnboarding() {
  return `
    <section class="onboarding">
      <div class="onboarding-brand">
        <span class="play-mark" aria-hidden="true"></span>
        <span>SimaTube</span>
      </div>
      <div class="onboarding-copy">
        <h1>Sign in to SimaTube.</h1>
        <p>Use your own Google account so Home, subscriptions, history, and watch pages feel personal on this phone.</p>
      </div>
      <div class="onboarding-actions">
        <button class="primary-button big" type="button" data-action="signin">Sign in to SimaTube</button>
        ${!state.config.serverOAuthEnabled && !hasOAuthClient()
          ? `<button class="ghost-button" type="button" data-action="continue-demo">Preview demo feed</button>`
          : ""}
      </div>
      <div class="onboarding-steps">
        <div><strong>1</strong><span>Choose your Google account.</span></div>
        <div><strong>2</strong><span>Allow YouTube read access.</span></div>
        <div><strong>3</strong><span>Your feed loads on this phone.</span></div>
      </div>
    </section>
  `;
}

function renderReconnectScreen() {
  return `
    <section class="onboarding reconnect-screen">
      <div class="onboarding-brand">
        <span class="play-mark" aria-hidden="true"></span>
        <span>SimaTube</span>
      </div>
      <div class="onboarding-copy">
        <h1>Reconnect SimaTube.</h1>
        <p>Safari needs one tap to refresh your SimaTube session after the app reloads.</p>
      </div>
      <div class="onboarding-actions">
        <button class="primary-button big" type="button" data-action="signin">Reconnect SimaTube</button>
        <button class="ghost-button" type="button" data-action="continue-demo">Use demo feed</button>
      </div>
    </section>
  `;
}

function renderHome() {
  const feed = filteredHomeFeed();
  const feedSource = ["history", "saved"].includes(state.homeFilter) ? state.homeFilter : "home";
  const personalized = Boolean(state.auth.profile || state.usingCachedPersonalFeed);
  const emptyMessage = {
    today: "No new long-form videos today.",
    explore: "No discovery picks are ready yet.",
    saved: "Save a video to keep it here.",
    history: "Videos you watch will appear here.",
  }[state.homeFilter] || "No videos are ready yet.";
  return `
    <section class="home-rail">
      <h1 class="sr-only">Home</h1>
      ${state.demoMode && !personalized ? renderDemoPill() : ""}
      ${state.reconnectFailed && state.rememberSignIn && !personalized ? renderReconnectPill() : ""}
      <div class="chip-row" aria-label="Home filters">
        ${filterChip("all", personalized ? "For you" : "Popular")}
        ${filterChip("today", "New")}
        ${filterChip("explore", "Explore")}
        ${filterChip("saved", "Saved")}
        ${filterChip("history", "History")}
      </div>
      ${state.feedLoading ? renderFeedLoader() : renderVideoList(feed, feedSource, emptyMessage)}
    </section>
  `;
}

function renderFeedLoader() {
  const skeletons = Array.from({ length: 4 }, (_, index) => `
    <article class="video-row skeleton-card" style="--item-index: ${index};" aria-hidden="true">
      <div class="thumb-button skeleton-box"></div>
      <div class="video-copy">
        <span class="channel-avatar skeleton-box"></span>
        <span>
          <strong class="skeleton-line wide"></strong>
          <small class="skeleton-line"></small>
        </span>
      </div>
    </article>
  `).join("");

  return `
    <section class="feed-loader" role="status" aria-label="Loading feed">
      <span class="yt-spinner" aria-hidden="true"></span>
      ${skeletons}
    </section>
  `;
}

function renderDemoPill() {
  return `
    <section class="demo-pill">
      <span>Demo feed</span>
      <button type="button" data-action="signin">Sign in for your own feed</button>
    </section>
  `;
}

function renderReconnectPill() {
  return `
    <section class="demo-pill">
      <span>Reconnect SimaTube</span>
      <button type="button" data-action="signin">Tap to restore</button>
    </section>
  `;
}

function filterChip(value, label) {
  const active = state.homeFilter === value ? " active" : "";
  return `<button class="chip${active}" type="button" data-action="home-filter" data-filter="${escapeHtml(value)}" aria-pressed="${state.homeFilter === value ? "true" : "false"}">${escapeHtml(label)}</button>`;
}

function renderSearch() {
  const loading = state.searchStatus === "loading";
  let content = renderQuickSearches();
  if (state.query && loading) {
    content = `
      <p class="result-label">Searching for ${escapeHtml(state.query)}</p>
      ${renderFeedLoader()}
    `;
  } else if (state.query && state.searchStatus === "error") {
    content = `
      <section class="empty-panel search-state" role="alert">
        <h2>Search could not finish.</h2>
        <p>${escapeHtml(state.error || "Check your connection and try again.")}</p>
        <button class="primary-button" type="button" data-action="retry-search">Try again</button>
      </section>
    `;
  } else if (state.query && state.searchStatus === "idle") {
    content = `
      <section class="empty-panel search-state">
        <h2>Search paused.</h2>
        <p>Run this search again when you are ready.</p>
        <button class="primary-button" type="button" data-action="retry-search">Search again</button>
      </section>
    `;
  } else if (state.query && !state.searchResults.length) {
    content = `
      <section class="empty-panel search-state">
        <h2>No videos found.</h2>
        <p>Try a channel name, topic, or a shorter search.</p>
      </section>
    `;
  } else if (state.query) {
    const resultLabel = state.searchResults.length === 1 ? "result" : "results";
    content = `
      <p class="result-label">${state.searchResults.length} ${resultLabel} for ${escapeHtml(state.query)}</p>
      ${renderVideoList(state.searchResults, "search")}
    `;
  }

  return `
    <section class="search-view">
      <h1 class="sr-only">Search</h1>
      <form class="search-form" data-action="search-form">
        <label class="search-box">
          ${icon("search")}
          <input name="query" value="${escapeHtml(state.query)}" type="search" placeholder="Search SimaTube" aria-label="Search videos" autocomplete="off" />
        </label>
        <button class="text-button" type="submit" data-action="search-submit"${pendingButtonAttributes(loading)}>Search</button>
      </form>
      ${content}
    </section>
  `;
}

function renderQuickSearches() {
  const recent = state.searchHistory.slice(0, 5);
  return `
    <section class="search-discovery">
      ${recent.length ? `
        <div class="search-section-head">
          <h2>Recent</h2>
          <button class="text-button" type="button" data-action="clear-search-history">Clear</button>
        </div>
        <div class="recent-searches">
          ${recent.map((query) => `<button class="chip" type="button" data-action="quick-search" data-query="${escapeHtml(query)}">${icon("history")}<span>${escapeHtml(query)}</span></button>`).join("")}
        </div>
      ` : ""}
      <div class="search-section-head"><h2>Explore</h2></div>
      <div class="quick-grid">
        ${["Music", "Gaming", "News", "Live", "Podcasts", "Tech"].map((item) => `
          <button class="quick-tile" type="button" data-action="quick-search" data-query="${escapeHtml(item)}">${escapeHtml(item)}</button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderWatch() {
  const video = currentVideo();
  const subscribed = Boolean(state.subscriptionIdsByChannel[video.channelId]);
  const liked = state.ratings[video.id] === "like";
  const saved = state.savedIds.has(video.id);
  const commentsStatus = state.commentsStatusByVideoId[video.id] || "idle";
  const commentsPending = commentsStatus === "loading" || state.pendingActions.has(`comments:${video.id}`);
  const commentsActionLabel = {
    error: "Retry",
    loaded: "Refresh",
    loading: "Loading",
  }[commentsStatus] || "Load";
  const url = `${WATCH_BASE}?v=${encodeURIComponent(video.id)}`;

  return `
    <section class="watch-view">
      <div class="player-shell" data-video-id="${escapeHtml(video.id)}">
        <div id="playerMount"></div>
        <button class="poster-button" type="button" data-action="play" aria-label="Play video">
          ${video.posterUrl || video.thumbnailUrl
            ? `<img src="${escapeHtml(video.posterUrl || video.thumbnailUrl)}" alt="" decoding="async" fetchpriority="high" data-image-fallback="thumbnail" data-fallback-initial="${escapeHtml(channelInitial(video.title))}" />`
            : `<span class="thumbnail-fallback" aria-hidden="true">${escapeHtml(channelInitial(video.title))}</span>`}
          <span class="big-play" aria-hidden="true"></span>
          <span class="duration">${escapeHtml(video.duration)}</span>
        </button>
        ${state.playerError ? `
          <div class="player-fallback">
            <strong>Playback blocked here</strong>
            <span>${escapeHtml(state.playerError)}</span>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open in YouTube</a>
          </div>
        ` : ""}
      </div>
      <section class="watch-detail">
        <div class="title-row">
          <h1>${escapeHtml(video.title)}</h1>
          <div class="title-actions">
            <button class="player-fullscreen-button" type="button" data-action="player-fullscreen" aria-label="Fullscreen player" aria-pressed="false" title="Fullscreen">
              <span class="fullscreen-enter">${icon("fullscreen")}</span>
              <span class="fullscreen-exit">${icon("fullscreenExit")}</span>
            </button>
          </div>
        </div>
        <p class="stats-line">${escapeHtml([video.viewCount ? `${video.viewCount} views` : "", timeAgo(video.publishedAt)].filter(Boolean).join(" \u2022 "))}</p>
        <div class="channel-row">
          <button class="channel-link" type="button" data-action="open-channel" data-channel-id="${escapeHtml(video.channelId)}">
            ${renderChannelAvatar(video, "large")}
            <span>
              <strong>${escapeHtml(video.channelTitle)}</strong>
              <small>${subscribed ? "Subscribed" : "Channel"}</small>
            </span>
          </button>
          <button class="subscribe-button${subscribed ? " subscribed" : ""}" type="button" data-action="subscribe" aria-pressed="${subscribed ? "true" : "false"}"${pendingButtonAttributes(state.pendingActions.has(`subscription:${video.channelId}`))}>${subscribed ? "Subscribed" : "Subscribe"}</button>
        </div>
        <div class="action-row" aria-label="Video actions">
          ${actionPill("like", liked ? "Liked" : (video.likeCount || "Like"), liked ? "thumb-filled" : "thumb", liked, true)}
          ${actionPill("replay", "Replay", "replay")}
          ${actionPill("save", saved ? "Saved" : "Save", saved ? "check" : "plus", saved, true)}
          ${actionPill("share", "Share", "share")}
        </div>
        ${renderDescription(video)}
        <section class="comments-block">
          <div class="section-head">
            <h2>Comments</h2>
            <button class="text-button" type="button" data-action="comments"${pendingButtonAttributes(commentsPending)}>${commentsActionLabel}</button>
          </div>
          ${renderComments(video.id)}
        </section>
      </section>
      <section class="queue-section">
        <div class="section-head">
          <h2>Up next</h2>
          <button class="text-button" type="button" data-action="next-video">Next</button>
        </div>
        ${renderCompactQueue()}
      </section>
    </section>
  `;
}

function actionPill(action, label, iconName, active = false, toggle = false) {
  const pressed = toggle ? ` aria-pressed="${active ? "true" : "false"}"` : "";
  const pending = action === "like" && state.pendingActions.has(`rating:${currentVideo()?.id}`);
  return `<button class="action-pill${active ? " active" : ""}" type="button" data-action="${escapeHtml(action)}"${pressed}${pendingButtonAttributes(pending)}>${icon(iconName)}<span>${escapeHtml(label)}</span></button>`;
}

function pendingButtonAttributes(pending) {
  return pending ? ` disabled aria-busy="true"` : "";
}

function renderDescription(video) {
  return `
    <section class="description">
      <input class="description-toggle-input" id="description-toggle" type="checkbox" />
      <h2>Description</h2>
      <p>${escapeHtml(video.description || "No description available.")}</p>
      <label class="description-toggle" for="description-toggle">
        <span class="more-label">Show more</span>
        <span class="less-label">Show less</span>
      </label>
    </section>
  `;
}

function renderComments(videoId) {
  const status = state.commentsStatusByVideoId[videoId] || "idle";
  const comments = state.commentsByVideoId[videoId] || [];
  if (status === "loading") {
    return `
      <div class="comment-list comments-loading" role="status" aria-label="Loading comments">
        ${Array.from({ length: 2 }, () => `
          <article class="comment comment-skeleton" aria-hidden="true">
            <span class="comment-avatar skeleton-box"></span>
            <div><span class="skeleton-line wide"></span><span class="skeleton-line"></span></div>
          </article>
        `).join("")}
      </div>
    `;
  }
  if (status === "error") {
    return `
      <div class="inline-state error comments-empty" role="alert">
        <strong>Comments are unavailable.</strong>
        <span>${escapeHtml(state.commentsErrorByVideoId[videoId] || "Try again in a moment.")}</span>
      </div>
    `;
  }
  if (status === "loaded" && !comments.length) {
    return `<p class="empty-text comments-empty">No comments yet.</p>`;
  }
  if (status === "idle") {
    return `<p class="empty-text comments-empty">Load the top comments without leaving the video.</p>`;
  }

  return `
    <div class="comment-list">
      ${comments.map((comment) => `
        <article class="comment">
          ${comment.avatar ? `<img src="${escapeHtml(comment.avatar)}" alt="" width="32" height="32" loading="lazy" decoding="async" data-image-fallback="comment" data-fallback-initial="${escapeHtml(channelInitial(comment.author))}" />` : `<span class="comment-avatar fallback-initial" aria-hidden="true">${escapeHtml(channelInitial(comment.author))}</span>`}
          <div>
            <strong>${escapeHtml(comment.author)}</strong>
            <p>${escapeHtml(comment.text)}</p>
            <span>${Number(comment.likes).toLocaleString()} ${Number(comment.likes) === 1 ? "like" : "likes"}</span>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderCompactQueue() {
  const queue = state.queue.filter((video) => video.id !== state.activeVideoId).slice(0, 8);
  if (!queue.length) {
    return `<p class="empty-text">No more videos in this queue.</p>`;
  }

  return `<div class="queue-list">${queue.map((video) => renderVideoRow(video, "queue")).join("")}</div>`;
}

function renderSubscriptions() {
  if (!state.auth.accessToken) {
    return `
      <section class="signin-panel fill">
        <h1>Subscriptions</h1>
        <p>Sign in to load your subscribed channels and newest uploads.</p>
        <button class="primary-button" type="button" data-action="signin">Sign in</button>
      </section>
    `;
  }

  const visibleChannels = state.subscriptions.slice(0, state.visibleSubscriptionChannels);
  const remainingChannels = Math.max(0, state.subscriptions.length - visibleChannels.length);
  return `
    <section class="subscriptions-view">
      <div class="section-head sticky-head">
        <h1>Subscriptions</h1>
        <button class="text-button" type="button" data-action="refresh-subs"${pendingButtonAttributes(Boolean(state.subscriptionLoadPromise))}>Refresh</button>
      </div>
      <div class="channel-strip">
        ${visibleChannels.map((channel) => `
          <button class="channel-bubble" type="button" data-action="open-channel" data-channel-id="${escapeHtml(channel.id)}">
            ${renderChannelImage(channel)}
            <span>${escapeHtml(channel.title)}</span>
          </button>
        `).join("")}
        ${remainingChannels ? `
          <button class="channel-bubble channel-more" type="button" data-action="load-more-channels" aria-label="Show more channels">
            <span class="channel-more-icon" aria-hidden="true">+${Math.min(remainingChannels, SUBSCRIPTION_CHANNEL_INCREMENT)}</span>
            <span>More</span>
          </button>
        ` : ""}
      </div>
      ${state.feedLoading ? renderFeedLoader() : renderSubscriptionContent()}
    </section>
  `;
}

function renderSubscriptionContent() {
  if (!state.subscriptions.length) {
    const failed = Boolean(state.error);
    return `
      <section class="empty-panel">
        <h2>${failed ? "Subscriptions could not load." : "No subscriptions loaded."}</h2>
        <p>${escapeHtml(state.error || "Refresh once YouTube finishes reconnecting your account.")}</p>
        <button class="primary-button" type="button" data-action="refresh-subs"${pendingButtonAttributes(Boolean(state.subscriptionLoadPromise))}>Refresh</button>
      </section>
    `;
  }

  if (!state.subscriptionVideos.length) {
    return `
      <section class="empty-panel">
        <h2>Your channels loaded.</h2>
        <p>${escapeHtml(state.subscriptionWarning || "Newest uploads did not come through yet. You can still open any channel above.")}</p>
        <button class="primary-button" type="button" data-action="refresh-subs"${pendingButtonAttributes(Boolean(state.subscriptionLoadPromise))}>Try again</button>
      </section>
    `;
  }

  return renderVideoList(state.subscriptionVideos, "subscriptions");
}

function renderChannel() {
  const channel = activeChannel();
  if (!channel) {
    return `
      <section class="channel-view">
        <p class="empty-text">Choose a channel from Home, Watch, or Subscriptions.</p>
      </section>
    `;
  }

  const subscribed = Boolean(state.subscriptionIdsByChannel[channel.id]);
  const videos = sortedChannelVideos(channel.id);
  const showLoader = state.channelLoading && !videos.length;
  const youtubeUrl = `https://www.youtube.com/channel/${encodeURIComponent(channel.id)}`;
  const meta = [
    channel.subscriberCount ? `${channel.subscriberCount} subscribers` : "",
    channel.videoCount ? `${channel.videoCount} videos` : "",
  ].filter(Boolean).join(" \u2022 ");

  return `
    <section class="channel-view">
      <section class="channel-hero">
        <div class="channel-hero-top">
          <button class="icon-button channel-back" type="button" data-action="view" data-view="home" aria-label="Back to Home">${icon("back")}</button>
          <a class="channel-youtube-link" href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener noreferrer">${icon("external")}<span>YouTube</span></a>
        </div>
        <div class="channel-identity">
          ${renderChannelImage(channel, "hero")}
          <div>
            <h1>${escapeHtml(channel.title)}</h1>
            <p>${escapeHtml(meta || "YouTube channel")}</p>
          </div>
        </div>
        ${channel.description ? `<p class="channel-description">${escapeHtml(channel.description)}</p>` : ""}
        <div class="channel-actions">
          <button class="subscribe-button${subscribed ? " subscribed" : ""}" type="button" data-action="subscribe-channel" aria-pressed="${subscribed ? "true" : "false"}"${pendingButtonAttributes(state.pendingActions.has(`subscription:${channel.id}`))}>${subscribed ? "Subscribed" : "Subscribe"}</button>
          <button class="text-button" type="button" data-action="refresh-channel"${pendingButtonAttributes(state.channelLoading)}>${state.channelLoading ? "Refreshing" : "Refresh"}</button>
        </div>
      </section>
      <div class="channel-tabs" aria-label="Channel videos">
        ${channelTab("latest", "Latest")}
        ${channelTab("popular", "Popular")}
      </div>
      ${showLoader ? renderChannelLoader() : `
        ${state.error ? `
          <div class="inline-state error channel-inline-state" role="alert">
            <strong>${videos.length ? "Channel refresh failed." : "Channel could not load."}</strong>
            <span>${escapeHtml(state.error)}</span>
            ${videos.length ? "" : `<button class="text-button" type="button" data-action="refresh-channel">Try again</button>`}
          </div>
        ` : ""}
        ${videos.length || !state.error ? renderVideoList(videos, "channel", "This channel has no long-form videos yet.") : ""}
      `}
    </section>
  `;
}

function activeChannel() {
  return state.channelCacheById[state.activeChannelId]
    || state.recentChannels.find((channel) => channel.id === state.activeChannelId)
    || demoChannels.find((channel) => channel.id === state.activeChannelId)
    || channelFromVideo(findVideoByChannel(state.activeChannelId));
}

function sortedChannelVideos(channelId) {
  const videos = [...(state.channelVideosById[channelId] || [])];
  if (state.channelSort === "popular") {
    return videos.sort((a, b) => (b.viewCountNumber || 0) - (a.viewCountNumber || 0));
  }
  return videos.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

function channelTab(value, label) {
  const active = state.channelSort === value ? " active" : "";
  return `<button class="chip${active}" type="button" data-action="channel-sort" data-sort="${escapeHtml(value)}" aria-pressed="${state.channelSort === value ? "true" : "false"}">${escapeHtml(label)}</button>`;
}

function renderChannelLoader() {
  return `
    <section class="feed-loader channel-loader" role="status" aria-label="Loading channel">
      <span class="yt-spinner" aria-hidden="true"></span>
      <article class="video-row skeleton-card">
        <div class="thumb-button skeleton-box"></div>
        <div class="video-copy">
          <span class="channel-avatar skeleton-box"></span>
          <span>
            <strong class="skeleton-line wide"></strong>
            <small class="skeleton-line"></small>
          </span>
        </div>
      </article>
    </section>
  `;
}

function renderYou() {
  const profile = state.auth.profile;
  const savedVideos = savedLibraryVideos();
  const likedPending = state.pendingActions.has("liked-videos");
  const likedActionLabel = likedPending ? "Loading" : state.likedVideosLoaded ? "Refresh" : "Load";
  return `
    <section class="you-view">
      <section class="profile-head">
        ${profile?.thumbnailUrl ? `<img src="${escapeHtml(profile.thumbnailUrl)}" alt="" width="58" height="58" decoding="async" data-image-fallback="profile" data-fallback-initial="${escapeHtml(channelInitial(profile.title))}" />` : `<span class="profile-avatar">${escapeHtml(channelInitial(profile?.title || "H"))}</span>`}
        <div>
          <h1>${escapeHtml(profile?.title || "You")}</h1>
          <p>${profile ? "Your SimaTube library" : "Saved and watched on this device"}</p>
        </div>
        <button class="text-button" type="button" data-action="${profile ? "signout" : "signin"}">${profile ? "Sign out" : "Sign in"}</button>
      </section>
      <section class="library-block">
        <div class="section-head">
          <h2>History</h2>
          <span>${state.localHistory.length}</span>
        </div>
        ${renderVideoList(state.localHistory, "history", "Videos you watch will appear here.")}
      </section>
      <section class="library-block">
        <div class="section-head">
          <h2>Saved</h2>
          <span>${savedVideos.length}</span>
        </div>
        ${renderVideoList(savedVideos, "saved", "Save a video to keep it here.")}
      </section>
      <section class="library-block">
        <div class="section-head">
          <h2>Liked videos</h2>
          ${profile ? `<button class="text-button" type="button" data-action="liked"${pendingButtonAttributes(likedPending)}>${likedActionLabel}</button>` : ""}
        </div>
        ${profile
          ? likedPending && !state.likedVideos.length
            ? `<p class="empty-text library-loading" role="status">Loading liked videos...</p>`
            : renderVideoList(state.likedVideos, "liked", state.likedVideosLoaded ? "No liked videos yet." : "Load the videos you liked on YouTube.")
          : `<p class="empty-text">Sign in to see videos you liked on YouTube.</p>`}
      </section>
    </section>
  `;
}

function initialRowsForSource(source) {
  return ["history", "saved", "liked"].includes(source)
    ? LIBRARY_INITIAL_VIDEO_ROWS
    : INITIAL_VIDEO_ROWS;
}

function renderVideoList(videos, source, emptyMessage = "Nothing to show yet.") {
  const list = Array.isArray(videos) ? videos.filter(Boolean) : [];
  if (!list.length) {
    return `<p class="empty-text">${escapeHtml(emptyMessage)}</p>`;
  }

  const visibleLimit = state.visibleRowsBySource[source] || initialRowsForSource(source);
  const visibleVideos = list.slice(0, visibleLimit);
  const remaining = Math.max(0, list.length - visibleVideos.length);
  return `
    <div class="video-list">${visibleVideos.map((video, index) => renderVideoRow(video, source, index)).join("")}</div>
    ${remaining ? `
      <div class="load-more-row">
        <button class="secondary-button load-more-button" type="button" data-action="load-more" data-source="${escapeHtml(source)}">
          Show ${Math.min(remaining, VIDEO_ROWS_INCREMENT)} more
        </button>
      </div>
    ` : ""}
  `;
}

function renderVideoRow(video, source, itemIndex = -1) {
  if (!video?.id) {
    return "";
  }

  const saved = state.savedIds.has(video.id);
  const watched = state.localHistory.some((item) => item.id === video.id);
  const reason = videoFeedReason(video, source);
  const stateClass = [
    saved ? "is-saved" : "",
    watched ? "is-watched" : "",
    itemIndex >= 0 && itemIndex < 6 ? "motion-entry" : "",
  ].filter(Boolean).join(" ");
  const entryStyle = itemIndex >= 0 && itemIndex < 6 ? ` style="--item-index: ${itemIndex};"` : "";
  const imageLoading = itemIndex >= 0 && itemIndex < 2 ? "eager" : "lazy";
  const imagePriority = itemIndex === 0 ? "high" : "low";

  return `
    <article class="video-row ${stateClass}"${entryStyle}>
      <button class="thumb-button" type="button" data-action="watch" data-video-id="${escapeHtml(video.id)}" data-source="${escapeHtml(source)}" aria-label="Play ${escapeHtml(video.title)}">
        ${video.thumbnailUrl
          ? `<img src="${escapeHtml(video.thumbnailUrl)}" alt="" width="480" height="360" loading="${imageLoading}" decoding="async" fetchpriority="${imagePriority}" data-image-fallback="thumbnail" data-fallback-initial="${escapeHtml(channelInitial(video.title))}" />`
          : `<span class="thumbnail-fallback" aria-hidden="true">${escapeHtml(channelInitial(video.title))}</span>`}
        ${saved ? `<span class="saved-badge">${icon("check")}Saved</span>` : ""}
        ${watched ? `<span class="watch-progress" aria-hidden="true"></span>` : ""}
        ${video.duration ? `<span class="duration">${escapeHtml(video.duration)}</span>` : ""}
      </button>
      <div class="video-copy">
        <button class="channel-avatar-button" type="button" data-action="open-channel" data-channel-id="${escapeHtml(video.channelId)}" aria-label="${escapeHtml(video.channelTitle)} channel">
          ${renderChannelAvatar(video)}
        </button>
        <span class="video-text">
          ${reason ? `<em class="feed-reason">${escapeHtml(reason)}</em>` : ""}
          <button class="video-title-button" type="button" data-action="watch" data-video-id="${escapeHtml(video.id)}" data-source="${escapeHtml(source)}">
            <strong>${escapeHtml(video.title)}</strong>
          </button>
          <span class="video-meta-line">
            <button class="channel-name-button" type="button" data-action="open-channel" data-channel-id="${escapeHtml(video.channelId)}">${escapeHtml(video.channelTitle)}</button>
            <small>${escapeHtml(videoStatsMeta(video))}</small>
          </span>
        </span>
      </div>
      <button class="kebab" type="button" data-action="sheet" data-sheet="row-more" data-video-id="${escapeHtml(video.id)}" aria-label="More">${icon("more")}</button>
    </article>
  `;
}

function videoFeedReason(video, source) {
  if (source === "channel") {
    return "From this channel";
  }
  if (source === "subscriptions") {
    return "From your channels";
  }
  if (source === "home") {
    return state.feedReasonsById[video.id] || feedReasonForSource(video, "popular");
  }
  return "";
}

function channelAvatarFor(video) {
  return video.channelThumbnailUrl || state.channelThumbnailsById[video.channelId] || "";
}

function renderChannelAvatar(video, size = "") {
  const className = `channel-avatar${size ? ` ${size}` : ""}`;
  const avatarUrl = channelAvatarFor(video);

  if (avatarUrl) {
    return `<img class="${className}" src="${escapeHtml(avatarUrl)}" alt="" width="56" height="56" loading="lazy" decoding="async" data-image-fallback="channel" data-fallback-initial="${escapeHtml(channelInitial(video.channelTitle))}" />`;
  }

  return `<span class="${className} fallback" aria-hidden="true">${escapeHtml(channelInitial(video.channelTitle))}</span>`;
}

function renderChannelImage(channel, size = "") {
  const className = `channel-avatar${size ? ` ${size}` : ""}`;
  if (channel?.thumbnailUrl) {
    return `<img class="${className}" src="${escapeHtml(channel.thumbnailUrl)}" alt="" width="56" height="56" loading="lazy" decoding="async" data-image-fallback="channel" data-fallback-initial="${escapeHtml(channelInitial(channel.title))}" />`;
  }
  return `<span class="${className} fallback" aria-hidden="true">${escapeHtml(channelInitial(channel?.title))}</span>`;
}

function channelInitial(title = "") {
  return (String(title).trim().charAt(0) || "S").toUpperCase();
}

function renderBottomNav() {
  return `
    <nav class="bottom-nav" aria-label="Primary">
      ${navButton("home", "Home", "home")}
      ${navButton("search", "Search", "search")}
      ${navButton("subscriptions", "Subs", "subs")}
      ${navButton("you", "You", "user")}
    </nav>
  `;
}

function navButton(view, label, iconName) {
  const active = state.view === view ? " active" : "";
  const current = state.view === view ? ` aria-current="page"` : "";
  return `
    <button class="nav-item${active}" type="button" data-action="view" data-view="${escapeHtml(view)}" aria-label="${escapeHtml(label)}"${current}>
      ${icon(iconName)}
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function icon(name) {
  const icons = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11v2H8.8l4.6 4.6L12 19 5 12l7-7 1.4 1.4L8.8 11H20Z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.6 2.6 0 0 0 2.45-1.75h-4.9A2.6 2.6 0 0 0 12 22Zm7-6.5V11a7 7 0 0 0-5.2-6.77V3a1.8 1.8 0 1 0-3.6 0v1.23A7 7 0 0 0 5 11v4.5l-1.7 2.27A.75.75 0 0 0 3.9 19h16.2a.75.75 0 0 0 .6-1.23L19 15.5ZM7 11a5 5 0 0 1 10 0v5.17l.62.83H6.38L7 16.17V11Z"/></svg>',
    cast: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25v13.5A2.25 2.25 0 0 1 18.75 21H16.5v-2h2.25a.25.25 0 0 0 .25-.25V5.25a.25.25 0 0 0-.25-.25H5.25a.25.25 0 0 0-.25.25V7.5H3Zm0 10.25v-2.1A5.35 5.35 0 0 1 8.35 21h2.1v-2h-2.1A3.35 3.35 0 0 0 5 15.65v-2.2A5.55 5.55 0 0 1 10.55 19H13v-2h-2.45A7.55 7.55 0 0 0 3 9.45v2.1A5.45 5.45 0 0 1 8.45 17H13v-2H8.45A3.45 3.45 0 0 0 5 11.55v6.2H3Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.2 16.6-4.1-4.1-1.4 1.4 5.5 5.5L21 7.6 19.6 6 9.2 16.6Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"/></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h6v2H8.4l3.3 3.3-1.4 1.4L7 8.4V11H5V5Zm8 0h6v6h-2V8.4l-3.3 3.3-1.4-1.4L15.6 7H13V5ZM7 15.6l3.3-3.3 1.4 1.4L8.4 17H11v2H5v-6h2v2.6ZM17 15.6V13h2v6h-6v-2h2.6l-3.3-3.3 1.4-1.4L17 15.6Z"/></svg>',
    fullscreenExit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.6 6.2V3h2v6.6H5v-2h3.2L4.7 4.1 6.1 2.7l3.5 3.5Zm6.2 1.4H19v2h-6.6V3h2v3.2l3.5-3.5 1.4 1.4-3.5 3.5ZM8.2 16.4H5v-2h6.6V21h-2v-3.2l-3.5 3.5-1.4-1.4 3.5-3.5Zm6.2 1.4V21h-2v-6.6H19v2h-3.2l3.5 3.5-1.4 1.4-3.5-3.5Z"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 1-7.74 10H6.4A6 6 0 1 0 8 7.1V10H6V4h6v2H9.45A7.95 7.95 0 0 1 12 4Zm-1 3h2v4.45l3.12 1.8-1 1.73L11 12.6V7Z"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.7 12 4l8 6.7V20h-5v-5.5H9V20H4v-9.3Z"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>',
    replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.66-5.66L20 4v6h-6l2.24-2.24A6 6 0 1 0 18 12h2a8 8 0 1 1-16 0Zm7-4h2v4.15l3.18 1.84-1 1.74L11 13.31V8Z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20.49 19.07-4.08-4.08a7.2 7.2 0 1 0-1.42 1.42l4.08 4.08 1.42-1.42ZM5 10.2a5.2 5.2 0 1 1 10.4 0 5.2 5.2 0 0 1-10.4 0Z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.3 3.3 0 0 0 0-1.39l7.05-4.1A3 3 0 1 0 15 5c0 .24.03.47.08.69L8.03 9.8a3 3 0 1 0 0 4.4l7.12 4.16c-.04.18-.06.37-.06.56a2.91 2.91 0 1 0 2.91-2.84Z"/></svg>',
    subs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 13.5v-7Zm2.5-.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5h-11ZM8 18h8v2H8v-2Zm3-9 4 2.2-4 2.3V9Z"/></svg>',
    thumb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.1 21H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h4.1l3.18-5.5a2.5 2.5 0 0 1 4.66 1.65L15.35 9H20a2.5 2.5 0 0 1 2.45 3l-1.4 7A2.5 2.5 0 0 1 18.6 21H8.1ZM8 11H4v8h4v-8Zm2 7.98h8.6a.5.5 0 0 0 .49-.4l1.4-7A.5.5 0 0 0 20 11h-7l.95-6.13a.5.5 0 0 0-.93-.33L10 9.78v9.2Z"/></svg>',
    "thumb-filled": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h4v12Zm2 0h8.6a2.5 2.5 0 0 0 2.45-2l1.4-7A2.5 2.5 0 0 0 20 9h-4.65l.59-3.85a2.5 2.5 0 0 0-4.66-1.65L8.5 8.32V21H10Z"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.1 0-7 2.2-7 5v1h14v-1c0-2.8-2.9-5-7-5Z"/></svg>',
  };

  return icons[name] || icons.more;
}

function mountPlayer(autoplay) {
  let mount = document.querySelector("#playerMount");
  const video = currentVideo();
  if (!mount || state.playerError || !state.ytApiReady || !window.YT?.Player) {
    return;
  }

  const existingFrame = state.player?.getIframe?.();
  if (existingFrame && document.body.contains(existingFrame) && state.playerVideoId === video.id) {
    return;
  }

  if (state.player) {
    destroyPlayer();
    mount = document.querySelector("#playerMount");
    if (!mount) {
      return;
    }
  }

  state.playerVideoId = video.id;
  let player = null;
  try {
    player = new window.YT.Player(mount, {
      host: "https://www.youtube-nocookie.com",
      videoId: video.id,
      playerVars: {
        autoplay: autoplay ? 1 : 0,
        controls: 1,
        enablejsapi: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
      },
      events: {
        onReady: () => {
          if (state.player !== player || state.playerVideoId !== video.id) {
            return;
          }
          state.playerReady = true;
          configurePlayerIframe();
          if (state.pendingAutoplayVideoId === video.id) {
            state.pendingAutoplayVideoId = "";
            document.querySelector(".poster-button")?.setAttribute("hidden", "");
            player.playVideo?.();
          }
        },
        onError: (event) => handlePlayerError(event.data, video.id),
        onStateChange: (event) => {
          if (state.player === player
            && state.playerVideoId === video.id
            && event.data === window.YT.PlayerState.ENDED) {
            nextVideo({ autoplay: true, preserveFullscreen: true });
          }
        },
      },
    });
  } catch {
    state.playerVideoId = "";
    state.pendingAutoplayVideoId = "";
    const poster = document.querySelector(".poster-button");
    poster?.classList.remove("is-loading");
    poster?.removeAttribute("aria-busy");
    showToast("The player could not start. Tap to try again.");
    return;
  }
  state.player = player;
}

function destroyPlayer() {
  const player = state.player;
  state.player = null;
  state.playerVideoId = "";
  state.playerReady = false;

  if (!player) {
    return;
  }

  try {
    player.destroy?.();
  } catch {
    player.getIframe?.()?.remove?.();
  }
}

function configurePlayerIframe() {
  const iframe = state.player?.getIframe?.();
  if (!iframe) {
    return;
  }

  iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
  iframe.setAttribute("playsinline", "");
  iframe.setAttribute("webkit-playsinline", "");
}

async function togglePlayerFullscreen() {
  if (isPlayerFullscreen()) {
    closePlayerFullscreen();
    return;
  }
  restorePlayerFullscreen();
}

function isPlayerFullscreen() {
  return Boolean(document.querySelector(".player-shell.app-fullscreen"));
}

function restorePlayerFullscreen() {
  const shell = document.querySelector(".player-shell");
  if (!shell) {
    closePlayerFullscreen();
    return;
  }

  shell.classList.add("app-fullscreen");
  document.documentElement.classList.add("player-fullscreen-open");
  document.body.classList.add("player-fullscreen-open");
  setFullscreenButtonState(true);
  showPlayerFullscreenControls();
}

function closePlayerFullscreen() {
  document.querySelector(".player-shell.app-fullscreen")?.classList.remove("app-fullscreen");
  document.documentElement.classList.remove("player-fullscreen-open");
  document.body.classList.remove("player-fullscreen-open");
  clearPlayerFullscreenControlsTimer();
  setFullscreenButtonState(false);
}

function setFullscreenButtonState(fullscreen) {
  document.querySelectorAll(".player-fullscreen-button").forEach((button) => {
    button.setAttribute("aria-label", fullscreen ? "Exit fullscreen player" : "Fullscreen player");
    button.setAttribute("aria-pressed", fullscreen ? "true" : "false");
    button.setAttribute("title", fullscreen ? "Exit fullscreen" : "Fullscreen");
  });
}

function showPlayerFullscreenControls() {
  clearPlayerFullscreenControlsTimer();
  state.fullscreenControlsHidden = false;
  document.documentElement.classList.remove("player-fullscreen-controls-hidden");
  document.body.classList.remove("player-fullscreen-controls-hidden");

  if (document.querySelector(".player-shell.app-fullscreen")) {
    state.fullscreenControlsTimer = window.setTimeout(hidePlayerFullscreenControls, 2600);
  }
}

function hidePlayerFullscreenControls() {
  if (!document.querySelector(".player-shell.app-fullscreen")) {
    return;
  }

  state.fullscreenControlsHidden = true;
  document.documentElement.classList.add("player-fullscreen-controls-hidden");
  document.body.classList.add("player-fullscreen-controls-hidden");
}

function clearPlayerFullscreenControlsTimer() {
  window.clearTimeout(state.fullscreenControlsTimer);
  state.fullscreenControlsTimer = 0;
  state.fullscreenControlsHidden = false;
  document.documentElement.classList.remove("player-fullscreen-controls-hidden");
  document.body.classList.remove("player-fullscreen-controls-hidden");
}

function handlePlayerFullscreenWakeTap(event) {
  const shell = document.querySelector(".player-shell.app-fullscreen");
  if (!shell || !shell.contains(event.target)) {
    return false;
  }

  if (state.fullscreenControlsHidden) {
    showPlayerFullscreenControls();
    return true;
  }

  showPlayerFullscreenControls();
  return false;
}

function playActive() {
  const video = currentVideo();
  const poster = document.querySelector(".poster-button");
  if (!state.ytApiReady || !window.YT?.Player || (state.player && !state.playerReady)) {
    state.pendingAutoplayVideoId = video.id;
    poster?.classList.add("is-loading");
    poster?.setAttribute("aria-busy", "true");
    loadYouTubeIframeApi();
    return;
  }

  state.pendingAutoplayVideoId = "";
  poster?.setAttribute("hidden", "");
  if (state.player?.loadVideoById) {
    state.player.loadVideoById(video.id);
    return;
  }

  mountPlayer(true);
}

function replayActive() {
  if (state.player?.seekTo) {
    state.player.seekTo(0, true);
    state.player.playVideo();
    return;
  }
  playActive();
}

function handlePlayerError(code, videoId = state.playerVideoId) {
  if (!videoId || videoId !== state.activeVideoId || videoId !== state.playerVideoId) {
    return;
  }
  const preserveFullscreen = isPlayerFullscreen();
  const messages = {
    100: "This video was removed, private, or not found.",
    101: "The owner does not allow embedded playback.",
    150: "The owner does not allow embedded playback.",
    153: "YouTube needs a valid browser identity for this embed.",
  };
  if (state.pendingAutoplayVideoId === videoId) {
    state.pendingAutoplayVideoId = "";
  }
  state.playerError = messages[code] || "This video cannot play in the embedded player.";
  destroyPlayer();
  render();
  if (preserveFullscreen) {
    restorePlayerFullscreen();
  }
  window.setTimeout(() => {
    if (state.activeVideoId === videoId) {
      nextVideo({ autoplay: false, preserveFullscreen: false });
    }
  }, 1600);
}

function nextVideo(options = {}) {
  const queue = state.queue.length ? state.queue : state.homeFeed;
  const currentIndex = queue.findIndex((video) => video.id === state.activeVideoId);
  const next = queue[(currentIndex + 1 + queue.length) % queue.length];
  if (next && next.id !== state.activeVideoId) {
    openWatch(next.id, queue, options);
  }
}

function queueForSource(source) {
  if (source === "search") {
    return state.searchResults;
  }
  if (source === "history") {
    return state.localHistory;
  }
  if (source === "liked") {
    return state.likedVideos;
  }
  if (source === "saved") {
    return savedLibraryVideos();
  }
  if (source === "subscriptions") {
    return state.subscriptionVideos;
  }
  if (source === "channel") {
    return sortedChannelVideos(state.activeChannelId);
  }
  if (source === "queue") {
    return state.queue;
  }
  return state.homeFeed;
}

function handleImageError(image) {
  const kind = image.dataset.imageFallback;
  if (!kind) {
    return;
  }
  const initial = image.dataset.fallbackInitial || "S";

  if (kind === "profile") {
    const avatarButton = image.closest(".avatar-button");
    if (avatarButton) {
      avatarButton.replaceChildren(document.createTextNode(initial));
      return;
    }
    const fallback = document.createElement("span");
    fallback.className = "profile-avatar";
    fallback.textContent = initial;
    fallback.setAttribute("aria-hidden", "true");
    image.replaceWith(fallback);
    return;
  }

  const fallback = document.createElement("span");
  fallback.textContent = initial;
  fallback.setAttribute("aria-hidden", "true");
  if (kind === "channel") {
    fallback.className = `${image.className} fallback`;
  } else if (kind === "comment") {
    fallback.className = "comment-avatar fallback-initial";
  } else {
    fallback.className = "thumbnail-fallback";
  }
  image.replaceWith(fallback);
}

app.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement) {
    handleImageError(event.target);
  }
}, true);

app.addEventListener("click", async (event) => {
  tryLockPortraitOrientation();

  if (handlePlayerFullscreenWakeTap(event)) {
    return;
  }

  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }

  const action = target.dataset.action;

  if (action === "view") {
    setView(target.dataset.view);
  }
  if (action === "signin") {
    await signIn();
  }
  if (action === "continue-demo") {
    continueDemo();
  }
  if (action === "install-intro-done") {
    state.installIntroDone = true;
    state.onboarded = false;
    state.demoMode = false;
    writeJson("yt_install_intro_done", true);
    writeJson("yt_onboarded", false);
    writeJson("yt_demo_mode", false);
    render();
    resetScroll();
  }
  if (action === "signout") {
    await signOut();
  }
  if (action === "home-filter") {
    state.homeFilter = target.dataset.filter;
    render();
  }
  if (action === "watch") {
    openWatch(target.dataset.videoId, queueForSource(target.dataset.source));
  }
  if (action === "play") {
    playActive();
  }
  if (action === "player-fullscreen") {
    await togglePlayerFullscreen();
  }
  if (action === "replay") {
    replayActive();
  }
  if (action === "next-video") {
    nextVideo({ autoplay: true, preserveFullscreen: true });
  }
  if (action === "like") {
    await rateActiveVideo();
  }
  if (action === "subscribe") {
    await subscribeToActiveChannel();
  }
  if (action === "save") {
    toggleSaved(currentVideo().id);
  }
  if (action === "share") {
    await shareVideo(currentVideo());
  }
  if (action === "comments") {
    await loadComments(currentVideo().id);
  }
  if (action === "liked") {
    await loadLikedVideos({ refresh: true });
  }
  if (action === "refresh-subs") {
    target.disabled = true;
    target.setAttribute("aria-busy", "true");
    target.textContent = "Refreshing";
    state.homeFeedLoaded = false;
    await loadSubscriptionsAndFeed({ refresh: true, includeHome: state.view === "home" });
  }
  if (action === "refresh-channel") {
    target.disabled = true;
    target.setAttribute("aria-busy", "true");
    target.textContent = "Refreshing";
    await loadActiveChannel({ refresh: true });
  }
  if (action === "retry-search") {
    await runSearch(state.query, { refresh: true });
  }
  if (action === "clear-search-history") {
    state.searchHistory = [];
    writeJson("yt_search_history", []);
    render();
  }
  if (action === "channel-sort") {
    state.channelSort = target.dataset.sort || "latest";
    render();
  }
  if (action === "load-more") {
    const source = target.dataset.source || "home";
    state.visibleRowsBySource[source] = (state.visibleRowsBySource[source] || initialRowsForSource(source))
      + VIDEO_ROWS_INCREMENT;
    render();
  }
  if (action === "load-more-channels") {
    state.visibleSubscriptionChannels += SUBSCRIPTION_CHANNEL_INCREMENT;
    render();
  }
  if (action === "subscribe-channel") {
    await subscribeToActiveChannel(state.activeChannelId);
  }
  if (action === "quick-search") {
    setView("search");
    await runSearch(target.dataset.query);
  }
  if (action === "sheet") {
    handleSheet(target.dataset.sheet, target.dataset.videoId);
  }
  if (action === "open-channel") {
    openChannel(target.dataset.channelId);
  }
});

app.addEventListener("submit", async (event) => {
  if (!event.target.matches('[data-action="search-form"]')) {
    return;
  }

  event.preventDefault();
  await runSearch(new FormData(event.target).get("query") || "");
});

sheetRoot.addEventListener("click", (event) => {
  if (event.target.matches(".sheet-backdrop")) {
    closeSheet();
  }
});

function trapSheetFocus(event) {
  if (event.key !== "Tab" || !sheetRoot.childElementCount) {
    return false;
  }
  const focusable = [...sheetRoot.querySelectorAll(".sheet-action")]
    .filter((element) => !element.disabled && element.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) {
    event.preventDefault();
    return true;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  if (!sheetRoot.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

document.addEventListener("keydown", (event) => {
  if (trapSheetFocus(event)) {
    return;
  }
  if (event.key === "Escape") {
    if (sheetRoot.childElementCount) {
      closeSheet();
      return;
    }
    closePlayerFullscreen();
  }
});

function handleSheet(sheet, videoId) {
  const video = videoId ? findVideo(videoId) : currentVideo();
  if (sheet === "row-more" || sheet === "video-more") {
    openSheet(video.title, "Choose where to continue this video.", [
      { label: state.savedIds.has(video.id) ? "Remove saved" : "Save", action: () => { toggleSaved(video.id); closeSheet(); } },
      { label: "Open channel", action: () => { closeSheet(); openChannel(video.channelId); } },
      { label: "Open in YouTube", href: `${WATCH_BASE}?v=${encodeURIComponent(video.id)}` },
      { label: "Close", action: closeSheet },
    ]);
  }
}
