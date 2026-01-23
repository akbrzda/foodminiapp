import express from "express";
import db from "../config/database.js";
import { authenticateToken, requireRole, checkCityAccess } from "../middleware/auth.js";
import redis from "../config/redis.js";
import axios from "axios";

const router = express.Router();

const parseGeoJson = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.error("Failed to parse polygon GeoJSON:", error);
      return null;
    }
  }
  return value;
};

// ==================== Публичные эндпоинты ====================

// Получить полигоны по городу
router.get("/city/:cityId", async (req, res, next) => {
  try {
    const cityId = req.params.cityId;

    const [polygons] = await db.query(
      `SELECT dp.id, dp.branch_id, dp.name, 
              ST_AsGeoJSON(dp.polygon) as polygon,
              dp.delivery_time,
              dp.min_order_amount, dp.delivery_cost,
              b.name as branch_name
       FROM delivery_polygons dp
       JOIN branches b ON dp.branch_id = b.id
       WHERE b.city_id = ? AND dp.is_active = TRUE AND b.is_active = TRUE
         AND (dp.is_blocked = FALSE OR 
              (dp.blocked_from IS NOT NULL AND dp.blocked_until IS NOT NULL 
               AND NOW() NOT BETWEEN dp.blocked_from AND dp.blocked_until))`,
      [cityId],
    );

    // Парсим GeoJSON для каждого полигона
    const parsedPolygons = polygons.map((p) => ({
      ...p,
      polygon: parseGeoJson(p.polygon),
    }));

    res.json({ polygons: parsedPolygons });
  } catch (error) {
    next(error);
  }
});

// Получить полигоны по филиалу
router.get("/branch/:branchId", async (req, res, next) => {
  try {
    const branchId = req.params.branchId;

    const [polygons] = await db.query(
      `SELECT id, branch_id, name, 
              ST_AsGeoJSON(polygon) as polygon,
              delivery_time,
              min_order_amount, delivery_cost
       FROM delivery_polygons
       WHERE branch_id = ? AND is_active = TRUE
         AND (is_blocked = FALSE OR 
              (blocked_from IS NOT NULL AND blocked_until IS NOT NULL 
               AND NOW() NOT BETWEEN blocked_from AND blocked_until))`,
      [branchId],
    );

    // Парсим GeoJSON для каждого полигона
    const parsedPolygons = polygons.map((p) => ({
      ...p,
      polygon: parseGeoJson(p.polygon),
    }));

    res.json({ polygons: parsedPolygons });
  } catch (error) {
    next(error);
  }
});

// Геокодирование адреса через Nominatim API (для совместимости с roadmap)
router.post("/geocode", async (req, res, next) => {
  try {
    const { address } = req.body;

    if (!address || typeof address !== "string" || address.trim().length === 0) {
      return res.status(400).json({
        error: "address is required and must be a non-empty string",
      });
    }

    // Проверяем кеш Redis (TTL: 24 часа)
    const cacheKey = `geocode:${Buffer.from(address.trim().toLowerCase()).toString("base64")}`;
    let cached = null;
    try {
      cached = await redis.get(cacheKey);
    } catch (redisError) {
      console.error("Redis error on geocode cache get:", redisError);
    }

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Rate limiting: 1 запрос в секунду
    const rateLimitKey = "geocode:ratelimit";
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
      console.error("Redis error on rate limiting:", redisError);
    }

    // Запрос к Nominatim API
    const nominatimUrl = "https://nominatim.openstreetmap.org/search";
    const response = await axios.get(nominatimUrl, {
      params: {
        q: address.trim(),
        format: "json",
        limit: 1,
        addressdetails: 1,
      },
      headers: {
        "User-Agent": "MiniappPanda/1.0 (Food Delivery Service)", // Требуется Nominatim
      },
      timeout: 5000,
    });

    if (!response.data || response.data.length === 0) {
      return res.status(404).json({
        error: "Address not found",
      });
    }

    const result = response.data[0];
    const geocodeResult = {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      formatted_address: result.display_name,
      address: {
        street: result.address?.road || "",
        house: result.address?.house_number || "",
        city: result.address?.city || result.address?.town || result.address?.village || "",
        country: result.address?.country || "",
      },
    };

    // Кешируем результат на 24 часа
    try {
      await redis.set(cacheKey, JSON.stringify(geocodeResult), "EX", 86400);
    } catch (redisError) {
      console.error("Redis error on geocode cache set:", redisError);
    }

    res.json(geocodeResult);
  } catch (error) {
    if (error.response) {
      // Ошибка от Nominatim API
      return res.status(502).json({
        error: "Geocoding service unavailable",
        details: error.message,
      });
    }
    next(error);
  }
});

// Обратное геокодирование (координаты -> адрес)
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
    const cacheKey = `reverse:${roundedLat},${roundedLon}`;
    let cached = null;
    try {
      cached = await redis.get(cacheKey);
    } catch (redisError) {
      console.error("Redis error on reverse cache get:", redisError);
    }

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Rate limiting: 1 запрос в секунду
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
      console.error("Redis error on reverse rate limiting:", redisError);
    }

    const nominatimUrl = "https://nominatim.openstreetmap.org/reverse";
    let response = null;
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await axios.get(nominatimUrl, {
          params: {
            format: "json",
            addressdetails: 1,
            lat: roundedLat,
            lon: roundedLon,
          },
          headers: {
            "User-Agent": "MiniappPanda/1.0 (Food Delivery Service)",
          },
          timeout: 8000,
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (error?.code === "ECONNABORTED" && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        break;
      }
    }
    if (lastError) {
      console.error("Reverse geocode request failed:", lastError?.code || lastError?.message || lastError);
      try {
        await redis.set(cacheKey, JSON.stringify({}), "EX", 60);
      } catch (redisError) {
        console.error("Redis error on reverse cache set (empty):", redisError);
      }
      return res.json({ label: "", lat, lon, error: "reverse_unavailable" });
    }

    if (!response.data) {
      return res.status(404).json({
        error: "Address not found",
      });
    }

    const result = response.data;
    const address = result.address || {};
    const street =
      address.road ||
      address.pedestrian ||
      address.footway ||
      address.residential ||
      address.living_street ||
      address.street ||
      address.neighbourhood;
    const house = address.house_number || address.building;
    const label = street ? (house ? `${street}, ${house}` : street) : result.display_name || "";

    const payload = {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      label,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 86400);
    } catch (redisError) {
      console.error("Redis error on reverse cache set:", redisError);
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

// Проверить попадание точки в зону доставки
router.post("/check-delivery", async (req, res, next) => {
  try {
    const { latitude, longitude, city_id } = req.body;

    if (!latitude || !longitude || !city_id) {
      return res.status(400).json({
        error: "latitude, longitude, and city_id are required",
      });
    }

    // Создаем точку из координат
    const point = `POINT(${longitude} ${latitude})`;

    // Ищем полигоны в которые попадает точка
    const [polygons] = await db.query(
      `SELECT dp.id, dp.branch_id, dp.name,
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
         AND ST_Contains(dp.polygon, ST_GeomFromText(?, 4326))
       ORDER BY dp.delivery_cost, dp.delivery_time
       LIMIT 1`,
      [city_id, point],
    );

    if (polygons.length === 0) {
      return res.json({
        available: false,
        message: "Delivery is not available to this address",
      });
    }

    res.json({
      available: true,
      polygon: polygons[0],
    });
  } catch (error) {
    next(error);
  }
});

// ==================== Админские эндпоинты ====================

// Получить все полигоны (включая неактивные)
router.get("/admin/all", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    let cityFilter = "";
    const values = [];

    if (req.user.role === "manager") {
      const cities = req.user.cities || [];
      if (cities.length === 0) {
        return res.json({ polygons: [] });
      }
      cityFilter = `WHERE b.city_id IN (${cities.map(() => "?").join(",")})`;
      values.push(...cities);
    }

    const [polygons] = await db.query(
      `SELECT dp.id, dp.branch_id, dp.name,
              ST_AsGeoJSON(dp.polygon) as polygon,
              dp.delivery_time,
              dp.min_order_amount, dp.delivery_cost, dp.is_active,
              dp.is_blocked, dp.blocked_from, dp.blocked_until, dp.block_reason,
              b.city_id, b.name as branch_name
       FROM delivery_polygons dp
       JOIN branches b ON dp.branch_id = b.id
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

// Получить все полигоны филиала (включая неактивные)
router.get("/admin/branch/:branchId", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const branchId = req.params.branchId;

    // Проверяем доступ к филиалу
    const [branches] = await db.query("SELECT city_id FROM branches WHERE id = ?", [branchId]);

    if (branches.length === 0) {
      return res.status(404).json({ error: "Branch not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(branches[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    const [polygons] = await db.query(
      `SELECT id, branch_id, name,
                ST_AsGeoJSON(polygon) as polygon,
                delivery_time,
                min_order_amount, delivery_cost, is_active,
                is_blocked, blocked_from, blocked_until, block_reason,
                created_at, updated_at
         FROM delivery_polygons
         WHERE branch_id = ?
         ORDER BY name`,
      [branchId],
    );

    // Парсим GeoJSON для каждого полигона
    const parsedPolygons = polygons.map((p) => ({
      ...p,
      polygon: parseGeoJson(p.polygon),
    }));

    res.json({ polygons: parsedPolygons });
  } catch (error) {
    next(error);
  }
});

// Создать полигон
router.post("/admin", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { branch_id, name, polygon, delivery_time, min_order_amount, delivery_cost } = req.body;

    if (!branch_id || !polygon) {
      return res.status(400).json({
        error: "branch_id and polygon are required",
      });
    }

    // Проверяем доступ к филиалу
    const [branches] = await db.query("SELECT city_id FROM branches WHERE id = ?", [branch_id]);

    if (branches.length === 0) {
      return res.status(404).json({ error: "Branch not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(branches[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    // Преобразуем GeoJSON полигон в MySQL Polygon
    // Ожидаем что polygon это массив координат [[lng, lat], [lng, lat], ...]
    if (!Array.isArray(polygon) || polygon.length < 3) {
      return res.status(400).json({
        error: "Polygon must be an array of at least 3 coordinates",
      });
    }

    // Формируем WKT (Well-Known Text) для полигона
    const coordinates = polygon.map((coord) => `${coord[0]} ${coord[1]}`).join(", ");
    const wkt = `POLYGON((${coordinates}))`;

    console.log("Creating polygon with WKT:", wkt);

    const [result] = await db.query(
      `INSERT INTO delivery_polygons 
         (branch_id, name, polygon, delivery_time, 
          min_order_amount, delivery_cost)
         VALUES (?, ?, ST_GeomFromText(?, 4326), ?, ?, ?)`,
      [branch_id, name || null, wkt, delivery_time || 30, min_order_amount || 0, delivery_cost || 0],
    );

    const [newPolygon] = await db.query(
      `SELECT id, branch_id, name, 
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

// Обновить полигон
router.put("/admin/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const polygonId = req.params.id;
    const { name, polygon, delivery_time, min_order_amount, delivery_cost, is_active } = req.body;

    // Проверяем существование полигона и доступ
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id = ?`,
      [polygonId],
    );

    if (polygons.length === 0) {
      return res.status(404).json({ error: "Polygon not found" });
    }

    // Проверка доступа к городу для менеджеров
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
      values.push(min_order_amount);
    }
    if (delivery_cost !== undefined) {
      updates.push("delivery_cost = ?");
      values.push(delivery_cost);
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
      `SELECT id, branch_id, name, 
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

// Заблокировать полигон
router.post("/admin/:id/block", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const polygonId = req.params.id;
    const { blocked_from, blocked_until, block_reason } = req.body;

    // Проверяем существование полигона и доступ
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id = ?`,
      [polygonId],
    );

    if (polygons.length === 0) {
      return res.status(404).json({ error: "Polygon not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(polygons[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    // Проверяем валидность временного периода
    if (blocked_from && blocked_until) {
      const from = new Date(blocked_from);
      const until = new Date(blocked_until);
      if (from >= until) {
        return res.status(400).json({ error: "blocked_from must be before blocked_until" });
      }
    }

    // Блокируем полигон
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
      `SELECT id, branch_id, name, 
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

// Разблокировать полигон
router.post("/admin/:id/unblock", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const polygonId = req.params.id;

    // Проверяем существование полигона и доступ
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id = ?`,
      [polygonId],
    );

    if (polygons.length === 0) {
      return res.status(404).json({ error: "Polygon not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(polygons[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    // Разблокируем полигон
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
      `SELECT id, branch_id, name, 
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

// Пакетная блокировка полигонов
router.post("/admin/bulk-block", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { polygon_ids, blocked_from, blocked_until, block_reason } = req.body;

    if (!Array.isArray(polygon_ids) || polygon_ids.length === 0) {
      return res.status(400).json({ error: "polygon_ids must be a non-empty array" });
    }

    // Проверяем временной период
    if (blocked_from && blocked_until) {
      const from = new Date(blocked_from);
      const until = new Date(blocked_until);
      if (from >= until) {
        return res.status(400).json({ error: "blocked_from must be before blocked_until" });
      }
    }

    // Проверяем доступ к полигонам
    const placeholders = polygon_ids.map(() => "?").join(",");
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id IN (${placeholders})`,
      polygon_ids,
    );

    if (polygons.length === 0) {
      return res.status(404).json({ error: "No polygons found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager") {
      const hasAccess = polygons.every((p) => req.user.cities.includes(p.city_id));
      if (!hasAccess) {
        return res.status(403).json({
          error: "You do not have access to one or more cities",
        });
      }
    }

    // Блокируем полигоны
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

// Пакетная разблокировка полигонов
router.post("/admin/bulk-unblock", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { polygon_ids } = req.body;

    if (!Array.isArray(polygon_ids) || polygon_ids.length === 0) {
      return res.status(400).json({ error: "polygon_ids must be a non-empty array" });
    }

    // Проверяем доступ к полигонам
    const placeholders = polygon_ids.map(() => "?").join(",");
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id IN (${placeholders})`,
      polygon_ids,
    );

    if (polygons.length === 0) {
      return res.status(404).json({ error: "No polygons found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager") {
      const hasAccess = polygons.every((p) => req.user.cities.includes(p.city_id));
      if (!hasAccess) {
        return res.status(403).json({
          error: "You do not have access to one or more cities",
        });
      }
    }

    // Разблокируем полигоны
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

// Переместить полигон на другой филиал
router.post("/admin/:id/transfer", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const polygonId = req.params.id;
    const { new_branch_id } = req.body;

    if (!new_branch_id) {
      return res.status(400).json({ error: "new_branch_id is required" });
    }

    // Проверяем существование полигона и получаем текущий город
    const [polygons] = await db.query(
      `SELECT dp.id, dp.branch_id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id = ?`,
      [polygonId],
    );

    if (polygons.length === 0) {
      return res.status(404).json({ error: "Polygon not found" });
    }

    const currentCityId = polygons[0].city_id;

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(currentCityId)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    // Проверяем существование нового филиала и что он в том же городе
    const [newBranches] = await db.query(`SELECT id, city_id, name FROM branches WHERE id = ?`, [new_branch_id]);

    if (newBranches.length === 0) {
      return res.status(404).json({ error: "New branch not found" });
    }

    if (newBranches[0].city_id !== currentCityId) {
      return res.status(400).json({ error: "Cannot transfer polygon to a branch in a different city" });
    }

    // Проверяем, что у нового филиала не более 3 полигонов
    const [branchPolygons] = await db.query(`SELECT COUNT(*) as count FROM delivery_polygons WHERE branch_id = ?`, [new_branch_id]);

    if (branchPolygons[0].count >= 3) {
      return res.status(400).json({ error: "Target branch already has maximum number of polygons (3)" });
    }

    // Переносим полигон
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

// Удалить полигон
router.delete("/admin/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const polygonId = req.params.id;

    // Проверяем существование полигона и доступ
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id = ?`,
      [polygonId],
    );

    if (polygons.length === 0) {
      return res.status(404).json({ error: "Polygon not found" });
    }

    // Проверка доступа к городу для менеджеров
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
