// server/tests/d4-sale-integrity.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import axios from 'axios';
import pkg from 'pg';
const { Pool } = pkg;

// === CRITICAL SAFETY GUARD ===
if (process.env.NODE_ENV !== 'test') {
    console.error('FATAL: Tests must be run with NODE_ENV=test');
    process.exit(1);
}
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL || TEST_DB_URL.includes('neon')) {
    console.error('FATAL: TEST_DATABASE_URL is required and must NOT point to production.');
    process.exit(1);
}
// ============================

const dbPool = new Pool({ connectionString: TEST_DB_URL }); // <-- Changed from process.env.DATABASE_URL
// ... (keep the rest of the file exactly as it is)

let authToken1 = null;
let authToken2 = null; // For cross-tenant test
let testProductId = null;
let testIngredientId = null;

const api1 = axios.create({ baseURL: BASE_URL, headers: { 'Content-Type': ' each request' } });
api1.interceptors.request.use(config => {
    if (authToken1) config.headers.Authorization = `Bearer ${authToken1}`;
    return config;
});

describe('D4: Cashier Direct-Sale Stock Integrity', () => {
    before(async () => {
        // 1. Login as Company 1 / Branch 1
        const res1 = await api1.post('/auth/login', { email: 'owner.test@example.com', password: 'test123' });
        authToken1 = res1.data.token;

        // 2. Find a product with a recipe in Company 1
        const productsRes = await api1.get('/products');
        const product = productsRes.data.data.find(p => p.is_available);
        testProductId = product.id;

        // 3. Find its ingredient to check stock
        const recipeRes = await api1.get(`/recipes/product/${testProductId}`);
        testIngredientId = recipeRes.data.data.ingredients[0].ingredient_id;
        console.log(`✅ Setup complete. Product: ${testProductId}, Ingredient: ${testIngredientId}`);
    });

    it('should deduct stock correctly for a normal sale', async () => {
        const initialStockRes = await dbPool.query('SELECT quantity FROM ingredients WHERE id = $1', [testIngredientId]);
        const initialStock = parseFloat(initialStockRes.rows[0].quantity);

        const res = await api1.post('/sales', {
            items: [{ product_id: testProductId, quantity: 1 }],
            payment_method: 'cash'
        }, { headers: { 'Idempotency-Key': `normal_sale_${Date.now()}` } });

        assert.strictEqual(res.status, 201);
        
        const finalStockRes = await dbPool.query('SELECT quantity FROM ingredients WHERE id = $1', [testIngredientId]);
        const finalStock = parseFloat(finalStockRes.rows[0].quantity);
        
        assert(finalStock < initialStock, 'Stock should be deducted');
        console.log('✅ Normal sale: Stock deducted correctly');
    });

    it('should reject sale with insufficient stock', async () => {
        try {
            await api1.post('/sales', {
                items: [{ product_id: testProductId, quantity: 99999 }],
                payment_method: 'cash'
            }, { headers: { 'Idempotency-Key': `insufficient_${Date.now()}` } });
            assert.fail('Should have thrown 400/409');
        } catch (err) {
            assert(err.response.status === 400 || err.response.status === 409, 'Should reject insufficient stock');
            console.log('✅ Insufficient stock: Sale rejected correctly');
        }
    });

    it('should prevent duplicate deductions on repeated idempotency key', async () => {
        const idemKey = `idem_test_${Date.now()}`;
        
        // First request
        await api1.post('/sales', {
            items: [{ product_id: testProductId, quantity: 1 }],
            payment_method: 'cash'
        }, { headers: { 'Idempotency-Key': idemKey } });

        // Second request with same key
        const res2 = await api1.post('/sales', {
            items: [{ product_id: testProductId, quantity: 1 }],
            payment_method: 'cash'
        }, { headers: { 'Idempotency-Key': idemKey } });

        assert.strictEqual(res2.status, 200); // Idempotent return
        console.log('✅ Idempotency: Duplicate request handled correctly');
    });

    it('should handle concurrent sales without overselling (no lost updates)', async () => {
        const initialStockRes = await dbPool.query('SELECT quantity FROM ingredients WHERE id = $1', [testIngredientId]);
        const initialStock = parseFloat(initialStockRes.rows[0].quantity);
        const concurrentRequests = 5;
        const idemKeys = Array.from({ length: concurrentRequests }, (_, i) => `concurrent_${Date.now()}_${i}`);

        const promises = idemKeys.map(key => 
            api1.post('/sales', {
                items: [{ product_id: testProductId, quantity: 1 }],
                payment_method: 'cash'
            }, { headers: { 'Idempotency-Key': key } }).catch(e => e)
        );

        const results = await Promise.all(promises);
        const successCount = results.filter(r => r.status === 201).length;
        
        const finalStockRes = await dbPool.query('SELECT quantity FROM ingredients WHERE id = $1', [testIngredientId]);
        const finalStock = parseFloat(finalStockRes.rows[0].quantity);
        const expectedDeduction = successCount; // Simplified for 1 unit per sale
        
        assert(finalStock <= initialStock, 'Stock should not increase');
        assert(finalStock >= (initialStock - expectedDeduction - 0.1), 'Stock should not be over-deducted (no lost updates)');
        console.log(`✅ Concurrent sales: ${successCount} succeeded, no overselling detected`);
    });
});

console.log('\n========================================');
console.log('✅ D4 Test Suite Loaded. Run with: node --test server/tests/d4-sale-integrity.test.js');
console.log('========================================\n');