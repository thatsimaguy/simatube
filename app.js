const READ_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const WRITE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
const API_BASE = "https://www.googleapis.com/youtube/v3";
const WATCH_BASE = "https://www.youtube.com/watch";
const MIN_FEED_DURATION_SECONDS = 61;
const MAX_DISCOVERY_QUERIES = 4;

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
    thumbnailUrl: "https://i.ytimg.com/vi/jNQXAC9IVRw/default.jpg",
    uploadsPlaylistId: "",
  },
  {
    id: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    title: "Google for Developers",
    thumbnailUrl: "https://i.ytimg.com/vi/M7lc1UVf-VE/default.jpg",
    uploadsPlaylistId: "",
  },
  {
    id: "UCz75RVbH8q2jdBJ4SnwuZZQ",
    title: "Blender Foundation",
    thumbnailUrl: "https://i.ytimg.com/vi/ScMzIvxBSi4/default.jpg",
    uploadsPlaylistId: "",
  },
];

const app = document.querySelector("#app");
const sheetRoot = document.querySelector("#sheet-root");
const toast = document.querySelector("#toast");

const state = {
  view: sanitizeView(readJson("yt_last_view", "home")),
  auth: {
    accessToken: "",
    scopes: new Set(),
    profile: null,
  },
  config: normalizeConfig(window.YT_APP_CONFIG || {}),
  configLocalLoaded: false,
  activeVideoId: demoVideos[0].id,
  homeFeed: [],
  searchResults: [],
  subscriptions: [],
  queue: [],
  comments: [],
  likedVideos: [],
  ratings: {},
  subscriptionIdsByChannel: {},
  savedIds: new Set(readJson("yt_saved_ids", [])),
  localHistory: readJson("yt_history", []),
  searchHistory: readJson("yt_search_history", []),
  onboarded: readJson("yt_onboarded", false),
  installIntroDone: readJson("yt_install_intro_done", false),
  rememberSignIn: readJson("yt_remember_youtube_signin", false),
  reconnectFailed: false,
  demoMode: readJson("yt_demo_mode", false),
  installDismissed: readJson("yt_install_dismissed", false),
  feedLoading: false,
  loading: "",
  error: "",
  query: "",
  homeFilter: "all",
  player: null,
  playerReady: false,
  playerError: null,
  ytApiReady: false,
};

await loadOptionalLocalConfig();
state.config = normalizeConfig(window.YT_APP_CONFIG || {});
boot();
clearOldServiceWorkers();

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
    state.configLocalLoaded = true;
  } catch {
    state.configLocalLoaded = false;
  }
}

function boot() {
  window.onYouTubeIframeAPIReady = () => {
    state.ytApiReady = true;
    if (state.view === "watch") {
      mountPlayer(false);
    }
  };

  loadYouTubeIframeApi();
  state.feedLoading = shouldLoadInitialFeed();
  state.homeFeed = state.demoMode ? demoVideos : [];
  state.queue = state.homeFeed;
  render();

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

async function restoreServerSession() {
  if (!state.config.serverOAuthEnabled) {
    return false;
  }

  try {
    const session = await fetchServerSession();
    if (!session.authenticated) {
      if (state.rememberSignIn) {
        state.reconnectFailed = true;
        render();
      }
      return false;
    }

    applyServerSession(session);
    await loadMe();
    await loadSubscriptionsAndFeed({ quiet: true });
    state.onboarded = true;
    state.demoMode = false;
    state.rememberSignIn = true;
    state.reconnectFailed = false;
    writeJson("yt_onboarded", true);
    writeJson("yt_demo_mode", false);
    writeJson("yt_remember_youtube_signin", true);
    showToast("Signed in.");
    return true;
  } catch {
    if (state.rememberSignIn) {
      state.reconnectFailed = true;
      render();
    }
    return false;
  }
}

async function fetchServerSession() {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok && response.status !== 401) {
    throw new Error(payload.error || "Could not load server session.");
  }

  return payload;
}

function applyServerSession(session) {
  state.auth.accessToken = session.accessToken || "";
  state.auth.scopes = new Set(session.scopes || []);
}

async function refreshServerAccessToken() {
  if (!state.config.serverOAuthEnabled) {
    return false;
  }

  const session = await fetchServerSession();
  if (!session.authenticated) {
    return false;
  }

  applyServerSession(session);
  return true;
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
    await fetch("/api/auth/logout", {
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
  return ["home", "search", "watch", "subscriptions", "you"].includes(view) ? view : "home";
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("Local storage is unavailable.");
  }
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
    state.ytApiReady = true;
    return;
  }

  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.async = true;
  document.head.append(script);
}

async function clearOldServiceWorkers() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cache cleanup is best-effort; the app still works without it.
  }
}

function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
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
        scope.split(" ").forEach((item) => state.auth.scopes.add(item));
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
  const useAuth = options.auth || (!state.config.youtubeApiKey && Boolean(state.auth.accessToken));
  const url = new URL(`${API_BASE}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const headers = {};
  if (useAuth && state.auth.accessToken) {
    headers.Authorization = `Bearer ${state.auth.accessToken}`;
  } else if (state.config.youtubeApiKey) {
    url.searchParams.set("key", state.config.youtubeApiKey);
  } else {
    throw new Error("Add an API key or sign in first.");
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
  });

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
  if (state.auth.accessToken) {
    return;
  }

  state.feedLoading = true;
  setLoading("Loading Home");
  try {
    const popularVideos = await loadPopularVideos();
    const rankedPopular = rankHomeCandidates(popularVideos.map((video) => ({ video, source: "popular" })));
    state.homeFeed = rankedPopular.length ? rankedPopular : demoVideos;
    state.queue = state.homeFeed;
    state.error = "";
  } catch (error) {
    state.error = error.message;
    state.homeFeed = demoVideos;
    state.queue = demoVideos;
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

  setLoading("Signing in");
  try {
    await ensureReadAuth({ prompt: state.rememberSignIn ? "" : "consent" });
    await loadMe();
    await loadSubscriptionsAndFeed();
    state.onboarded = true;
    state.demoMode = false;
    state.rememberSignIn = true;
    state.reconnectFailed = false;
    writeJson("yt_onboarded", true);
    writeJson("yt_demo_mode", false);
    writeJson("yt_remember_youtube_signin", true);
    state.view = "home";
    writeJson("yt_last_view", "home");
    showToast("Signed in.");
  } catch (error) {
    openSheet("Sign in did not finish", error.message, [{ label: "Close", action: closeSheet }]);
  } finally {
    clearLoading();
  }
}

async function signOut() {
  await clearServerSession();
  state.auth.accessToken = "";
  state.auth.scopes.clear();
  state.auth.profile = null;
  state.subscriptions = [];
  state.subscriptionIdsByChannel = {};
  state.likedVideos = [];
  state.rememberSignIn = false;
  state.reconnectFailed = false;
  state.homeFeed = demoVideos;
  state.queue = demoVideos;
  state.view = "home";
  writeJson("yt_remember_youtube_signin", false);
  writeJson("yt_last_view", "home");
  showToast("Signed out.");
  render();
}

function continueDemo() {
  state.onboarded = true;
  state.demoMode = true;
  state.rememberSignIn = false;
  state.reconnectFailed = false;
  state.feedLoading = false;
  state.homeFeed = demoVideos;
  state.queue = demoVideos;
  state.view = "home";
  writeJson("yt_onboarded", true);
  writeJson("yt_demo_mode", true);
  writeJson("yt_remember_youtube_signin", false);
  writeJson("yt_last_view", "home");
  showToast("Demo feed ready.");
  render();
}

async function restoreSignIn() {
  state.feedLoading = true;
  setLoading("Reconnecting SimaTube");

  try {
    await ensureReadAuth({ prompt: "", quiet: true, timeoutMs: 7000 });
    await loadMe();
    await loadSubscriptionsAndFeed({ quiet: true });
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

async function loadMe() {
  const payload = await youtubeFetch("/channels", {
    part: "snippet,contentDetails",
    mine: "true",
  }, { auth: true });

  const channel = payload.items?.[0];
  if (!channel) {
    throw new Error("No YouTube channel was found for this account.");
  }

  state.auth.profile = {
    id: channel.id,
    title: channel.snippet?.title || "You",
    thumbnailUrl: bestThumbnail(channel.snippet?.thumbnails),
    likedPlaylistId: channel.contentDetails?.relatedPlaylists?.likes || "",
  };
}

async function loadSubscriptionsAndFeed(options = {}) {
  await ensureReadAuth(options.authOptions || {});
  state.feedLoading = true;
  setLoading("Loading subscriptions");

  try {
    const subs = await listAll("/subscriptions", {
      part: "snippet,contentDetails",
      mine: "true",
      maxResults: 50,
      order: "unread",
    }, { auth: true }, state.config.maxSubscriptionChannels);

    state.subscriptionIdsByChannel = {};
    subs.forEach((sub) => {
      const channelId = sub.snippet?.resourceId?.channelId;
      if (channelId && sub.id) {
        state.subscriptionIdsByChannel[channelId] = sub.id;
      }
    });

    const channelIds = subs.map((sub) => sub.snippet?.resourceId?.channelId).filter(Boolean);
    const channels = await loadChannels(channelIds);
    state.subscriptions = channels;

    const uploadsPerChannel = Math.max(state.config.uploadsPerChannel, 5);
    const playlistResults = await Promise.allSettled(
      channels
        .filter((channel) => channel.uploadsPlaylistId)
        .map((channel) => youtubeFetch("/playlistItems", {
          part: "snippet,contentDetails",
          playlistId: channel.uploadsPlaylistId,
          maxResults: uploadsPerChannel,
        }, { auth: true })),
    );

    const uploadVideoIds = playlistResults
      .flatMap((result) => result.status === "fulfilled" ? result.value.items || [] : [])
      .map((item) => item.contentDetails?.videoId)
      .filter(Boolean);

    const uniqueVideoIds = [...new Set(uploadVideoIds)];
    const subscribedVideos = await loadVideoDetails(uniqueVideoIds, { auth: true });
    const feed = await buildPersonalHomeFeed(subscribedVideos);

    state.homeFeed = feed.length ? feed : subscribedVideos.filter((video) => !isLikelyShort(video));
    state.queue = state.homeFeed;
    state.error = "";
  } catch (error) {
    state.error = error.message;
    if (!options.quiet) {
      openSheet("Could not load subscriptions", error.message, [{ label: "Close", action: closeSheet }]);
    }
  } finally {
    state.feedLoading = false;
    clearLoading();
  }
}

async function buildPersonalHomeFeed(subscribedVideos = []) {
  const likedVideos = await loadLikedVideoSeeds();
  if (likedVideos.length) {
    state.likedVideos = likedVideos;
  }

  const [discoveryVideos, popularVideos] = await Promise.all([
    loadInterestDiscoveryVideos(),
    loadPopularVideos({ auth: true }),
  ]);

  const candidates = [
    ...subscribedVideos.map((video) => ({ video, source: "subscription" })),
    ...discoveryVideos.map((video) => ({ video, source: "interest" })),
    ...popularVideos.map((video) => ({ video, source: "popular" })),
  ];

  return rankHomeCandidates(candidates);
}

async function loadLikedVideoSeeds() {
  try {
    const payload = await youtubeFetch("/videos", {
      part: "snippet,contentDetails,statistics",
      myRating: "like",
      maxResults: 25,
    }, { auth: true });
    return (payload.items || []).map(normalizeVideoResource);
  } catch {
    return [];
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
    return (payload.items || []).map(normalizeVideoResource);
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
    .sort((a, b) => b.score - a.score)
    .map(({ video }) => video);

  return diversifyByChannel(scored).slice(0, 40);
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

function diversifyByChannel(videos) {
  const picked = [];
  const deferred = [];
  const channelCounts = new Map();

  videos.forEach((video) => {
    const count = channelCounts.get(video.channelId) || 0;
    const limit = picked.length < 16 ? 1 : 2;
    if (count < limit) {
      picked.push(video);
      channelCounts.set(video.channelId, count + 1);
    } else {
      deferred.push(video);
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
  return Math.max(0, (Date.now() - new Date(dateValue).getTime()) / 86_400_000);
}

function stableDailyJitter(id = "") {
  const seed = `${new Date().toISOString().slice(0, 10)}:${id}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 100;
}

async function loadChannels(channelIds) {
  const chunks = chunk(channelIds, 50);
  const responses = await Promise.all(chunks.map((ids) => youtubeFetch("/channels", {
    part: "snippet,contentDetails",
    id: ids.join(","),
    maxResults: 50,
  }, { auth: Boolean(state.auth.accessToken) })));

  return responses.flatMap((payload) => payload.items || []).map(normalizeChannelResource);
}

async function loadVideoDetails(videoIds, options = {}) {
  const chunks = chunk(videoIds, 50);
  const responses = await Promise.all(chunks.map((ids) => youtubeFetch("/videos", {
    part: "snippet,contentDetails,statistics",
    id: ids.join(","),
    maxResults: 50,
  }, options)));

  return responses.flatMap((payload) => payload.items || []).map(normalizeVideoResource);
}

async function runSearch(query) {
  const cleaned = query.trim();
  state.query = cleaned;

  if (!cleaned) {
    state.searchResults = [];
    render();
    return;
  }

  rememberSearch(cleaned);
  setLoading("Searching");
  try {
    if (!hasApiAccess()) {
      state.searchResults = demoVideos.filter((video) => {
        const haystack = `${video.title} ${video.channelTitle}`.toLowerCase();
        return haystack.includes(cleaned.toLowerCase());
      });
      if (!state.searchResults.length) {
        state.searchResults = demoVideos;
      }
      state.error = "";
      return;
    }

    const search = await youtubeFetch("/search", {
      part: "snippet",
      q: cleaned,
      type: "video",
      videoEmbeddable: "true",
      maxResults: 25,
      regionCode: state.config.regionCode,
    }, { auth: Boolean(state.auth.accessToken) });

    const ids = (search.items || []).map((item) => item.id?.videoId).filter(Boolean);
    state.searchResults = (await loadVideoDetails(ids, { auth: Boolean(state.auth.accessToken) }))
      .filter((video) => !isLikelyShort(video));
    state.error = "";
  } catch (error) {
    state.error = error.message;
    openSheet("Search failed", error.message, [{ label: "Close", action: closeSheet }]);
  } finally {
    clearLoading();
  }
}

function rememberSearch(query) {
  state.searchHistory = [
    query,
    ...state.searchHistory.filter((item) => item.toLowerCase() !== query.toLowerCase()),
  ].slice(0, 20);
  writeJson("yt_search_history", state.searchHistory);
}

async function loadComments(videoId) {
  setLoading("Loading comments");
  try {
    const payload = await youtubeFetch("/commentThreads", {
      part: "snippet",
      videoId,
      maxResults: 10,
      order: "relevance",
      textFormat: "plainText",
    }, { auth: Boolean(state.auth.accessToken) });

    state.comments = (payload.items || []).map((item) => {
      const comment = item.snippet?.topLevelComment?.snippet || {};
      return {
        author: comment.authorDisplayName || "YouTube user",
        avatar: comment.authorProfileImageUrl || "",
        text: comment.textDisplay || "",
        likes: comment.likeCount || 0,
      };
    });
    render();
  } catch (error) {
    openSheet("Comments unavailable", error.message, [{ label: "Close", action: closeSheet }]);
  } finally {
    clearLoading();
  }
}

async function loadLikedVideos() {
  await ensureReadAuth();
  setLoading("Loading liked videos");
  try {
    const payload = await youtubeFetch("/videos", {
      part: "snippet,contentDetails,statistics",
      myRating: "like",
      maxResults: 25,
    }, { auth: true });
    state.likedVideos = (payload.items || [])
      .map(normalizeVideoResource)
      .filter((video) => !isLikelyShort(video));
    render();
  } catch (error) {
    openSheet("Liked videos unavailable", error.message, [{ label: "Close", action: closeSheet }]);
  } finally {
    clearLoading();
  }
}

async function rateActiveVideo() {
  const video = currentVideo();
  if (!video) {
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
    render();
  } catch (error) {
    openSheet("Like needs permission", error.message, [{ label: "Close", action: closeSheet }]);
  } finally {
    clearLoading();
  }
}

async function subscribeToActiveChannel() {
  const video = currentVideo();
  if (!video?.channelId) {
    return;
  }

  setLoading("Updating subscription");
  try {
    await ensureWriteAuth();
    const subscriptionId = state.subscriptionIdsByChannel[video.channelId];

    if (subscriptionId) {
      await youtubeFetch("/subscriptions", { id: subscriptionId }, { auth: true, method: "DELETE" });
      delete state.subscriptionIdsByChannel[video.channelId];
      state.subscriptions = state.subscriptions.filter((channel) => channel.id !== video.channelId);
      showToast("Unsubscribed.");
    } else {
      const response = await fetch(`${API_BASE}/subscriptions?part=snippet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${state.auth.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snippet: {
            resourceId: {
              kind: "youtube#channel",
              channelId: video.channelId,
            },
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error?.message || "Could not subscribe.");
      }

      state.subscriptionIdsByChannel[video.channelId] = payload.id;
      showToast("Subscribed.");
    }

    render();
  } catch (error) {
    openSheet("Subscribe needs permission", error.message, [{ label: "Close", action: closeSheet }]);
  } finally {
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
    thumbnailUrl: bestThumbnail(snippet.thumbnails),
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
  return {
    id: item.id || "",
    title: snippet.title || "Channel",
    thumbnailUrl: bestThumbnail(snippet.thumbnails),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || "",
  };
}

function bestThumbnail(thumbnails = {}) {
  return thumbnails.maxres?.url
    || thumbnails.standard?.url
    || thumbnails.high?.url
    || thumbnails.medium?.url
    || thumbnails.default?.url
    || "";
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
  const match = String(isoDuration).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }

  return Number(match[1] || 0) * 3600
    + Number(match[2] || 0) * 60
    + Number(match[3] || 0);
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

  const seconds = Math.max(1, Math.floor((Date.now() - new Date(dateValue).getTime()) / 1000));
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
  ].filter(Boolean).join(" • ");
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
  return [
    ...state.homeFeed,
    ...state.searchResults,
    ...state.queue,
    ...state.localHistory,
    ...state.likedVideos,
    ...demoVideos,
  ].find((video) => video.id === videoId);
}

function openWatch(videoId, queue = []) {
  const video = findVideo(videoId);
  if (!video) {
    return;
  }

  state.activeVideoId = videoId;
  state.queue = queue.length ? queue : state.homeFeed;
  state.comments = [];
  state.playerError = null;
  state.view = "watch";
  writeJson("yt_last_view", "watch");
  addHistory(video);
  render();
  resetScroll();
  mountPlayer(false);
}

function addHistory(video) {
  state.localHistory = [
    video,
    ...state.localHistory.filter((item) => item.id !== video.id),
  ].slice(0, 30);
  writeJson("yt_history", state.localHistory);
}

function toggleSaved(videoId) {
  if (state.savedIds.has(videoId)) {
    state.savedIds.delete(videoId);
    showToast("Removed from saved.");
  } else {
    state.savedIds.add(videoId);
    showToast("Saved.");
  }

  writeJson("yt_saved_ids", [...state.savedIds]);
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

async function shareSite() {
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) {
    await navigator.share({ title: "SimaTube", url });
      return;
    }

    await navigator.clipboard.writeText(url);
    showToast("Site link copied.");
  } catch {
    openSheet("Share this site", url, [
      { label: "Close", action: closeSheet },
    ]);
  }
}

function setView(view) {
  const changed = state.view !== view;
  state.view = view;
  state.error = "";
  writeJson("yt_last_view", view);
  render();
  if (changed) {
    resetScroll();
  }

  if (view === "home" && !state.auth.accessToken && hasApiAccess()) {
    loadPopularHome();
  }
  if (view === "subscriptions" && state.auth.accessToken && !state.subscriptions.length) {
    loadSubscriptionsAndFeed();
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
    return state.homeFeed.filter((video) => state.savedIds.has(video.id));
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
  const actionHtml = actions.map((action, index) => {
    if (action.href) {
      return `<a class="sheet-action" href="${escapeHtml(action.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(action.label)}</a>`;
    }
    return `<button class="sheet-action" type="button" data-sheet-action="${index}">${escapeHtml(action.label)}</button>`;
  }).join("");

  sheetRoot.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="sheet-grip"></div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(body)}</p>
        <div class="sheet-actions">${actionHtml}</div>
      </section>
    </div>
  `;

  sheetRoot.querySelector(".sheet-actions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sheet-action]");
    if (!button) {
      return;
    }
    const action = actions[Number(button.dataset.sheetAction)];
    action?.action?.();
  }, { once: false });
}

function closeSheet() {
  sheetRoot.replaceChildren();
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
  if (shouldShowInstallIntro()) {
    app.innerHTML = renderInstallIntro();
    return;
  }

  if (shouldShowReconnect()) {
    app.innerHTML = renderReconnectScreen();
    return;
  }

  if (shouldShowOnboarding()) {
    app.innerHTML = renderOnboarding();
    return;
  }

  app.innerHTML = `
    ${renderTopbar()}
    ${state.loading ? `<div class="loading-bar"><span>${escapeHtml(state.loading)}</span></div>` : ""}
    <section class="screen">${renderView()}</section>
    ${renderBottomNav()}
  `;

  if (state.view === "watch") {
    mountPlayer(false);
  }
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
          ${signedIn && state.auth.profile.thumbnailUrl ? `<img src="${escapeHtml(state.auth.profile.thumbnailUrl)}" alt="" />` : "H"}
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
  const personalized = Boolean(state.auth.profile);
  return `
    <section class="home-rail">
      ${renderInstallBanner()}
      ${state.demoMode && !personalized ? renderDemoPill() : ""}
      ${state.reconnectFailed && state.rememberSignIn && !personalized ? renderReconnectPill() : ""}
      <div class="chip-row" aria-label="Home filters">
        ${filterChip("all", personalized ? "For you" : "Popular")}
        ${filterChip("today", "Today")}
        ${filterChip("saved", "Saved")}
        ${filterChip("history", "History")}
      </div>
      ${state.feedLoading ? renderFeedLoader() : renderVideoList(feed, "home")}
    </section>
  `;
}

function renderFeedLoader() {
  return `
    <section class="feed-loader" role="status" aria-label="Loading feed">
      <span class="yt-spinner" aria-hidden="true"></span>
    </section>
  `;
}

function renderInstallBanner() {
  if (state.installDismissed || isHomeScreenMode()) {
    return "";
  }

  return `
    <section class="install-banner">
      <div>
        <strong>Add it to your Home Screen</strong>
        <span>Safari Share button, then Add to Home Screen.</span>
      </div>
      <button class="text-button" type="button" data-action="install-help">How</button>
      <button class="icon-button small" type="button" data-action="dismiss-install" aria-label="Dismiss">${icon("close")}</button>
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
  return `<button class="chip${active}" type="button" data-action="home-filter" data-filter="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
}

function renderSearch() {
  return `
    <section class="search-view">
      <form class="search-form" data-action="search-form">
        <label class="search-box">
          ${icon("search")}
          <input name="query" value="${escapeHtml(state.query)}" type="search" placeholder="Search SimaTube" autocomplete="off" />
        </label>
        <button class="text-button" type="submit">Search</button>
      </form>
      ${state.query ? `<p class="result-label">${state.searchResults.length} results for ${escapeHtml(state.query)}</p>` : ""}
      ${state.query ? renderVideoList(state.searchResults, "search") : renderQuickSearches()}
    </section>
  `;
}

function renderQuickSearches() {
  return `
    <section class="quick-grid">
      ${["Music", "Gaming", "News", "Live", "Podcasts", "Tech"].map((item) => `
        <button class="quick-tile" type="button" data-action="quick-search" data-query="${escapeHtml(item)}">${escapeHtml(item)}</button>
      `).join("")}
    </section>
  `;
}

function renderWatch() {
  const video = currentVideo();
  const subscribed = Boolean(state.subscriptionIdsByChannel[video.channelId]);
  const liked = state.ratings[video.id] === "like";
  const saved = state.savedIds.has(video.id);
  const url = `${WATCH_BASE}?v=${encodeURIComponent(video.id)}`;

  return `
    <section class="watch-view">
      <div class="player-shell">
        <div id="playerMount"></div>
        <button class="poster-button" type="button" data-action="play" aria-label="Play video">
          <img src="${escapeHtml(video.thumbnailUrl)}" alt="" />
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
          <button class="kebab" type="button" data-action="sheet" data-sheet="video-more" aria-label="More">${icon("more")}</button>
        </div>
        <p class="stats-line">${escapeHtml([video.viewCount ? `${video.viewCount} views` : "", timeAgo(video.publishedAt)].filter(Boolean).join(" • "))}</p>
        <div class="channel-row">
          <img class="channel-avatar large" src="${escapeHtml(channelAvatarFor(video))}" alt="" />
          <div>
            <strong>${escapeHtml(video.channelTitle)}</strong>
            <span>${subscribed ? "Subscribed" : "Channel"}</span>
          </div>
          <button class="subscribe-button${subscribed ? " subscribed" : ""}" type="button" data-action="subscribe">${subscribed ? "Subscribed" : "Subscribe"}</button>
        </div>
        <div class="action-row" aria-label="Video actions">
          ${actionPill("like", liked ? "Liked" : (video.likeCount || "Like"), liked ? "thumb-filled" : "thumb")}
          ${actionPill("replay", "Replay", "replay")}
          ${actionPill("save", saved ? "Saved" : "Save", saved ? "check" : "plus")}
          ${actionPill("share", "Share", "share")}
          <a class="action-pill" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${icon("external")}<span>YouTube</span></a>
        </div>
        <details class="description" open>
          <summary>Description</summary>
          <p>${escapeHtml(video.description || "No description available.")}</p>
        </details>
        <section class="comments-block">
          <div class="section-head">
            <h2>Comments</h2>
            <button class="text-button" type="button" data-action="comments">Load</button>
          </div>
          ${renderComments()}
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

function actionPill(action, label, iconName) {
  return `<button class="action-pill" type="button" data-action="${escapeHtml(action)}">${icon(iconName)}<span>${escapeHtml(label)}</span></button>`;
}

function renderComments() {
  if (!state.comments.length) {
    return `<p class="empty-text">Comments load from YouTube when API access is available.</p>`;
  }

  return `
    <div class="comment-list">
      ${state.comments.map((comment) => `
        <article class="comment">
          ${comment.avatar ? `<img src="${escapeHtml(comment.avatar)}" alt="" />` : `<span class="comment-avatar"></span>`}
          <div>
            <strong>${escapeHtml(comment.author)}</strong>
            <p>${escapeHtml(comment.text)}</p>
            <span>${Number(comment.likes).toLocaleString()} likes</span>
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

  return `
    <section class="subscriptions-view">
      <div class="section-head sticky-head">
        <h1>Subscriptions</h1>
        <button class="text-button" type="button" data-action="refresh-subs">Refresh</button>
      </div>
      <div class="channel-strip">
        ${state.subscriptions.map((channel) => `
          <button class="channel-bubble" type="button" data-action="open-channel" data-channel-id="${escapeHtml(channel.id)}">
            <img src="${escapeHtml(channel.thumbnailUrl)}" alt="" />
            <span>${escapeHtml(channel.title)}</span>
          </button>
        `).join("")}
      </div>
      ${renderVideoList(state.homeFeed, "subscriptions")}
    </section>
  `;
}

function renderYou() {
  const profile = state.auth.profile;
  return `
    <section class="you-view">
      <section class="profile-head">
        ${profile?.thumbnailUrl ? `<img src="${escapeHtml(profile.thumbnailUrl)}" alt="" />` : `<span class="profile-avatar">H</span>`}
        <div>
          <h1>${escapeHtml(profile?.title || "You")}</h1>
          <p>${profile ? "Signed in to SimaTube" : "Demo mode"}</p>
        </div>
        <button class="text-button" type="button" data-action="${profile ? "signout" : "signin"}">${profile ? "Sign out" : "Sign in"}</button>
      </section>
      ${renderHomeScreenCard()}
      ${renderSetupStatus()}
      <section class="library-block">
        <div class="section-head">
          <h2>History</h2>
          <span>${state.localHistory.length}</span>
        </div>
        ${renderVideoList(state.localHistory, "history")}
      </section>
      <section class="library-block">
        <div class="section-head">
          <h2>Liked videos</h2>
          <button class="text-button" type="button" data-action="liked">Load</button>
        </div>
        ${renderVideoList(state.likedVideos, "liked")}
      </section>
    </section>
  `;
}

function renderSetupStatus() {
  if (state.config.youtubeApiKey && state.config.googleOAuthClientId) {
    return `
      <section class="setup-status ready">
        <div><span>Link</span><strong>Ready for you and your friend</strong></div>
        <button class="text-button" type="button" data-action="share-site">Share</button>
      </section>
    `;
  }

  return `
    <section class="setup-status">
      <div><span>API key</span><strong>${state.config.youtubeApiKey ? "Configured" : "Missing"}</strong></div>
      <div><span>OAuth</span><strong>${state.config.googleOAuthClientId ? "Configured" : "Missing"}</strong></div>
      <div><span>Local config</span><strong>${state.configLocalLoaded ? "Loaded" : "Not found"}</strong></div>
      <button class="text-button" type="button" data-action="sheet" data-sheet="setup">Setup</button>
    </section>
  `;
}

function renderHomeScreenCard() {
  return `
    <section class="home-screen-card">
      <div>
        <h2>Phone shortcut</h2>
        <p>${isHomeScreenMode() ? "Opened from your Home Screen." : "Add this site to your iPhone Home Screen for the cleanest flow."}</p>
      </div>
      <button class="text-button" type="button" data-action="install-help">How</button>
    </section>
  `;
}

function renderVideoList(videos, source) {
  if (!videos.length) {
    return `<p class="empty-text">Nothing to show yet.</p>`;
  }

  return `<div class="video-list">${videos.map((video) => renderVideoRow(video, source)).join("")}</div>`;
}

function renderVideoRow(video, source) {
  return `
    <article class="video-row">
      <button class="thumb-button" type="button" data-action="watch" data-video-id="${escapeHtml(video.id)}" data-source="${escapeHtml(source)}">
        <img src="${escapeHtml(video.thumbnailUrl)}" alt="" loading="lazy" />
        ${video.duration ? `<span class="duration">${escapeHtml(video.duration)}</span>` : ""}
      </button>
      <button class="video-copy" type="button" data-action="watch" data-video-id="${escapeHtml(video.id)}" data-source="${escapeHtml(source)}">
        <img class="channel-avatar" src="${escapeHtml(channelAvatarFor(video))}" alt="" loading="lazy" />
        <span>
          <strong>${escapeHtml(video.title)}</strong>
          <small>${escapeHtml(videoMeta(video))}</small>
        </span>
      </button>
      <button class="kebab" type="button" data-action="sheet" data-sheet="row-more" data-video-id="${escapeHtml(video.id)}" aria-label="More">${icon("more")}</button>
    </article>
  `;
}

function channelAvatarFor(video) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/default.jpg`;
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
  return `
    <button class="nav-item${active}" type="button" data-action="view" data-view="${escapeHtml(view)}" aria-label="${escapeHtml(label)}">
      ${icon(iconName)}
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function icon(name) {
  const icons = {
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.6 2.6 0 0 0 2.45-1.75h-4.9A2.6 2.6 0 0 0 12 22Zm7-6.5V11a7 7 0 0 0-5.2-6.77V3a1.8 1.8 0 1 0-3.6 0v1.23A7 7 0 0 0 5 11v4.5l-1.7 2.27A.75.75 0 0 0 3.9 19h16.2a.75.75 0 0 0 .6-1.23L19 15.5ZM7 11a5 5 0 0 1 10 0v5.17l.62.83H6.38L7 16.17V11Z"/></svg>',
    cast: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25v13.5A2.25 2.25 0 0 1 18.75 21H16.5v-2h2.25a.25.25 0 0 0 .25-.25V5.25a.25.25 0 0 0-.25-.25H5.25a.25.25 0 0 0-.25.25V7.5H3Zm0 10.25v-2.1A5.35 5.35 0 0 1 8.35 21h2.1v-2h-2.1A3.35 3.35 0 0 0 5 15.65v-2.2A5.55 5.55 0 0 1 10.55 19H13v-2h-2.45A7.55 7.55 0 0 0 3 9.45v2.1A5.45 5.45 0 0 1 8.45 17H13v-2H8.45A3.45 3.45 0 0 0 5 11.55v6.2H3Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.2 16.6-4.1-4.1-1.4 1.4 5.5 5.5L21 7.6 19.6 6 9.2 16.6Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"/></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>',
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

async function mountPlayer(autoplay) {
  const mount = document.querySelector("#playerMount");
  if (!mount || !state.ytApiReady || !window.YT?.Player) {
    return;
  }

  const existingFrame = state.player?.getIframe?.();
  if (existingFrame && document.body.contains(existingFrame)) {
    return;
  }

  const video = currentVideo();
  state.player = null;
  state.playerReady = false;
  state.player = new window.YT.Player("playerMount", {
    host: "https://www.youtube-nocookie.com",
    videoId: video.id,
    playerVars: {
      autoplay: autoplay ? 1 : 0,
      controls: 1,
      enablejsapi: 1,
      iv_load_policy: 3,
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
    },
    events: {
      onReady: () => {
        state.playerReady = true;
      },
      onError: (event) => handlePlayerError(event.data),
      onStateChange: (event) => {
        if (event.data === window.YT.PlayerState.ENDED) {
          nextVideo();
        }
      },
    },
  });
}

function playActive() {
  document.querySelector(".poster-button")?.setAttribute("hidden", "");
  if (state.player?.loadVideoById) {
    state.player.loadVideoById(currentVideo().id);
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

function handlePlayerError(code) {
  const messages = {
    100: "This video was removed, private, or not found.",
    101: "The owner does not allow embedded playback.",
    150: "The owner does not allow embedded playback.",
    153: "YouTube needs a valid browser identity for this embed.",
  };
  state.playerError = messages[code] || "This video cannot play in the embedded player.";
  render();
  window.setTimeout(nextVideo, 1600);
}

function nextVideo() {
  const queue = state.queue.length ? state.queue : state.homeFeed;
  const currentIndex = queue.findIndex((video) => video.id === state.activeVideoId);
  const next = queue[(currentIndex + 1 + queue.length) % queue.length];
  if (next && next.id !== state.activeVideoId) {
    openWatch(next.id, queue);
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
  if (source === "queue") {
    return state.queue;
  }
  return state.homeFeed;
}

app.addEventListener("click", async (event) => {
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
  }
  if (action === "install-help") {
    openSheet("Add to Home Screen", installCopy(), [
      { label: "Share this link", action: shareSite },
      { label: "Close", action: closeSheet },
    ]);
  }
  if (action === "share-site") {
    await shareSite();
  }
  if (action === "dismiss-install") {
    state.installDismissed = true;
    writeJson("yt_install_dismissed", true);
    render();
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
  if (action === "replay") {
    replayActive();
  }
  if (action === "next-video") {
    nextVideo();
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
    await loadLikedVideos();
  }
  if (action === "refresh-subs") {
    await loadSubscriptionsAndFeed();
  }
  if (action === "quick-search") {
    state.view = "search";
    await runSearch(target.dataset.query);
  }
  if (action === "sheet") {
    handleSheet(target.dataset.sheet, target.dataset.videoId);
  }
  if (action === "open-channel") {
    window.open(`https://www.youtube.com/channel/${encodeURIComponent(target.dataset.channelId)}`, "_blank", "noopener,noreferrer");
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

function handleSheet(sheet, videoId) {
  const video = videoId ? findVideo(videoId) : currentVideo();
  if (sheet === "setup") {
    openSheet("Setup", setupCopy(), [
      { label: "Open credentials", href: "https://console.cloud.google.com/apis/credentials" },
      { label: "Close", action: closeSheet },
    ]);
    return;
  }
  if (sheet === "row-more" || sheet === "video-more") {
    openSheet(video.title, "Choose where to continue this video.", [
      { label: "Open in YouTube", href: `${WATCH_BASE}?v=${encodeURIComponent(video.id)}` },
      { label: state.savedIds.has(video.id) ? "Remove saved" : "Save", action: () => toggleSaved(video.id) },
      { label: "Close", action: closeSheet },
    ]);
  }
}
