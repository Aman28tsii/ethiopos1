// server/src/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { pool, testConnection } from "./config/database.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import expenseRoutes from "./routes/expenses.js";
import ingredientRoutes from "./routes/ingredients.js";
import kitchenRoutes from "./routes/kitchen.js";
import orderRoutes from "./routes/orders.js";
import productRoutes from "./routes/products.js";
import profitRoutes from "./routes/profit.js";
import recipeRoutes from "./routes/recipes.js";
import saleRoutes from "./routes/sales.js";
import tableRoutes from "./routes/tables.js";
import waiterRoutes from "./routes/waiter.js";
import categoryRoutes from "./routes/categories.js";
import customerRoutes from "./routes/customers.js";
import companyRoutes from "./routes/companies.js";
import branchRoutes from "./routes/branches.js";
import platformAdminRoutes from "./routes/platformAdmin.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { ensureIdempotencyTable } from "./middleware/idempotency.js";
import { ensureRateLimitTable } from "./middleware/rateLimiter.js";
import jwt from 'jsonwebtoken';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const server = createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';
const PORT = process.env.PORT || 5000;

// ============================================================
// ALLOWED ORIGINS
// ============================================================

const allowedOrigins = [
    'https://ethiopos1-1.onrender.com',
    'https://ethiopos1.onrender.com',
    'http://localhost:3000',
    'http://localhost:3001',
    'https://ethiopos-offline-pos.onrender.com'
];

// ============================================================
// CORS CONFIGURATION
// ============================================================

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            if (process.env.NODE_ENV !== 'production') {
                callback(null, true);
            } else {
                console.log(`[CORS] Blocked origin: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Idempotency-Key",
        "cache-control",
        "X-Requested-With",
        "Accept",
        "Origin"
    ]
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ============================================================
// TRUST PROXY CONFIGURATION
// ============================================================

app.set('trust proxy', 1);

// ============================================================
// Socket.IO with CORS
// ============================================================

const io = new SocketServer(server, {
    cors: corsOptions,
    path: "/socket.io",
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    cookie: false
});

app.set("io", io);

// ============================================================
// SOCKET.IO AUTHENTICATION MIDDLEWARE
//
// Every socket must present a valid JWT containing company_id and
// branch_id. We DO NOT fall back to any default tenant. A token
// missing tenant context is rejected before any handler runs.
// ============================================================
io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
        return next(new Error('Authentication required'));
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Require explicit tenant context — no fallbacks.
        if (!decoded.company_id || !decoded.branch_id) {
            return next(new Error('Invalid token: missing tenant context'));
        }
        if (!decoded.id || !decoded.role) {
            return next(new Error('Invalid token: missing identity'));
        }

        socket.user = {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
            company_id: decoded.company_id,
            branch_id: decoded.branch_id,
            name: decoded.name
        };
        next();
    } catch (error) {
        return next(new Error('Invalid token'));
    }
});

// ============================================================
// Middleware
// ============================================================

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// API Routes - MUST BE BEFORE STATIC FILES
// ============================================================

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/ingredients", ingredientRoutes);
app.use("/api/kitchen", kitchenRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/products", productRoutes);
app.use("/api/profit", profitRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/waiter", waiterRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/platform-admin", platformAdminRoutes);

// ============================================================
// Health Check - Must be before static files
// ============================================================

app.get("/health", (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, cache-control');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
    res.json({
        name: "EthioPOS API",
        version: "1.0.0",
        status: "running",
        endpoints: "/api/*"
    });
});

// ============================================================
// Serve Static Files (Frontend) - ONLY IN PRODUCTION
// ============================================================

if (process.env.NODE_ENV === 'production') {
    const buildPath = path.join(__dirname, '../../client/build');
    console.log(`[STATIC] Serving static files from: ${buildPath}`);

    app.use(express.static(buildPath));

    app.get('*', (req, res) => {
        if (req.path.startsWith('/api/')) {
            return res.status(404).json({ success: false, error: 'API endpoint not found' });
        }
        res.sendFile(path.join(buildPath, 'index.html'));
    });
}

// ============================================================
// Error Handling
// ============================================================

app.use(notFound);
app.use(errorHandler);

// ============================================================
// Socket.IO Events
//
// Every socket is auto-joined to the rooms it is authorized for,
// derived exclusively from socket.user (verified JWT).
//
// Client-supplied join events are accepted for backward
// compatibility but NEVER grant additional membership; any
// mismatch with socket.user is logged and ignored.
//
// All room names are company-scoped to prevent cross-tenant
// collisions on shared branch IDs:
//   branch_${companyId}_${branchId}
//   kitchen_${companyId}_${branchId}
//   cashier_${companyId}_${branchId}
//   waiter_${companyId}_${branchId}
//   waiter_user_${userId}
// ============================================================

const buildTenantRooms = (user) => {
    const rooms = [];
    if (!user || !user.company_id || !user.branch_id) return rooms;

    // Every authenticated user joins their company+branch room.
    rooms.push(`branch_${user.company_id}_${user.branch_id}`);

    // Role-scoped rooms.
    if (user.role === 'kitchen') {
        rooms.push(`kitchen_${user.company_id}_${user.branch_id}`);
    }
    if (user.role === 'cashier') {
        rooms.push(`cashier_${user.company_id}_${user.branch_id}`);
    }
    if (user.role === 'waiter') {
        rooms.push(`waiter_${user.company_id}_${user.branch_id}`);
        rooms.push(`waiter_user_${user.id}`);
    }
    return rooms;
};

io.on("connection", (socket) => {
    const user = socket.user;
    console.log(`[SOCKET] Connected: ${socket.id} user=${user.id} role=${user.role} company=${user.company_id} branch=${user.branch_id}`);

    // Auto-join authorized rooms — derived exclusively from socket.user.
    const rooms = buildTenantRooms(user);
    rooms.forEach((room) => {
        socket.join(room);
    });
    console.log(`[SOCKET] ${socket.id} auto-joined: ${rooms.join(', ')}`);

    // ------------------------------------------------------------
    // Backward-compatible join events.
    //
    // These exist for legacy clients only. They DO NOT grant any
    // membership beyond what socket.user is already authorized for.
    // Any mismatch is logged and silently ignored.
    // ------------------------------------------------------------
    socket.on('join_branch', (data) => {
        const requestedCompany = parseInt(data?.company_id);
        const requestedBranch = parseInt(data?.branch_id);
        if (requestedCompany === user.company_id && requestedBranch === user.branch_id) {
            socket.join(`branch_${user.company_id}_${user.branch_id}`);
        } else {
            console.warn(`[SOCKET] ${socket.id} unauthorized join_branch attempt: ${JSON.stringify(data)}`);
        }
    });

    socket.on('join_kitchen', (data) => {
        const requestedBranch = parseInt(data?.branch_id);
        if (user.role === 'kitchen' && requestedBranch === user.branch_id) {
            socket.join(`kitchen_${user.company_id}_${user.branch_id}`);
        } else {
            console.warn(`[SOCKET] ${socket.id} unauthorized join_kitchen attempt: ${JSON.stringify(data)}`);
        }
    });

    socket.on('join_waiter', (data) => {
        const requestedUserId = parseInt(data?.user_id);
        if (user.role === 'waiter' && requestedUserId === user.id) {
            socket.join(`waiter_user_${user.id}`);
        } else {
            console.warn(`[SOCKET] ${socket.id} unauthorized join_waiter attempt: ${JSON.stringify(data)}`);
        }
    });

    socket.on('join_cashier', (data) => {
        const requestedBranch = parseInt(data?.branch_id);
        if (user.role === 'cashier' && requestedBranch === user.branch_id) {
            socket.join(`cashier_${user.company_id}_${user.branch_id}`);
        } else {
            console.warn(`[SOCKET] ${socket.id} unauthorized join_cashier attempt: ${JSON.stringify(data)}`);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log(`[SOCKET] Disconnected: ${socket.id} (${reason})`);
    });
});

// ============================================================
// Start Server
// ============================================================

server.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/api`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}/socket.io`);
    console.log(`📡 CORS allowed origins: ${allowedOrigins.join(', ')}`);

    const dbConnected = await testConnection();
    if (dbConnected) {
        console.log("✅ Database connected successfully");
        await ensureIdempotencyTable();
        await ensureRateLimitTable();
    } else {
        console.log("❌ Database connection failed");
    }
});

export { app, server, io };