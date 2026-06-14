require('dotenv').config();
const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/error.middleware');

const authRoutes = require('./routes/auth.routes');
const groupRoutes = require('./routes/group.routes');
const expenseRoutes = require('./routes/expense.routes');
const settlementRoutes = require('./routes/settlement.routes');
const balanceRoutes = require('./routes/balance.routes');
const importRoutes = require('./routes/import.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Config global middlewares
app.use(cors({
  origin: '*', // For testing purposes, allows frontend connections from any origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve API Routes
app.use('/auth', authRoutes);
app.use('/groups', groupRoutes);
app.use('/expenses', expenseRoutes);
app.use('/settlements', settlementRoutes);
app.use('/balances', balanceRoutes);
app.use('/import', importRoutes);

// Simple healthcheck route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Shared Expense Management Server is running.' });
});

// Central Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
