// server/src/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
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
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const server = createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';
const PORT = process.env.PORT || 5000;

// ✅ FIX: Allow ALL origins to prevent CORS issues
const corsOptions = {
    origin: '*', // Allow all origins for now
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Requested-With"]
};

// ✅ Apply CORS middleware
app.use(cors(corsOptions));

// ✅ Handle preflight requests
app.options('*', cors(corsOptions));

// ✅ Socket.IO with relaxed CORS
const io = new SocketServer(server, {
    cors: {
        origin: '*',
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"]
    },
    path: "/socket.io",
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    cookie: false,
    upgrade: true,
    allowUpgrades: true
});

// Socket.IO authentication middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (!token) {
        console.log('[SOCKET] No token provided');
        return next(new Error('Authentication required'));
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
            company_id: decoded.company_id || 1,
            branch_id: decoded.branch_id || 1,
            name: decoded.name
        };
        next();
    } catch (error) {
        console.log('[SOCKET] Token verification failed:', error.message);
        return next(new Error('Invalid token'));
    }
});

app.set("io", io);

// ✅ Other middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// ROUTES
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

// ============================================================
// HEALTH CHECK - With CORS headers
// ============================================================

app.get("/health", (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
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
// ERROR HANDLING
// ============================================================

app.use(notFound);
app.use(errorHandler);

// ============================================================
// SOCKET.IO EVENTS
// ============================================================

io.on("connection", (socket) => {
    const user = socket.user;
    console.log(`[SOCKET] Client connected: ${socket.id} (${user?.email || 'unknown'})`);
    console.log(`[SOCKET] Transport: ${socket.conn.transport.name}`);

    // ✅ Keep connection alive with ping
    socket.on('ping', () => {
        socket.emit('pong');
    });

    socket.on('join_branch', (data) => {
        try {
            const branchRoom = `branch_${data.company_id}_${data.branch_id}`;
            socket.join(branchRoom);
            console.log(`[SOCKET] ${socket.id} joined ${branchRoom}`);
            
            if (data.role) {
                const roleRoom = `role_${data.role}_${data.branch_id}`;
                socket.join(roleRoom);
                console.log(`[SOCKET] ${socket.id} joined ${roleRoom}`);
            }
        } catch (err) {
            console.error('[SOCKET] join_branch error:', err);
        }
    });

    socket.on('join_waiter', (data) => {
        try {
            const waiterRoom = `waiter_${data.user_id}`;
            socket.join(waiterRoom);
            console.log(`[SOCKET] ${socket.id} joined ${waiterRoom}`);
        } catch (err) {
            console.error('[SOCKET] join_waiter error:', err);
        }
    });

    socket.on('join_kitchen', (data) => {
        try {
            const kitchenRoom = `kitchen_${data.branch_id}`;
            socket.join(kitchenRoom);
            console.log(`[SOCKET] ${socket.id} joined ${kitchenRoom}`);
        } catch (err) {
            console.error('[SOCKET] join_kitchen error:', err);
        }
    });

    socket.on('join_cashier', (data) => {
        try {
            const cashierRoom = `cashier_${data.branch_id}`;
            socket.join(cashierRoom);
            console.log(`[SOCKET] ${socket.id} joined ${cashierRoom}`);
        } catch (err) {
            console.error('[SOCKET] join_cashier error:', err);
        }
    });

    socket.conn.on('upgrade', () => {
        console.log(`[SOCKET] Transport upgraded to: ${socket.conn.transport.name}`);
    });

    socket.on('error', (error) => {
        console.error(`[SOCKET] Socket error for ${socket.id}:`, error);
    });

    socket.on("disconnect", (reason) => {
        console.log(`[SOCKET] Client disconnected: ${socket.id} (${reason})`);
    });
});

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/api`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}/socket.io`);
    
    const dbConnected = await testConnection();
    if (dbConnected) {
        console.log("✅ Database connected successfully");
    } else {
        console.log("❌ Database connection failed");
    }
});

export { app, server, io };