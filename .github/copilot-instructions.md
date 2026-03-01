# FoodMiniApp - Instructions for AI Agents

## Language and Documentation

- **All code, comments, commits, and documentation are written in Russian**
- Always read existing documentation before starting a task (`README.md`, `docs/`, `TASKS.md`)
- Comment only important code blocks, not every line
- Using third-party libraries without user approval is prohibited
- Tailwind CSS Documentation: https://tailwindcss.com/docs
- Shadcn UI Documentation: https://ui.shadcn.com/docs
- Lucide Icons: https://lucide.dev/guide/packages/lucide-vue-next
- Vue 3 Documentation: https://vuejs.org/guide/introduction.html

## Project Architecture

Monorepo consisting of three main components:

### Backend (`backend/`)

- **Stack**: Node.js (Express), MySQL 8.0, Redis, BullMQ
- **Pattern**: REST API + WebSocket for real-time
- **Structure**: `/src/routes` → `/src/services` → `/src/utils`
- **Workers**: BullMQ workers in `/src/workers` for background tasks (bonus expiration, level recalculation, birthday bonuses)

### Admin Panel (`admin-panel/`)

- **Stack**: Vue 3 + Vite + Tailwind CSS
- **Icons**: **Only `lucide-vue-next`** (using others is prohibited)
- **UI Components**: Shadcn UI
- **Store**: Pinia (`/src/stores`)
- **Routing**: Vue Router with role checks (`admin`, `ceo`, `manager`)
- Always responsive design for mobile devices
- Pagination, filters, and sorting for tables with large amounts of data
- Always follow Tailwind and Shadcn UI documentation when creating interfaces and adhere to dark and light themes
- For all async data loading, loading states via `Skeleton` (Shadcn) are mandatory, not empty blocks/sudden UI jumps

### Telegram MiniApp (`telegram-miniapp/`)

- **Stack**: Vue 3 + Vite + Tailwind CSS
- **API**: Integration with backend via `/src/api/client.js`
- **Icons**: **Only `lucide-vue-next`** (using others is prohibited)

### Database Migrations

**Mandatory rule**: when creating a migration **always** update `backend/database/schema.sql`:

```bash
# 1. Create migration file: backend/database/migrations/number_description.sql
# 2. Apply migration: cd backend && npm run migrate
# 3. Update schema.sql manually with the same changes
```

Migrations are executed via `backend/src/scripts/migrate.js`, which tracks executed migrations in the `migrations` table.

## Git Workflow

Ниже — версия правил, которую можно напрямую вставить в инструкцию агента. Формулировка жёсткая и однозначная, чтобы не было двойных трактовок.

---

## CHANGELOG.md Maintenance

### Criteria for Significant Changes:

✅ **Add**:

- New features/modules
- API endpoint changes
- DB migrations with new tables
- Critical security fixes
- Breaking changes
- New integrations (payments, delivery, etc.)

❌ **Don't Add**:

- Minor UI changes (sizes, paddings, colors)
- Refactoring without functional changes
- Typo fixes
- Dependency updates without functional changes
- Comment changes

**Entry Format**:

```markdown
## [YYYY-MM-DD]

### Added

- Promotions and promo codes module with rule configuration
- Integration with Stripe payment system

### Changed

- Bonus API now returns transaction history
- Updated loyalty level calculation algorithm

### Fixed

- Critical error in birthday bonus accrual
- Issue with order duplication on slow internet
```

## TASKS.md Management

### Task Management Rules:

1. **Before a new task**: If all tasks are completed — **clear the file completely**
2. **Structure**: Break down task into subtasks with checkboxes `[ ]`
3. **Statuses**: `[ ]` → `[x]` → delete completed blocks as they finish
4. **Detailing**: Specify affected files and components
5. **Relevance**: Keep only the current task and its subtasks in the file

**Example TASKS.md structure**:

```markdown
# Current Task: Add Promotions System

## Backend

- [ ] Create migration `001_create_promotions_table.sql`
  - Fields: id, code, discount_type, value, min_order_amount, max_uses, valid_from, valid_until
- [ ] Update `schema.sql` with new table
- [ ] Add routes in `src/routes/promotions.js`
  - GET /api/promotions - list all promotions
  - POST /api/promotions - create promotion
  - PUT /api/promotions/:id - update
  - DELETE /api/promotions/:id - delete
- [ ] Implement service `src/services/promotionService.js`
  - validatePromoCode() - promo code validation
  - applyDiscount() - apply discount to order
  - checkUsageLimit() - check usage limit

## Admin Panel

- [ ] Component `PromotionList.vue` - promotion list with filtering
- [ ] Form `PromotionForm.vue` - create/edit promotion
- [ ] Update navigation in `Sidebar.vue`
- [ ] Add route `/promotions` in router

## Telegram MiniApp

- [ ] Add promo code input field in `CheckoutView.vue`
- [ ] Show applied discount in total amount
```

## Using MCP Context7

- **Always run** `mcp context7` before starting work on a task
- Study the context of related files before making changes
- Don't improvise without understanding the existing architecture
- Use context to understand dependencies between modules

## Code Commenting

### Rules:

❌ **DON'T Comment the Obvious**:

```javascript
// Get user
const user = await User.findById(id);
// Check existence
if (!user) return null;
// Return user
return user;
```

✅ **CORRECT — Comment Important Logic**:

```javascript
// Business logic: award bonuses only to active users with level > 1
// This prevents system abuse through fake accounts
if (user.status === "active" && user.level > 1) {
  await bonusService.award(user.id, amount);
}

// WORKAROUND: Telegram API sometimes returns null instead of empty string
// TODO: Remove after updating telegram-bot-api to v7.0
const username = telegramUser.username || "";
```

### Comment Only:

- Complex business logic that's not obvious from code
- Non-obvious algorithms and mathematical calculations
- Workarounds and technical debt (with TODO/FIXME labels)
- API contracts in JSDoc format for public functions
- Reasons for choosing a specific approach if not obvious

## Service Management

### Before Running Commands:

1. **Check Active Terminals**: Read output of all open terminals
2. **Determine Service Status**:
   - Backend: Is `http://localhost:3000` accessible?
   - Admin Panel: Is `http://localhost:5173` accessible?
   - Telegram MiniApp: Is `http://localhost:5174` accessible?
   - MySQL: Is port 3306 listening?
   - Redis: Is port 6379 listening?
3. **Don't Duplicate Launches**: If service is running — don't start again
4. **Don't Create New Terminals**: Use existing open terminals

### Launch Commands (only if service is NOT running):

```bash
# Backend (from project root)
cd backend && npm run dev

# Admin Panel (from project root)
cd admin-panel && npm run dev

# Telegram MiniApp (from project root)
cd telegram-miniapp && npm run dev

# MySQL (via Docker, from project root)
docker-compose up -d mysql

# Redis (via Docker, from project root)
docker-compose up -d redis
```

### Status Check:

```bash
# Check running Node.js processes
ps aux | grep node

# Check ports
netstat -tulpn | grep -E '3000|5173|5174|3306|6379'

# Check Docker containers
docker ps
```

## Dependency Management

### Before Installing a New Library:

1. **MUST ask user permission**
2. Explain why the library is needed and what alternatives exist
3. Check if a solution isn't already installed in the project
4. Ensure the library is actively maintained (last commit < 6 months ago)

### After Installation:

- Update `package.json` description if new major functionality added
- Add to `.env.example` if environment variables are required

### Prohibited:

❌ Install libraries "just in case"  
❌ Duplicate functionality of existing dependencies  
❌ Use deprecated or unmaintained packages  
❌ Install libraries with known security vulnerabilities

## Error Handling

### Backend (Express)

```javascript
// ✅ Correct: uniform response format
try {
  const result = await service.doSomething();
  res.json({ success: true, data: result });
} catch (error) {
  console.error("Error in doSomething:", error);
  res.status(500).json({
    success: false,
    error: "Failed to perform operation. Please try again later.",
  });
}

// ✅ Input data validation
const { code, discount } = req.body;
if (!code || !discount) {
  return res.status(400).json({
    success: false,
    error: "Required fields: code, discount",
  });
}
```

### Frontend (Vue)

```javascript
// ✅ Correct: show toast with error and log details
import { toast } from "@/components/ui/toast";

try {
  const data = await api.fetchOrders();
  orders.value = data;
} catch (error) {
  // Show user-friendly message
  toast.error(error.response?.data?.error || "Failed to load orders");
  // Log full information for debugging
  console.error("Order loading error:", error);
}
```

### Logging:

- `console.error()` — for errors (remain in production)
- `console.warn()` — for warnings (remain in production)
- `console.log()` — only for debugging (**remove before commit**)

## API Standards

### Uniform Response Format:

**Success**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Example"
  }
}
```

**Error**:

```json
{
  "success": false,
  "error": "User-friendly error message"
}
```

**Pagination**:

```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Product 1" },
    { "id": 2, "name": "Product 2" }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

### HTTP Status Codes:

- `200` — successful request
- `201` — new resource created
- `400` — input validation error
- `401` — not authenticated (no token)
- `403` — no access rights (token exists but wrong role)
- `404` — resource not found
- `500` — internal server error

## Component Naming & Structure (Vue)

### Naming Convention:

- **PascalCase** for components: `UserCard.vue`, `OrderList.vue`, `PromotionForm.vue`
- **camelCase** for methods and variables: `fetchOrders()`, `handleSubmit()`, `isLoading`
- **UPPER_SNAKE_CASE** for constants: `API_BASE_URL`, `MAX_ITEMS_PER_PAGE`, `DEFAULT_LIMIT`

### Component File Structure:

```vue
<script setup>
// 1. Imports
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import api from "@/api/client";

// 2. Props
const props = defineProps({
  userId: {
    type: Number,
    required: true,
  },
});

// 3. Emits
const emit = defineEmits(["update", "delete"]);

// 4. State
const isLoading = ref(false);
const orders = ref([]);

// 5. Computed
const filteredOrders = computed(() => {
  return orders.value.filter((o) => o.status === "active");
});

// 6. Methods
const fetchData = async () => {
  isLoading.value = true;
  try {
    const data = await api.fetchOrders(props.userId);
    orders.value = data;
  } catch (error) {
    console.error("Fetch error:", error);
  } finally {
    isLoading.value = false;
  }
};

// 7. Lifecycle
onMounted(() => {
  fetchData();
});
</script>

<template>
  <div class="p-4">
    <!-- Use Skeleton for loading -->
    <Skeleton v-if="isLoading" class="h-32" />

    <!-- Main content -->
    <div v-else>
      <!-- No more than 4 nesting levels -->
    </div>
  </div>
</template>

<style scoped>
/* Only if custom styles are needed */
/* Try to use Tailwind classes */
</style>
```

### Component Size:

- **< 300 lines** — normal, all good
- **300-500 lines** — consider splitting into sub-components
- **> 500 lines** — **MUST** split into logical parts

**Splitting Example**:

```
// ❌ Bad: one large file 800 lines
UserProfile.vue

// ✅ Good: logical separation
components/user/
  ├── UserProfile.vue        (150 lines - main component)
  ├── UserInfo.vue           (100 lines - user information)
  ├── UserStats.vue          (120 lines - statistics)
  ├── UserOrders.vue         (180 lines - order list)
  └── UserSettings.vue       (150 lines - settings)
```

## Database Query Optimization

### Field Selection:

```javascript
// ✅ Correct: select only needed fields
const users = await query("SELECT id, name, email, level FROM users WHERE status = ?", ["active"]);

// ❌ Wrong: SELECT * loads all fields (including unnecessary)
const users = await query("SELECT * FROM users WHERE status = ?", ["active"]);
```

### Indexes in Migrations:

When creating a migration **always** add indexes for:

- Foreign keys (relationships between tables)
- Fields in WHERE conditions
- Fields for sorting (ORDER BY)
- Fields for search (LIKE)

```sql
-- Example migration with indexes
CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Indexes for query optimization
  INDEX idx_user_id (user_id),           -- for WHERE user_id = ?
  INDEX idx_status (status),             -- for WHERE status = ?
  INDEX idx_created_at (created_at),     -- for ORDER BY created_at
  INDEX idx_user_status (user_id, status) -- composite for WHERE user_id = ? AND status = ?
);
```

### Avoid N+1 Problem:

```javascript
// ❌ Bad: N+1 queries (1 order query + N user queries)
const orders = await query("SELECT * FROM orders LIMIT 100");
for (const order of orders) {
  order.user = await query("SELECT * FROM users WHERE id = ?", [order.user_id]);
}

// ✅ Good: one query with JOIN
const orders = await query(`
  SELECT 
    o.id, o.total_amount, o.status, o.created_at,
    u.id as user_id, u.name as user_name, u.email as user_email
  FROM orders o
  LEFT JOIN users u ON o.user_id = u.id
  LIMIT 100
`);
```

### Pagination:

```javascript
// ✅ Always use LIMIT and OFFSET for large tables
const page = parseInt(req.query.page) || 1;
const limit = parseInt(req.query.limit) || 20;
const offset = (page - 1) * limit;

const orders = await query("SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?", [limit, offset]);

// Don't forget total count for pagination
const [{ total }] = await query("SELECT COUNT(*) as total FROM orders");
```

## Environment Variables

### Rules:

1. **NEVER** commit `.env` files to git
2. **Always** update `.env.example` when adding new variables
3. Document each variable with comments
4. Group variables by meaning (Database, Redis, JWT, External Services)

### .env.example Format:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=foodminiapp
DB_USER=root
DB_PASSWORD=your_secure_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Authentication
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/webhook

# Email Service (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Application
NODE_ENV=development
PORT=3000
```

### Code Validation:

```javascript
// ✅ Validate required variables on application start
const requiredEnvVars = ["DB_HOST", "DB_USER", "DB_PASSWORD", "JWT_SECRET", "TELEGRAM_BOT_TOKEN"];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`❌ Missing required environment variable: ${varName}`);
    process.exit(1);
  }
}

console.log("✅ All environment variables loaded");
```

## Pre-Commit Checklist

### Check Before Saving Changes:

- [ ] No `console.log()` for debugging (only `console.error` and `console.warn`)
- [ ] All imports are used (no unused imports)
- [ ] No commented code (delete or explain why left)
- [ ] Checked `null`/`undefined` (use optional chaining `?.`)
- [ ] Input validation on backend (check req.body, req.params, req.query)
- [ ] Loading states for async operations (Skeleton components)
- [ ] Error handling for all API calls (try/catch with toast notifications)
- [ ] Responsive design checked (320px, 768px, 1024px)
- [ ] Accessibility: `alt` for images, `label` for inputs, ARIA attributes
- [ ] No code duplication (extract to `utils/`, `composables/`, or separate components)
- [ ] Updated `COMMIT.md` with change description
- [ ] If migration — updated `schema.sql`
- [ ] If major change — added entry to `CHANGELOG.md`

## File Organization

### Maximum File Sizes:

- **Vue components**: 500 lines → split into parts
- **Services/Utils**: 300 lines → split by logic
- **API Routes**: 200 lines → extract business logic to services

### File Splitting Rule:

If file exceeds limit — split it into logical parts:

```
// ❌ Bad: everything in one file
services/orderService.js (800 lines)

// ✅ Good: logical separation
services/order/
  ├── orderService.js          (150 lines - main service)
  ├── orderValidator.js        (100 lines - validation)
  ├── orderCalculator.js       (120 lines - calculations)
  └── orderNotifications.js    (150 lines - notifications)
```

### File Naming:

- **Vue Components**: `PascalCase.vue` (UserProfile.vue, OrderCard.vue)
- **Composables**: `use*.js` (useAuth.js, useOrders.js, useCart.js)
- **Utils**: `camelCase.js` (dateFormatter.js, validator.js, priceCalculator.js)
- **Stores (Pinia)**: `*Store.js` (authStore.js, orderStore.js, cartStore.js)
- **API clients**: `*Api.js` or `*Client.js` (ordersApi.js, usersApi.js)

## Testing

### Backend API:

- When adding new endpoint — add request examples in Postman/Thunder Client
- Check all possible HTTP statuses (200, 400, 401, 403, 404, 500)
- Check validation: send requests with invalid data

### Database:

- When creating migration — test on clean schema
- Check migration rollback if provided
- Ensure indexes are created correctly

### Frontend UI:

- For UI changes check different resolutions:
  - Mobile: 320px, 375px, 414px
  - Tablet: 768px, 1024px
  - Desktop: 1280px, 1920px
- Check dark and light themes
- Check states: loading, error, empty state, success

## Performance

### Avoid:

❌ N+1 database queries (use JOIN or batch queries)  
❌ Loading all records without pagination (always LIMIT + OFFSET)  
❌ Missing indexes on frequently used fields  
❌ Synchronous operations in API routes (use BullMQ workers for long tasks)  
❌ Large components without lazy loading  
❌ No caching for frequent queries

### Use:

✅ `LIMIT` and `OFFSET` for large table pagination  
✅ Redis for caching frequent queries (e.g., menu, settings)  
✅ Debounce for search fields (minimum 300ms delay)  
✅ Lazy loading for large Vue components  
✅ Indexes on fields in WHERE, ORDER BY, JOIN conditions  
✅ BullMQ workers for sending emails, processing images, generating reports

## Security

### Mandatory Rules:

- **Always** validate input data on backend (don't trust frontend)
- **Never** log passwords, tokens, API keys, personal data
- Use `bcrypt` for password hashing (minimum 10 rounds)
- Check roles before accessing protected routes
- Sanitize SQL queries (use parameterized queries, not string concatenation)
- Use HTTPS in production
- Set rate limiting for API endpoints (brute-force protection)
- Store JWT tokens in httpOnly cookies (not in localStorage)

### Examples:

```javascript
// ✅ Correct: parameterized query
const user = await query("SELECT * FROM users WHERE email = ?", [email]);

// ❌ Wrong: SQL injection vulnerability
const user = await query(`SELECT * FROM users WHERE email = '${email}'`);

// ✅ Correct: validation before processing
if (!validator.isEmail(email)) {
  return res.status(400).json({ success: false, error: "Invalid email format" });
}

// ✅ Correct: role check
if (!["admin", "ceo"].includes(req.user.role)) {
  return res.status(403).json({ success: false, error: "Access denied" });
}
```

## Quick Documentation Links

Use these links when working with specific technologies:

### Frontend

- [Vue 3 Composition API](https://vuejs.org/api/composition-api-setup.html)
- [Tailwind CSS Classes](https://tailwindcss.com/docs/utility-first)
- [Shadcn Vue Components](https://www.shadcn-vue.com/docs/components/accordion.html)
- [Lucide Icons Search](https://lucide.dev/icons/)
- [Pinia Store](https://pinia.vuejs.org/core-concepts/)
- [Vue Router](https://router.vuejs.org/guide/)

### Backend

- [Express Routing](https://expressjs.com/en/guide/routing.html)
- [Express Middleware](https://expressjs.com/en/guide/using-middleware.html)
- [MySQL 8.0 Reference](https://dev.mysql.com/doc/refman/8.0/en/)
- [BullMQ Guide](https://docs.bullmq.io/guide/jobs)
- [Redis Commands](https://redis.io/commands/)

### Tools

- [Vite Config](https://vitejs.dev/config/)
- [Docker Compose](https://docs.docker.com/compose/)
- [Postman Documentation](https://learning.postman.com/docs/getting-started/introduction/)

## Key Project Files

### Documentation:

- `README.md` — detailed documentation of loyalty system and all modules
- `docs/bonus.md` — complete technical specification of bonus system
- `docs/menu.md` — complete technical specification of menu management
- `docs/doc.md` — complete project technical specification
- `TASKS.md` — current tasks and work plan
- `COMMIT.md` — accumulated changes for next commit
- `CHANGELOG.md` — history of significant project changes

### Database:

- `backend/database/schema.sql` — current DB schema (updated with migrations)
- `backend/database/migrations/` — DB migration files

### Configuration:

- `.env.example` — environment variables template
- `docker-compose.yml` — Docker services configuration

## Prohibited

❌ Create unnecessary files after completing task  
❌ Use icons other than `lucide-vue-next`  
❌ Ignore updating `schema.sql` during migrations  
❌ Comment every line of code  
❌ Start services without checking if they're running  
❌ Open new terminals for each command  
❌ Run `npm run build`  
❌ Install libraries without user permission  
❌ Commit `.env` files  
❌ Use `console.log()` in production code

## Good Practices

✅ First check output of all available terminals, if service not running — then start  
✅ Always execute terminal commands from root folder of corresponding service  
✅ Always follow technical documentation and don't improvise without approval  
✅ If file exceeds 500 lines — split it into multiple files logically  
✅ In any new or modified UI screen with API loading, add `Skeleton` for all key data blocks  
✅ Use `try/catch` for all async operations  
✅ Add backend validation for all input data  
✅ Check responsive design on mobile devices  
✅ Document complex business logic in comments  
✅ Update `COMMIT.md` after each significant update  
✅ Use uniform API response format (`{success, data/error}`)
