import express from "express";
import db from "../../config/database.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import redis from "../../config/redis.js";
import axios from "axios";
import { findTariffForAmount, getNextThreshold, validateTariffs } from "./utils/deliveryTariffs.js";
import { getSystemSettings } from "../../utils/settings.js";
const router = express.Router();

router.use("/admin", authenticateToken);
const parseGeoJson = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }
  return value;
};
const getPolygonMeta = async (polygonId) => {
  const [rows] = await db.query(
    `SELECT dp.id, dp.branch_id, b.city_id
     FROM delivery_polygons dp
     JOIN branches b ON dp.branch_id = b.id
     WHERE dp.id = ? AND dp.source = 'local'`,
    [polygonId],
  );
  return rows[0] || null;
};
const getTariffsByPolygonId = async (polygonId) => {
  const [rows] = await db.query(
    `SELECT id, polygon_id, amount_from, amount_to, delivery_cost
     FROM delivery_tariffs
     WHERE polygon_id = ?
     ORDER BY amount_from`,
    [polygonId],
  );
  return (rows || []).map((row) => ({
    id: row.id,
    polygon_id: row.polygon_id,
    amount_from: row.amount_from,
    amount_to: row.amount_to === null ? null : Number(row.amount_to),
    delivery_cost: row.delivery_cost,
  }));
};
const denyManagerWrite = (req, res) => {
  if (req.user.role !== "manager") return false;
  res.status(403).json({ error: "Недостаточно прав для выполнения действия" });
  return true;
};
const STREETS_SEARCH_CACHE_TTL = 5 * 60;
const CITY_BOUNDS_CACHE_TTL = 60 * 60;
const YANDEX_GEOCODER_URL = "https://geocode-maps.yandex.ru/v1/";
const YANDEX_SUGGEST_URL = "https://suggest-maps.yandex.ru/v1/suggest";
const normalizeStreetName = (value) => String(value || "").trim();
const normalizeStreetQuery = (value) => String(value || "").trim().toLowerCase();
const parseYandexPoint = (geoObject = {}) => {
  const rawPos = String(geoObject?.Point?.pos || "").trim();
  if (!rawPos) return null;
  const [lonRaw, latRaw] = rawPos.split(/\s+/);
  const lon = Number.parseFloat(lonRaw);
  const lat = Number.parseFloat(latRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
};
const getYandexAddressComponents = (geoObject = {}) => {
  const components = geoObject?.metaDataProperty?.GeocoderMetaData?.Address?.Components;
  return Array.isArray(components) ? components : [];
};
const findYandexComponentName = (components = [], kinds = []) => {
  for (const kind of kinds) {
    const found = components.find((component) => component?.kind === kind && String(component?.name || "").trim());
    if (found) return String(found.name).trim();
  }
  return "";
};
const mapYandexGeoObject = (geoObject = {}) => {
  const point = parseYandexPoint(geoObject);
  if (!point) return null;
  const meta = geoObject?.metaDataProperty?.GeocoderMetaData || {};
  const components = getYandexAddressComponents(geoObject);
  const street = findYandexComponentName(components, ["street", "route"]);
  const house = findYandexComponentName(components, ["house"]);
  const city = findYandexComponentName(components, ["locality", "province", "area"]);
  const country = findYandexComponentName(components, ["country"]);
  const fullText = String(meta?.text || "").trim();
  const label = street ? (house ? `${street}, ${house}` : street) : fullText;
  if (!label) return null;
  return {
    lat: point.lat,
    lon: point.lon,
    lng: point.lon,
    label,
    formatted_address: fullText || label,
    address: {
      street,
      house,
      city,
      country,
    },
  };
};
const loadYandexMapsSettings = async () => {
  const settings = await getSystemSettings();
  return {
    geocoderApiKey: String(settings?.yandex_js_api_key || "").trim(),
    suggestApiKey: String(settings?.yandex_suggest_api_key || "").trim(),
    language: String(settings?.maps_default_language || "ru_RU").trim() || "ru_RU",
  };
};
const requestYandexGeocoder = async ({ geocoderApiKey, language, query, results = 5, kind = "" }) => {
  const params = {
    apikey: geocoderApiKey,
    geocode: query,
    format: "json",
    results: Math.min(Math.max(Number(results) || 1, 1), 20),
    lang: language || "ru_RU",
  };
  if (kind) {
    params.kind = kind;
  }
  const { data } = await axios.get(YANDEX_GEOCODER_URL, {
    params,
    timeout: 7000,
  });
  const members = data?.response?.GeoObjectCollection?.featureMember;
  if (!Array.isArray(members)) return [];
  return members.map((member) => mapYandexGeoObject(member?.GeoObject)).filter(Boolean);
};
const mapYandexStreetItem = (title = "", subtitle = "") => {
  const normalizedTitle = normalizeStreetName(title);
  const normalizedSubtitle = normalizeStreetName(subtitle);
  if (!normalizedTitle) return null;
  const label = normalizedSubtitle ? `${normalizedTitle}, ${normalizedSubtitle}` : normalizedTitle;
  return {
    id: `yandex:${label.toLowerCase()}`,
    classifier_id: null,
    name: normalizedTitle,
    label,
    source: "yandex",
  };
};
const extractSuggestTags = (row = {}) => {
  const rawTags = row?.tags;
  if (!Array.isArray(rawTags)) return [];
  return rawTags.map((tag) => String(tag || "").trim().toLowerCase()).filter(Boolean);
};
const isStreetSuggestResult = (row = {}) => {
  const tags = extractSuggestTags(row);
  if (tags.includes("street") || tags.includes("house")) return true;
  const title = String(row?.title?.text || "").toLowerCase();
  const subtitle = String(row?.subtitle?.text || "").toLowerCase();
  return (
    title.includes("улиц") ||
    title.includes("проспект") ||
    title.includes("переул") ||
    title.includes("бульвар") ||
    subtitle.includes("улиц") ||
    subtitle.includes("проспект") ||
    subtitle.includes("переул") ||
    subtitle.includes("бульвар")
  );
};
const collectStreetNamesFromSuggest = (rows = [], requestLimit = 10) => {
  const uniqueStreetItems = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isStreetSuggestResult(row)) continue;
    const title = String(row?.title?.text || "").trim();
    const subtitle = String(row?.subtitle?.text || "").trim();
    const mapped = mapYandexStreetItem(title || subtitle, subtitle);
    const key = String(mapped?.label || "").toLowerCase();
    if (!mapped || !key || seen.has(key)) continue;
    seen.add(key);
    uniqueStreetItems.push(mapped);
    if (uniqueStreetItems.length >= requestLimit) break;
  }
  return uniqueStreetItems;
};
const STREET_QUERY_STOPWORDS = new Set(["улица", "ул", "ул.", "проспект", "пр-кт", "дом", "д", "д."]);
const tokenizeStreetSearch = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !STREET_QUERY_STOPWORDS.has(token));
const filterStreetItemsByQuery = (items = [], rawQuery = "", limit = 10) => {
  const queryTokens = tokenizeStreetSearch(rawQuery);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 10, 1), 20);
  const filtered = items
    .filter((item) => {
      if (!queryTokens.length) return true;
      const searchable = `${item?.label || ""} ${item?.name || ""}`.toLowerCase();
      return queryTokens.every((token) => searchable.includes(token));
    })
    .slice(0, normalizedLimit);
  return filtered;
};
const collectCoordsFromGeoJson = (geometry, collector = []) => {
  if (!geometry || typeof geometry !== "object") return collector;
  const type = String(geometry.type || "");
  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates)) return collector;

  if (type === "Polygon") {
    coordinates.forEach((ring) => {
      if (!Array.isArray(ring)) return;
      ring.forEach((coord) => {
        if (!Array.isArray(coord) || coord.length < 2) return;
        const lon = Number(coord[0]);
        const lat = Number(coord[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        collector.push([lon, lat]);
      });
    });
    return collector;
  }

  if (type === "MultiPolygon") {
    coordinates.forEach((polygon) => {
      if (!Array.isArray(polygon)) return;
      polygon.forEach((ring) => {
        if (!Array.isArray(ring)) return;
        ring.forEach((coord) => {
          if (!Array.isArray(coord) || coord.length < 2) return;
          const lon = Number(coord[0]);
          const lat = Number(coord[1]);
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
          collector.push([lon, lat]);
        });
      });
    });
    return collector;
  }

  return collector;
};
const calcBboxFromGeoJsonRows = (rows = []) => {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  rows.forEach((row) => {
    const rawPolygon = row?.polygon;
    if (!rawPolygon) return;
    let parsed = null;
    if (typeof rawPolygon === "string") {
      try {
        parsed = JSON.parse(rawPolygon);
      } catch (error) {
        parsed = null;
      }
    } else if (typeof rawPolygon === "object") {
      parsed = rawPolygon;
    }
    if (!parsed) return;
    const coords = collectCoordsFromGeoJson(parsed, []);
    coords.forEach(([lon, lat]) => {
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    });
  });

  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return null;
  return { minLon, minLat, maxLon, maxLat };
};
const formatYandexBBox = (bounds) => {
  if (!bounds) return "";
  const { minLon, minLat, maxLon, maxLat } = bounds;
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return "";
  return `${minLon},${minLat}~${maxLon},${maxLat}`;
};
const isValidLonLatBounds = (bounds) => {
  if (!bounds) return false;
  const { minLon, minLat, maxLon, maxLat } = bounds;
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return false;
  if (minLon > maxLon || minLat > maxLat) return false;
  if (minLon < -180 || maxLon > 180) return false;
  if (minLat < -90 || maxLat > 90) return false;
  return true;
};
const swapBoundsAxes = (bounds) => {
  if (!bounds) return null;
  return {
    minLon: Number(bounds.minLat),
    minLat: Number(bounds.minLon),
    maxLon: Number(bounds.maxLat),
    maxLat: Number(bounds.maxLon),
  };
};
const boundsContainsPoint = (bounds, lat, lon) => {
  if (!isValidLonLatBounds(bounds)) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lon >= bounds.minLon && lon <= bounds.maxLon && lat >= bounds.minLat && lat <= bounds.maxLat;
};
const boundsCenterDistanceSq = (bounds, lat, lon) => {
  if (!isValidLonLatBounds(bounds) || !Number.isFinite(lat) || !Number.isFinite(lon)) return Number.POSITIVE_INFINITY;
  const centerLon = (bounds.minLon + bounds.maxLon) / 2;
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const dLon = centerLon - lon;
  const dLat = centerLat - lat;
  return dLon * dLon + dLat * dLat;
};
const normalizeBoundsByCityCenter = (bounds, cityCenter = null) => {
  if (!isValidLonLatBounds(bounds)) return null;
  const lat = Number(cityCenter?.latitude);
  const lon = Number(cityCenter?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return bounds;

  const swapped = swapBoundsAxes(bounds);
  if (!isValidLonLatBounds(swapped)) return bounds;

  const directContains = boundsContainsPoint(bounds, lat, lon);
  const swappedContains = boundsContainsPoint(swapped, lat, lon);
  if (swappedContains && !directContains) return swapped;
  if (directContains && !swappedContains) return bounds;

  return boundsCenterDistanceSq(swapped, lat, lon) < boundsCenterDistanceSq(bounds, lat, lon) ? swapped : bounds;
};
const getCitySuggestBounds = async (cityId, cityCenter = null) => {
  const cacheKey = `maps:city:suggest:bbox:${cityId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const normalizedCached = normalizeBoundsByCityCenter(parsed, cityCenter);
      if (normalizedCached) {
        return normalizedCached;
      }
    }
  } catch (redisError) {
    // Redis errors are non-critical
  }

  const [rows] = await db.query(
    `SELECT ST_AsGeoJSON(dp.polygon) AS polygon
     FROM delivery_polygons dp
     JOIN branches b ON b.id = dp.branch_id
     WHERE b.city_id = ? AND dp.source = 'local'`,
    [cityId],
  );
  const fromPolygons = normalizeBoundsByCityCenter(calcBboxFromGeoJsonRows(rows), cityCenter);
  if (fromPolygons) {
    try {
      await redis.set(cacheKey, JSON.stringify(fromPolygons), "EX", CITY_BOUNDS_CACHE_TTL);
    } catch (redisError) {
      // Redis errors are non-critical
    }
    return fromPolygons;
  }

  const lat = Number(cityCenter?.latitude);
  const lon = Number(cityCenter?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const fallback = {
    minLon: lon - 0.35,
    minLat: lat - 0.25,
    maxLon: lon + 0.35,
    maxLat: lat + 0.25,
  };
  return fallback;
};
const searchYandexStreets = async ({
  suggestApiKey,
  cityId,
  query,
  cityName,
  latitude,
  longitude,
  language,
  limit = 10,
  sessionToken = "",
}) => {
  const requestLimit = Math.min(Math.max(Number(limit) || 10, 1), 10);
  const bbox = await getCitySuggestBounds(cityId, { latitude, longitude });
  const bboxValue = formatYandexBBox(bbox);
  const baseParams = {
    apikey: suggestApiKey,
    lang: language || "ru_RU",
    results: requestLimit,
    print_address: 1,
    strict_bounds: 1,
    types: "street,house",
  };
  if (sessionToken) {
    baseParams.sessiontoken = sessionToken;
  }
  if (bboxValue) {
    baseParams.bbox = bboxValue;
  }
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    baseParams.ll = `${longitude},${latitude}`;
    baseParams.spn = "0.2,0.2";
  }
  const queryVariants = Array.from(
    new Set(
      [cityName ? `${cityName}, ${query}` : "", cityName ? `${query}, ${cityName}` : "", query]
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );

  const merged = [];
  const seen = new Set();
  const collectFromVariants = async (paramsBuilder) => {
    for (const variant of queryVariants) {
      const { data } = await axios.get(YANDEX_SUGGEST_URL, {
        params: paramsBuilder(variant),
        timeout: 5000,
      });
      const items = collectStreetNamesFromSuggest(Array.isArray(data?.results) ? data.results : [], requestLimit);
      for (const item of items) {
        const key = String(item?.label || "").toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
        if (merged.length >= requestLimit) {
          return;
        }
      }
    }
  };

  await collectFromVariants((variant) => ({ ...baseParams, text: variant }));

  if (merged.length === 0) {
    const relaxedParams = { ...baseParams };
    delete relaxedParams.bbox;
    delete relaxedParams.strict_bounds;
    await collectFromVariants((variant) => ({ ...relaxedParams, text: variant }));
  }

  if (merged.length === 0) {
    const minimalParams = { ...baseParams };
    delete minimalParams.bbox;
    delete minimalParams.strict_bounds;
    delete minimalParams.ll;
    delete minimalParams.spn;
    await collectFromVariants((variant) => ({ ...minimalParams, text: variant }));
  }

  return merged;
};

router.get("/city/:cityId", async (req, res, next) => {
  try {
    const cityId = req.params.cityId;
    const [polygons] = await db.query(
      `SELECT dp.id, dp.branch_id, dp.name, 
              dp.source,
              ST_AsGeoJSON(dp.polygon) as polygon,
              dp.delivery_time,
              dp.min_order_amount, dp.delivery_cost,
              b.name as branch_name,
              (SELECT COUNT(*) FROM delivery_tariffs dt WHERE dt.polygon_id = dp.id) as tariffs_count
       FROM delivery_polygons dp
       JOIN branches b ON dp.branch_id = b.id
       WHERE b.city_id = ? AND dp.source = 'local' AND dp.is_active = TRUE AND b.is_active = TRUE
         AND (dp.is_blocked = FALSE OR 
              (dp.blocked_from IS NOT NULL AND dp.blocked_until IS NOT NULL 
               AND NOW() NOT BETWEEN dp.blocked_from AND dp.blocked_until))`,
      [cityId],
    );
    if (!polygons.length) {
      return res.json({ polygons: [] });
    }
    const polygonIds = polygons.map((p) => p.id);
    const placeholders = polygonIds.map(() => "?").join(",");
    const [tariffsRows] = await db.query(
      `SELECT id, polygon_id, amount_from, amount_to, delivery_cost
       FROM delivery_tariffs
       WHERE polygon_id IN (${placeholders})
       ORDER BY polygon_id, amount_from`,
      polygonIds,
    );
    const tariffsByPolygon = new Map();
    tariffsRows.forEach((row) => {
      if (!tariffsByPolygon.has(row.polygon_id)) {
        tariffsByPolygon.set(row.polygon_id, []);
      }
      tariffsByPolygon.get(row.polygon_id).push({
        id: row.id,
        polygon_id: row.polygon_id,
        amount_from: row.amount_from,
        amount_to: row.amount_to === null ? null : Number(row.amount_to),
        delivery_cost: row.delivery_cost,
      });
    });
    const parsedPolygons = polygons.map((p) => ({
      ...p,
      polygon: parseGeoJson(p.polygon),
      tariffs: tariffsByPolygon.get(p.id) || [],
    }));
    res.json({ polygons: parsedPolygons });
  } catch (error) {
    next(error);
  }
});
router.get("/branch/:branchId", async (req, res, next) => {
  try {
    const branchId = req.params.branchId;
    const [branchRows] = await db.query("SELECT id FROM branches WHERE id = ?", [branchId]);
    if (!branchRows.length) {
      return res.status(404).json({ error: "Branch not found" });
    }
    const [polygons] = await db.query(
      `SELECT id, branch_id, name, 
              source,
              ST_AsGeoJSON(polygon) as polygon,
              delivery_time,
              min_order_amount, delivery_cost,
              (SELECT COUNT(*) FROM delivery_tariffs dt WHERE dt.polygon_id = delivery_polygons.id) as tariffs_count
       FROM delivery_polygons
       WHERE branch_id = ? AND source = 'local' AND is_active = TRUE
         AND (is_blocked = FALSE OR 
              (blocked_from IS NOT NULL AND blocked_until IS NOT NULL 
               AND NOW() NOT BETWEEN blocked_from AND blocked_until))`,
      [branchId],
    );
    if (!polygons.length) {
      return res.json({ polygons: [] });
    }
    const polygonIds = polygons.map((p) => p.id);
    const placeholders = polygonIds.map(() => "?").join(",");
    const [tariffsRows] = await db.query(
      `SELECT id, polygon_id, amount_from, amount_to, delivery_cost
       FROM delivery_tariffs
       WHERE polygon_id IN (${placeholders})
       ORDER BY polygon_id, amount_from`,
      polygonIds,
    );
    const tariffsByPolygon = new Map();
    tariffsRows.forEach((row) => {
      if (!tariffsByPolygon.has(row.polygon_id)) {
        tariffsByPolygon.set(row.polygon_id, []);
      }
      tariffsByPolygon.get(row.polygon_id).push({
        id: row.id,
        polygon_id: row.polygon_id,
        amount_from: row.amount_from,
        amount_to: row.amount_to === null ? null : Number(row.amount_to),
        delivery_cost: row.delivery_cost,
      });
    });
    const parsedPolygons = polygons.map((p) => ({
      ...p,
      polygon: parseGeoJson(p.polygon),
      tariffs: tariffsByPolygon.get(p.id) || [],
    }));
    res.json({ polygons: parsedPolygons });
  } catch (error) {
    next(error);
  }
});
router.get("/address-directory/streets", async (req, res, next) => {
  try {
    const cityId = Number(req.query?.city_id);
    const query = String(req.query?.q || "").trim();
    const sessionToken = String(req.query?.sessiontoken || "").trim();
    const requestedLimit = Number(req.query?.limit);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 20) : 10;

    if (!Number.isFinite(cityId)) {
      return res.status(400).json({ error: "city_id is required and must be a number" });
    }
    if (!query) {
      return res.status(400).json({ error: "q is required and must be a non-empty string" });
    }

    const searchCacheKey = `maps:streets:search:${cityId}:${query.toLowerCase()}:${limit}`;
    try {
      const cachedSearch = await redis.get(searchCacheKey);
      if (cachedSearch) {
        return res.json(JSON.parse(cachedSearch));
      }
    } catch (redisError) {
      // Redis errors are non-critical
    }

    const [cityRows] = await db.query(
      `SELECT id, name, latitude, longitude
       FROM cities
       WHERE id = ?`,
      [cityId],
    );
    const city = cityRows?.[0];
    if (!city) {
      return res.status(404).json({ error: "City not found" });
    }

    const mapsSettings = await loadYandexMapsSettings();
    if (!mapsSettings.suggestApiKey) {
      return res.status(503).json({ error: "Yandex suggest API key is not configured" });
    }
    const yandexStreets = await searchYandexStreets({
      suggestApiKey: mapsSettings.suggestApiKey,
      cityId,
      query,
      cityName: city.name,
      latitude: Number(city.latitude),
      longitude: Number(city.longitude),
      language: mapsSettings.language,
      limit,
      sessionToken,
    });
    const responsePayload = {
      items: filterStreetItemsByQuery(yandexStreets, query, limit),
      source: "yandex",
    };

    try {
      await redis.set(searchCacheKey, JSON.stringify(responsePayload), "EX", STREETS_SEARCH_CACHE_TTL);
    } catch (redisError) {
      // Redis errors are non-critical
    }

    return res.json(responsePayload);
  } catch (error) {
    if (error.response) {
      return res.status(502).json({
        error: "Address directory service unavailable",
        details: error.message,
      });
    }
    return next(error);
  }
});

router.post("/geocode", async (req, res, next) => {
  try {
    const rawQuery = typeof req.body?.query === "string" ? req.body.query : req.body?.address;
    if (!rawQuery || typeof rawQuery !== "string" || rawQuery.trim().length === 0) {
      return res.status(400).json({
        error: "query or address is required and must be a non-empty string",
      });
    }
    const query = rawQuery.trim();
    const requestedLimit = Number(req.body?.limit);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 10) : 5;
    const city = typeof req.body?.city === "string" ? req.body.city.trim() : "";
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const radius = Number(req.body?.radius);
    const hasCenter = Number.isFinite(latitude) && Number.isFinite(longitude);
    const hasRadius = Number.isFinite(radius) && radius > 0 && radius <= 2;
    const cachePayload = {
      query: query.toLowerCase(),
      limit,
      city: city.toLowerCase(),
      latitude: hasCenter ? Number(latitude.toFixed(4)) : null,
      longitude: hasCenter ? Number(longitude.toFixed(4)) : null,
      radius: hasRadius ? Number(radius.toFixed(2)) : null,
    };
    const cacheKey = `geocode:${Buffer.from(JSON.stringify(cachePayload)).toString("base64")}`;
    let cached = null;
    try {
      cached = await redis.get(cacheKey);
    } catch (redisError) {
      // Redis errors are non-critical
    }
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    const isAutocomplete = limit > 1;
    const minIntervalMs = isAutocomplete ? 250 : 1000;
    const rateLimitKey = isAutocomplete ? "geocode:ratelimit:autocomplete" : "geocode:ratelimit";
    try {
      const lastRequest = await redis.get(rateLimitKey);
      if (lastRequest) {
        const timeSinceLastRequest = Date.now() - parseInt(lastRequest);
        if (timeSinceLastRequest < minIntervalMs) {
          await new Promise((resolve) => setTimeout(resolve, minIntervalMs - timeSinceLastRequest));
        }
      }
      await redis.set(rateLimitKey, Date.now().toString(), "EX", 1);
    } catch (redisError) {
      // Redis errors are non-critical
    }
    const mapsSettings = await loadYandexMapsSettings();
    if (!mapsSettings.geocoderApiKey) {
      return res.status(503).json({ error: "Yandex geocoder API key is not configured" });
    }
    const fullQuery = city ? `${query}, ${city}` : query;
    const geocodeItems = await requestYandexGeocoder({
      geocoderApiKey: mapsSettings.geocoderApiKey,
      language: mapsSettings.language,
      query: fullQuery,
      results: limit,
    });
    const items = geocodeItems.filter((item) => {
      if (!hasCenter || !hasRadius || query.length < 3) return true;
      const dLat = Math.abs(item.lat - latitude);
      const dLon = Math.abs(item.lon - longitude);
      return dLat <= radius && dLon <= radius;
    });
    if (!items.length) {
      if (limit > 1) {
        return res.json({ items: [] });
      }
      return res.status(404).json({
        error: "Address not found",
      });
    }
    const geocodeResult = { items };
    try {
      await redis.set(cacheKey, JSON.stringify(geocodeResult), "EX", 86400);
    } catch (redisError) {
      // Redis errors are non-critical
    }
    if (limit === 1) {
      const first = items[0];
      if (!first) {
        return res.status(404).json({
          error: "Address not found",
        });
      }
      return res.json({
        lat: first.lat,
        lng: first.lng,
        formatted_address: first.formatted_address,
        address: first.address,
        label: first.label,
      });
    }
    return res.json(geocodeResult);
  } catch (error) {
    if (error.response) {
      return res.status(502).json({
        error: "Geocoding service unavailable",
        details: error.message,
      });
    }
    next(error);
  }
});
router.post("/reverse", async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({
        error: "latitude and longitude are required",
      });
    }
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({
        error: "latitude and longitude must be numbers",
      });
    }
    const roundedLat = lat.toFixed(5);
    const roundedLon = lon.toFixed(5);
    const cacheKey = `reverse:v2:${roundedLat},${roundedLon}`;
    let cached = null;
    try {
      cached = await redis.get(cacheKey);
    } catch (redisError) {
      // Redis errors are non-critical
    }
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    const rateLimitKey = "reverse:ratelimit";
    try {
      const lastRequest = await redis.get(rateLimitKey);
      if (lastRequest) {
        const timeSinceLastRequest = Date.now() - parseInt(lastRequest);
        if (timeSinceLastRequest < 1000) {
          await new Promise((resolve) => setTimeout(resolve, 1000 - timeSinceLastRequest));
        }
      }
      await redis.set(rateLimitKey, Date.now().toString(), "EX", 1);
    } catch (redisError) {
      // Redis errors are non-critical
    }
    const mapsSettings = await loadYandexMapsSettings();
    if (!mapsSettings.geocoderApiKey) {
      return res.status(503).json({ error: "Yandex geocoder API key is not configured" });
    }
    const reverseItems = await requestYandexGeocoder({
      geocoderApiKey: mapsSettings.geocoderApiKey,
      language: mapsSettings.language,
      query: `${roundedLon},${roundedLat}`,
      results: 1,
      kind: "house",
    });
    const first = reverseItems[0];
    if (!first) {
      return res.json({ label: "", lat, lon, error: "reverse_unavailable" });
    }
    const payload = { lat: first.lat, lon: first.lon, label: first.label };
    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 86400);
    } catch (redisError) {
      // Redis errors are non-critical
    }
    res.json(payload);
  } catch (error) {
    if (error.response) {
      return res.status(502).json({
        error: "Reverse geocoding service unavailable",
        details: error.message,
      });
    }
    next(error);
  }
});
router.post("/check-delivery", async (req, res, next) => {
  try {
    const { latitude, longitude, city_id, cart_amount } = req.body;
    const lat = Number(latitude);
    const lon = Number(longitude);
    const cityId = Number(city_id);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(cityId)) {
      return res.status(400).json({
        error: "latitude, longitude, and city_id are required",
      });
    }
    const findPolygon = async (pointLat, pointLon) => {
      const point = `POINT(${pointLon} ${pointLat})`;
      const [polygons] = await db.query(
        `SELECT dp.id, dp.branch_id, dp.name, dp.source,
                dp.delivery_time,
                dp.min_order_amount, dp.delivery_cost,
                b.name as branch_name, b.address as branch_address,
                b.prep_time, b.assembly_time
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE b.city_id = ? 
           AND dp.is_active = TRUE 
           AND b.is_active = TRUE
           AND (dp.is_blocked = FALSE OR 
                (dp.blocked_from IS NOT NULL AND dp.blocked_until IS NOT NULL 
                 AND NOW() NOT BETWEEN dp.blocked_from AND dp.blocked_until))
           AND dp.source = 'local'
           AND ST_Contains(dp.polygon, ST_GeomFromText(?, 4326))
         ORDER BY dp.delivery_time, dp.id
         LIMIT 1`,
        [cityId, point],
      );
      return polygons[0] || null;
    };
    let polygon = await findPolygon(lat, lon);
    let coordsSwapped = false;
    if (!polygon) {
      polygon = await findPolygon(lon, lat);
      coordsSwapped = Boolean(polygon);
    }
    if (!polygon) {
      return res.json({
        available: false,
        message: "Доставка по этому адресу недоступна.",
      });
    }
    const [tariffsRows] = await db.query(
      `SELECT id, polygon_id, amount_from, amount_to, delivery_cost
       FROM delivery_tariffs
       WHERE polygon_id = ?
       ORDER BY amount_from`,
      [polygon.id],
    );
    const tariffs = (tariffsRows || []).map((row) => ({
      id: row.id,
      polygon_id: row.polygon_id,
      amount_from: row.amount_from,
      amount_to: row.amount_to === null ? null : Number(row.amount_to),
      delivery_cost: row.delivery_cost,
    }));
    if (tariffs.length === 0) {
      const freeTariffs = [{ amount_from: 0, amount_to: null, delivery_cost: 0 }];
      return res.json({
        available: true,
        polygon,
        coords_swapped: coordsSwapped,
        tariffs: freeTariffs,
        delivery_cost: 0,
        next_threshold: null,
      });
    }
    const cartAmountValue = Number.isFinite(Number(cart_amount)) ? Number(cart_amount) : null;
    const minOrderAmount = Number.isFinite(Number(polygon.min_order_amount)) ? Number(polygon.min_order_amount) : 0;
    if (cartAmountValue !== null && cartAmountValue < minOrderAmount) {
      return res.json({
        available: false,
        polygon,
        coords_swapped: coordsSwapped,
        message: `Минимальная сумма заказа для этой зоны: ${minOrderAmount}`,
      });
    }
    const currentTariff = cartAmountValue === null ? null : findTariffForAmount(tariffs, cartAmountValue);
    const deliveryCost = currentTariff ? currentTariff.delivery_cost : null;
    const nextThreshold = currentTariff ? getNextThreshold(tariffs, cartAmountValue) : null;
    res.json({
      available: true,
      polygon,
      coords_swapped: coordsSwapped,
      tariffs,
      delivery_cost: deliveryCost,
      next_threshold: nextThreshold,
    });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/all", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    let cityFilter = "";
    const values = [];
    if (req.user.role === "manager") {
      const cities = req.user.cities || [];
      if (cities.length === 0) {
        return res.json({ polygons: [] });
      }
      cityFilter = `AND b.city_id IN (${cities.map(() => "?").join(",")})`;
      values.push(...cities);
    }
    const [polygons] = await db.query(
      `SELECT dp.id, dp.branch_id, dp.name, dp.source,
              ST_AsGeoJSON(dp.polygon) as polygon,
              dp.delivery_time,
              dp.min_order_amount, dp.delivery_cost, dp.is_active,
              dp.is_blocked, dp.blocked_from, dp.blocked_until, dp.block_reason,
              b.city_id, b.name as branch_name,
              (SELECT COUNT(*) FROM delivery_tariffs dt WHERE dt.polygon_id = dp.id) as tariffs_count
       FROM delivery_polygons dp
       JOIN branches b ON dp.branch_id = b.id
       WHERE dp.source = 'local'
       ${cityFilter}
       ORDER BY b.city_id, dp.name`,
      values,
    );
    const parsedPolygons = polygons.map((p) => ({
      ...p,
      polygon: parseGeoJson(p.polygon),
    }));
    res.json({ polygons: parsedPolygons });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/branch/:branchId", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const branchId = req.params.branchId;
    const [branches] = await db.query("SELECT city_id FROM branches WHERE id = ?", [branchId]);
    if (branches.length === 0) {
      return res.status(404).json({ error: "Branch not found" });
    }
    if (req.user.role === "manager" && !req.user.cities.includes(branches[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }
    const [polygons] = await db.query(
      `SELECT id, branch_id, name, source,
                ST_AsGeoJSON(polygon) as polygon,
                delivery_time,
                min_order_amount, delivery_cost, is_active,
                is_blocked, blocked_from, blocked_until, block_reason,
                created_at, updated_at,
                (SELECT COUNT(*) FROM delivery_tariffs dt WHERE dt.polygon_id = delivery_polygons.id) as tariffs_count
         FROM delivery_polygons
         WHERE branch_id = ? AND source = 'local'
         ORDER BY name`,
      [branchId],
    );
    const parsedPolygons = polygons.map((p) => ({
      ...p,
      polygon: parseGeoJson(p.polygon),
    }));
    res.json({ polygons: parsedPolygons });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/:id/tariffs", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const polygonId = req.params.id;
    const meta = await getPolygonMeta(polygonId);
    if (!meta) {
      return res.status(404).json({ error: "Polygon not found" });
    }
    if (req.user.role === "manager" && !req.user.cities.includes(meta.city_id)) {
      return res.status(403).json({ error: "You do not have access to this city" });
    }
    const tariffs = await getTariffsByPolygonId(polygonId);
    res.json({ tariffs });
  } catch (error) {
    next(error);
  }
});
router.put("/admin/:id/tariffs", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    if (denyManagerWrite(req, res)) return;
    const polygonId = req.params.id;
    const meta = await getPolygonMeta(polygonId);
    if (!meta) {
      return res.status(404).json({ error: "Polygon not found" });
    }
    if (req.user.role === "manager" && !req.user.cities.includes(meta.city_id)) {
      return res.status(403).json({ error: "You do not have access to this city" });
    }
    const { tariffs = [] } = req.body;
    const { valid, errors, normalized } = validateTariffs(tariffs);
    if (!valid) {
      return res.status(400).json({ error: "Validation error", errors });
    }
    await connection.beginTransaction();
    await connection.query("DELETE FROM delivery_tariffs WHERE polygon_id = ?", [polygonId]);
    for (const tariff of normalized) {
      await connection.query(
        `INSERT INTO delivery_tariffs (polygon_id, amount_from, amount_to, delivery_cost)
         VALUES (?, ?, ?, ?)`,
        [polygonId, tariff.amount_from, tariff.amount_to, tariff.delivery_cost],
      );
    }
    await connection.commit();
    const saved = await getTariffsByPolygonId(polygonId);
    res.json({ tariffs: saved });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});
router.post("/admin/:id/tariffs/copy", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    if (denyManagerWrite(req, res)) return;
    const polygonId = req.params.id;
    const sourcePolygonId = Number(req.body?.source_polygon_id);
    if (!Number.isFinite(sourcePolygonId)) {
      return res.status(400).json({ error: "source_polygon_id is required" });
    }
    const targetMeta = await getPolygonMeta(polygonId);
    const sourceMeta = await getPolygonMeta(sourcePolygonId);
    if (!targetMeta || !sourceMeta) {
      return res.status(404).json({ error: "Polygon not found" });
    }
    if (req.user.role === "manager") {
      if (!req.user.cities.includes(targetMeta.city_id) || !req.user.cities.includes(sourceMeta.city_id)) {
        return res.status(403).json({ error: "You do not have access to this city" });
      }
    }
    if (targetMeta.branch_id !== sourceMeta.branch_id) {
      return res.status(400).json({ error: "Полигон-источник должен быть в том же филиале" });
    }
    const [targetCountRows] = await connection.query("SELECT COUNT(*) as count FROM delivery_tariffs WHERE polygon_id = ?", [polygonId]);
    if ((targetCountRows[0]?.count || 0) > 0) {
      return res.status(400).json({ error: "У целевого полигона уже есть тарифы" });
    }
    const sourceTariffs = await getTariffsByPolygonId(sourcePolygonId);
    if (sourceTariffs.length === 0) {
      return res.status(400).json({ error: "У полигона-источника нет тарифов" });
    }
    await connection.beginTransaction();
    for (const tariff of sourceTariffs) {
      await connection.query(
        `INSERT INTO delivery_tariffs (polygon_id, amount_from, amount_to, delivery_cost)
         VALUES (?, ?, ?, ?)`,
        [polygonId, tariff.amount_from, tariff.amount_to, tariff.delivery_cost],
      );
    }
    await connection.commit();
    const saved = await getTariffsByPolygonId(polygonId);
    res.json({ tariffs: saved });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});
router.post("/admin", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    if (denyManagerWrite(req, res)) return;
    const { branch_id, name, polygon, delivery_time } = req.body;
    if (!branch_id || !polygon) {
      return res.status(400).json({
        error: "branch_id and polygon are required",
      });
    }
    const [branches] = await db.query("SELECT city_id FROM branches WHERE id = ?", [branch_id]);
    if (branches.length === 0) {
      return res.status(404).json({ error: "Branch not found" });
    }
    if (req.user.role === "manager" && !req.user.cities.includes(branches[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }
    if (!Array.isArray(polygon) || polygon.length < 3) {
      return res.status(400).json({
        error: "Polygon must be an array of at least 3 coordinates",
      });
    }
    const coordinates = polygon.map((coord) => `${coord[0]} ${coord[1]}`).join(", ");
    const safeMinOrderAmount = 0;
    const safeDeliveryCost = 0;
    const wkt = `POLYGON((${coordinates}))`;
    const [result] = await db.query(
      `INSERT INTO delivery_polygons 
         (branch_id, name, source, polygon, delivery_time, 
          min_order_amount, delivery_cost)
         VALUES (?, ?, 'local', ST_GeomFromText(?, 4326), ?, ?, ?)`,
      [branch_id, name || null, wkt, delivery_time || 30, safeMinOrderAmount, safeDeliveryCost],
    );
    const [newPolygon] = await db.query(
      `SELECT id, branch_id, name, source,
                ST_AsGeoJSON(polygon) as polygon,
                delivery_time,
                min_order_amount, delivery_cost, is_active,
                created_at, updated_at
         FROM delivery_polygons WHERE id = ?`,
      [result.insertId],
    );
    res.status(201).json({
      polygon: {
        ...newPolygon[0],
        polygon: parseGeoJson(newPolygon[0].polygon),
      },
    });
  } catch (error) {
    next(error);
  }
});
router.put("/admin/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    if (denyManagerWrite(req, res)) return;
    const polygonId = req.params.id;
    const { name, polygon, delivery_time, min_order_amount, delivery_cost, is_active } = req.body;
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id = ? AND dp.source = 'local'`,
      [polygonId],
    );
    if (polygons.length === 0) {
      return res.status(404).json({ error: "Polygon not found" });
    }
    if (req.user.role === "manager" && !req.user.cities.includes(polygons[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }
    const updates = [];
    const values = [];
    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (polygon !== undefined) {
      if (!Array.isArray(polygon) || polygon.length < 3) {
        return res.status(400).json({
          error: "Polygon must be an array of at least 3 coordinates",
        });
      }
      const coordinates = polygon.map((coord) => `${coord[0]} ${coord[1]}`).join(", ");
      const wkt = `POLYGON((${coordinates}))`;
      updates.push("polygon = ST_GeomFromText(?, 4326)");
      values.push(wkt);
    }
    if (delivery_time !== undefined) {
      updates.push("delivery_time = ?");
      values.push(delivery_time);
    }
    if (min_order_amount !== undefined) {
      updates.push("min_order_amount = ?");
      values.push(0);
    }
    if (delivery_cost !== undefined) {
      updates.push("delivery_cost = ?");
      values.push(0);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    values.push(polygonId);
    await db.query(`UPDATE delivery_polygons SET ${updates.join(", ")} WHERE id = ?`, values);
    const [updatedPolygon] = await db.query(
      `SELECT id, branch_id, name, source,
                ST_AsGeoJSON(polygon) as polygon,
                delivery_time,
                min_order_amount, delivery_cost, is_active,
                created_at, updated_at
         FROM delivery_polygons WHERE id = ?`,
      [polygonId],
    );
    res.json({
      polygon: {
        ...updatedPolygon[0],
        polygon: parseGeoJson(updatedPolygon[0].polygon),
      },
    });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/:id/block", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const polygonId = req.params.id;
    const { blocked_from, blocked_until, block_reason } = req.body;
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id = ? AND dp.source = 'local'`,
      [polygonId],
    );
    if (polygons.length === 0) {
      return res.status(404).json({ error: "Polygon not found" });
    }
    if (req.user.role === "manager" && !req.user.cities.includes(polygons[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }
    if (blocked_from && blocked_until) {
      const from = new Date(blocked_from);
      const until = new Date(blocked_until);
      if (from >= until) {
        return res.status(400).json({ error: "blocked_from must be before blocked_until" });
      }
    }
    await db.query(
      `UPDATE delivery_polygons 
       SET is_blocked = TRUE, 
           blocked_from = ?, 
           blocked_until = ?, 
           block_reason = ?,
           blocked_by = ?,
           blocked_at = NOW()
       WHERE id = ?`,
      [blocked_from || null, blocked_until || null, block_reason || null, req.user.id, polygonId],
    );
    const [updatedPolygon] = await db.query(
      `SELECT id, branch_id, name, source,
              ST_AsGeoJSON(polygon) as polygon,
              delivery_time,
              min_order_amount, delivery_cost, is_active,
              is_blocked, blocked_from, blocked_until, block_reason,
              created_at, updated_at
       FROM delivery_polygons WHERE id = ?`,
      [polygonId],
    );
    res.json({
      message: "Polygon blocked successfully",
      polygon: {
        ...updatedPolygon[0],
        polygon: parseGeoJson(updatedPolygon[0].polygon),
      },
    });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/:id/unblock", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const polygonId = req.params.id;
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id = ? AND dp.source = 'local'`,
      [polygonId],
    );
    if (polygons.length === 0) {
      return res.status(404).json({ error: "Polygon not found" });
    }
    if (req.user.role === "manager" && !req.user.cities.includes(polygons[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }
    await db.query(
      `UPDATE delivery_polygons 
       SET is_blocked = FALSE, 
           blocked_from = NULL, 
           blocked_until = NULL, 
           block_reason = NULL,
           blocked_by = NULL,
           blocked_at = NULL
       WHERE id = ?`,
      [polygonId],
    );
    const [updatedPolygon] = await db.query(
      `SELECT id, branch_id, name, source,
              ST_AsGeoJSON(polygon) as polygon,
              delivery_time,
              min_order_amount, delivery_cost, is_active,
              is_blocked, blocked_from, blocked_until, block_reason,
              created_at, updated_at
       FROM delivery_polygons WHERE id = ?`,
      [polygonId],
    );
    res.json({
      message: "Polygon unblocked successfully",
      polygon: {
        ...updatedPolygon[0],
        polygon: parseGeoJson(updatedPolygon[0].polygon),
      },
    });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/bulk-block", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { polygon_ids, blocked_from, blocked_until, block_reason } = req.body;
    if (!Array.isArray(polygon_ids) || polygon_ids.length === 0) {
      return res.status(400).json({ error: "polygon_ids must be a non-empty array" });
    }
    if (blocked_from && blocked_until) {
      const from = new Date(blocked_from);
      const until = new Date(blocked_until);
      if (from >= until) {
        return res.status(400).json({ error: "blocked_from must be before blocked_until" });
      }
    }
    const placeholders = polygon_ids.map(() => "?").join(",");
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id IN (${placeholders}) AND dp.source = 'local'`,
      polygon_ids,
    );
    if (polygons.length === 0) {
      return res.status(404).json({ error: "No polygons found" });
    }
    if (req.user.role === "manager") {
      const hasAccess = polygons.every((p) => req.user.cities.includes(p.city_id));
      if (!hasAccess) {
        return res.status(403).json({
          error: "You do not have access to one or more cities",
        });
      }
    }
    await db.query(
      `UPDATE delivery_polygons 
       SET is_blocked = TRUE, 
           blocked_from = ?, 
           blocked_until = ?, 
           block_reason = ?,
           blocked_by = ?,
           blocked_at = NOW()
       WHERE id IN (${placeholders})`,
      [blocked_from || null, blocked_until || null, block_reason || null, req.user.id, ...polygon_ids],
    );
    res.json({
      message: `${polygon_ids.length} polygon(s) blocked successfully`,
      count: polygon_ids.length,
    });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/bulk-unblock", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { polygon_ids } = req.body;
    if (!Array.isArray(polygon_ids) || polygon_ids.length === 0) {
      return res.status(400).json({ error: "polygon_ids must be a non-empty array" });
    }
    const placeholders = polygon_ids.map(() => "?").join(",");
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id IN (${placeholders}) AND dp.source = 'local'`,
      polygon_ids,
    );
    if (polygons.length === 0) {
      return res.status(404).json({ error: "No polygons found" });
    }
    if (req.user.role === "manager") {
      const hasAccess = polygons.every((p) => req.user.cities.includes(p.city_id));
      if (!hasAccess) {
        return res.status(403).json({
          error: "You do not have access to one or more cities",
        });
      }
    }
    await db.query(
      `UPDATE delivery_polygons 
       SET is_blocked = FALSE, 
           blocked_from = NULL, 
           blocked_until = NULL, 
           block_reason = NULL,
           blocked_by = NULL,
           blocked_at = NULL
       WHERE id IN (${placeholders})`,
      polygon_ids,
    );
    res.json({
      message: `${polygon_ids.length} polygon(s) unblocked successfully`,
      count: polygon_ids.length,
    });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/:id/transfer", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    if (denyManagerWrite(req, res)) return;
    const polygonId = req.params.id;
    const { new_branch_id } = req.body;
    if (!new_branch_id) {
      return res.status(400).json({ error: "new_branch_id is required" });
    }
    const [polygons] = await db.query(
      `SELECT dp.id, dp.branch_id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id = ? AND dp.source = 'local'`,
      [polygonId],
    );
    if (polygons.length === 0) {
      return res.status(404).json({ error: "Polygon not found" });
    }
    const currentCityId = polygons[0].city_id;
    if (req.user.role === "manager" && !req.user.cities.includes(currentCityId)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }
    const [newBranches] = await db.query(`SELECT id, city_id, name FROM branches WHERE id = ?`, [new_branch_id]);
    if (newBranches.length === 0) {
      return res.status(404).json({ error: "New branch not found" });
    }
    if (newBranches[0].city_id !== currentCityId) {
      return res.status(400).json({ error: "Cannot transfer polygon to a branch in a different city" });
    }
    await db.query(`UPDATE delivery_polygons SET branch_id = ? WHERE id = ?`, [new_branch_id, polygonId]);
    const [updatedPolygon] = await db.query(
      `SELECT dp.id, dp.branch_id, dp.name, 
              ST_AsGeoJSON(dp.polygon) as polygon,
              dp.delivery_time,
              dp.min_order_amount, dp.delivery_cost, dp.is_active,
              dp.is_blocked, dp.blocked_from, dp.blocked_until, dp.block_reason,
              b.name as branch_name,
              created_at, updated_at
       FROM delivery_polygons dp
       JOIN branches b ON dp.branch_id = b.id
       WHERE dp.id = ?`,
      [polygonId],
    );
    res.json({
      message: "Polygon transferred successfully",
      polygon: {
        ...updatedPolygon[0],
        polygon: parseGeoJson(updatedPolygon[0].polygon),
      },
    });
  } catch (error) {
    next(error);
  }
});
router.delete("/admin/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    if (denyManagerWrite(req, res)) return;
    const polygonId = req.params.id;
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id = ? AND dp.source = 'local'`,
      [polygonId],
    );
    if (polygons.length === 0) {
      return res.status(404).json({ error: "Polygon not found" });
    }
    if (req.user.role === "manager" && !req.user.cities.includes(polygons[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }
    await db.query("DELETE FROM delivery_polygons WHERE id = ?", [polygonId]);
    res.json({ message: "Polygon deleted successfully" });
  } catch (error) {
    next(error);
  }
});
export default router;
