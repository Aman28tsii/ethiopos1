import { AppError } from './errorHandler.js';

export const validateProduct = (req, res, next) => {
    const { name, price } = req.body;
    
    if (!name || name.trim().length < 2) {
        return next(new AppError('Product name must be at least 2 characters', 400));
    }
    
    if (price === undefined || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
        return next(new AppError('Valid price is required', 400));
    }
    
    next();
};

export const validatePagination = (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    req.pagination = { page, limit, offset: (page - 1) * limit };
    next();
};