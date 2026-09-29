import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

function App() {
  const stats = [
    { label: 'Orders', value: '128' },
    { label: 'Revenue', value: 'PKR 1.9L' },
    { label: 'Pending', value: '14' },
    { label: 'Customers', value: '96' },
  ];

  const products = [
    { name: 'Classic Suit', price: 'PKR 1800' },
    { name: 'Bridal Lehenga', price: 'PKR 4200' },
    { name: 'Shalwar Kameez', price: 'PKR 1500' },
  ];

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>TailorApp</h1>
        </div>
        <button className="primary-btn">+ New Order</button>
      </header>

      <section className="stats-grid">
        {stats.map((item) => (
          <div className="stat-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      <section className="content-grid">
        <div className="panel">
          <h2>Recent Orders</h2>
          <ul className="list">
            <li><span>Ali Khan</span><span>In progress</span></li>
            <li><span>Sara Ahmed</span><span>Ready</span></li>
            <li><span>Hamza Noor</span><span>In fitting</span></li>
          </ul>
        </div>

        <div className="panel">
          <h2>Popular Products</h2>
          <ul className="list">
            {products.map((product) => (
              <li key={product.name}>
                <span>{product.name}</span>
                <span>{product.price}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
