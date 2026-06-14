const jwt = require('jsonwebtoken');
const prisma = require('../prisma/prisma-client');
const { UnauthorizedError } = require('../utils/errors');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token is missing or invalid');
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    } catch (err) {
      throw new UnauthorizedError('Token is invalid or expired');
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authMiddleware;
