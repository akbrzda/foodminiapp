import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const changelogPath = path.join(__dirname, "../../config/changelog.json");

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const normalizeRelease = (release) => {
  const id = Number(release?.id);
  return {
    id: Number.isFinite(id) ? id : 0,
    version: String(release?.version || ""),
    title: String(release?.title || ""),
    description: release?.description ? String(release.description) : null,
    published_at: release?.published_at || null,
    items: Array.isArray(release?.items) ? release.items : [],
    components: Array.isArray(release?.components) ? release.components : [],
  };
};

const sortByPublishedAtDesc = (a, b) => {
  const first = new Date(a.published_at || 0).getTime();
  const second = new Date(b.published_at || 0).getTime();
  return second - first;
};

function readChangelogConfig() {
  if (!fs.existsSync(changelogPath)) {
    return { releases: [] };
  }

  try {
    const raw = fs.readFileSync(changelogPath, "utf-8");
    const parsed = JSON.parse(raw);
    const releases = Array.isArray(parsed?.releases) ? parsed.releases.map(normalizeRelease).filter((item) => item.id > 0) : [];
    return {
      releases: releases.sort(sortByPublishedAtDesc),
    };
  } catch (error) {
    return { releases: [] };
  }
}

export async function listPublicReleases(query = {}) {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 10), 50);
  const offset = (page - 1) * limit;

  const { releases } = readChangelogConfig();
  const items = releases.slice(offset, offset + limit).map((release) => ({
    id: release.id,
    version: release.version,
    title: release.title,
    description: release.description,
    published_at: release.published_at,
  }));

  return {
    items,
    pagination: {
      page,
      limit,
      total: releases.length,
    },
  };
}

export async function getPublicReleaseDetails(releaseId) {
  const { releases } = readChangelogConfig();
  const id = Number(releaseId);
  const release = releases.find((item) => item.id === id);
  if (!release) return null;

  return {
    ...release,
  };
}

export async function getLatestPublishedRelease() {
  const { releases } = readChangelogConfig();
  return releases[0] || null;
}
