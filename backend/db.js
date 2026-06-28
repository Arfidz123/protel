const { Pool } = require('pg');
require('dotenv').config();
 
const pool = new Pool({
  user:     process.env.DB_USER     || 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  database: process.env.DB_NAME     || 'rip_current',
  password: process.env.DB_PASSWORD || 'postgres',
  port:     parseInt(process.env.DB_PORT || '5432'),
});
 
pool.connect((err, client, release) => {
  if (err) {
    console.error('Gagal konek ke PostgreSQL:', err.message);
    console.error('   Pastikan PostgreSQL berjalan dan kredensial di .env sudah benar.');
  } else {
    console.log('Terhubung ke PostgreSQL');
    release();
  }
});
 
module.exports = pool;