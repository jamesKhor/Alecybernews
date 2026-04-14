/**
 * GitHub commit helpers.
 *
 * Two modes:
 *   commitFilesToGitHub() — atomic multi-file commit via Git Data API
 *     (createBlob × N, createTree, createCommit, updateRef). One push event,
 *     one deploy trigger, regardless of file count. Use this when publishing
 *     EN + ZH together.
 *   commitSingleFileToGitHub() — legacy single-file helper via Contents API
 *     with 409-retry. Simpler, still supported for single-locale publishes.
 *
 * Both respect GITHUB_TOKEN, GITHUB_REPO (owner/repo), GITHUB_BRANCH (default main).
 */

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

interface FileToCommit {
  path: string;
  content: string;
}

export interface CommitResult {
  sha: string;
  url: string;
  files: { path: string; url: string }[];
}

function getConfig(): { token: string; repo: string; branch: string } {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    throw new Error("GITHUB_TOKEN or GITHUB_REPO not configured");
  }
  const branch = process.env.GITHUB_BRANCH ?? "main";
  return { token, repo, branch };
}

async function ghFetch<T>(
  path: string,
  init: RequestInit & { token: string },
): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      ...GH_HEADERS,
      Authorization: `Bearer ${init.token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub API ${res.status} on ${path}: ${errText}`);
  }
  return (await res.json()) as T;
}

/**
 * Atomically commit multiple files in a single commit via the Git Data API.
 *
 * Why: admin publish adds EN + ZH MDX together. Using the Contents API twice
 * produces two commits → two deploy events → two PM2 restarts → up to 6
 * minutes of flaky downtime. A single tree commit produces one push event.
 */
export async function commitFilesToGitHub(
  files: FileToCommit[],
  message: string,
): Promise<CommitResult> {
  if (files.length === 0) throw new Error("No files to commit");

  const { token, repo, branch } = getConfig();

  // 1. Get the current ref (branch HEAD)
  const ref = await ghFetch<{ object: { sha: string } }>(
    `/repos/${repo}/git/ref/heads/${branch}`,
    { token },
  );
  const parentSha = ref.object.sha;

  // 2. Get the current commit to find its tree SHA
  const parentCommit = await ghFetch<{ tree: { sha: string } }>(
    `/repos/${repo}/git/commits/${parentSha}`,
    { token },
  );
  const baseTreeSha = parentCommit.tree.sha;

  // 3. Create a blob for each file
  const blobs = await Promise.all(
    files.map((f) =>
      ghFetch<{ sha: string }>(`/repos/${repo}/git/blobs`, {
        token,
        method: "POST",
        body: JSON.stringify({
          content: Buffer.from(f.content, "utf-8").toString("base64"),
          encoding: "base64",
        }),
      }),
    ),
  );

  // 4. Create a new tree with the new blobs, using the old tree as base
  const tree = await ghFetch<{ sha: string }>(`/repos/${repo}/git/trees`, {
    token,
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: files.map((f, i) => ({
        path: f.path,
        mode: "100644",
        type: "blob",
        sha: blobs[i].sha,
      })),
    }),
  });

  // 5. Create the commit pointing at the new tree
  const commit = await ghFetch<{ sha: string; html_url: string }>(
    `/repos/${repo}/git/commits`,
    {
      token,
      method: "POST",
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [parentSha],
      }),
    },
  );

  // 6. Fast-forward the ref to the new commit
  await ghFetch(`/repos/${repo}/git/refs/heads/${branch}`, {
    token,
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    sha: commit.sha,
    url: commit.html_url,
    files: files.map((f) => ({
      path: f.path,
      url: `https://github.com/${repo}/blob/${branch}/${f.path}`,
    })),
  };
}

/**
 * Single-file commit via Contents API. Retries on 409 (stale blob SHA).
 */
export async function commitSingleFileToGitHub(
  path: string,
  content: string,
  message: string,
  retries = 2,
): Promise<{ url: string }> {
  const { token, repo, branch } = getConfig();
  const encoded = Buffer.from(content, "utf-8").toString("base64");
  const apiUrl = `/repos/${repo}/contents/${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Fetch current SHA each attempt — stale SHA causes 409
    let sha: string | undefined;
    try {
      const existing = await ghFetch<{ sha: string }>(apiUrl, { token });
      sha = existing.sha;
    } catch {
      sha = undefined;
    }

    const body: Record<string, unknown> = { message, content: encoded, branch };
    if (sha) body.sha = sha;

    const res = await fetch(`https://api.github.com${apiUrl}`, {
      method: "PUT",
      headers: { ...GH_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json()) as { content: { html_url: string } };
      return { url: data.content.html_url };
    }

    if (res.status === 409 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }

    const errText = await res.text();
    throw new Error(`GitHub API ${res.status}: ${errText}`);
  }

  throw new Error("GitHub commit failed after retries");
}
