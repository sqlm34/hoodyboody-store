const http = require("http");
const https = require("https");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Server: SocketServer } = require("socket.io");
const { createOrderController } = require("./controllers/orderController");
const { createAdminOrderRouter } = require("./routes/adminOrderRoutes");
const { createStripeWebhookRouter } = require("./routes/stripeWebhookRoutes");
const {
  createShippoService,
  normalizeProductShippingFields,
  saveSelectedShippingOption,
  validateProductShippingFields
} = require("./services/shippoService");
const { sendOrderStatusEmail } = require("./services/emailService");
const {
  DEFAULT_CHANNEL_ID,
  getPushConfigurationStatus,
  isPushConfigured,
  publicPushToken,
  removePushToken,
  sendChatPushNotifications,
  sendTestPush,
  upsertPushToken
} = require("./services/pushNotifications");
let PgPool = null;
let StsClient = null;
let AssumeRoleWithWebIdentityCommand = null;
let RdsSigner = null;

function loadLocalEnv() {
  const envPath = path.resolve(__dirname, ".env");
  if (!fs.existsSync(envPath)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...valueParts] = line.split("=");
        const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
        return [key.trim(), value];
      })
  );
}

const localEnv = loadLocalEnv();
const root = __dirname;
const port = Number(process.env.PORT) || 8000;
const adminEmail = process.env.NITKA_ADMIN_EMAIL || localEnv.NITKA_ADMIN_EMAIL || "owner@nitka.local";
const adminPassword = process.env.NITKA_ADMIN_PASSWORD || localEnv.NITKA_ADMIN_PASSWORD || "owner123";
const chatAdminToken = process.env.CHAT_ADMIN_TOKEN || localEnv.CHAT_ADMIN_TOKEN || "";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || localEnv.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || localEnv.STRIPE_WEBHOOK_SECRET || "";
const stripeCurrency = String(process.env.STRIPE_CURRENCY || localEnv.STRIPE_CURRENCY || "usd").toLowerCase();
const shippoApiKey = process.env.SHIPPO_API_KEY || localEnv.SHIPPO_API_KEY || "";
const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || localEnv.UPSTASH_REDIS_REST_URL || localEnv.KV_REST_API_URL || "";
const redisRestToken =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || localEnv.UPSTASH_REDIS_REST_TOKEN || localEnv.KV_REST_API_TOKEN || "";
const redisDbKey = process.env.NITKA_REDIS_DB_KEY || localEnv.NITKA_REDIS_DB_KEY || "nitka:db";
const hasRedisDb = Boolean(redisRestUrl && redisRestToken);
const maxJsonBodyBytes = 8_500_000;
const maxProductImageBytes = 2_500_000;
const maxChatAttachmentBytes = 8_500_000;
const defaultChatSettings = {
  chatColor: "#1f6b5a",
  accentColor: "#263b73",
  timeColor: "#59616a",
  pushColor: "#1f6b5a",
  logoText: "HOODYBOODY",
  logoImage: "",
  welcomeText: "Ask us about size, delivery or your order."
};
const postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || localEnv.DATABASE_URL || localEnv.POSTGRES_URL || "";
const postgresPassword = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || localEnv.PGPASSWORD || localEnv.POSTGRES_PASSWORD || "";
const hasAwsIamPostgres = Boolean(
  process.env.PGHOST &&
    process.env.PGDATABASE &&
    process.env.PGUSER &&
    process.env.AWS_ROLE_ARN &&
    process.env.AWS_REGION &&
    process.env.VERCEL_OIDC_TOKEN
);
const hasPostgresDb = Boolean(
  postgresUrl ||
    (process.env.PGHOST &&
      process.env.PGDATABASE &&
      process.env.PGUSER &&
      (postgresPassword || hasAwsIamPostgres))
);
const postgresDbKey = process.env.NITKA_POSTGRES_DB_KEY || localEnv.NITKA_POSTGRES_DB_KEY || "default";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;
const productDiscountThreshold = 20000;
const productDiscountRate = 0.1;
const shippingOrigin = {
  name: process.env.SHIPPING_FROM_NAME || localEnv.SHIPPING_FROM_NAME || "HOODYBOODY",
  street1: process.env.SHIPPING_FROM_STREET1 || localEnv.SHIPPING_FROM_STREET1 || "6463 Bayside South Drive",
  street2: process.env.SHIPPING_FROM_STREET2 || localEnv.SHIPPING_FROM_STREET2 || "",
  city: process.env.SHIPPING_FROM_CITY || localEnv.SHIPPING_FROM_CITY || "Indianapolis",
  state: process.env.SHIPPING_FROM_STATE || localEnv.SHIPPING_FROM_STATE || "IN",
  zip: process.env.SHIPPING_FROM_ZIP || localEnv.SHIPPING_FROM_ZIP || "46250",
  country: "US",
  phone: process.env.SHIPPING_FROM_PHONE || localEnv.SHIPPING_FROM_PHONE || "4153334444",
  email: process.env.SHIPPING_FROM_EMAIL || localEnv.SHIPPING_FROM_EMAIL || adminEmail
};
const checkoutShippoService = createShippoService({ apiKey: shippoApiKey, shippingOrigin });
const defaultShippingByType = {
  accessories: {
    weight_value: 10,
    weight_unit: "oz",
    length: 12,
    width: 10,
    height: 2,
    dimension_unit: "in",
    package_type: "soft_pack",
    required: true
  },
  default: {
    weight_value: 18,
    weight_unit: "oz",
    length: 15,
    width: 12,
    height: 3,
    dimension_unit: "in",
    package_type: "soft_pack",
    required: true
  }
};
const defaultInventory = {
  "linen-jacket": 12,
  "cotton-hoodie": 18,
  "denim-shirt": 9,
  "canvas-tote": 24,
  "linen-shirt": 14,
  "soft-bomber": 6
};
const DEFAULT_PRODUCT_IMAGE = "assets/tshirt.webp";
const defaultProducts = [
  {
    id: "linen-jacket",
    title: "Linen Jacket Iris",
    type: "outerwear",
    badge: "linen",
    description: "Loose silhouette, iris embroidery on the front and cuff.",
    price: 12900,
    sizes: ["XS", "S", "M", "L"],
    focus: "38% 45%",
    image: DEFAULT_PRODUCT_IMAGE,
    colors: [
      { name: "Milky", value: "#f3eadb" },
      { name: "Sage", value: "#7f9b89" },
      { name: "Black", value: "#202326" }
    ],
    longDescription:
      "Light linen jacket with soft fit and iris embroidery. Suitable for capsule wardrobe, summer events and everyday looks.",
    gallery: [
      { label: "General view", focus: "38% 45%" },
      { label: "Embroidery", focus: "32% 36%" },
      { label: "Texture", focus: "48% 61%" }
    ]
  },
  {
    id: "cotton-hoodie",
    title: "Hoodie Herbarium",
    type: "tops",
    badge: "cotton",
    description: "Dense fleece, sage twig and small monogram.",
    price: 7900,
    sizes: ["S", "M", "L", "XL"],
    focus: "56% 35%",
    image: DEFAULT_PRODUCT_IMAGE,
    colors: [
      { name: "Graphite", value: "#3d4248" },
      { name: "Milky", value: "#f3eadb" },
      { name: "Pine", value: "#1f6b5a" }
    ],
    longDescription:
      "Hoodie from dense cotton fleece with botanical embroidery and small monogram. Holds shape well and remains soft after washing.",
    gallery: [
      { label: "General view", focus: "56% 35%" },
      { label: "Embroidery", focus: "60% 43%" },
      { label: "Hood", focus: "51% 29%" }
    ]
  },
  {
    id: "denim-shirt",
    title: "Shirt Indigo",
    type: "tops",
    badge: "denim",
    description: "Contrast stitches, embroidery on pocket and collar.",
    price: 9200,
    sizes: ["S", "M", "L"],
    focus: "72% 52%",
    image: DEFAULT_PRODUCT_IMAGE,
    colors: [
      { name: "Indigo", value: "#263b73" },
      { name: "White", value: "#f7f7f2" },
      { name: "Terracotta", value: "#c65a43" }
    ],
    longDescription:
      "Shirt from soft denim with contrast embroidery on pocket and collar. Accent piece for everyday look.",
    gallery: [
      { label: "General view", focus: "72% 52%" },
      { label: "Pocket", focus: "68% 43%" },
      { label: "Collar", focus: "75% 34%" }
    ]
  },
  {
    id: "canvas-tote",
    title: "Shopper Bloom",
    type: "accessories",
    badge: "canvas",
    description: "Dense shopper with botanical motif and initials.",
    price: 4200,
    sizes: ["One size"],
    focus: "44% 68%",
    image: DEFAULT_PRODUCT_IMAGE,
    colors: [
      { name: "Natural", value: "#d8c6a1" },
      { name: "Black", value: "#202326" },
      { name: "Terracotta", value: "#c65a43" }
    ],
    longDescription:
      "Shopper from dense canvas with botanical motif. Holds laptop, documents and daily items.",
    gallery: [
      { label: "General view", focus: "44% 68%" },
      { label: "Embroidery", focus: "39% 62%" },
      { label: "Handles", focus: "49% 52%" }
    ]
  },
  {
    id: "linen-shirt",
    title: "Shirt Meadow",
    type: "tops",
    badge: "shirt",
    description: "Light linen shirt with embroidery along the placket line.",
    price: 8700,
    sizes: ["XS", "S", "M", "L", "XL"],
    focus: "28% 58%",
    image: DEFAULT_PRODUCT_IMAGE,
    colors: [
      { name: "White", value: "#f7f7f2" },
      { name: "Sky", value: "#9bbbd0" },
      { name: "Pine", value: "#1f6b5a" }
    ],
    longDescription:
      "Linen shirt with embroidery along the placket line. Breathable fabric, loose fit and calm decorative accent.",
    gallery: [
      { label: "General view", focus: "28% 58%" },
      { label: "Placket", focus: "31% 48%" },
      { label: "Cuff", focus: "23% 67%" }
    ]
  },
  {
    id: "soft-bomber",
    title: "Bomber Thread",
    type: "outerwear",
    badge: "capsule",
    description: "Soft bomber with large motif on the back to order.",
    price: 14800,
    sizes: ["S", "M", "L"],
    focus: "64% 62%",
    image: DEFAULT_PRODUCT_IMAGE,
    colors: [
      { name: "Black", value: "#202326" },
      { name: "Indigo", value: "#263b73" },
      { name: "Milky", value: "#f3eadb" }
    ],
    longDescription:
      "Soft bomber with large embroidery on the back to order. You can adapt the motif, scale and placement.",
    gallery: [
      { label: "General view", focus: "64% 62%" },
      { label: "Back", focus: "66% 55%" },
      { label: "Cuff", focus: "58% 72%" }
    ]
  }
];
const defaultCategories = [
  {
    id: "outerwear",
    title: "Jackets",
    eyebrow: "outerwear",
    description: "Layered linen, bomber and denim pieces with embroidery that holds the whole look together.",
    image: "assets/embroidered-collection.png",
    focus: "38% 45%",
    background: "linear-gradient(135deg, #e9f0ea 0%, #f6eee1 100%)",
    sortOrder: 10
  },
  {
    id: "tops",
    title: "Tops",
    eyebrow: "tops",
    description: "Hoodies and shirts with clean stitched details for everyday wear and custom styling.",
    image: "assets/embroidered-collection.png",
    focus: "56% 35%",
    background: "linear-gradient(135deg, #edf1f7 0%, #f7f0eb 100%)",
    sortOrder: 20
  },
  {
    id: "accessories",
    title: "Accessories",
    eyebrow: "accessories",
    description: "Small embroidered pieces that finish the outfit without feeling loud.",
    image: "assets/embroidered-collection.png",
    focus: "44% 68%",
    background: "linear-gradient(135deg, #f4efe7 0%, #e8f2ef 100%)",
    sortOrder: 30
  }
];
const emptyDb = {
  users: [],
  sessions: [],
  orders: [],
  reviews: [],
  inventory: {},
  inventoryLog: [],
  pendingStripeOrders: [],
  products: [],
  productImages: {},
  categories: [],
  chatConversations: [],
  chatMessages: [],
  chatPushTokens: [],
  chatSettings: JSON.parse(JSON.stringify(defaultChatSettings))
};
const memoryDb = process.env.NITKA_DB_PATH === ":memory:" || (process.env.VERCEL && !hasRedisDb && !hasPostgresDb) ? JSON.parse(JSON.stringify(emptyDb)) : null;
const dbPath = memoryDb ? "" : path.resolve(root, process.env.NITKA_DB_PATH || "data/db.json");
const dataDir = memoryDb ? "" : path.dirname(dbPath);
const sessionCookie = "nitka_session";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".apk": "application/vnd.android.package-archive"
};
const noIndexHeader = { "X-Robots-Tag": "noindex, nofollow, noarchive" };

function ensureDb() {
  if (memoryDb) return;
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(emptyDb, null, 2));
  }
}

function getDefaultProductShipping(product = {}) {
  return JSON.parse(JSON.stringify(defaultShippingByType[product.type] || defaultShippingByType.default));
}

function ensureProductShippingDefaults(product = {}) {
  const isDigital = product.isDigital === true || String(product.type || "").toLowerCase() === "digital";
  const current = normalizeProductShippingFields(product);
  const fallback = getDefaultProductShipping(product);

  product.isDigital = isDigital;
  product.shipping = {
    weight_value: current.weight_value || fallback.weight_value,
    weight_unit: current.weight_unit || fallback.weight_unit,
    length: current.length || fallback.length,
    width: current.width || fallback.width,
    height: current.height || fallback.height,
    dimension_unit: current.dimension_unit || fallback.dimension_unit,
    package_type: current.package_type || fallback.package_type,
    required: !isDigital
  };

  return product;
}

function ensureDbDefaults(db) {
  let changed = false;

  db.users ||= [];
  db.sessions ||= [];
  db.orders ||= [];
  db.reviews ||= [];
  db.inventory ||= {};
  db.inventoryLog ||= [];
  db.pendingStripeOrders ||= [];
  db.products ||= [];
  db.productImages ||= {};
  db.chatConversations ||= [];
  db.chatMessages ||= [];
  db.chatPushTokens ||= [];
  db.chatSettings = sanitizeChatSettings(db.chatSettings || {});
  [
    "seoGlobalSettings",
    "seoEntries",
    "seoTemplates",
    "seoRedirects",
    "seoCodeSnippets",
    "seoAuditLogs",
    "mediaSeo",
    "seoSitemap"
  ].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(db, key)) {
      delete db[key];
      changed = true;
    }
  });
  if (!Object.prototype.hasOwnProperty.call(db, "categories")) {
    db.categories = JSON.parse(JSON.stringify(defaultCategories));
    changed = true;
  } else if (!Array.isArray(db.categories)) {
    db.categories = [];
    changed = true;
  }

  const categoriesBefore = JSON.stringify(db.categories);
  db.categories = db.categories
    .map((category, index) => sanitizeCategory(category, category))
    .filter((category) => category.category)
    .map(({ category }, index) => ({ ...category, sortOrder: Number.isFinite(Number(category.sortOrder)) ? Number(category.sortOrder) : (index + 1) * 10 }));
  if (categoriesBefore !== JSON.stringify(db.categories)) changed = true;
  db.categories.forEach((category) => {
    if (Object.prototype.hasOwnProperty.call(category, "seoTitle")) {
      delete category.seoTitle;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(category, "seoDescription")) {
      delete category.seoDescription;
      changed = true;
    }
  });

  if (!db.products.length) {
    db.products = JSON.parse(JSON.stringify(defaultProducts));
    changed = true;
  } else {
    defaultProducts.forEach((defaultProduct) => {
      const product = db.products.find((item) => item.id === defaultProduct.id);
      if (!product) {
        db.products.push(JSON.parse(JSON.stringify(defaultProduct)));
        changed = true;
        return;
      }

      Object.entries(defaultProduct).forEach(([key, value]) => {
        if (product[key] === undefined) {
          product[key] = JSON.parse(JSON.stringify(value));
          changed = true;
        }
      });
    });
  }

  db.products.forEach((product) => {
    if (Object.prototype.hasOwnProperty.call(product, "seoTitle")) {
      delete product.seoTitle;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(product, "seoDescription")) {
      delete product.seoDescription;
      changed = true;
    }
    const before = JSON.stringify(product.shipping || {});
    const beforeDigital = product.isDigital;
    ensureProductShippingDefaults(product);
    if (before !== JSON.stringify(product.shipping || {}) || beforeDigital !== product.isDigital) changed = true;
  });

  Object.entries(defaultInventory).forEach(([productId, stock]) => {
    if (!db.inventory[productId]) {
      db.inventory[productId] = {
        stock,
        updatedAt: new Date().toISOString(),
        updatedBy: "system"
      };
      changed = true;
    } else if (typeof db.inventory[productId] === "number") {
      db.inventory[productId] = {
        stock: db.inventory[productId],
        updatedAt: new Date().toISOString(),
        updatedBy: "migration"
      };
      changed = true;
    }
  });

  const ownerEmail = normalizeEmail(adminEmail);
  const owner = db.users.find((user) => user.email === ownerEmail);

  if (owner) {
    if (owner.role !== "admin") {
      owner.role = "admin";
      changed = true;
    }
  } else {
    const salt = crypto.randomBytes(16).toString("hex");
    db.users.push({
      id: crypto.randomUUID(),
      name: "Store Owner",
      phone: "",
      email: ownerEmail,
      role: "admin",
      passwordSalt: salt,
      passwordHash: hashPassword(adminPassword, salt),
      address: {},
      createdAt: new Date().toISOString()
    });
    changed = true;
  }

  db.users.forEach((user) => {
    if (!user.role) {
      user.role = user.email === ownerEmail ? "admin" : "customer";
      changed = true;
    }
  });

  return changed;
}

function readDb() {
  if (memoryDb) {
    ensureDbDefaults(memoryDb);
    return JSON.parse(JSON.stringify(memoryDb));
  }
  ensureDb();
  const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  if (ensureDbDefaults(db)) {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  }
  return db;
}

function writeDb(db) {
  ensureDbDefaults(db);

  if (memoryDb) {
    memoryDb.users = db.users;
    memoryDb.sessions = db.sessions;
    memoryDb.orders = db.orders;
    memoryDb.reviews = db.reviews;
    memoryDb.inventory = db.inventory;
    memoryDb.inventoryLog = db.inventoryLog;
    memoryDb.pendingStripeOrders = db.pendingStripeOrders;
    memoryDb.products = db.products;
    memoryDb.productImages = db.productImages;
    memoryDb.categories = db.categories;
    memoryDb.chatConversations = db.chatConversations;
    memoryDb.chatMessages = db.chatMessages;
    memoryDb.chatPushTokens = db.chatPushTokens;
    return;
  }

  ensureDb();
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

async function redisCommand(command) {
  const response = await fetch(redisRestUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisRestToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || "Persistent database request failed.");
  }

  return data.result;
}

async function readDbAsync() {
  if (hasRedisDb) {
    const stored = await redisCommand(["GET", redisDbKey]);
    const db = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(emptyDb));

    if (ensureDbDefaults(db) || !stored) {
      await writeDbAsync(db);
    }

    return db;
  }

  if (hasPostgresDb) return readPgDb();
  return readDb();
}

async function writeDbAsync(db) {
  if (hasRedisDb) {
    ensureDbDefaults(db);
    await redisCommand(["SET", redisDbKey, JSON.stringify(db)]);
    return;
  }

  if (hasPostgresDb) {
    await writePgDb(db);
    return;
  }

  writeDb(db);
}

let pgPool = null;
let pgReady = false;
let awsCredentialsCache = null;
let awsCredentialsExpiresAt = 0;

async function getAwsIamCredentials() {
  if (awsCredentialsCache && awsCredentialsExpiresAt > Date.now() + 60_000) return awsCredentialsCache;
  if (!StsClient) {
    ({ STSClient: StsClient, AssumeRoleWithWebIdentityCommand } = require("@aws-sdk/client-sts"));
  }

  const sts = new StsClient({ region: process.env.AWS_REGION });
  const response = await sts.send(
    new AssumeRoleWithWebIdentityCommand({
      RoleArn: process.env.AWS_ROLE_ARN,
      RoleSessionName: "nitka-store-vercel",
      WebIdentityToken: process.env.VERCEL_OIDC_TOKEN,
      DurationSeconds: 900
    })
  );
  const credentials = response.Credentials;

  awsCredentialsCache = {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.SessionToken
  };
  awsCredentialsExpiresAt = credentials.Expiration ? new Date(credentials.Expiration).getTime() : Date.now() + 10 * 60 * 1000;
  return awsCredentialsCache;
}

async function getPostgresPassword() {
  if (postgresPassword) return postgresPassword;
  if (!hasAwsIamPostgres) return "";
  if (!RdsSigner) {
    ({ Signer: RdsSigner } = require("@aws-sdk/rds-signer"));
  }

  const signer = new RdsSigner({
    region: process.env.AWS_REGION,
    hostname: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    username: process.env.PGUSER,
    credentials: await getAwsIamCredentials()
  });

  return signer.getAuthToken();
}

function getPgPool() {
  if (pgPool) return pgPool;
  if (!PgPool) PgPool = require("pg").Pool;

  pgPool = postgresUrl
    ? new PgPool({
        connectionString: postgresUrl,
        ssl: { rejectUnauthorized: false }
      })
    : new PgPool({
        host: process.env.PGHOST || localEnv.PGHOST,
        port: Number(process.env.PGPORT || localEnv.PGPORT || 5432),
        database: process.env.PGDATABASE || localEnv.PGDATABASE,
        user: process.env.PGUSER || localEnv.PGUSER,
        password: getPostgresPassword,
        ssl: String(process.env.PGSSLMODE || localEnv.PGSSLMODE || "").toLowerCase() === "disable" ? false : { rejectUnauthorized: false }
      });

  return pgPool;
}

async function ensurePgDb() {
  if (pgReady) return;
  await getPgPool().query(`
    create table if not exists nitka_store_db (
      key text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
  pgReady = true;
}

async function readPgDb() {
  await ensurePgDb();
  const result = await getPgPool().query("select data from nitka_store_db where key = $1", [postgresDbKey]);
  const db = result.rows[0]?.data || JSON.parse(JSON.stringify(emptyDb));

  if (ensureDbDefaults(db) || !result.rows[0]) {
    await writePgDb(db);
  }

  return db;
}

async function writePgDb(db) {
  await ensurePgDb();
  ensureDbDefaults(db);
  await getPgPool().query(
    `
      insert into nitka_store_db (key, data, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (key)
      do update set data = excluded.data, updated_at = now()
    `,
    [postgresDbKey, JSON.stringify(db)]
  );
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...noIndexHeader,
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function isChatApiPath(pathname = "") {
  return pathname === "/api/chat/bootstrap" || pathname.startsWith("/api/chat/") || pathname.startsWith("/api/admin/chat/");
}

function chatCorsHeaders(req) {
  const origin = req.headers.origin || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-chat-admin-token, x-chat-client-token",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function sendChatJson(req, res, status, payload, headers = {}) {
  sendJson(res, status, payload, {
    ...chatCorsHeaders(req),
    ...headers
  });
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [key, ...value] = item.split("=");
        return [key, decodeURIComponent(value.join("="))];
      })
  );
}

function readJson(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bodyBytes = 0;

    req.on("data", (chunk) => {
      body += chunk;
      bodyBytes += chunk.length;
      if (bodyBytes > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role || "customer",
    address: user.address || {},
    createdAt: user.createdAt
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeLoginIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhoneIdentifier(value) {
  return String(value || "").replace(/\D/g, "");
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function makeSession(db, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + sessionMaxAgeSeconds * 1000;
  db.sessions = db.sessions.filter((session) => session.expiresAt > Date.now());
  db.sessions.push({ token, userId, expiresAt });
  return token;
}

function sessionHeader(token) {
  return {
    "Set-Cookie": `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMaxAgeSeconds}`
  };
}

function clearSessionHeader() {
  return {
    "Set-Cookie": `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  };
}

function getSessionUser(req, db) {
  const token = parseCookies(req)[sessionCookie];
  if (!token) return null;

  const session = db.sessions.find((item) => item.token === token && item.expiresAt > Date.now());
  if (!session) return null;

  return db.users.find((user) => user.id === session.userId) || null;
}

function getOrderNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `NITKA-${stamp}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

function getTrackingInfo(deliveryType) {
  if (deliveryType === "pickup") {
    return {
      company: "Store pickup",
      number: "",
      url: "",
      status: "Ready for pickup"
    };
  }

  const number = `CDEK-${crypto.randomInt(100000000, 999999999)}`;

  return {
    company: "CDEK",
    number,
    url: `https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(number)}`,
    status: "Shipped"
  };
}

function publicReview(review) {
  if (!review) return null;

  return {
    id: review.id,
    productId: review.productId,
    userName: review.userName,
    rating: review.rating,
    text: review.text,
    createdAt: review.createdAt
  };
}

function getReviewSummary(reviews) {
  const summary = {};

  reviews.forEach((review) => {
    if (!review.productId) return;

    summary[review.productId] ||= { count: 0, total: 0, average: 0 };
    summary[review.productId].count += 1;
    summary[review.productId].total += Number(review.rating) || 0;
  });

  Object.values(summary).forEach((item) => {
    item.average = item.count ? Number((item.total / item.count).toFixed(1)) : 0;
    delete item.total;
  });

  return summary;
}

function isAdmin(user) {
  return user?.role === "admin" || user?.role === "superadmin";
}

function hasChatAdminToken(value) {
  if (!chatAdminToken) return false;
  const received = Buffer.from(String(value || ""));
  const expected = Buffer.from(chatAdminToken);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function hasChatAdminAccess(req, db) {
  const token = req.headers["x-chat-admin-token"];
  return isAdmin(getSessionUser(req, db)) || hasChatAdminToken(Array.isArray(token) ? token[0] : token);
}

function normalizeChatText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 1200);
}

function normalizeChatCustomer(payload = {}, user = null) {
  return {
    name: String(payload.name || user?.name || "Customer").trim().slice(0, 80) || "Customer",
    email: normalizeEmail(payload.email || user?.email || ""),
    phone: String(payload.phone || user?.phone || "").trim().slice(0, 40)
  };
}

function sanitizeHexColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function sanitizeChatSettings(input = {}, current = defaultChatSettings) {
  return {
    chatColor: sanitizeHexColor(input.chatColor, current.chatColor || defaultChatSettings.chatColor),
    accentColor: sanitizeHexColor(input.accentColor, current.accentColor || defaultChatSettings.accentColor),
    timeColor: sanitizeHexColor(input.timeColor, current.timeColor || defaultChatSettings.timeColor),
    pushColor: sanitizeHexColor(input.pushColor, current.pushColor || defaultChatSettings.pushColor),
    logoText: String(input.logoText || current.logoText || defaultChatSettings.logoText).trim().slice(0, 60) || defaultChatSettings.logoText,
    logoImage: sanitizeChatLogo(input.logoImage || current.logoImage || ""),
    welcomeText: String(input.welcomeText || current.welcomeText || defaultChatSettings.welcomeText).trim().slice(0, 180) || defaultChatSettings.welcomeText
  };
}

function sanitizeChatLogo(value) {
  const logo = String(value || "").trim();
  if (!logo) return "";
  if (/^https?:\/\/[\w.-]/i.test(logo)) return logo.slice(0, 900);
  if (/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(logo) && Buffer.byteLength(logo, "utf8") <= maxChatAttachmentBytes) return logo;
  return "";
}

function publicChatSettings(settings = {}) {
  return sanitizeChatSettings(settings);
}

function createChatClientToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashChatClientToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function readChatClientToken(req, payload = {}, url = null) {
  const headerToken = req?.headers?.["x-chat-client-token"];
  return String(payload.clientToken || (Array.isArray(headerToken) ? headerToken[0] : headerToken) || url?.searchParams?.get("clientToken") || "").trim();
}

function canAccessCustomerChat(conversation, user, clientToken) {
  if (!conversation) return false;
  if (user?.id && conversation.userId && conversation.userId === user.id) return true;
  if (!clientToken || !conversation.clientTokenHash) return false;
  return conversation.clientTokenHash === hashChatClientToken(clientToken);
}

function findCustomerChatConversation(db, conversationId, user, clientToken) {
  const requestedId = String(conversationId || "").trim();
  let conversation = requestedId ? db.chatConversations.find((item) => item.id === requestedId) : null;
  if (conversation && canAccessCustomerChat(conversation, user, clientToken)) return conversation;
  if (requestedId) return null;

  if (user?.id) {
    return db.chatConversations
      .slice()
      .filter((item) => item.userId === user.id)
      .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt || b.createdAt) - new Date(a.lastMessageAt || a.updatedAt || a.createdAt))[0] || null;
  }

  return null;
}

function ensureCustomerChatConversation(db, payload = {}, user = null) {
  const customer = normalizeChatCustomer(payload.customer || payload, user);
  let clientToken = String(payload.clientToken || "").trim();
  let conversation = findCustomerChatConversation(db, payload.conversationId, user, clientToken);

  if (conversation) {
    conversation.customer = {
      ...(conversation.customer || {}),
      ...Object.fromEntries(Object.entries(customer).filter(([, value]) => value))
    };
    if (user?.id && !conversation.userId) conversation.userId = user.id;
    conversation.updatedAt = new Date().toISOString();
    return { conversation, clientToken };
  }

  clientToken = createChatClientToken();
  const now = new Date().toISOString();
  conversation = {
    id: crypto.randomUUID(),
    userId: user?.id || "",
    clientTokenHash: hashChatClientToken(clientToken),
    customer,
    status: "open",
    unreadAdmin: 0,
    unreadCustomer: 0,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    lastMessageText: ""
  };

  db.chatConversations.push(conversation);
  return { conversation, clientToken };
}

function normalizeChatAttachments(value = []) {
  const input = Array.isArray(value) ? value : value ? [value] : [];
  return input
    .map((attachment) => {
      const name = String(attachment.name || "Attachment").trim().slice(0, 120);
      const type = String(attachment.type || "").trim().slice(0, 120);
      const dataUrl = String(attachment.dataUrl || "").trim();
      const size = Math.max(0, Math.min(Number(attachment.size || 0) || 0, maxChatAttachmentBytes));

      if (!/^data:[\w.+-]+\/[\w.+-]+;base64,/i.test(dataUrl)) return null;
      if (Buffer.byteLength(dataUrl, "utf8") > maxChatAttachmentBytes) return null;
      return { id: crypto.randomUUID(), kind: "file", name, type, dataUrl, size };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function publicChatMessage(message) {
  if (!message) return null;

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderType: message.senderType,
    senderName: message.senderName,
    text: message.text,
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    createdAt: message.createdAt
  };
}

function publicChatConversation(conversation, db, options = {}) {
  if (!conversation) return null;

  const messages = db.chatMessages.filter((message) => message.conversationId === conversation.id);
  const lastMessage = messages[messages.length - 1] || null;

  return {
    id: conversation.id,
    customer: conversation.customer || {},
    status: conversation.status || "open",
    unreadAdmin: Number(conversation.unreadAdmin || 0),
    unreadCustomer: Number(conversation.unreadCustomer || 0),
    lastMessageText: conversation.lastMessageText || lastMessage?.text || "",
    lastMessageAt: conversation.lastMessageAt || lastMessage?.createdAt || conversation.createdAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    clientToken: options.clientToken || undefined,
    messages: options.withMessages ? messages.map(publicChatMessage) : undefined
  };
}

function ensureChatConversation(db, payload = {}, user = null) {
  const requestedId = String(payload.conversationId || "").trim();
  const existing = requestedId ? db.chatConversations.find((conversation) => conversation.id === requestedId) : null;
  const customer = normalizeChatCustomer(payload.customer || payload, user);

  if (existing) {
    existing.customer = {
      ...(existing.customer || {}),
      ...Object.fromEntries(Object.entries(customer).filter(([, value]) => value))
    };
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  const now = new Date().toISOString();
  const conversation = {
    id: crypto.randomUUID(),
    customer,
    status: "open",
    unreadAdmin: 0,
    unreadCustomer: 0,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    lastMessageText: ""
  };

  db.chatConversations.push(conversation);
  return conversation;
}

function addChatMessage(db, conversation, senderType, text, senderName = "", attachments = []) {
  const cleanText = normalizeChatText(text);
  const cleanAttachments = normalizeChatAttachments(attachments);
  if (!cleanText && !cleanAttachments.length) return null;

  const now = new Date().toISOString();
  const fallbackText = cleanAttachments.length
    ? "File attachment"
    : "";
  const message = {
    id: crypto.randomUUID(),
    conversationId: conversation.id,
    senderType,
    senderName: String(senderName || (senderType === "admin" ? "HOODYBOODY" : conversation.customer?.name || "Customer")).slice(0, 80),
    text: cleanText,
    attachments: cleanAttachments,
    createdAt: now
  };

  db.chatMessages.push(message);
  conversation.lastMessageAt = now;
  conversation.lastMessageText = cleanText || fallbackText;
  conversation.updatedAt = now;
  if (senderType === "admin") conversation.unreadCustomer = Number(conversation.unreadCustomer || 0) + 1;
  if (senderType === "customer") conversation.unreadAdmin = Number(conversation.unreadAdmin || 0) + 1;
  return message;
}

function markChatRead(conversation, readerType) {
  if (!conversation) return;
  if (readerType === "admin") conversation.unreadAdmin = 0;
  if (readerType === "customer") conversation.unreadCustomer = 0;
  conversation.updatedAt = new Date().toISOString();
}

let chatIo = null;

function emitChatUpdate(db, conversation, message = null) {
  if (!chatIo || !conversation) return;

  const payload = {
    conversation: publicChatConversation(conversation, db),
    message: publicChatMessage(message)
  };

  chatIo.to(`chat:${conversation.id}`).emit("chat:message", payload);
  chatIo.to("chat:admins").emit("chat:conversation", payload);
}

async function notifyChatAdmins(db, conversation, message) {
  try {
    const result = await sendChatPushNotifications(db, conversation, message, { logger: console, color: db.chatSettings?.pushColor });
    if (result.changed) await writeDbAsync(db);
    return result;
  } catch (error) {
    console.warn(`[push] Chat push failed: ${error.message || error}`);
    return { sent: 0, failed: 1, changed: false };
  }
}

function publicInventory(inventory) {
  return Object.fromEntries(
    Object.entries(inventory || {}).map(([productId, item]) => {
      const stock = typeof item === "number" ? item : item.stock;

      return [
        productId,
        {
          stock: Math.max(0, Number(stock) || 0),
          updatedAt: item.updatedAt || "",
          updatedBy: item.updatedBy || ""
        }
      ];
    })
  );
}

function slugifyCategoryId(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || `category-${Date.now().toString(36)}`;
}

function sanitizeCategory(body = {}, currentCategory = {}) {
  const id = slugifyCategoryId(currentCategory.id || body.id || body.title);
  const title = String(body.title || currentCategory.title || "").trim().slice(0, 90);
  const eyebrow = String(body.eyebrow || currentCategory.eyebrow || title || "collection").trim().slice(0, 40);
  const description = String(body.description || currentCategory.description || "").trim().slice(0, 360);
  const image = String(body.image || currentCategory.image || "assets/embroidered-collection.png").trim().slice(0, 500);
  const focus = String(body.focus || currentCategory.focus || "center").trim().slice(0, 40);
  const background = String(body.background || currentCategory.background || "linear-gradient(135deg, #f7f8f5 0%, #e4eee8 100%)")
    .trim()
    .slice(0, 220);
  const sortOrder = Math.round(Number(body.sortOrder ?? currentCategory.sortOrder ?? 100));

  if (!id || !title || !description) {
    return { category: null, message: "Fill category title and description." };
  }

  return {
    category: {
      id,
      title,
      eyebrow,
      description,
      image,
      focus,
      background,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100
    }
  };
}

function publicCategory(category) {
  return sanitizeCategory(category, category).category;
}

function publicCategories(db) {
  return (Array.isArray(db.categories) ? db.categories : [])
    .map(publicCategory)
    .filter(Boolean)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || a.title.localeCompare(b.title));
}

function publicProduct(product) {
  const normalizedProduct = ensureProductShippingDefaults({ ...product, shipping: { ...(product.shipping || {}) } });

  return {
    id: normalizedProduct.id,
    title: normalizedProduct.title,
    type: normalizedProduct.type,
    badge: normalizedProduct.badge,
    description: normalizedProduct.description,
    price: normalizedProduct.price,
    sizes: Array.isArray(normalizedProduct.sizes) ? normalizedProduct.sizes : [],
    focus: normalizedProduct.focus || "center",
    image: normalizedProduct.image || DEFAULT_PRODUCT_IMAGE,
    imageName: normalizedProduct.imageName || "",
    colors: Array.isArray(normalizedProduct.colors) ? normalizedProduct.colors : [],
    longDescription: normalizedProduct.longDescription || normalizedProduct.description,
    gallery: Array.isArray(normalizedProduct.gallery) ? normalizedProduct.gallery : [],
    isDigital: normalizedProduct.isDigital === true,
    shipping: normalizedProduct.shipping
  };
}

function publicProducts(db) {
  const products = Array.isArray(db.products) && db.products.length ? db.products : defaultProducts;
  return products.map(publicProduct);
}

function getProduct(productId, db) {
  return publicProducts(db).find((product) => product.id === productId) || null;
}

function getProductLookup(db) {
  return Object.fromEntries(publicProducts(db).map((product) => [product.id, product]));
}

function parseList(value, fallback = []) {
  const items = Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
  return items.length ? items : fallback;
}

function slugifyProductId(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52);

  return slug || `product-${Date.now().toString(36)}`;
}

function sanitizeProductPatch(body, currentProduct) {
  const price = Math.round(Number(body.price));
  let shippingValidation;

  try {
    shippingValidation = validateProductShippingFields({
      ...currentProduct,
      ...body,
      isDigital: String(body.isDigital || body.digital || "false") === "true",
      shipping: {
        ...(currentProduct.shipping || {}),
        weight_value: body.weight_value,
        weight_unit: body.weight_unit,
        length: body.length,
        width: body.width,
        height: body.height,
        dimension_unit: body.dimension_unit,
        package_type: body.package_type
      }
    });
  } catch (error) {
    return { product: null, message: error.message };
  }

  const next = {
    ...currentProduct,
    title: String(body.title || "").trim().slice(0, 120),
    type: String(body.type || "").trim().slice(0, 40),
    badge: String(body.badge || "").trim().slice(0, 40),
    description: String(body.description || "").trim().slice(0, 260),
    longDescription: String(body.longDescription || "").trim().slice(0, 1200),
    image: String(body.image || "").trim().slice(0, 500),
    focus: String(body.focus || "center").trim().slice(0, 40),
    price,
    isDigital: shippingValidation.isDigital,
    shipping: shippingValidation.shipping,
    sizes: parseList(body.sizes, currentProduct.sizes),
    gallery: parseList(body.galleryLabels, []).map((label, index) => ({
      label,
      focus: parseList(body.galleryFocus, [])[index] || currentProduct.gallery?.[index]?.focus || nextFocusFallback(body.focus)
    }))
  };

  if (!next.title || !next.description || !next.longDescription || !Number.isInteger(price) || price < 0) {
    return { product: null, message: "Fill product title, descriptions, and price correctly." };
  }

  if (!next.gallery.length) {
    next.gallery = Array.isArray(currentProduct.gallery) && currentProduct.gallery.length ? currentProduct.gallery : [{ label: "General view", focus: next.focus }];
  }

  return { product: next };
}

function nextFocusFallback(focus) {
  return String(focus || "center").trim().slice(0, 40) || "center";
}

function parseProductImageDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > maxProductImageBytes) return null;

  return {
    mimeType: match[1].toLowerCase(),
    buffer
  };
}

function getImageExtension(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function getProductImageIdFromUrl(imageUrl) {
  const prefix = "/api/product-images/";
  const value = String(imageUrl || "");
  if (!value.startsWith(prefix)) return "";
  return decodeURIComponent(value.slice(prefix.length).split(/[?#]/)[0]);
}

function safeFileName(value, extension) {
  const base = String(value || "product-photo")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "product-photo"}.${extension}`;
}

function getStripeUnitAmount(price) {
  return Math.round(Number(price) || 0);
}

function getRequestOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  return req.headers.origin || `${proto}://${req.headers.host}`;
}

function escapeHtmlAttribute(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });
}

function absoluteUrl(req, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return `${getRequestOrigin(req).replace(/\/$/, "")}/${text.replace(/^\//, "")}`;
}

function readContentJson(fileName, fallback) {
  try {
    const contentPath = path.join(root, "content", fileName);
    return JSON.parse(fs.readFileSync(contentPath, "utf8"));
  } catch {
    return fallback;
  }
}

function getProductPageContent() {
  return readContentJson("product-pages.json", { pages: [] });
}

function stripTrailingSlash(value) {
  const text = String(value || "/").replace(/\/+$/, "");
  return text || "/";
}

function normalizeCleanHref(value) {
  const text = String(value || "").trim();
  if (!text) return "/";
  if (/^https?:\/\//i.test(text)) return text;
  return text.startsWith("/") ? text : `/${text}`;
}

function jsonLdScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

function renderSiteTopbar() {
  return `
    <header class="topbar checkout-topbar" aria-label="Site navigation">
      <a class="brand" href="/" aria-label="HOODYBOODY">
        <span class="brand-mark">HB</span>
        <span>HOODYBOODY</span>
      </a>
      <nav class="nav-links" aria-label="Site sections"></nav>
      <div class="top-actions">
        <a class="account-pill login-link" href="/auth.html" hidden>Login</a>
        <a class="account-pill cabinet-link" href="/account.html" hidden>Cabinet</a>
        <a class="account-pill admin-link" href="/admin.html" hidden>Owner</a>
        <button class="account-pill as-button logout-button" type="button" hidden>Logout</button>
      </div>
    </header>
  `;
}

function renderSeoFooter() {
  return `
    <footer class="site-footer" data-footer-ready="true">
      <div class="site-footer-inner">
        <div class="site-footer-brand">
          <a class="brand footer-brand" href="/" aria-label="HOODYBOODY"><span>HOODYBOODY</span></a>
          <p>Premium custom embroidery for clean wardrobe pieces, logo apparel and small batch orders.</p>
        </div>
        <nav class="footer-links" aria-label="Product pages">
          <strong>Products</strong>
          <a href="/embroidered-hoodies/">Embroidered hoodies</a>
          <a href="/embroidered-tshirts/">Embroidered T-shirts</a>
          <a href="/embroidered-hats/">Embroidered hats</a>
          <a href="/embroidered-tote-bags/">Embroidered tote bags</a>
        </nav>
        <nav class="footer-links" aria-label="Custom embroidery">
          <strong>Custom embroidery</strong>
          <a href="/#custom">Upload logo or design</a>
          <a href="/#custom">Business embroidery</a>
          <a href="/blog/">Blog</a>
          <a href="/checkout.html">Checkout</a>
        </nav>
      </div>
    </footer>
  `;
}

function renderBreadcrumbsHtml(items) {
  if (!items.length) return "";
  return `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        ${items
          .map((item, index) => {
            const isLast = index === items.length - 1;
            return `<li>${isLast ? `<span aria-current="page">${escapeHtmlAttribute(item.name)}</span>` : `<a href="${escapeHtmlAttribute(item.url)}">${escapeHtmlAttribute(item.name)}</a>`}</li>`;
          })
          .join("")}
      </ol>
    </nav>
  `;
}

function renderPageShell(req, options) {
  const title = options.title || "HOODYBOODY";
  const description = options.description || "Premium custom embroidery by HOODYBOODY.";
  const canonicalPath = normalizeCleanHref(options.canonicalPath || "/");
  const canonicalUrl = absoluteUrl(req, canonicalPath);
  const breadcrumbs = options.breadcrumbs || [{ name: "Home", url: "/" }];
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "HOODYBOODY",
      url: absoluteUrl(req, "/"),
      logo: absoluteUrl(req, "/assets/embroidered-collection.png")
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: absoluteUrl(req, item.url)
      }))
    },
    ...(options.structuredData || [])
  ];

  return applyNoIndexToHtml(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <title>${escapeHtmlAttribute(title)}</title>
    <meta name="description" content="${escapeHtmlAttribute(description)}" />
    <link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}" />
    <meta property="og:title" content="${escapeHtmlAttribute(title)}" />
    <meta property="og:description" content="${escapeHtmlAttribute(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtmlAttribute(canonicalUrl)}" />
    <meta property="og:site_name" content="HOODYBOODY" />
    <meta property="og:image" content="${escapeHtmlAttribute(absoluteUrl(req, "/assets/embroidered-collection.png"))}" />
    <meta property="og:image:alt" content="HOODYBOODY embroidered clothing" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttribute(title)}" />
    <meta name="twitter:description" content="${escapeHtmlAttribute(description)}" />
    <meta name="twitter:image" content="${escapeHtmlAttribute(absoluteUrl(req, "/assets/embroidered-collection.png"))}" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
    <link rel="stylesheet" href="/styles.css" />
    ${structuredData.map(jsonLdScript).join("\n    ")}
  </head>
  <body>
    ${renderSiteTopbar()}
    <main class="${escapeHtmlAttribute(options.mainClass || "seo-page")}">
      ${renderBreadcrumbsHtml(breadcrumbs)}
      ${options.body || ""}
    </main>
    ${renderSeoFooter()}
    <script src="/session-nav.js"></script>
  </body>
</html>`);
}

function productMatchesLanding(product, page) {
  const keywords = Array.isArray(page.keywords) ? page.keywords.map((item) => String(item).toLowerCase()) : [];
  const haystack = [product.id, product.title, product.type, product.badge, product.description, product.longDescription]
    .join(" ")
    .toLowerCase();
  return (page.category && product.type === page.category) || keywords.some((keyword) => haystack.includes(keyword));
}

function renderProductCards(products, fromPath) {
  if (!products.length) {
    return `<div class="catalog-empty"><h3>Products are being prepared</h3><p>This page is ready for the catalog. Add matching products in the owner dashboard and they will appear here.</p></div>`;
  }

  return products
    .map(
      (product) => `
        <a class="location-product-card" href="/product.html?id=${encodeURIComponent(product.id)}&from=${encodeURIComponent(fromPath)}">
          <span class="location-product-photo" style="--product-image: url('${escapeHtmlAttribute(product.image || DEFAULT_PRODUCT_IMAGE)}'); --focus: ${escapeHtmlAttribute(product.focus || "center")}"></span>
          <strong>${escapeHtmlAttribute(product.title)}</strong>
          <p>${escapeHtmlAttribute(product.description)}</p>
          <span class="price">${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(product.price) || 0) / 100)}</span>
        </a>
      `
    )
    .join("");
}

function renderCategoryLinkGrid(req) {
  const pages = getProductPageContent().pages || [];
  return pages
    .slice(0, 5)
    .map((page) => `<a class="seo-link-card" href="/${escapeHtmlAttribute(page.slug)}/"><strong>${escapeHtmlAttribute(page.title)}</strong><span>${escapeHtmlAttribute(page.intro)}</span></a>`)
    .join("");
}

async function renderProductLandingPage(req, page) {
  const db = await readDbAsync();
  const productsForPage = publicProducts(db).filter((product) => productMatchesLanding(product, page)).slice(0, 8);
  const canonicalPath = `/${page.slug}/`;
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Products", url: "/#catalog" },
    { name: page.title, url: canonicalPath }
  ];

  return renderPageShell(req, {
    title: page.seoTitle || `${page.title} | HOODYBOODY`,
    description: page.metaDescription,
    canonicalPath,
    mainClass: "seo-page product-landing-page",
    breadcrumbs,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: page.title,
        description: page.metaDescription,
        url: absoluteUrl(req, canonicalPath)
      }
    ],
    body: `
      <section class="seo-hero">
        <div class="seo-hero-copy">
          <p class="eyebrow">product page</p>
          <h1>${escapeHtmlAttribute(page.h1 || page.title)}</h1>
          <p>${escapeHtmlAttribute(page.intro)}</p>
          <div class="location-actions">
            <a class="button primary" href="/#custom">Start custom embroidery</a>
          </div>
        </div>
        <div class="seo-hero-media" aria-hidden="true"></div>
      </section>
      <section class="location-section">
        <div class="section-head"><div><p class="eyebrow">catalog</p><h2>Product cards</h2></div></div>
        <div class="location-grid">${renderProductCards(productsForPage, canonicalPath)}</div>
      </section>
      <section class="location-section">
        <div class="section-head"><div><p class="eyebrow">custom work</p><h2>Logo and design embroidery</h2></div></div>
        <div class="seo-split">
          <p>Upload a logo, artwork or reference image, choose the base product and add notes about quantity and placement. HOODYBOODY reviews the request before confirming the final quote.</p>
          <a class="button primary" href="/#custom">Upload design</a>
        </div>
      </section>
    `
  });
}

async function tryRenderSeoRoute(req, res, pathname) {
  const cleanPath = stripTrailingSlash(pathname);
  const productPages = getProductPageContent().pages || [];
  const productPage = productPages.find((page) => cleanPath === `/${page.slug}`);
  if (productPage) {
    const html = await renderProductLandingPage(req, productPage);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...noIndexHeader });
    res.end(html);
    return true;
  }

  return false;
}

function renderSitemapXml(req) {
  const productPages = getProductPageContent().pages || [];
  const urls = [
    "/",
    "/blog/",
    ...productPages.map((page) => `/${page.slug}/`)
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${escapeHtmlAttribute(absoluteUrl(req, url))}</loc><changefreq>weekly</changefreq><priority>${url === "/" ? "1.0" : "0.7"}</priority></url>`)
    .join("\n")}\n</urlset>`;
}

function createStripeCheckoutSession(params) {
  const payload = params.toString();

  return new Promise((resolve, reject) => {
    const stripeReq = https.request(
      {
        hostname: "api.stripe.com",
        path: "/v1/checkout/sessions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (stripeRes) => {
        let body = "";

        stripeRes.on("data", (chunk) => {
          body += chunk;
        });

        stripeRes.on("end", () => {
          const data = JSON.parse(body || "{}");

          if (stripeRes.statusCode >= 200 && stripeRes.statusCode < 300) {
            resolve(data);
            return;
          }

          reject(new Error(data.error?.message || "Stripe could not create a payment session."));
        });
      }
    );

    stripeReq.on("error", reject);
    stripeReq.write(payload);
    stripeReq.end();
  });
}

function createStripeCustomer(params) {
  const payload = params.toString();

  return new Promise((resolve, reject) => {
    const stripeReq = https.request(
      {
        hostname: "api.stripe.com",
        path: "/v1/customers",
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (stripeRes) => {
        let body = "";

        stripeRes.on("data", (chunk) => {
          body += chunk;
        });

        stripeRes.on("end", () => {
          const data = JSON.parse(body || "{}");

          if (stripeRes.statusCode >= 200 && stripeRes.statusCode < 300) {
            resolve(data);
            return;
          }

          reject(new Error(data.error?.message || "Stripe could not prepare customer details."));
        });
      }
    );

    stripeReq.on("error", reject);
    stripeReq.write(payload);
    stripeReq.end();
  });
}

function getStripeCheckoutSession(sessionId) {
  return new Promise((resolve, reject) => {
    const stripeReq = https.request(
      {
        hostname: "api.stripe.com",
        path: `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`
        }
      },
      (stripeRes) => {
        let body = "";

        stripeRes.on("data", (chunk) => {
          body += chunk;
        });

        stripeRes.on("end", () => {
          const data = JSON.parse(body || "{}");

          if (stripeRes.statusCode >= 200 && stripeRes.statusCode < 300) {
            resolve(data);
            return;
          }

          reject(new Error(data.error?.message || "Stripe could not verify the payment session."));
        });
      }
    );

    stripeReq.on("error", reject);
    stripeReq.end();
  });
}

function getStripeCustomerParams(body) {
  const params = new URLSearchParams();
  const customer = body.customer || {};
  const delivery = body.delivery || {};
  const name = String(customer.name || "").trim();
  const email = String(customer.email || "").trim();
  const phone = String(customer.phone || "").trim();
  const city = String(delivery.city || "").trim();
  const state = String(delivery.state || "").trim().toUpperCase();
  const zip = String(delivery.zip || "").trim();
  const address = String(delivery.address || "").trim();
  const line2 = [delivery.apartment, delivery.entrance]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");

  if (email) params.append("email", email);
  if (name) params.append("name", name);
  if (phone) params.append("phone", phone);
  if (address) params.append("address[line1]", address);
  if (line2) params.append("address[line2]", line2);
  if (city) params.append("address[city]", city);
  if (state) params.append("address[state]", state);
  if (zip) params.append("address[postal_code]", zip);
  if (address || city || state || zip) params.append("address[country]", "US");

  return params;
}

function publicShippoRates(data) {
  const rates = Array.isArray(data) ? data : data.results || data.rates || [];

  return rates
    .filter((rate) => String(rate.currency || "").toUpperCase() === "USD")
    .map((rate) => ({
      id: rate.object_id,
      shipmentId: data.object_id || data.id || rate.shipment,
      carrier: rate.provider,
      service: rate.servicelevel?.name || rate.servicelevel?.token || "Shipping",
      serviceToken: rate.servicelevel?.token || "",
      price: Math.round(Number(rate.amount || 0) * 100),
      currency: rate.currency,
      deliveryDays: rate.estimated_days || null,
      attributes: Array.isArray(rate.attributes) ? rate.attributes : []
    }))
    .filter((rate) => rate.price >= 0)
    .sort((a, b) => a.price - b.price);
}

async function createShippoShipment(body, db) {
  const items = Array.isArray(body.items) ? body.items : [];
  const subtotal = getCartSubtotal(items, db);

  if (!items.length) throw new Error("The cart is empty.");

  return checkoutShippoService.getShippoRates({
    destination: body.destination || {},
    items,
    products: publicProducts(db),
    subtotal,
    metadata: "checkout"
  });
}

function getCartSubtotal(items, db) {
  const productLookup = getProductLookup(db);

  return Array.isArray(items)
    ? items.reduce((sum, item) => {
        const productId = getCartProductId(item, productLookup);
        const product = productId ? productLookup[productId] : null;
        const price = Math.round(Number(product?.price ?? item.price) || 0);
        return sum + price * Math.max(1, Number(item.quantity) || 1);
      }, 0)
    : 0;
}

function getDiscountedUnitAmount(price, discountApplies) {
  const amount = Math.max(0, Math.round(Number(price) || 0));
  return discountApplies ? Math.max(1, Math.round(amount * (1 - productDiscountRate))) : amount;
}

function getCartPricing(items, db) {
  const productLookup = getProductLookup(db);
  const normalizedItems = Array.isArray(items) ? items : [];
  const subtotal = getCartSubtotal(normalizedItems, db);
  const discountApplies = subtotal >= productDiscountThreshold;
  const discountedSubtotal = normalizedItems.reduce((sum, item) => {
    const productId = getCartProductId(item, productLookup);
    const product = productId ? productLookup[productId] : null;
    const price = Math.max(0, Math.round(Number(product?.price ?? item.price) || 0));
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    return sum + getDiscountedUnitAmount(price, discountApplies) * quantity;
  }, 0);
  const productDiscount = discountApplies ? Math.max(0, subtotal - discountedSubtotal) : 0;

  return {
    subtotal,
    productDiscount,
    discountedSubtotal,
    discountRate: productDiscountRate,
    discountThreshold: productDiscountThreshold
  };
}

async function normalizeCheckoutBody(body, db) {
  const normalized = {
    ...body,
    delivery: { ...(body.delivery || {}) },
    totals: { ...(body.totals || {}) }
  };
  const pricing = getCartPricing(normalized.items, db);

  let deliveryPrice = Math.max(0, Math.round(Number(normalized.delivery.price) || 0));
  if (normalized.delivery.type === "shipping") {
    if (!shippoApiKey) {
      throw new Error("Shippo is not configured. Set SHIPPO_API_KEY before starting the server.");
    }

    const shipmentId = String(normalized.delivery.shippoShipmentId || normalized.delivery.easyPostShipmentId || "").trim();
    const rateId = String(normalized.delivery.shippoRateId || normalized.delivery.easyPostRateId || "").trim();
    if (!shipmentId || !rateId) {
      throw new Error("Select a shipping rate before checkout.");
    }

    const shipmentRates = await checkoutShippoService.request("GET", `/shipments/${encodeURIComponent(shipmentId)}/rates/USD`);
    const options = checkoutShippoService.buildShippingOptions({
      rates: publicShippoRates(shipmentRates),
      subtotal: pricing.subtotal,
      destination: normalized.delivery,
      parcels: checkoutShippoService.buildShippoParcelsFromCart(normalized.items, publicProducts(db))
    });
    normalized.delivery = saveSelectedShippingOption(
      {
        ...normalized.delivery,
        shippoShipmentId: shipmentId,
        shippoRateId: rateId
      },
      options
    );
    deliveryPrice = normalized.delivery.customerShippingPrice;
  }

  normalized.totals = {
    subtotal: pricing.subtotal,
    discount: pricing.productDiscount,
    productDiscount: pricing.productDiscount,
    discountedSubtotal: pricing.discountedSubtotal,
    delivery: deliveryPrice,
    total: pricing.discountedSubtotal + deliveryPrice
  };

  return normalized;
}

function getCartProductId(item, inventory) {
  if (item.productId && inventory[item.productId]) return item.productId;
  if (item.baseProductId && inventory[item.baseProductId]) return item.baseProductId;
  if (item.id && inventory[item.id]) return item.id;

  return Object.keys(inventory)
    .sort((a, b) => b.length - a.length)
    .find((productId) => String(item.id || "").startsWith(`${productId}-`));
}

function getStripeLineItem(item, product, discountApplies = false) {
  const title = String(product?.title || item.title || "Custom item").trim().slice(0, 120);
  const unitAmount = getStripeUnitAmount(getDiscountedUnitAmount(product?.price ?? item.price, discountApplies));
  const productDescription = String(product?.description || "").trim();
  const itemDescription = String(item.description || "").trim();
  const description = product
    ? [productDescription, itemDescription].filter(Boolean).join(" - ")
    : itemDescription || "Custom order";

  if (!title || unitAmount <= 0) return null;

  return {
    title,
    unitAmount,
    description: description.slice(0, 500)
  };
}

function getStockStatus(stock) {
  if (stock <= 0) return "out";
  if (stock <= 5) return "low";
  return "in";
}

function getOrderShippingFields(delivery = {}, totals = {}) {
  const subtotal = Math.max(0, Math.round(Number(totals.subtotal || 0) || 0));
  const customerShippingPrice = Math.max(
    0,
    Math.round(Number(delivery.customerShippingPrice ?? delivery.customer_shipping_price ?? delivery.price ?? totals.delivery ?? 0) || 0)
  );
  const realShippoCost = customerShippingPrice;

  return {
    subtotal,
    customerShippingPrice,
    realShippoCost,
    shippingDiscount: 0,
    labelPurchaseMode: delivery.type === "shipping" ? "automatic" : "",
    shippingOptionType: String(delivery.shippingOptionType || delivery.shippingType || "").trim(),
    shippingTitle: String(delivery.shippingTitle || "").trim()
  };
}

async function notifyOrderStatus(order, statusKey, statusLabel) {
  try {
    return await sendOrderStatusEmail(order, statusKey, { statusLabel });
  } catch (error) {
    order.notifications ||= { sent: [] };
    order.notifications.lastError = error.message || "Email notification failed.";
    order.notifications.failedAt = new Date().toISOString();
    return { skipped: true, reason: "send_failed" };
  }
}

function createOrderFromPayload(db, user, body, overrides = {}) {
  const items = Array.isArray(body.items) ? body.items : [];

  if (!items.length) {
    return { status: 400, message: "The cart is empty." };
  }

  const requestedInventory = {};
  items.forEach((item) => {
    const productId = getCartProductId(item, db.inventory);
    if (!productId) return;
    requestedInventory[productId] ||= 0;
    requestedInventory[productId] += Math.max(0, Number(item.quantity) || 0);
  });

  const shortage = Object.entries(requestedInventory).find(([productId, quantity]) => {
    const stock = Number(db.inventory[productId]?.stock) || 0;
    return quantity > stock;
  });

  if (shortage) {
    const [productId, quantity] = shortage;
    const stock = Number(db.inventory[productId]?.stock) || 0;
    return {
      status: 409,
      message: `Not enough stock available: ${productId}. with ${quantity} in cart, ${stock} available.`
    };
  }

  const delivery = body.delivery || {};
  const pricing = getCartPricing(items, db);
  const baseTotals = {
    subtotal: pricing.subtotal,
    discount: pricing.productDiscount,
    productDiscount: pricing.productDiscount,
    discountedSubtotal: pricing.discountedSubtotal,
    delivery: Math.max(0, Math.round(Number(body.totals?.delivery ?? delivery.price ?? 0) || 0)),
    total: Math.max(0, Math.round(Number(body.totals?.total ?? 0) || 0))
  };
  const shippingFields = getOrderShippingFields(delivery, baseTotals);
  const totals = {
    ...body.totals,
    subtotal: shippingFields.subtotal,
    discount: pricing.productDiscount,
    productDiscount: pricing.productDiscount,
    discountedSubtotal: pricing.discountedSubtotal,
    delivery: shippingFields.customerShippingPrice,
    total: pricing.discountedSubtotal + shippingFields.customerShippingPrice
  };
  const paymentType = String(body.payment?.type || "").trim();
  const isDeferredPayment = paymentType === "invoice" || paymentType === "sbp";
  const orderStatus = String(overrides.status || (isDeferredPayment ? "pending" : "paid")).trim().toLowerCase();
  const paidAt = overrides.paidAt ?? (isDeferredPayment ? "" : new Date().toISOString());
  const shouldDecrementStock = overrides.decrementStock ?? orderStatus === "paid";
  const tracking = getTrackingInfo(delivery.type);

  const order = {
    id: crypto.randomUUID(),
    number: getOrderNumber(),
    userId: user?.id || "",
    items,
    customer: body.customer || {},
    delivery: {
      ...delivery,
      price: shippingFields.customerShippingPrice,
      shippingType: shippingFields.shippingOptionType,
      customerShippingPrice: shippingFields.customerShippingPrice,
      customer_shipping_price: shippingFields.customerShippingPrice,
      realShippoCost: shippingFields.realShippoCost,
      real_shippo_cost: shippingFields.realShippoCost,
      shippingDiscount: 0,
      shipping_discount: 0,
      labelPurchaseMode: shippingFields.labelPurchaseMode,
      label_purchase_mode: shippingFields.labelPurchaseMode,
      tracking
    },
    payment: {
      ...(body.payment || {}),
      ...(overrides.payment || {}),
      status: orderStatus,
      paidAt
    },
    totals,
    shipping: {
      labelPurchaseMode: shippingFields.labelPurchaseMode,
      customerShippingPrice: shippingFields.customerShippingPrice,
      realShippingCost: shippingFields.realShippoCost,
      shippingDiscount: 0,
      status: ""
    },
    notifications: { sent: [] },
    status: orderStatus,
    createdAt: new Date().toISOString()
  };

  if (shouldDecrementStock) {
    Object.entries(requestedInventory).forEach(([productId, quantity]) => {
      db.inventory[productId].stock = Math.max(0, (Number(db.inventory[productId].stock) || 0) - quantity);
      db.inventory[productId].updatedAt = new Date().toISOString();
      db.inventory[productId].updatedBy = `order:${order.id}`;
    });
  }

  db.orders.push(order);
  return { order };
}

async function handleApi(req, res) {
  const db = await readDbAsync();
  const method = req.method;
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (isChatApiPath(url.pathname) && method === "OPTIONS") {
      res.writeHead(204, {
        ...noIndexHeader,
        ...chatCorsHeaders(req)
      });
      res.end();
      return;
    }

    if (url.pathname === "/api/register" && method === "POST") {
      const body = await readJson(req);
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");

      if (!name || !phone || !email || password.length < 6) {
        sendJson(res, 400, { message: "Please provide name, phone, email, and a password of at least 6 characters." });
        return;
      }

      if (db.users.some((user) => user.email === email)) {
        sendJson(res, 409, { message: "A customer with this email is already registered." });
        return;
      }

      const salt = crypto.randomBytes(16).toString("hex");
      const user = {
        id: crypto.randomUUID(),
        name,
        phone,
        email,
        role: email === normalizeEmail(adminEmail) ? "admin" : "customer",
        passwordSalt: salt,
        passwordHash: hashPassword(password, salt),
        address: {},
        createdAt: new Date().toISOString()
      };

      db.users.push(user);
      const token = makeSession(db, user.id);
      await writeDbAsync(db);
      sendJson(res, 201, { user: publicUser(user) }, sessionHeader(token));
      return;
    }

    if (url.pathname === "/api/login" && method === "POST") {
      const body = await readJson(req);
      const login = normalizeLoginIdentifier(body.login || body.email);
      const loginPhone = normalizePhoneIdentifier(login);
      const password = String(body.password || "");
      const user = db.users.find((item) => {
        if (normalizeEmail(item.email) === login) return true;
        const userPhone = normalizePhoneIdentifier(item.phone);
        return loginPhone && userPhone && (userPhone === loginPhone || userPhone.endsWith(loginPhone) || loginPhone.endsWith(userPhone));
      });

      if (!user || hashPassword(password, user.passwordSalt) !== user.passwordHash) {
        sendJson(res, 401, { message: "Incorrect email or password." });
        return;
      }

      const token = makeSession(db, user.id);
      await writeDbAsync(db);
      sendJson(res, 200, { user: publicUser(user) }, sessionHeader(token));
      return;
    }

    if (url.pathname === "/api/logout" && method === "POST") {
      const token = parseCookies(req)[sessionCookie];
      db.sessions = db.sessions.filter((session) => session.token !== token);
      await writeDbAsync(db);
      sendJson(res, 200, { ok: true }, clearSessionHeader());
      return;
    }

    if (url.pathname === "/api/me" && method === "GET") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in." });
        return;
      }

      sendJson(res, 200, { user: publicUser(user) });
      return;
    }

    if (url.pathname === "/api/session" && method === "GET") {
      const user = getSessionUser(req, db);
      sendJson(res, 200, { user: publicUser(user) });
      return;
    }

    if (url.pathname === "/api/chat/bootstrap" && method === "GET") {
      const user = getSessionUser(req, db);
      const conversationId = String(url.searchParams.get("conversationId") || "").trim();
      const clientToken = readChatClientToken(req, {}, url);
      const conversation = findCustomerChatConversation(db, conversationId, user, clientToken);

      if (conversation) {
        markChatRead(conversation, "customer");
        await writeDbAsync(db);
      }

      sendChatJson(req, res, 200, {
        user: publicUser(user),
        conversation: publicChatConversation(conversation, db, { withMessages: true, clientToken }),
        settings: publicChatSettings(db.chatSettings),
        socketEnabled: true
      });
      return;
    }

    if (url.pathname === "/api/chat/settings" && method === "GET") {
      sendChatJson(req, res, 200, { settings: publicChatSettings(db.chatSettings) });
      return;
    }

    if (url.pathname === "/api/chat/messages" && method === "GET") {
      const conversationId = String(url.searchParams.get("conversationId") || "").trim();
      const clientToken = readChatClientToken(req, {}, url);
      const user = getSessionUser(req, db);
      const conversation = findCustomerChatConversation(db, conversationId, user, clientToken);

      if (!conversation) {
        sendChatJson(req, res, 404, { message: "Chat conversation not found." });
        return;
      }

      markChatRead(conversation, "customer");
      await writeDbAsync(db);
      sendChatJson(req, res, 200, { conversation: publicChatConversation(conversation, db, { withMessages: true, clientToken }) });
      return;
    }

    if (url.pathname === "/api/chat/messages" && method === "POST") {
      const user = getSessionUser(req, db);
      const body = await readJson(req, maxJsonBodyBytes);
      const resolved = ensureCustomerChatConversation(db, { ...body, clientToken: readChatClientToken(req, body, url) }, user);
      const conversation = resolved.conversation;
      const message = addChatMessage(db, conversation, "customer", body.text || body.message, conversation.customer?.name || user?.name || "Customer", body.attachments);

      if (!message) {
        sendChatJson(req, res, 400, { message: "Write a message before sending." });
        return;
      }

      await writeDbAsync(db);
      emitChatUpdate(db, conversation, message);
      await notifyChatAdmins(db, conversation, message);
      sendChatJson(req, res, 201, {
        conversation: publicChatConversation(conversation, db, { withMessages: true, clientToken: resolved.clientToken }),
        message: publicChatMessage(message)
      });
      return;
    }

    if (url.pathname === "/api/admin/chat/push-token" && method === "POST") {
      if (!hasChatAdminAccess(req, db)) {
        sendChatJson(req, res, 401, { message: "Owner access is required for live chat." });
        return;
      }

      const body = await readJson(req);
      const record = upsertPushToken(db, {
        ...body,
        channelId: body.channelId || DEFAULT_CHANNEL_ID
      });
      if (!record) {
        sendChatJson(req, res, 400, { message: "Push token is required." });
        return;
      }

      await writeDbAsync(db);
      sendChatJson(req, res, 200, {
        ok: true,
        pushConfigured: isPushConfigured(),
        token: publicPushToken(record)
      });
      return;
    }

    if (url.pathname === "/api/admin/chat/push-token" && method === "DELETE") {
      if (!hasChatAdminAccess(req, db)) {
        sendChatJson(req, res, 401, { message: "Owner access is required for live chat." });
        return;
      }

      const body = await readJson(req);
      const removed = removePushToken(db, String(body.token || "").trim());
      if (removed) await writeDbAsync(db);
      sendChatJson(req, res, 200, { ok: true, removed });
      return;
    }

    if (url.pathname === "/api/admin/chat/push-status" && method === "GET") {
      if (!hasChatAdminAccess(req, db)) {
        sendChatJson(req, res, 401, { message: "Owner access is required for live chat." });
        return;
      }

      sendChatJson(req, res, 200, {
        configured: isPushConfigured(),
        configuration: getPushConfigurationStatus(),
        tokens: (db.chatPushTokens || []).map(publicPushToken)
      });
      return;
    }

    if (url.pathname === "/api/admin/chat/test-push" && method === "POST") {
      if (!hasChatAdminAccess(req, db)) {
        sendChatJson(req, res, 401, { message: "Owner access is required for live chat." });
        return;
      }

      const result = await sendTestPush(db, { logger: console });
      if (result.changed) await writeDbAsync(db);
      sendChatJson(req, res, 200, {
        ok: true,
        pushConfigured: isPushConfigured(),
        result
      });
      return;
    }

    if (url.pathname === "/api/admin/chat/settings" && method === "GET") {
      if (!hasChatAdminAccess(req, db)) {
        sendChatJson(req, res, 401, { message: "Owner access is required for live chat." });
        return;
      }

      sendChatJson(req, res, 200, { settings: publicChatSettings(db.chatSettings) });
      return;
    }

    if (url.pathname === "/api/admin/chat/settings" && method === "PATCH") {
      if (!hasChatAdminAccess(req, db)) {
        sendChatJson(req, res, 401, { message: "Owner access is required for live chat." });
        return;
      }

      const body = await readJson(req, maxJsonBodyBytes);
      db.chatSettings = sanitizeChatSettings(body, db.chatSettings || defaultChatSettings);
      await writeDbAsync(db);
      sendChatJson(req, res, 200, { settings: publicChatSettings(db.chatSettings) });
      return;
    }

    if (url.pathname === "/api/admin/chat/conversations" && method === "GET") {
      if (!hasChatAdminAccess(req, db)) {
        sendChatJson(req, res, 401, { message: "Owner access is required for live chat." });
        return;
      }

      const conversations = db.chatConversations
        .slice()
        .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt || b.createdAt) - new Date(a.lastMessageAt || a.updatedAt || a.createdAt))
        .map((conversation) => publicChatConversation(conversation, db));
      sendChatJson(req, res, 200, { conversations, tokenAuth: Boolean(req.headers["x-chat-admin-token"]) });
      return;
    }

    if (url.pathname.startsWith("/api/admin/chat/conversations/")) {
      if (!hasChatAdminAccess(req, db)) {
        sendChatJson(req, res, 401, { message: "Owner access is required for live chat." });
        return;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      const conversationId = parts[4] || "";
      const action = parts[5] || "";
      const conversation = db.chatConversations.find((item) => item.id === conversationId);

      if (!conversation) {
        sendChatJson(req, res, 404, { message: "Chat conversation not found." });
        return;
      }

      if (!action && method === "GET") {
        markChatRead(conversation, "admin");
        await writeDbAsync(db);
        sendChatJson(req, res, 200, { conversation: publicChatConversation(conversation, db, { withMessages: true }) });
        return;
      }

      if (action === "messages" && method === "POST") {
        const user = getSessionUser(req, db);
        const body = await readJson(req, maxJsonBodyBytes);
        const message = addChatMessage(db, conversation, "admin", body.text || body.message, user?.name || "HOODYBOODY", body.attachments);

        if (!message) {
          sendChatJson(req, res, 400, { message: "Write a message before sending." });
          return;
        }

        await writeDbAsync(db);
        emitChatUpdate(db, conversation, message);
        sendChatJson(req, res, 201, {
          conversation: publicChatConversation(conversation, db, { withMessages: true }),
          message: publicChatMessage(message)
        });
        return;
      }

      if (action === "read" && method === "PATCH") {
        markChatRead(conversation, "admin");
        await writeDbAsync(db);
        sendChatJson(req, res, 200, { conversation: publicChatConversation(conversation, db, { withMessages: true }) });
        return;
      }
    }

    if (url.pathname === "/api/health" && method === "GET") {
      sendJson(res, 200, {
        ok: true,
        storage: hasRedisDb ? "redis" : hasPostgresDb ? "postgres" : memoryDb ? "memory" : "file",
        vercel: Boolean(process.env.VERCEL),
        databaseEnv: {
          redis: hasRedisDb,
          postgresUrl: Boolean(postgresUrl),
          pgHost: Boolean(process.env.PGHOST || localEnv.PGHOST),
          pgDatabase: Boolean(process.env.PGDATABASE || localEnv.PGDATABASE),
          pgUser: Boolean(process.env.PGUSER || localEnv.PGUSER),
          pgPassword: Boolean(postgresPassword),
          awsIam: hasAwsIamPostgres,
          oidc: Boolean(process.env.VERCEL_OIDC_TOKEN)
        }
      });
      return;
    }

    if (url.pathname === "/api/inventory" && method === "GET") {
      sendJson(res, 200, { inventory: publicInventory(db.inventory) });
      return;
    }

    if (url.pathname === "/api/products" && method === "GET") {
      sendJson(res, 200, { products: publicProducts(db) });
      return;
    }

    if (url.pathname === "/api/categories" && method === "GET") {
      sendJson(res, 200, { categories: publicCategories(db) });
      return;
    }

    if (url.pathname.startsWith("/api/product-images/") && method === "GET") {
      const imageId = decodeURIComponent(url.pathname.slice("/api/product-images/".length));
      const image = db.productImages?.[imageId];

      if (!image?.data || !image?.mimeType) {
        sendJson(res, 404, { message: "Product image not found." });
        return;
      }

      const buffer = Buffer.from(image.data, "base64");
      res.writeHead(200, {
        "Content-Type": image.mimeType,
        "Content-Length": buffer.length,
        "Cache-Control": "public, max-age=31536000, immutable"
      });
      res.end(buffer);
      return;
    }

    if (url.pathname === "/api/shipping/rates" && method === "POST") {
      const body = await readJson(req);
      const shipping = await createShippoShipment(body, db);
      const options = shipping.options || [];

      if (!options.length) {
        sendJson(res, 404, { message: "No Shippo shipping options are available for this address." });
        return;
      }

      sendJson(res, 200, {
        shipmentId: shipping.shipmentId,
        options,
        rates: options,
        subtotal: getCartSubtotal(Array.isArray(body.items) ? body.items : [], db)
      });
      return;
    }

    if (url.pathname === "/api/stripe/checkout" && method === "POST") {
      if (!stripeSecretKey) {
        sendJson(res, 501, {
          message: "Stripe is not configured. Set STRIPE_SECRET_KEY before starting the server."
        });
        return;
      }

      const body = await normalizeCheckoutBody(await readJson(req), db);
      const items = Array.isArray(body.items) ? body.items : [];

      if (!items.length) {
        sendJson(res, 400, { message: "The cart is empty." });
        return;
      }

      const origin = getRequestOrigin(req);
      const pendingId = crypto.randomUUID();
      const params = new URLSearchParams();
      params.append("mode", "payment");
      params.append("success_url", `${origin}/checkout.html?stripe=success&session_id={CHECKOUT_SESSION_ID}`);
      params.append("cancel_url", `${origin}/checkout.html?stripe=cancel`);
      params.append("phone_number_collection[enabled]", "true");
      params.append("billing_address_collection", "required");

      let lineIndex = 0;
      const requestedInventory = {};
      const productLookup = getProductLookup(db);
      const discountApplies = Math.max(0, Math.round(Number(body.totals?.discount || body.totals?.productDiscount || 0) || 0)) > 0;

      for (const item of items) {
        const productId = getCartProductId(item, productLookup);
        const product = productId ? productLookup[productId] : null;
        const lineItem = getStripeLineItem(item, product, discountApplies);
        const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));

        if (!lineItem) continue;

        if (productId && db.inventory[productId]) {
          requestedInventory[productId] ||= 0;
          requestedInventory[productId] += quantity;
        }

        params.append(`line_items[${lineIndex}][quantity]`, String(quantity));
        params.append(`line_items[${lineIndex}][price_data][currency]`, stripeCurrency);
        params.append(`line_items[${lineIndex}][price_data][unit_amount]`, String(lineItem.unitAmount));
        params.append(`line_items[${lineIndex}][price_data][product_data][name]`, lineItem.title);
        params.append(`line_items[${lineIndex}][price_data][product_data][description]`, lineItem.description);
        if (productId) params.append(`line_items[${lineIndex}][price_data][product_data][metadata][product_id]`, productId);
        lineIndex += 1;
      }

      if (!lineIndex) {
        sendJson(res, 400, { message: "There are no items in the cart available for Stripe payment." });
        return;
      }

      const deliveryPrice = Math.max(0, Math.round(Number(body.delivery?.price) || 0));
      if (deliveryPrice > 0) {
        params.append(`line_items[${lineIndex}][quantity]`, "1");
        params.append(`line_items[${lineIndex}][price_data][currency]`, stripeCurrency);
        params.append(`line_items[${lineIndex}][price_data][unit_amount]`, String(getStripeUnitAmount(deliveryPrice)));
        params.append(`line_items[${lineIndex}][price_data][product_data][name]`, "Delivery");
        params.append(`line_items[${lineIndex}][price_data][product_data][description]`, String(body.delivery?.type || "Delivery"));
      }

      const shortage = Object.entries(requestedInventory).find(([productId, quantity]) => {
        const stock = Number(db.inventory[productId]?.stock) || 0;
        return quantity > stock;
      });

      if (shortage) {
        const [productId, quantity] = shortage;
        const stock = Number(db.inventory[productId]?.stock) || 0;
        sendJson(res, 409, { message: `Not enough stock available: ${productId}. with ${quantity} in cart, ${stock} available.` });
        return;
      }

      const customerParams = getStripeCustomerParams(body);
      const stripeCustomer = customerParams.toString() ? await createStripeCustomer(customerParams) : null;
      if (stripeCustomer?.id) {
        params.append("customer", stripeCustomer.id);
        params.append("customer_update[address]", "auto");
        params.append("customer_update[name]", "auto");
      } else if (body.customer?.email) {
        params.append("customer_email", String(body.customer.email));
      }

      params.append("metadata[source]", "cart");
      params.append("metadata[pending_id]", pendingId);
      params.append("metadata[customer_name]", String(body.customer?.name || ""));
      params.append("metadata[customer_phone]", String(body.customer?.phone || ""));
      params.append("metadata[delivery_type]", String(body.delivery?.type || ""));
      params.append("metadata[delivery_city]", String(body.delivery?.city || ""));
      params.append("metadata[delivery_state]", String(body.delivery?.state || ""));
      params.append("metadata[delivery_zip]", String(body.delivery?.zip || ""));
      params.append("metadata[delivery_address]", String(body.delivery?.address || ""));
      params.append("metadata[subtotal]", String(body.totals?.subtotal || 0));
      params.append("metadata[product_discount]", String(body.totals?.discount || body.totals?.productDiscount || 0));
      params.append("metadata[discounted_subtotal]", String(body.totals?.discountedSubtotal || 0));
      params.append("metadata[shipping_price]", String(body.totals?.delivery || body.delivery?.price || 0));
      params.append("metadata[customer_shipping_price]", String(body.delivery?.customerShippingPrice ?? body.delivery?.price ?? 0));
      params.append("metadata[real_shippo_cost]", String(body.delivery?.realShippoCost ?? body.delivery?.real_shippo_cost ?? 0));
      params.append("metadata[shipping_discount]", "0");
      params.append("metadata[label_purchase_mode]", "automatic");
      params.append("metadata[shipping_option_id]", String(body.delivery?.shippingOptionId || ""));
      params.append("metadata[shipping_option_type]", String(body.delivery?.shippingOptionType || ""));
      params.append("metadata[shipping_title]", String(body.delivery?.shippingTitle || ""));
      params.append("metadata[shippo_shipment_id]", String(body.delivery?.shippoShipmentId || ""));
      params.append("metadata[shippo_rate_id]", String(body.delivery?.shippoRateId || ""));
      params.append("metadata[shippo_carrier]", String(body.delivery?.carrier || ""));
      params.append("metadata[shippo_service]", String(body.delivery?.service || ""));
      params.append("metadata[total]", String(body.totals?.total || ""));
      params.append("payment_intent_data[metadata][source]", "cart");
      params.append("payment_intent_data[metadata][pending_id]", pendingId);

      const session = await createStripeCheckoutSession(params);
      const user = getSessionUser(req, db);
      db.pendingStripeOrders = (db.pendingStripeOrders || []).filter((item) => {
        return !item.createdAt || Date.now() - new Date(item.createdAt).getTime() < 1000 * 60 * 60 * 24;
      });
      db.pendingStripeOrders.push({
        id: pendingId,
        sessionId: session.id,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : "",
        userId: user?.id || "",
        payload: body,
        createdAt: new Date().toISOString()
      });
      await writeDbAsync(db);
      sendJson(res, 200, { id: session.id, url: session.url });
      return;
    }

    if (url.pathname === "/api/stripe/complete" && method === "POST") {
      if (!stripeSecretKey) {
        sendJson(res, 501, {
          message: "Stripe is not configured. Set STRIPE_SECRET_KEY before starting the server."
        });
        return;
      }

      const body = await readJson(req);
      const sessionId = String(body.sessionId || "").trim();

      if (!sessionId) {
        sendJson(res, 400, { message: "Payment session was not found." });
        return;
      }

      const existingOrder = db.orders.find((order) => order.payment?.stripeSessionId === sessionId);
      if (existingOrder) {
        sendJson(res, 200, { order: existingOrder });
        return;
      }

      const pending = db.pendingStripeOrders.find((item) => item.sessionId === sessionId);
      if (!pending) {
        sendJson(res, 404, { message: "Payment session was not found." });
        return;
      }

      const stripeSession = await getStripeCheckoutSession(sessionId);
      if (stripeSession.payment_status !== "paid") {
        sendJson(res, 409, { message: "Stripe payment is not completed yet." });
        return;
      }

      const user = db.users.find((item) => item.id === pending.userId) || null;
      const result = createOrderFromPayload(db, user, pending.payload, {
        status: "paid",
        paidAt: new Date().toISOString(),
        payment: {
          provider: "stripe",
          type: "card",
          stripeSessionId: sessionId,
          stripePaymentIntentId: typeof stripeSession.payment_intent === "string" ? stripeSession.payment_intent : "",
          stripePendingId: pending.id || "",
          amountPaid: Math.max(0, Math.round(Number(stripeSession.amount_total || pending.payload?.totals?.total || 0) || 0))
        }
      });

      if (!result.order) {
        sendJson(res, result.status, { message: result.message });
        return;
      }

      db.pendingStripeOrders = db.pendingStripeOrders.filter((item) => item.sessionId !== sessionId);
      await notifyOrderStatus(result.order, "order_paid", "order paid / confirmed");
      await writeDbAsync(db);
      sendJson(res, 201, { order: result.order });
      return;
    }

    if (url.pathname === "/api/stripe/config" && method === "GET") {
      sendJson(res, 200, { currency: stripeCurrency, configured: Boolean(stripeSecretKey) });
      return;
    }

    if (url.pathname === "/api/admin/inventory" && method === "GET") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "This page is only available to the store owner." });
        return;
      }

      sendJson(res, 200, { inventory: publicInventory(db.inventory), user: publicUser(user) });
      return;
    }

    if (url.pathname === "/api/admin/inventory" && method === "PATCH") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "Only the store owner can update inventory levels." });
        return;
      }

      const body = await readJson(req);
      const productId = String(body.productId || "").trim();
      const stock = Number(body.stock);

      if (!db.inventory[productId] || !Number.isInteger(stock) || stock < 0) {
        sendJson(res, 400, { message: "Select a product and enter a stock level as an integer from 0." });
        return;
      }

      const previousStock = Number(db.inventory[productId].stock) || 0;
      db.inventory[productId] = {
        stock,
        updatedAt: new Date().toISOString(),
        updatedBy: user.id
      };
      db.inventoryLog.push({
        id: crypto.randomUUID(),
        productId,
        previousStock,
        stock,
        delta: stock - previousStock,
        userId: user.id,
        userName: user.name,
        createdAt: new Date().toISOString()
      });

      await writeDbAsync(db);
      sendJson(res, 200, { inventory: publicInventory(db.inventory)[productId] });
      return;
    }

    if (url.pathname === "/api/admin/categories" && method === "GET") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "Only the store owner can manage categories." });
        return;
      }

      sendJson(res, 200, { categories: publicCategories(db) });
      return;
    }

    if (url.pathname === "/api/admin/categories" && method === "POST") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "Only the store owner can manage categories." });
        return;
      }

      const body = await readJson(req);
      const categoryPatch = sanitizeCategory(body, {});
      const nextCategory = categoryPatch.category;

      if (!nextCategory) {
        sendJson(res, 400, { message: categoryPatch.message || "Fill category fields correctly." });
        return;
      }

      if (db.categories.some((category) => category.id === nextCategory.id)) {
        sendJson(res, 409, { message: "A category with this slug already exists." });
        return;
      }

      nextCategory.createdAt = new Date().toISOString();
      nextCategory.updatedAt = nextCategory.createdAt;
      nextCategory.updatedBy = user.id;
      db.categories.push(nextCategory);

      await writeDbAsync(db);
      sendJson(res, 201, { category: publicCategory(nextCategory), categories: publicCategories(db) });
      return;
    }

    if (url.pathname === "/api/admin/categories" && method === "PATCH") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "Only the store owner can manage categories." });
        return;
      }

      const body = await readJson(req);
      const categoryId = String(body.categoryId || body.id || "").trim();
      const categoryIndex = db.categories.findIndex((category) => category.id === categoryId);

      if (categoryIndex === -1) {
        sendJson(res, 404, { message: "Category not found." });
        return;
      }

      const categoryPatch = sanitizeCategory(body, db.categories[categoryIndex]);
      const nextCategory = categoryPatch.category;

      if (!nextCategory) {
        sendJson(res, 400, { message: categoryPatch.message || "Fill category fields correctly." });
        return;
      }

      nextCategory.id = db.categories[categoryIndex].id;
      nextCategory.createdAt = db.categories[categoryIndex].createdAt || "";
      nextCategory.updatedAt = new Date().toISOString();
      nextCategory.updatedBy = user.id;
      db.categories[categoryIndex] = nextCategory;

      await writeDbAsync(db);
      sendJson(res, 200, { category: publicCategory(nextCategory), categories: publicCategories(db) });
      return;
    }

    if (url.pathname === "/api/admin/categories" && method === "DELETE") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "Only the store owner can manage categories." });
        return;
      }

      const body = await readJson(req);
      const categoryId = String(body.categoryId || body.id || "").trim();
      const categoryIndex = db.categories.findIndex((category) => category.id === categoryId);

      if (categoryIndex === -1) {
        sendJson(res, 404, { message: "Category not found." });
        return;
      }

      db.categories.splice(categoryIndex, 1);
      await writeDbAsync(db);
      sendJson(res, 200, { categories: publicCategories(db), productCount: db.products.filter((product) => product.type === categoryId).length });
      return;
    }

    if (url.pathname === "/api/admin/products" && method === "GET") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "Only the store owner can edit products." });
        return;
      }

      sendJson(res, 200, { products: publicProducts(db) });
      return;
    }

    if (url.pathname === "/api/admin/products" && method === "POST") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "Only the store owner can create products." });
        return;
      }

      const body = await readJson(req);
      const baseProduct = {
        id: "",
        title: "New product card",
        type: "tops",
        badge: "new",
        description: "Short product description.",
        longDescription: "Detailed product description.",
        image: DEFAULT_PRODUCT_IMAGE,
        imageName: "",
        focus: "50% 50%",
        price: 0,
        sizes: ["S", "M", "L"],
        isDigital: false,
        shipping: getDefaultProductShipping({ type: "tops" }),
        colors: [{ name: "Black", value: "#202326" }],
        gallery: [{ label: "General view", focus: "50% 50%", image: DEFAULT_PRODUCT_IMAGE }]
      };
      const productPatch = sanitizeProductPatch(body, baseProduct);
      const nextProduct = productPatch.product;

      if (!nextProduct) {
        sendJson(res, 400, { message: productPatch.message || "Fill product title, descriptions, and price correctly." });
        return;
      }

      const baseId = slugifyProductId(nextProduct.title);
      let productId = baseId;
      let counter = 2;
      while (db.products.some((product) => product.id === productId)) {
        productId = `${baseId}-${counter}`;
        counter += 1;
      }

      nextProduct.id = productId;
      nextProduct.createdAt = new Date().toISOString();
      nextProduct.updatedAt = nextProduct.createdAt;
      nextProduct.updatedBy = user.id;
      db.products.push(nextProduct);

      const stock = Math.max(0, Math.round(Number(body.stock) || 0));
      db.inventory[productId] = {
        stock,
        updatedAt: new Date().toISOString(),
        updatedBy: user.id
      };
      db.inventoryLog.push({
        id: crypto.randomUUID(),
        productId,
        previousStock: 0,
        stock,
        delta: stock,
        userId: user.id,
        userName: user.name,
        createdAt: new Date().toISOString()
      });

      await writeDbAsync(db);
      sendJson(res, 201, {
        product: publicProduct(nextProduct),
        products: publicProducts(db),
        inventory: publicInventory(db.inventory)[productId]
      });
      return;
    }

    if (url.pathname === "/api/admin/products" && method === "PATCH") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "Only the store owner can edit products." });
        return;
      }

      const body = await readJson(req);
      const productId = String(body.productId || "").trim();
      const productIndex = db.products.findIndex((product) => product.id === productId);

      if (productIndex === -1) {
        sendJson(res, 404, { message: "Product not found." });
        return;
      }

      const productPatch = sanitizeProductPatch(body, db.products[productIndex]);
      const nextProduct = productPatch.product;
      if (!nextProduct) {
        sendJson(res, 400, { message: productPatch.message || "Fill product title, descriptions, and price correctly." });
        return;
      }

      nextProduct.id = db.products[productIndex].id;
      nextProduct.updatedAt = new Date().toISOString();
      nextProduct.updatedBy = user.id;
      db.products[productIndex] = nextProduct;

      await writeDbAsync(db);
      sendJson(res, 200, { product: publicProduct(nextProduct), products: publicProducts(db) });
      return;
    }

    if (url.pathname === "/api/admin/products/photo" && method === "POST") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "Only the store owner can upload product photos." });
        return;
      }

      const body = await readJson(req, maxJsonBodyBytes);
      const productId = String(body.productId || "").trim();
      const productIndex = db.products.findIndex((product) => product.id === productId);

      if (productIndex === -1) {
        sendJson(res, 404, { message: "Product not found." });
        return;
      }

      const parsed = parseProductImageDataUrl(body.dataUrl);
      if (!parsed) {
        sendJson(res, 400, { message: "Upload JPG, PNG, or WEBP up to 2.5 MB after compression." });
        return;
      }

      const hash = crypto.createHash("sha256").update(parsed.buffer).digest("hex").slice(0, 16);
      const extension = getImageExtension(parsed.mimeType);
      const imageId = `${productId}-${Date.now().toString(36)}-${hash}.${extension}`;
      const fileName = safeFileName(body.fileName, extension);
      const product = db.products[productIndex];
      const imageUrl = `/api/product-images/${encodeURIComponent(imageId)}`;
      const currentGallery = Array.isArray(product.gallery) ? product.gallery : [];
      const hasGalleryImages = currentGallery.some((item) => item?.image);
      const currentImageId = getProductImageIdFromUrl(product.image);
      const galleryBase =
        hasGalleryImages
          ? currentGallery
          : currentImageId
            ? [
                {
                  label: product.imageName || "Photo 1",
                  focus: product.focus || "center",
                  image: product.image
                }
              ]
            : [];
      const nextGallery = [
        ...galleryBase,
        {
          label: fileName.replace(/\.[^.]+$/, ""),
          focus: product.focus || "center",
          image: imageUrl
        }
      ].slice(0, 20);

      db.productImages[imageId] = {
        id: imageId,
        productId,
        fileName,
        mimeType: parsed.mimeType,
        data: parsed.buffer.toString("base64"),
        size: parsed.buffer.length,
        createdAt: new Date().toISOString(),
        updatedBy: user.id
      };

      db.products[productIndex] = {
        ...product,
        image: hasGalleryImages || currentImageId ? product.image : imageUrl,
        imageName: fileName,
        gallery: nextGallery,
        updatedAt: new Date().toISOString(),
        updatedBy: user.id
      };

      await writeDbAsync(db);
      sendJson(res, 200, { product: publicProduct(db.products[productIndex]), products: publicProducts(db) });
      return;
    }

    if (url.pathname === "/api/admin/products/photo" && method === "DELETE") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "Only the store owner can delete product photos." });
        return;
      }

      const body = await readJson(req);
      const productId = String(body.productId || "").trim();
      const imageUrl = String(body.image || body.imageUrl || "").trim();
      const imageId = getProductImageIdFromUrl(imageUrl);
      const productIndex = db.products.findIndex((product) => product.id === productId);

      if (productIndex === -1) {
        sendJson(res, 404, { message: "Product not found." });
        return;
      }

      if (!imageId || !db.productImages?.[imageId]) {
        sendJson(res, 404, { message: "Product photo not found." });
        return;
      }

      const product = db.products[productIndex];
      const currentGallery = Array.isArray(product.gallery) ? product.gallery : [];
      const nextGallery = currentGallery.filter((item) => item?.image !== imageUrl);
      const wasInGallery = nextGallery.length !== currentGallery.length;

      if (!wasInGallery && product.image !== imageUrl) {
        sendJson(res, 404, { message: "Product photo is not attached to this product." });
        return;
      }

      const nextCover = nextGallery.find((item) => item?.image);
      const nextImage = product.image === imageUrl ? nextCover?.image || DEFAULT_PRODUCT_IMAGE : product.image;
      const nextImageName = product.image === imageUrl ? nextCover?.label || "" : product.imageName || "";

      delete db.productImages[imageId];
      db.products[productIndex] = {
        ...product,
        image: nextImage,
        imageName: nextImageName,
        gallery: nextGallery.length ? nextGallery : [{ label: "General view", focus: product.focus || "center" }],
        updatedAt: new Date().toISOString(),
        updatedBy: user.id
      };

      await writeDbAsync(db);
      sendJson(res, 200, { product: publicProduct(db.products[productIndex]), products: publicProducts(db) });
      return;
    }

    if (url.pathname === "/api/admin/reviews" && method === "GET") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "Only the store owner can delete reviews." });
        return;
      }

      const reviews = db.reviews
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(publicReview);
      sendJson(res, 200, { reviews });
      return;
    }

    if (url.pathname === "/api/admin/reviews" && method === "DELETE") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in as the store owner." });
        return;
      }

      if (!isAdmin(user)) {
        sendJson(res, 403, { message: "Only the store owner can delete reviews." });
        return;
      }

      const body = await readJson(req);
      const reviewId = String(body.reviewId || "").trim();
      const reviewIndex = db.reviews.findIndex((review) => review.id === reviewId);

      if (reviewIndex === -1) {
        sendJson(res, 404, { message: "Review not found." });
        return;
      }

      const [review] = db.reviews.splice(reviewIndex, 1);
      await writeDbAsync(db);
      sendJson(res, 200, { ok: true, review: publicReview(review) });
      return;
    }

    if (url.pathname === "/api/profile" && method === "PATCH") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in." });
        return;
      }

      const body = await readJson(req);
      user.name = String(body.name || user.name).trim();
      user.phone = String(body.phone || user.phone).trim();
      user.address = {
        city: String(body.city || "").trim(),
        state: String(body.state || "").trim().toUpperCase(),
        zip: String(body.zip || "").trim(),
        address: String(body.address || "").trim(),
        apartment: String(body.apartment || "").trim(),
        entrance: String(body.entrance || "").trim()
      };

      await writeDbAsync(db);
      sendJson(res, 200, { user: publicUser(user) });
      return;
    }

    if (url.pathname === "/api/orders" && method === "GET") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "You must be logged in." });
        return;
      }

      const orders = db.orders
        .filter((order) => order.userId === user.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      sendJson(res, 200, { orders });
      return;
    }

    if (url.pathname === "/api/orders" && method === "POST") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "Please log in or register to place an order." });
        return;
      }

      const body = await normalizeCheckoutBody(await readJson(req), db);
      const result = createOrderFromPayload(db, user, body);

      if (!result.order) {
        sendJson(res, result.status, { message: result.message });
        return;
      }

      if (result.order.payment?.status === "paid") {
        await notifyOrderStatus(result.order, "order_paid", "order paid / confirmed");
      }

      await writeDbAsync(db);
      sendJson(res, 201, { order: result.order });
      return;
    }

    if (url.pathname === "/api/reviews/summary" && method === "GET") {
      sendJson(res, 200, { summary: getReviewSummary(db.reviews) });
      return;
    }

    if (url.pathname === "/api/reviews" && method === "GET") {
      const user = getSessionUser(req, db);
      const productId = String(url.searchParams.get("productId") || "").trim();
      const reviews = db.reviews
        .filter((review) => !productId || review.productId === productId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const userReview = productId && user ? reviews.find((review) => review.userId === user.id) : null;

      sendJson(res, 200, {
        reviews: reviews.map(publicReview),
        summary: productId ? getReviewSummary(reviews)[productId] || { count: 0, average: 0 } : getReviewSummary(reviews),
        userHasReviewed: Boolean(userReview),
        userReview: publicReview(userReview)
      });
      return;
    }

    if (url.pathname === "/api/reviews" && method === "POST") {
      const user = getSessionUser(req, db);
      if (!user) {
        sendJson(res, 401, { message: "Only registered customers can post reviews." });
        return;
      }

      const body = await readJson(req);
      const productId = String(body.productId || "").trim();
      const text = String(body.text || "").trim();
      const rating = Number(body.rating || 0);

      if (!productId || text.length < 3 || rating < 1 || rating > 5) {
        sendJson(res, 400, { message: "Choose a rating and write a review of at least 3 characters." });
        return;
      }

      if (db.reviews.some((review) => review.productId === productId && review.userId === user.id)) {
        sendJson(res, 409, { message: "You have already reviewed this product." });
        return;
      }

      const review = {
        id: crypto.randomUUID(),
        productId,
        userId: user.id,
        userName: user.name,
        rating,
        text,
        createdAt: new Date().toISOString()
      };

      db.reviews.push(review);
      await writeDbAsync(db);
      sendJson(res, 201, { review: publicReview(review) });
      return;
    }

    sendJson(res, 404, { message: "API not found." });
  } catch (error) {
    sendJson(res, 400, { message: error.message || "Request error." });
  }
}

function applyNoIndexToHtml(html) {
  const noIndexMeta = '<meta name="robots" content="noindex, nofollow, noarchive" />';
  if (/<meta\s+name=["']robots["'][^>]*>/i.test(html)) {
    return html.replace(/<meta\s+name=["']robots["'][^>]*>/i, noIndexMeta);
  }

  return html.replace(/<head([^>]*)>/i, `<head$1>\n    ${noIndexMeta}`);
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.resolve(root, `.${requestedPath}`);
  const safeRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (filePath !== root && !filePath.startsWith(safeRoot)) {
    res.writeHead(403, noIndexHeader);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, async (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...noIndexHeader });
      res.end("File not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    let responseContent = content;

    if (ext === ".html") {
      responseContent = Buffer.from(applyNoIndexToHtml(responseContent.toString("utf8")));
    }

    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", ...noIndexHeader });
    res.end(responseContent);
  });
}

async function appHandler(req, res) {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }

  const pathname = new URL(req.url, getRequestOrigin(req)).pathname;
  if (pathname === "/robots.txt") {
    const robotsPath = path.join(root, "robots.txt");
    const robots = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, "utf8") : "User-agent: *\nDisallow: /";
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...noIndexHeader });
    res.end(robots);
    return;
  }

  if (pathname === "/sitemap.xml") {
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", ...noIndexHeader });
    res.end(renderSitemapXml(req));
    return;
  }

  if (stripTrailingSlash(pathname) === "/blog") {
    req.url = "/blog.html";
    serveStatic(req, res);
    return;
  }

  if (await tryRenderSeoRoute(req, res, pathname)) {
    return;
  }

  serveStatic(req, res);
}

function getSocketUser(socket, db) {
  const cookieHeader = socket.handshake.headers.cookie || "";
  const token = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [key, ...value] = item.split("=");
        return [key, decodeURIComponent(value.join("="))];
      })
  )[sessionCookie];

  if (!token) return null;
  const session = db.sessions.find((item) => item.token === token && item.expiresAt > Date.now());
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}

function socketHasAdminAccess(socket, db) {
  const user = getSocketUser(socket, db);
  return { ok: isAdmin(user) || hasChatAdminToken(socket.handshake.auth?.adminToken), user };
}

function attachChatSocket(httpServer) {
  chatIo = new SocketServer(httpServer, {
    maxHttpBufferSize: maxJsonBodyBytes,
    cors: {
      origin: true,
      credentials: true
    }
  });

  chatIo.on("connection", (socket) => {
    socket.emit("chat:connected", { ok: true });

    socket.on("chat:customer:join", async (payload = {}, reply) => {
      try {
        const db = await readDbAsync();
        const user = getSocketUser(socket, db);
        const resolved = ensureCustomerChatConversation(
          db,
          { ...payload, clientToken: payload.clientToken || socket.data.clientToken || "" },
          user
        );
        const conversation = resolved.conversation;
        markChatRead(conversation, "customer");
        await writeDbAsync(db);

        socket.data.conversationId = conversation.id;
        socket.data.clientToken = resolved.clientToken || payload.clientToken || socket.data.clientToken || "";
        socket.join(`chat:${conversation.id}`);
        const response = { conversation: publicChatConversation(conversation, db, { withMessages: true, clientToken: socket.data.clientToken }) };
        socket.emit("chat:ready", response);
        chatIo.to("chat:admins").emit("chat:conversation", { conversation: publicChatConversation(conversation, db) });
        if (typeof reply === "function") reply(response);
      } catch (error) {
        socket.emit("chat:error", { message: error.message || "Chat connection failed." });
      }
    });

    socket.on("chat:admin:join", async (payload = {}, reply) => {
      try {
        const db = await readDbAsync();
        const admin = socketHasAdminAccess(socket, db);
        if (!admin.ok) {
          socket.emit("chat:error", { message: "Owner access is required for live chat." });
          return;
        }

        socket.data.isChatAdmin = true;
        socket.join("chat:admins");

        const conversationId = String(payload.conversationId || "").trim();
        const conversation = conversationId ? db.chatConversations.find((item) => item.id === conversationId) : null;
        if (conversation) {
          markChatRead(conversation, "admin");
          await writeDbAsync(db);
          socket.join(`chat:${conversation.id}`);
        }

        const conversations = db.chatConversations
          .slice()
          .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt || b.createdAt) - new Date(a.lastMessageAt || a.updatedAt || a.createdAt))
          .map((item) => publicChatConversation(item, db));
        const response = {
          conversations,
          conversation: publicChatConversation(conversation, db, { withMessages: true })
        };
        socket.emit("chat:admin:ready", response);
        if (typeof reply === "function") reply(response);
      } catch (error) {
        socket.emit("chat:error", { message: error.message || "Chat connection failed." });
      }
    });

    socket.on("chat:admin:open", async (payload = {}, reply) => {
      try {
        const db = await readDbAsync();
        const admin = socketHasAdminAccess(socket, db);
        if (!admin.ok) {
          socket.emit("chat:error", { message: "Owner access is required for live chat." });
          return;
        }

        const conversation = db.chatConversations.find((item) => item.id === String(payload.conversationId || "").trim());
        if (!conversation) {
          socket.emit("chat:error", { message: "Chat conversation not found." });
          return;
        }

        markChatRead(conversation, "admin");
        await writeDbAsync(db);
        socket.join(`chat:${conversation.id}`);
        const response = { conversation: publicChatConversation(conversation, db, { withMessages: true }) };
        socket.emit("chat:admin:conversation", response);
        if (typeof reply === "function") reply(response);
      } catch (error) {
        socket.emit("chat:error", { message: error.message || "Chat connection failed." });
      }
    });

    socket.on("chat:message:send", async (payload = {}, reply) => {
      try {
        const db = await readDbAsync();
        const admin = socketHasAdminAccess(socket, db);
        const senderType = admin.ok && payload.senderType === "admin" ? "admin" : "customer";
        const user = senderType === "admin" ? admin.user : getSocketUser(socket, db);
        const resolvedCustomerConversation =
          senderType === "customer"
            ? ensureCustomerChatConversation(
                db,
                {
                  ...payload,
                  conversationId: payload.conversationId || socket.data.conversationId,
                  clientToken: payload.clientToken || socket.data.clientToken || ""
                },
                user
              )
            : null;
        const conversation =
          senderType === "admin"
            ? db.chatConversations.find((item) => item.id === String(payload.conversationId || socket.data.conversationId || "").trim())
            : resolvedCustomerConversation.conversation;

        if (!conversation) {
          socket.emit("chat:error", { message: "Chat conversation not found." });
          return;
        }

        const message = addChatMessage(
          db,
          conversation,
          senderType,
          payload.text || payload.message,
          senderType === "admin" ? user?.name || "HOODYBOODY" : conversation.customer?.name || user?.name || "Customer",
          payload.attachments
        );

        if (!message) {
          socket.emit("chat:error", { message: "Write a message before sending." });
          return;
        }

        await writeDbAsync(db);
        socket.data.conversationId = conversation.id;
        if (senderType === "customer") socket.data.clientToken = resolvedCustomerConversation.clientToken || payload.clientToken || socket.data.clientToken || "";
        socket.join(`chat:${conversation.id}`);
        emitChatUpdate(db, conversation, message);
        if (senderType === "customer") await notifyChatAdmins(db, conversation, message);
        const response = {
          conversation: publicChatConversation(conversation, db, { withMessages: true, clientToken: senderType === "customer" ? socket.data.clientToken : undefined }),
          message: publicChatMessage(message)
        };
        if (typeof reply === "function") reply(response);
      } catch (error) {
        socket.emit("chat:error", { message: error.message || "Message was not sent." });
      }
    });
  });
}

const orderController = createOrderController({
  createOrderFromPayload,
  getSessionUser,
  isAdmin,
  readDbAsync,
  shippoApiKey,
  shippingOrigin,
  stripeSecretKey,
  stripeWebhookSecret,
  writeDbAsync
});
const expressApp = express();

expressApp.use("/api", createStripeWebhookRouter({ express, orderController }));
expressApp.use("/api", createAdminOrderRouter({ express, orderController }));
expressApp.get("/admin/orders", (req, res) => {
  res.sendFile(path.join(root, "admin-orders.html"));
});

expressApp.get("/admin/categories", (req, res) => {
  res.sendFile(path.join(root, "admin-categories.html"));
});

expressApp.get("/admin/chat", (req, res) => {
  res.sendFile(path.join(root, "admin-chat.html"));
});
expressApp.use((req, res) => appHandler(req, res));

const server = http.createServer(expressApp);
attachChatSocket(server);

if (require.main === module) {
  server.listen(port, () => {
    ensureDb();
    console.log(`Site started: http://localhost:${port}`);
  });
}

module.exports = expressApp;
