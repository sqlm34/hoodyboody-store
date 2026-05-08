const http = require("http");
const https = require("https");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || localEnv.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || localEnv.STRIPE_WEBHOOK_SECRET || "";
const stripeCurrency = String(process.env.STRIPE_CURRENCY || localEnv.STRIPE_CURRENCY || "usd").toLowerCase();
const shippoApiKey = process.env.SHIPPO_API_KEY || localEnv.SHIPPO_API_KEY || "";
const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || localEnv.UPSTASH_REDIS_REST_URL || localEnv.KV_REST_API_URL || "";
const redisRestToken =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || localEnv.UPSTASH_REDIS_REST_TOKEN || localEnv.KV_REST_API_TOKEN || "";
const redisDbKey = process.env.NITKA_REDIS_DB_KEY || localEnv.NITKA_REDIS_DB_KEY || "nitka:db";
const hasRedisDb = Boolean(redisRestUrl && redisRestToken);
const maxJsonBodyBytes = 6_500_000;
const maxProductImageBytes = 2_500_000;
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
    image: "assets/embroidered-collection.png",
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
    image: "assets/embroidered-collection.png",
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
    image: "assets/embroidered-collection.png",
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
    image: "assets/embroidered-collection.png",
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
    image: "assets/embroidered-collection.png",
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
    image: "assets/embroidered-collection.png",
    colors: [
      { name: "Black", value: "#202326" },
      { name: "Indigo", value: "#263b73" },
      { name: "Milky", value: "#f3eadb" }
    ],
    longDescription:
      "Soft bomber with large embroidery on the back to order. You can adapt the motif, scale and thread palette.",
    gallery: [
      { label: "General view", focus: "64% 62%" },
      { label: "Back", focus: "66% 55%" },
      { label: "Cuff", focus: "58% 72%" }
    ]
  }
];
const emptyDb = { users: [], sessions: [], orders: [], reviews: [], inventory: {}, inventoryLog: [], pendingStripeOrders: [], products: [], productImages: {} };
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
  ".svg": "image/svg+xml"
};

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
    ...headers
  });
  res.end(JSON.stringify(payload));
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
  return user?.role === "admin";
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
    image: normalizedProduct.image || "assets/embroidered-collection.png",
    imageName: normalizedProduct.imageName || "",
    colors: Array.isArray(normalizedProduct.colors) ? normalizedProduct.colors : [],
    longDescription: normalizedProduct.longDescription || normalizedProduct.description,
    gallery: Array.isArray(normalizedProduct.gallery) ? normalizedProduct.gallery : [],
    seoTitle: normalizedProduct.seoTitle || "",
    seoDescription: normalizedProduct.seoDescription || "",
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
    seoTitle: String(body.seoTitle || "").trim().slice(0, 160),
    seoDescription: String(body.seoDescription || "").trim().slice(0, 260),
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
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const user = db.users.find((item) => item.email === email);

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
        seoTitle: "",
        seoDescription: "",
        image: "assets/embroidered-collection.png",
        imageName: "",
        focus: "50% 50%",
        price: 0,
        sizes: ["S", "M", "L"],
        isDigital: false,
        shipping: getDefaultProductShipping({ type: "tops" }),
        colors: [{ name: "Black", value: "#202326" }],
        gallery: [{ label: "General view", focus: "50% 50%", image: "assets/embroidered-collection.png" }]
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
      const nextImage = product.image === imageUrl ? nextCover?.image || "assets/embroidered-collection.png" : product.image;
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

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.resolve(root, `.${requestedPath}`);
  const safeRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (filePath !== root && !filePath.startsWith(safeRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, async (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("File not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    let responseContent = content;

    if (requestedPath === "/product.html") {
      try {
        const db = await readDbAsync();
        const productId = new URL(req.url, getRequestOrigin(req)).searchParams.get("id");
        const product = getProduct(productId, db);

        if (product) {
          const title = product.seoTitle || `${product.title} | HOODYBOODY`;
          const description = product.seoDescription || product.longDescription || product.description;
          const image = absoluteUrl(req, product.image);
          const productUrl = `${getRequestOrigin(req).replace(/\/$/, "")}/product.html?id=${encodeURIComponent(product.id)}`;
          const seo = `
    <title>${escapeHtmlAttribute(title)}</title>
    <meta name="description" content="${escapeHtmlAttribute(description)}" />
    <meta property="og:title" content="${escapeHtmlAttribute(title)}" />
    <meta property="og:description" content="${escapeHtmlAttribute(description)}" />
    <meta property="og:type" content="product" />
    <meta property="og:url" content="${escapeHtmlAttribute(productUrl)}" />
    ${image ? `<meta property="og:image" content="${escapeHtmlAttribute(image)}" />` : ""}
    <link rel="canonical" href="${escapeHtmlAttribute(productUrl)}" />`;
          responseContent = Buffer.from(content.toString("utf8").replace(/<title>.*?<\/title>/, seo));
        }
      } catch {
        responseContent = content;
      }
    }

    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(responseContent);
  });
}

function appHandler(req, res) {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }

  serveStatic(req, res);
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
expressApp.use((req, res) => appHandler(req, res));

const server = http.createServer(expressApp);

if (require.main === module) {
  server.listen(port, () => {
    ensureDb();
    console.log(`Site started: http://localhost:${port}`);
  });
}

module.exports = expressApp;
