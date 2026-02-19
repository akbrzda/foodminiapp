import express from "express";
import db from "../../config/database.js";
import { authenticateToken, requireRole, checkCityAccess } from "../../middleware/auth.js";
import { getIikoClientOrNull } from "../integrations/services/integrationConfigService.js";
const router = express.Router();

const DAY_MAP = {
  monday: "monday",
  mon: "monday",
  понедельник: "monday",
  tuesday: "tuesday",
  tue: "tuesday",
  вторник: "tuesday",
  wednesday: "wednesday",
  wed: "wednesday",
  среда: "wednesday",
  thursday: "thursday",
  thu: "thursday",
  четверг: "thursday",
  friday: "friday",
  fri: "friday",
  пятница: "friday",
  saturday: "saturday",
  sat: "saturday",
  суббота: "saturday",
  sunday: "sunday",
  sun: "sunday",
  воскресенье: "sunday",
};

const normalizeDay = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const mapByNumber = {
      1: "monday",
      2: "tuesday",
      3: "wednesday",
      4: "thursday",
      5: "friday",
      6: "saturday",
      7: "sunday",
      0: "sunday",
    };
    return mapByNumber[value] || null;
  }
  const raw = String(value || "").trim().toLowerCase();
  if (/^\d+$/.test(raw)) {
    return normalizeDay(Number(raw));
  }
  return DAY_MAP[raw] || null;
};

const normalizeTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/(\d{1,2}):?(\d{2})/);
  if (!match) return null;
  const hours = match[1].padStart(2, "0");
  const minutes = match[2];
  return `${hours}:${minutes}`;
};

const extractPhone = (terminalGroup = {}) => {
  const directPhone =
    terminalGroup.phone ||
    terminalGroup.telephone ||
    terminalGroup.contactPhone ||
    terminalGroup.contact_phone ||
    terminalGroup.deliveryPhone ||
    terminalGroup.delivery_phone ||
    null;
  if (directPhone) return String(directPhone);

  if (Array.isArray(terminalGroup.phones)) {
    for (const item of terminalGroup.phones) {
      if (typeof item === "string" && item.trim()) return item;
      const phoneValue = item?.phone || item?.telephone || item?.number || item?.value;
      if (phoneValue) return String(phoneValue);
    }
  }

  if (Array.isArray(terminalGroup.contacts)) {
    for (const contact of terminalGroup.contacts) {
      const phone = contact?.phone || contact?.telephone;
      if (phone) return String(phone);
    }
  }

  return null;
};

const extractAddress = (terminalGroup = {}) => {
  if (typeof terminalGroup.address === "string" && terminalGroup.address.trim()) {
    return terminalGroup.address.trim();
  }

  const objectAddress =
    (terminalGroup.address && typeof terminalGroup.address === "object" && terminalGroup.address) ||
    (terminalGroup.location?.address && typeof terminalGroup.location.address === "object" && terminalGroup.location.address) ||
    null;

  if (objectAddress) {
    const fullAddress = objectAddress.fullAddress || objectAddress.text || objectAddress.formattedAddress || objectAddress.displayName;
    if (fullAddress) return String(fullAddress).trim();

    const streetName = objectAddress.street?.name || objectAddress.street;
    const cityName = objectAddress.city?.name || objectAddress.city;
    const parts = [cityName, streetName, objectAddress.house, objectAddress.building, objectAddress.flat]
      .filter((part) => String(part || "").trim())
      .map((part) => String(part).trim());
    if (parts.length > 0) return parts.join(", ");
  }

  if (terminalGroup.address && typeof terminalGroup.address === "object") {
    const fullAddress = terminalGroup.address.fullAddress || terminalGroup.address.text || terminalGroup.address.formattedAddress;
    if (fullAddress) return String(fullAddress).trim();

    const parts = [
      terminalGroup.address.street,
      terminalGroup.address.house,
      terminalGroup.address.building,
      terminalGroup.address.flat,
    ]
      .filter((part) => String(part || "").trim())
      .map((part) => String(part).trim());
    if (parts.length > 0) return parts.join(", ");
  }

  return null;
};

const extractCoordinates = (terminalGroup = {}) => {
  const lat =
    terminalGroup.latitude ??
    terminalGroup.lat ??
    terminalGroup.location?.latitude ??
    terminalGroup.location?.lat ??
    terminalGroup.coordinates?.latitude ??
    terminalGroup.coordinates?.lat ??
    null;
  const lng =
    terminalGroup.longitude ??
    terminalGroup.lng ??
    terminalGroup.location?.longitude ??
    terminalGroup.location?.lng ??
    terminalGroup.coordinates?.longitude ??
    terminalGroup.coordinates?.lng ??
    null;

  return {
    latitude: lat !== null ? Number(lat) : null,
    longitude: lng !== null ? Number(lng) : null,
  };
};

const extractWorkingHours = (terminalGroup = {}) => {
  const result = {};
  const setRange = (day, open, close) => {
    const normalizedDay = normalizeDay(day);
    const openTime = normalizeTime(open);
    const closeTime = normalizeTime(close);
    if (!normalizedDay || !openTime || !closeTime) return;
    result[normalizedDay] = `${openTime}-${closeTime}`;
  };

  const objectScheduleCandidates = [terminalGroup.workingHours, terminalGroup.schedule, terminalGroup.workTime];
  for (const candidate of objectScheduleCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    for (const [day, range] of Object.entries(candidate)) {
      if (typeof range === "string" && range.includes("-")) {
        const [open, close] = range.split("-");
        setRange(day, open, close);
      } else if (range && typeof range === "object") {
        setRange(day, range.open || range.from || range.start || range.fromTime, range.close || range.to || range.end || range.toTime);
      }
    }
  }

  const arrayCandidates = [
    ...(Array.isArray(terminalGroup.weekSchedule?.days) ? terminalGroup.weekSchedule.days : []),
    ...(Array.isArray(terminalGroup.schedule?.days) ? terminalGroup.schedule.days : []),
    ...(Array.isArray(terminalGroup.schedule) ? terminalGroup.schedule : []),
    ...(Array.isArray(terminalGroup.workingHours?.days) ? terminalGroup.workingHours.days : []),
    ...(Array.isArray(terminalGroup.workingHours) ? terminalGroup.workingHours : []),
  ];

  for (const item of arrayCandidates) {
    const day = item?.dayOfWeek || item?.day || item?.weekday;
    if (Array.isArray(item?.intervals) && item.intervals.length > 0) {
      const interval = item.intervals[0];
      setRange(day, interval?.from || interval?.start || interval?.fromTime, interval?.to || interval?.end || interval?.toTime);
      continue;
    }
    setRange(day, item?.from || item?.open || item?.start || item?.fromTime, item?.to || item?.close || item?.end || item?.toTime);
  }

  return Object.keys(result).length > 0 ? result : null;
};


const toIikoBranchView = (terminalGroup = {}, organizationNameById = new Map()) => {
  const id = String(terminalGroup.id || terminalGroup.terminalGroupId || terminalGroup.terminal_group_id || "").trim();
  if (!id) return null;
  const organizationId = String(
    terminalGroup.organizationId || terminalGroup.organization_id || terminalGroup.orgId || terminalGroup.parentOrganizationId || "",
  ).trim();
  const { latitude, longitude } = extractCoordinates(terminalGroup);
  return {
    id,
    organization_id: organizationId || null,
    organization_name: organizationNameById.get(organizationId) || null,
    name: String(terminalGroup.name || terminalGroup.title || terminalGroup.terminalGroupName || `Филиал ${id}`).trim(),
    address: extractAddress(terminalGroup),
    phone: extractPhone(terminalGroup),
    latitude,
    longitude,
    working_hours: extractWorkingHours(terminalGroup),
    raw: terminalGroup,
  };
};

router.get("/", async (req, res, next) => {
  try {
    const [cities] = await db.query(
      `SELECT id, name, iiko_city_id, latitude, longitude, timezone, is_active, created_at, updated_at
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
      `SELECT id, name, iiko_city_id, latitude, longitude, timezone, is_active, created_at, updated_at
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
              iiko_organization_id, iiko_terminal_group_id, iiko_synced_at,
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
              iiko_organization_id, iiko_terminal_group_id, iiko_synced_at,
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
        SELECT id, name, iiko_city_id, latitude, longitude, timezone, is_active, 
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
    const { name, iiko_city_id, latitude, longitude, timezone } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }
    const [result] = await db.query(
      `INSERT INTO cities (name, iiko_city_id, latitude, longitude, timezone)
         VALUES (?, ?, ?, ?, ?)`,
      [name, iiko_city_id || null, latitude || null, longitude || null, timezone || "Europe/Moscow"],
    );
    const [newCity] = await db.query(
      `SELECT id, name, iiko_city_id, latitude, longitude, timezone, is_active, 
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
    const { name, iiko_city_id, latitude, longitude, timezone, is_active } = req.body;
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
    if (iiko_city_id !== undefined) {
      updates.push("iiko_city_id = ?");
      values.push(iiko_city_id || null);
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
      `SELECT id, name, iiko_city_id, latitude, longitude, timezone, is_active, 
                created_at, updated_at
         FROM cities WHERE id = ?`,
      [cityId],
    );
    res.json({ city: updatedCity[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/iiko/address-cities", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const client = await getIikoClientOrNull();
    if (!client) {
      return res.status(400).json({ error: "Интеграция iiko выключена или не настроена" });
    }

    const cities = await client.getAddressCities({ includeDeleted: false, useConfiguredOrganization: false });
    const normalized = (Array.isArray(cities) ? cities : [])
      .map((city) => ({
        id: String(city?.id || "").trim(),
        name: String(city?.name || "").trim(),
        classifierId: String(city?.classifierId || "").trim() || null,
        isDeleted: Boolean(city?.isDeleted),
      }))
      .filter((city) => city.id && city.name);
    const uniqueById = new Map();
    for (const city of normalized) {
      if (!uniqueById.has(city.id)) {
        uniqueById.set(city.id, city);
      }
    }
    const deduplicated = [...uniqueById.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));

    return res.json({
      cities: deduplicated,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
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

router.get("/admin/iiko/unmapped-branches", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const client = await getIikoClientOrNull();
    if (!client) {
      return res.status(400).json({ error: "Интеграция iiko выключена или не настроена" });
    }

    const [organizations, terminalGroups, mappedRows] = await Promise.all([
      client.getOrganizations(),
      client.getTerminalGroups({ useConfiguredOrganization: false }),
      db.query("SELECT iiko_terminal_group_id FROM branches WHERE iiko_terminal_group_id IS NOT NULL"),
    ]);

    const organizationNameById = new Map(
      (Array.isArray(organizations) ? organizations : []).map((org) => [
        String(org?.id || org?.organizationId || org?.organization_id || "").trim(),
        String(org?.name || "Без названия").trim(),
      ]),
    );
    const mappedIds = new Set(
      (mappedRows?.[0] || [])
        .map((row) => String(row.iiko_terminal_group_id || "").trim())
        .filter(Boolean),
    );
    const unique = new Map();

    for (const terminalGroup of Array.isArray(terminalGroups) ? terminalGroups : []) {
      const branch = toIikoBranchView(terminalGroup, organizationNameById);
      if (!branch || mappedIds.has(branch.id) || unique.has(branch.id)) continue;
      unique.set(branch.id, branch);
    }

    const branches = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return res.json({ branches });
  } catch (error) {
    return next(error);
  }
});
router.get("/admin/:cityId/branches", authenticateToken, requireRole("admin", "manager", "ceo"), checkCityAccess, async (req, res, next) => {
  try {
    const cityId = req.params.cityId;
    const [branches] = await db.query(
      `SELECT id, city_id, name, address, latitude, longitude, phone, 
              working_hours, prep_time, assembly_time,
              iiko_organization_id, iiko_terminal_group_id, iiko_synced_at,
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
    const { name, address, latitude, longitude, phone, working_hours, prep_time, assembly_time, iiko_terminal_group_id, iiko_organization_id } =
      req.body;
    const [cities] = await db.query("SELECT id FROM cities WHERE id = ?", [cityId]);
    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found" });
    }

    const iikoTerminalGroupId = String(iiko_terminal_group_id || "").trim();
    if (iikoTerminalGroupId) {
      const [existsRows] = await db.query("SELECT id FROM branches WHERE iiko_terminal_group_id = ? LIMIT 1", [iikoTerminalGroupId]);
      if (existsRows.length > 0) {
        return res.status(400).json({ error: "Выбранный филиал iiko уже привязан к другому филиалу" });
      }
    }

    const branchName = String(name || "").trim();
    if (!branchName) {
      return res.status(400).json({ error: "Name is required" });
    }

    const branchAddress = address || null;
    const branchPhone = phone || null;
    const branchLatitude = latitude || null;
    const branchLongitude = longitude || null;
    const branchWorkingHours = working_hours || null;
    const branchIikoOrganizationId = String(iiko_organization_id || "").trim() || null;
    const branchIikoTerminalGroupId = iikoTerminalGroupId || null;
    const branchIikoSyncedAt = branchIikoTerminalGroupId ? new Date() : null;

    const [result] = await db.query(
      `INSERT INTO branches 
         (city_id, name, address, latitude, longitude, phone, working_hours, prep_time, assembly_time,
          iiko_organization_id, iiko_terminal_group_id, iiko_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cityId,
        branchName,
        branchAddress,
        branchLatitude,
        branchLongitude,
        branchPhone,
        branchWorkingHours ? JSON.stringify(branchWorkingHours) : null,
        prep_time || 0,
        assembly_time || 0,
        branchIikoOrganizationId,
        branchIikoTerminalGroupId,
        branchIikoSyncedAt,
      ],
    );
    const [newBranch] = await db.query(
      `SELECT id, city_id, name, address, latitude, longitude, phone, 
                working_hours, prep_time, assembly_time,
                iiko_organization_id, iiko_terminal_group_id, iiko_synced_at,
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
      const {
        name,
        address,
        latitude,
        longitude,
        phone,
        working_hours,
        prep_time,
        assembly_time,
        is_active,
        iiko_terminal_group_id,
        iiko_organization_id,
      } = req.body;
      const [branches] = await db.query("SELECT id, iiko_terminal_group_id FROM branches WHERE id = ? AND city_id = ?", [branchId, cityId]);
      if (branches.length === 0) {
        return res.status(404).json({ error: "Branch not found" });
      }
      const currentBranch = branches[0];
      const updates = [];
      const values = [];

      const incomingIikoTerminalGroupId = String(iiko_terminal_group_id || "").trim();

      if (incomingIikoTerminalGroupId) {
        const [duplicateRows] = await db.query("SELECT id FROM branches WHERE iiko_terminal_group_id = ? AND id <> ? LIMIT 1", [
          incomingIikoTerminalGroupId,
          branchId,
        ]);
        if (duplicateRows.length > 0) {
          return res.status(400).json({ error: "Выбранный филиал iiko уже привязан к другому филиалу" });
        }
        updates.push("iiko_terminal_group_id = ?");
        values.push(incomingIikoTerminalGroupId);
        updates.push("iiko_synced_at = NOW()");
      } else if (iiko_terminal_group_id === null || iiko_terminal_group_id === "") {
        updates.push("iiko_terminal_group_id = NULL");
        updates.push("iiko_organization_id = NULL");
        updates.push("iiko_synced_at = NULL");
      }

      if (iiko_organization_id !== undefined) {
        updates.push("iiko_organization_id = ?");
        values.push(String(iiko_organization_id || "").trim() || null);
      }

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
                iiko_organization_id, iiko_terminal_group_id, iiko_synced_at,
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
