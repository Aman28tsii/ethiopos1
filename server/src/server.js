import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { testConnection } from './config/database.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import saleRoutes from './routes/sales.js';
import orderRoutes from './routes/orders.js';
import tableRoutes from './routes/tables.js';
import waiterRoutes from './routes/waiter.js';
import dashboardRoutes from './routes/dashboard.js';
import expenseRoutes from './routes/expenses.js';
import profitRoutes from './routes/profit.js';
import ingredientRoutes from './routes/ingredients.js';
import recipeRoutes from './routes/recipes.js';
import categoryRoutes from './routes/categories.js';
import customerRoutes from './routes/customers.js';
import kitchenRoutes from './routes/kitchen.js';

import { errorHandler, notFound } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io accessible to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/waiter', waiterRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/profit', profitRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/kitchen', kitchenRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
async function startServer() {
  const dbConnected = await testConnection();
  
  if (!dbConnected) {
    console.error('Database connection failed. Exiting...');
    process.exit(1);
  }
  
  httpServer.listen(PORT, () => {
    console.log('Server running on http://localhost:' + PORT);
    console.log('Products API: http://localhost:' + PORT + '/api/products');
    console.log('Sales API: http://localhost:' + PORT + '/api/sales');
    console.log('Orders API: http://localhost:' + PORT + '/api/orders');
    console.log('Tables API: http://localhost:' + PORT + '/api/tables');
    console.log('WebSocket enabled - Real-time updates active');
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
