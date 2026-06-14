const { HttpError } = require('../utils/errors');

function errorHandler(err, req, res, next) {
  console.error(err);

  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
    });
  }

  // Handle Prisma unique constraint or foreign key violations gracefully
  if (err.code && err.code.startsWith('P')) {
    return res.status(400).json({
      error: 'DatabaseError',
      message: 'A database constraint violation occurred.',
      code: err.code,
      meta: err.meta,
    });
  }

  return res.status(500).json({
    error: 'InternalServerError',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred.' 
      : err.message,
  });
}

module.exports = errorHandler;
