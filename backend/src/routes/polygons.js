import express from "express";
import db from "../config/database.js";
import { authenticateToken, requireRole, checkCityAccess } from "../middleware/auth.js";
import redis from "../config/redis.js";
import axios from "axios";

const router = express.Router();

// ==================== Публичные эндпоинты ====================

// Получить полигоны по городу
router.get("/city/:cityId", async (req, res, next) => {
  try {
    const cityId = req.params.cityId;

    const [polygons] = await db.query(
      `SELECT dp.id, dp.branch_id, dp.name, 
              ST_AsGeoJSON(dp.polygon) as polygon,
              dp.delivery_time_min, dp.delivery_time_max,
              dp.min_order_amount, dp.delivery_cost,
              b.name as branch_name
       FROM delivery_polygons dp
       JOIN branches b ON dp.branch_id = b.id
       WHERE b.city_id = ? AND dp.is_active = TRUE AND b.is_active = TRUE`,
      [cityId]
    );

    // Парсим GeoJSON для каждого полигона
    const parsedPolygons = polygons.map((p) => ({
      ...p,
      polygon: p.polygon ? JSON.parse(p.polygon) : null,
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
              delivery_time_min, delivery_time_max,
              min_order_amount, delivery_cost
       FROM delivery_polygons
       WHERE branch_id = ? AND is_active = TRUE`,
      [branchId]
    );

    // Парсим GeoJSON для каждого полигона
    const parsedPolygons = polygons.map((p) => ({
      ...p,
      polygon: p.polygon ? JSON.parse(p.polygon) : null,
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
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Rate limiting: 1 запрос в секунду
    // Используем простую задержку (в продакшене лучше использовать более сложную систему)
    const rateLimitKey = "geocode:ratelimit";
    const lastRequest = await redis.get(rateLimitKey);
    if (lastRequest) {
      const timeSinceLastRequest = Date.now() - parseInt(lastRequest);
      if (timeSinceLastRequest < 1000) {
        await new Promise((resolve) => setTimeout(resolve, 1000 - timeSinceLastRequest));
      }
    }
    await redis.set(rateLimitKey, Date.now().toString(), "EX", 1);

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
    await redis.set(cacheKey, JSON.stringify(geocodeResult), "EX", 86400);

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
              dp.delivery_time_min, dp.delivery_time_max,
              dp.min_order_amount, dp.delivery_cost,
              b.name as branch_name, b.address as branch_address
       FROM delivery_polygons dp
       JOIN branches b ON dp.branch_id = b.id
       WHERE b.city_id = ? 
         AND dp.is_active = TRUE 
         AND b.is_active = TRUE
         AND ST_Contains(dp.polygon, ST_GeomFromText(?, 4326))
       ORDER BY dp.delivery_cost, dp.delivery_time_min
       LIMIT 1`,
      [city_id, point]
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
                delivery_time_min, delivery_time_max,
                min_order_amount, delivery_cost, is_active,
                gulyash_polygon_id, created_at, updated_at
         FROM delivery_polygons
         WHERE branch_id = ?
         ORDER BY name`,
      [branchId]
    );

    // Парсим GeoJSON для каждого полигона
    const parsedPolygons = polygons.map((p) => ({
      ...p,
      polygon: p.polygon ? JSON.parse(p.polygon) : null,
    }));

    res.json({ polygons: parsedPolygons });
  } catch (error) {
    next(error);
  }
});

// Создать полигон
router.post("/admin", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { branch_id, name, polygon, delivery_time_min, delivery_time_max, min_order_amount, delivery_cost } = req.body;

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

    const [result] = await db.query(
      `INSERT INTO delivery_polygons 
         (branch_id, name, polygon, delivery_time_min, delivery_time_max, 
          min_order_amount, delivery_cost)
         VALUES (?, ?, ST_GeomFromText(?, 4326), ?, ?, ?, ?)`,
      [branch_id, name || null, wkt, delivery_time_min || 30, delivery_time_max || 60, min_order_amount || 0, delivery_cost || 0]
    );

    const [newPolygon] = await db.query(
      `SELECT id, branch_id, name, 
                ST_AsGeoJSON(polygon) as polygon,
                delivery_time_min, delivery_time_max,
                min_order_amount, delivery_cost, is_active,
                gulyash_polygon_id, created_at, updated_at
         FROM delivery_polygons WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      polygon: {
        ...newPolygon[0],
        polygon: newPolygon[0].polygon ? JSON.parse(newPolygon[0].polygon) : null,
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
    const { name, polygon, delivery_time_min, delivery_time_max, min_order_amount, delivery_cost, is_active } = req.body;

    // Проверяем существование полигона и доступ
    const [polygons] = await db.query(
      `SELECT dp.id, b.city_id
         FROM delivery_polygons dp
         JOIN branches b ON dp.branch_id = b.id
         WHERE dp.id = ?`,
      [polygonId]
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
    if (delivery_time_min !== undefined) {
      updates.push("delivery_time_min = ?");
      values.push(delivery_time_min);
    }
    if (delivery_time_max !== undefined) {
      updates.push("delivery_time_max = ?");
      values.push(delivery_time_max);
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
                delivery_time_min, delivery_time_max,
                min_order_amount, delivery_cost, is_active,
                gulyash_polygon_id, created_at, updated_at
         FROM delivery_polygons WHERE id = ?`,
      [polygonId]
    );

    res.json({
      polygon: {
        ...updatedPolygon[0],
        polygon: updatedPolygon[0].polygon ? JSON.parse(updatedPolygon[0].polygon) : null,
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
      [polygonId]
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
