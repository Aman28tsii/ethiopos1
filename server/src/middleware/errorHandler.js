export const errorHandler = (err, res, req, next) => {
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
  
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errorCode = err.errorCode;
  
  // ✅ D10-C FIX: Detect PostgreSQL errors and map to appropriate HTTP status
  if (err.code && typeof err.code === 'string' && err.code.startsWith('23')) {
    // PostgreSQL class 23 errors: Integrity Constraint Violation
    switch (err.code) {
      case '23503': // foreign_key_violation
        statusCode = 409;
        message = 'Cannot delete this record: it is referenced by other data';
        errorCode = 'REFERENCED';
        break;
      case '23505': // unique_violation
        statusCode = 409;
        message = 'A record with this value already exists';
        errorCode = 'DUPLICATE';
        break;
      case '23502': // not_null_violation
        statusCode = 400;
        message = 'Required field is missing';
        errorCode = 'MISSING_FIELD';
        break;
      case '23514': // check_violation
        statusCode = 400;
        message = 'Invalid data: does not meet validation rules';
        errorCode = 'VALIDATION_FAILED';
        break;
      default:
        statusCode = 400;
        message = 'Database constraint violation';
        errorCode = 'CONSTRAINT_VIOLATION';
    }
  }
  
  const response = {
    success: false,
    error: message
  };
  
  if (errorCode) {
    response.code = errorCode;
  }
  
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
    response.details = err.details || null;
  }
  
  if (process.env.NODE_ENV === 'production') {
    console.error('[PRODUCTION ERROR]', {
      message: err.message,
      stack: err.stack,
      statusCode,
      pgCode: err.code || null,
      userId: req.user?.id,
      path: req.path
    });
  }
  
  res.status(statusCode).json(response);
};