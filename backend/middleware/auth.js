const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {

    try {
      const decoded = jwt.decode(token);
      
      // ✅ Debug — kya decode ho raha hai
      console.log('Decoded token:', JSON.stringify(decoded, null, 2));
      console.log('Email from token:', decoded?.email);
      console.log('Sub from token:', decoded?.sub);

      if (!decoded) {
        return res.status(401).json({ error: 'Cannot decode token' });
      }

      // ✅ Email alag jagah ho sakti hai
      const email = decoded.email || 
                    decoded.user_metadata?.email || 
                    decoded.user?.email;

      if (!email) {
        console.log('No email found in token!');
        return res.status(401).json({ error: 'No email in token' });
      }

      const result = await pool.query(
        'SELECT id, email, plan FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        const newUser = await pool.query(
          'INSERT INTO users (email, password_hash, full_name, plan) VALUES ($1, $2, $3, $4) RETURNING id, email, plan',
          [email, 'google-oauth', decoded.user_metadata?.full_name || '', 'free']
        );
        req.user = newUser.rows[0];
      } else {
        req.user = result.rows[0];
      }

      return next();

    } catch (e) {
      console.error('Token decode error:', e.message);
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
};

module.exports = authenticateToken;