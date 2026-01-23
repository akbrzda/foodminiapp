import express from "express";
import redis from "../config/redis.js";
import axios from "axios";
const router = express.Router();
router.post("/", async (req, res, next) => {
  try {
    const { address } = req.body;
    if (!address || typeof address !== "string" || address.trim().length === 0) {
      return res.status(400).json({
        error: "address is required and must be a non-empty string",
      });
    }
    const cacheKey = `geocode:${Buffer.from(address.trim().toLowerCase()).toString("base64")}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    const rateLimitKey = "geocode:ratelimit";
    const lastRequest = await redis.get(rateLimitKey);
    if (lastRequest) {
      const timeSinceLastRequest = Date.now() - parseInt(lastRequest);
      if (timeSinceLastRequest < 1000) {
        await new Promise((resolve) => setTimeout(resolve, 1000 - timeSinceLastRequest));
      }
    }
    await redis.set(rateLimitKey, Date.now().toString(), "EX", 1);
    const nominatimUrl = "https://nominatim.openstreetmap.org/search";
    const response = await axios.get(nominatimUrl, {
      params: {
        q: address.trim(),
        format: "json",
        limit: 1,
        addressdetails: 1,
      },
      headers: {
        "User-Agent": "MiniappPanda/1.0 (Food Delivery Service)",
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
    await redis.set(cacheKey, JSON.stringify(geocodeResult), "EX", 86400);
    res.json(geocodeResult);
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
export default router;
