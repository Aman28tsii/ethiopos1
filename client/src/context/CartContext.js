// client/src/context/CartContext.js

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { saveCart, getCart, clearCart } from '../services/offlineDB';
import { useBranch } from './BranchContext';

const CartContext = createContext();

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within CartProvider');
    }
    return context;
};

export const CartProvider = ({ children }) => {
    const { selectedBranch } = useBranch();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const initialLoadDone = useRef(false);
    const saveTimeout = useRef(null);

    // Load cart from IndexedDB on mount (only once)
    useEffect(() => {
        if (!initialLoadDone.current) {
            loadCart();
            initialLoadDone.current = true;
        }
    }, []);

    // Save cart whenever it changes (debounced)
    useEffect(() => {
        if (!loading && selectedBranch && items.length > 0) {
            if (saveTimeout.current) {
                clearTimeout(saveTimeout.current);
            }
            saveTimeout.current = setTimeout(() => {
                persistCart();
            }, 500);
        }
    }, [items, selectedBranch, loading]);

    const loadCart = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const saved = await getCart();
            if (saved && saved.items && saved.branch_id === selectedBranch?.id) {
                setItems(saved.items);
            } else {
                setItems([]);
            }
        } catch (err) {
            console.warn('Failed to load cart:', err);
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    const persistCart = async () => {
        try {
            if (selectedBranch) {
                await saveCart(items, selectedBranch.id);
            }
        } catch (err) {
            console.warn('Failed to save cart:', err);
        }
    };

    const addItem = useCallback((product) => {
        const price = typeof product.price === 'string' ? parseFloat(product.price) : product.price;
        setItems(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * price }
                        : item
                );
            }
            return [...prev, {
                id: product.id,
                name: product.name,
                price: price,
                quantity: 1,
                total: price
            }];
        });
    }, []);

    const removeItem = useCallback((productId) => {
        setItems(prev => prev.filter(item => item.id !== productId));
    }, []);

    const updateQuantity = useCallback((productId, delta) => {
        setItems(prev => {
            const item = prev.find(i => i.id === productId);
            if (!item) return prev;
            const newQuantity = item.quantity + delta;
            if (newQuantity <= 0) {
                return prev.filter(i => i.id !== productId);
            }
            return prev.map(i =>
                i.id === productId
                    ? { ...i, quantity: newQuantity, total: newQuantity * i.price }
                    : i
            );
        });
    }, []);

    const clearAll = useCallback(async () => {
        setItems([]);
        try {
            await clearCart();
        } catch (err) {
            console.warn('Failed to clear cart:', err);
        }
    }, []);

    const getTotals = useCallback(() => {
        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        const tax = subtotal * 0.15;
        const total = subtotal + tax;
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
        return { subtotal, tax, total, itemCount };
    }, [items]);

    const value = {
        items,
        loading,
        isOffline,
        addItem,
        removeItem,
        updateQuantity,
        clearAll,
        getTotals
    };

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
};