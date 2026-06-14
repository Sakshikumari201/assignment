class HttpError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends HttpError {
  constructor(message = 'Bad Request') {
    super(message, 400);
  }
}

class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

class NotFoundError extends HttpError {
  constructor(message = 'Not Found') {
    super(message, 404);
  }
}

class InternalServerError extends HttpError {
  constructor(message = 'Internal Server Error') {
    super(message, 500);
  }
}

module.exports = {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  InternalServerError,
};
