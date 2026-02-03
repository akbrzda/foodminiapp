import express from "express";
import db from "../../config/database.js";
import { authenticateToken, requireRole, checkCityAccess } from "../../middleware/auth.js";
const router = express.Router();
router.get("/", async (req, res, next) => {
  try {
    const [cities] = await db.query(
      `SELECT id, name, latitude, longitude, timezone, is_active, created_at, updated_at
       FROM cities
       WHERE is_active = TRUE
       ORDER BY name`,
    );
    res.json({ cities });
  } catch (error) {
    next(error);
  }
});
router.get("/:id", async (req, res, next) => {
  try {
    const cityId = req.params.id;
    const [cities] = await db.query(
      `SELECT id, name, latitude, longitude, timezone, is_active, created_at, updated_at
       FROM cities
       WHERE id = ? AND is_active = TRUE`,
      [cityId],
    );
    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found" });
    }
    res.json({ city: cities[0] });
  } catch (error) {
    next(error);
  }
});
router.get("/:id/branches", async (req, res, next) => {
  try {
    const cityId = req.params.id;
    const [branches] = await db.query(
      `SELECT id, city_id, name, address, latitude, longitude, phone, 
              working_hours, prep_time, assembly_time,
              is_active, created_at, updated_at
       FROM branches
       WHERE city_id = ? AND is_active = TRUE
       ORDER BY name`,
      [cityId],
    );
    res.json({ branches });
  } catch (error) {
    next(error);
  }
});
router.get("/:cityId/branches/:branchId", async (req, res, next) => {
  try {
    const { cityId, branchId } = req.params;
    const [branches] = await db.query(
      `SELECT id, city_id, name, address, latitude, longitude, phone, 
              working_hours, prep_time, assembly_time,
              is_active, created_at, updated_at
       FROM branches
       WHERE id = ? AND city_id = ? AND is_active = TRUE`,
      [branchId, cityId],
    );
    if (branches.length === 0) {
      return res.status(404).json({ error: "Branch not found" });
    }
    res.json({ branch: branches[0] });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/all", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    let query = `
        SELECT id, name, latitude, longitude, timezone, is_active, 
               created_at, updated_at
        FROM cities
      `;
    const params = [];
    if (req.user.role === "manager") {
      query += " WHERE id IN (?)";
      params.push(req.user.cities);
    }
    query += " ORDER BY name";
    const [cities] = await db.query(query, params);
    res.json({ cities });
  } catch (error) {
    next(error);
  }
});
router.post("/admin", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { name, latitude, longitude, timezone } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }
    const [result] = await db.query(
      `INSERT INTO cities (name, latitude, longitude, timezone)
         VALUES (?, ?, ?, ?)`,
      [name, latitude || null, longitude || null, timezone || "Europe/Moscow"],
    );
    const [newCity] = await db.query(
      `SELECT id, name, latitude, longitude, timezone, is_active, 
                created_at, updated_at
         FROM cities WHERE id = ?`,
      [result.insertId],
    );
    res.status(201).json({ city: newCity[0] });
  } catch (error) {
    next(error);
  }
});
router.put("/admin/:id", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const cityId = req.params.id;
    const { name, latitude, longitude, timezone, is_active } = req.body;
    const [cities] = await db.query("SELECT id FROM cities WHERE id = ?", [cityId]);
    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found" });
    }
    const updates = [];
    const values = [];
    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (latitude !== undefined) {
      updates.push("latitude = ?");
      values.push(latitude);
    }
    if (longitude !== undefined) {
      updates.push("longitude = ?");
      values.push(longitude);
    }
    if (timezone !== undefined) {
      updates.push("timezone = ?");
      values.push(timezone);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    values.push(cityId);
    await db.query(`UPDATE cities SET ${updates.join(", ")} WHERE id = ?`, values);
    const [updatedCity] = await db.query(
      `SELECT id, name, latitude, longitude, timezone, is_active, 
                created_at, updated_at
         FROM cities WHERE id = ?`,
      [cityId],
    );
    res.json({ city: updatedCity[0] });
  } catch (error) {
    next(error);
  }
});
router.delete("/admin/:id", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const cityId = req.params.id;
    const [cities] = await db.query("SELECT id FROM cities WHERE id = ?", [cityId]);
    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found" });
    }
    const [branches] = await db.query("SELECT COUNT(*) as count FROM branches WHERE city_id = ?", [cityId]);
    if (branches[0].count > 0) {
      return res.status(400).json({
        error: "Cannot delete city with branches. Delete branches first.",
      });
    }
    await db.query("DELETE FROM cities WHERE id = ?", [cityId]);
    res.json({ message: "City deleted successfully" });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/:cityId/branches", authenticateToken, requireRole("admin", "manager", "ceo"), checkCityAccess, async (req, res, next) => {
  try {
    const cityId = req.params.cityId;
    const [branches] = await db.query(
      `SELECT id, city_id, name, address, latitude, longitude, phone, 
              working_hours, prep_time, assembly_time,
              is_active, created_at, updated_at
         FROM branches
         WHERE city_id = ?
         ORDER BY name`,
      [cityId],
    );
    res.json({ branches });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/:cityId/branches", authenticateToken, requireRole("admin", "manager", "ceo"), checkCityAccess, async (req, res, next) => {
  try {
    const cityId = req.params.cityId;
    const { name, address, latitude, longitude, phone, working_hours, prep_time, assembly_time } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }
    const [cities] = await db.query("SELECT id FROM cities WHERE id = ?", [cityId]);
    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found" });
    }
    const [result] = await db.query(
      `INSERT INTO branches 
         (city_id, name, address, latitude, longitude, phone, working_hours, prep_time, assembly_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cityId,
        name,
        address || null,
        latitude || null,
        longitude || null,
        phone || null,
        working_hours ? JSON.stringify(working_hours) : null,
        prep_time || 0,
        assembly_time || 0,
      ],
    );
    const [newBranch] = await db.query(
      `SELECT id, city_id, name, address, latitude, longitude, phone, 
                working_hours, prep_time, assembly_time,
                is_active, created_at, updated_at
         FROM branches WHERE id = ?`,
      [result.insertId],
    );
    res.status(201).json({ branch: newBranch[0] });
  } catch (error) {
    next(error);
  }
});
router.put(
  "/admin/:cityId/branches/:branchId",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  checkCityAccess,
  async (req, res, next) => {
    try {
      const { cityId, branchId } = req.params;
      const { name, address, latitude, longitude, phone, working_hours, prep_time, assembly_time, is_active } = req.body;
      const [branches] = await db.query("SELECT id FROM branches WHERE id = ? AND city_id = ?", [branchId, cityId]);
      if (branches.length === 0) {
        return res.status(404).json({ error: "Branch not found" });
      }
      const updates = [];
      const values = [];
      if (name !== undefined) {
        updates.push("name = ?");
        values.push(name);
      }
      if (address !== undefined) {
        updates.push("address = ?");
        values.push(address);
      }
      if (latitude !== undefined) {
        updates.push("latitude = ?");
        values.push(latitude);
      }
      if (longitude !== undefined) {
        updates.push("longitude = ?");
        values.push(longitude);
      }
      if (phone !== undefined) {
        updates.push("phone = ?");
        values.push(phone);
      }
      if (working_hours !== undefined) {
        updates.push("working_hours = ?");
        values.push(JSON.stringify(working_hours));
      }
      if (prep_time !== undefined) {
        updates.push("prep_time = ?");
        values.push(prep_time);
      }
      if (assembly_time !== undefined) {
        updates.push("assembly_time = ?");
        values.push(assembly_time);
      }
      if (is_active !== undefined) {
        updates.push("is_active = ?");
        values.push(is_active);
      }
      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }
      values.push(branchId);
      await db.query(`UPDATE branches SET ${updates.join(", ")} WHERE id = ?`, values);
      const [updatedBranch] = await db.query(
        `SELECT id, city_id, name, address, latitude, longitude, phone, 
                working_hours, prep_time, assembly_time,
                is_active, created_at, updated_at
         FROM branches WHERE id = ?`,
        [branchId],
      );
      res.json({ branch: updatedBranch[0] });
    } catch (error) {
      next(error);
    }
  },
);
router.delete(
  "/admin/:cityId/branches/:branchId",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  checkCityAccess,
  async (req, res, next) => {
    try {
      const { cityId, branchId } = req.params;
      const [branches] = await db.query("SELECT id FROM branches WHERE id = ? AND city_id = ?", [branchId, cityId]);
      if (branches.length === 0) {
        return res.status(404).json({ error: "Branch not found" });
      }
      await db.query("DELETE FROM branches WHERE id = ?", [branchId]);
      res.json({ message: "Branch deleted successfully" });
    } catch (error) {
      next(error);
    }
  },
);
export default router;
