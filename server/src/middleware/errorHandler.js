export const errorHandler = (err, req, res, next) => { // ✅ FIXED SIGNATURE (was res, req)
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
  
  // ✅ D10-C FIX: Detect PostgreSQL errors by code OR message pattern
  // (Controllers sometimes wrap PG errors in AppError, stripping the .code property)
  const pgCode = err.code;
  const msg = (message || '').toLowerCase();

  if (pgCode === '23503' || msg.includes('violates foreign key constraint') || msg.includes('violates restrict setting')) {
    statusCode = 409;
    message = 'Cannot delete this record: it is referenced by other data';
    errorCode = 'REFERENCED';
  } 
  else if (pgCode === '23505' || msg.includes('unique constraint') || msg.includes('duplicate key value')) {
    statusCode = 409;
    message = 'A record with this value already exists';
    errorCode = 'DUPLICATE';
  } 
  else if (pgCode === '23502' || msg.includes('null value in column')) {
    statusCode = 400;
    message = 'Required field is missing';
    errorCode = 'MISSING_FIELD';
  } 
  else if (pgCode === '23514' || msg.includes('check constraint')) {
    statusCode = 400;
    message = 'Invalid data: does not meet validation rules';
    errorCode = 'VALIDATION_FAILED';
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
      pgCode: pgCode || null,
      userId: req.user?.id,
      path: req.path
    });
  }
  
  res.status(statusCode).json(response);
};