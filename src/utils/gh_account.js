// Made by Qwen3.8-Max

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function normalizeUsername(input) {
  const name = String(input ?? "").trim();
  if (!/^[A-Za-z0-9-]{1,39}$/.test(name)) {
    return null;
  }
  return name;
}

async function fetchGitHubUser(username, token) {
  const url = `https://api.github.com/users/${encodeURIComponent(username)}`;
  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "cloudflare-worker-github-account-age-check",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    headers,
    redirect: "follow",
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return {
    status: res.status,
    ok: res.ok,
    data,
  };
}

export async function isGitHubAccountFullOneDay(username, options = {}) {
  const result = await checkGitHubAccountAge(username, options);
  if (result.ok === true && result.fullOneDay === true) {
    return {
      ok: true,
      id: result.id
    }
  } else {
    return {
      ok: false
    }
  }
}

export async function checkGitHubAccountAge(username, options = {}) {
  const token = github_token;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const name = normalizeUsername(username);
  if (!name) {
    return {
      ok: false,
      fullOneDay: false,
      error: "invalid_username",
      username,
    };
  }
  try {
    const githubRes = await fetchGitHubUser(name, token);
    if (githubRes.status === 404) {
      return {
        ok: true,
        username: name,
        exists: false,
        fullOneDay: false,
      };
    }
    if (!githubRes.ok) {
      return {
        ok: false,
        username: name,
        exists: false,
        fullOneDay: false,
        error: "github_api_error",
        status: githubRes.status,
        message: githubRes.data?.message || "GitHub API request failed",
      };
    }
    const createdAt = githubRes.data?.created_at;
    const createdAtMs = Date.parse(createdAt);
    if (!createdAt || Number.isNaN(createdAtMs)) {
      return {
        ok: false,
        username: name,
        exists: true,
        fullOneDay: false,
        error: "missing_created_at",
        message: "GitHub API did not return created_at",
      };
    }
    const ageMs = Math.max(0, now - createdAtMs);
    const fullOneDay = ageMs >= ONE_DAY_MS;
    return {
      ok: true,
      username: name,
      exists: true,
      createdAt,
      createdAtMs,
      nowMs: now,
      ageMs,
      ageDays: ageMs / ONE_DAY_MS,
      fullOneDay,
      fullAt: new Date(createdAtMs + ONE_DAY_MS).toISOString(),
      id: githubRes.data?.id
    };
  } catch (err) {
    return {
      ok: false,
      username: name,
      exists: false,
      fullOneDay: false,
      error: "network_error",
      message: String(err?.message || err),
    };
  }
};