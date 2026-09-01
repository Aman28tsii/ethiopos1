// server/src/middleware/errorHandler.js

export class AppError extends Error {
  constructor(message, statusCode, errorCode = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
  }
}

export const notFound = (req, res, next) => {
  const error = new AppError(`Cannot ${req.method} ${req.path} - Not found`, 404);
  next(error);
};

export const errorHandler = (err, req, res, next) => {
  // Log error with details
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  console.error('Request:', {
    method: req.method,
    path: req.path,
    user: req.user?.id,
    company: req.user?.company_id,
    branch: req.user?.branch_id
  });
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  
  // ✅ FIXED: Only show stack in development
  const response = {
    success: false,
    error: message
  };
  
  // Add error code if present
  if (err.errorCode) {
    response.code = err.errorCode;
  }
  
  // Add stack trace only in development
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
    response.details = err.details || null;
  }
  
  // Log full error for production debugging
  if (process.env.NODE_ENV === 'production') {
    console.error('[PRODUCTION ERROR]', {
      message: err.message,
      stack: err.stack,
      statusCode,
      userId: req.user?.id,
      path: req.path
    });
  }
  
  res.status(statusCode).json(response);
};

export const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ============================================
// GLOBAL UNHANDLED REJECTION HANDLER
// ============================================

export const setupUnhandledRejection = () => {
  process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION:', err);
    // In production, you may want to notify monitoring
  });

  process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    // In production, log and exit gracefully
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: Uncaught exception. Shutting down...');
      process.exit(1);
    }
  });
};