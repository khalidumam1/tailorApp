const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const products = [
  { id: 1, name: 'Classic Suit', price: 1800, category: 'Menswear' },
  { id: 2, name: 'Bridal Lehenga', price: 4200, category: 'Bridal' },
  { id: 3, name: 'Shalwar Kameez', price: 1500, category: 'Women' },
];

const orders = [
  { id: 1, customer: 'Ali Khan', status: 'In progress', total: 1800 },
  { id: 2, customer: 'Sara Ahmed', status: 'Ready for pickup', total: 4200 },
];

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'tailorapp-backend', timestamp: new Date().toISOString() });
});

app.get('/api/products', (req, res) => {
  res.json(products);
});

app.get('/api/orders', (req, res) => {
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const { customer, status, total } = req.body;

  const newOrder = {
    id: Date.now(),
    customer: customer || 'New Customer',
    status: status || 'Pending',
    total: total || 0,
  };

  orders.push(newOrder);
  res.status(201).json(newOrder);
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  return res.json({
    message: 'Login successful',
    user: {
      id: 1,
      name: 'Tailor Admin',
      email,
      role: 'admin',
    },
  });
});

app.listen(port, () => {
  console.log(`TailorApp API running on http://localhost:${port}`);
});
