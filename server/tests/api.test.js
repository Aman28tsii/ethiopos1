// server/tests/api.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import axios from 'axios';

// === CRITICAL SAFETY GUARD ===
if (process.env.NODE_ENV !== 'test') {
    console.error('FATAL: Tests must be run with NODE_ENV=test');
    process.exit(1);
}
const TEST_API_URL = process.env.TEST_API_URL;
if (!TEST_API_URL || TEST_API_URL.includes('ethiopos1') || TEST_API_URL.includes('neon')) {
    console.error('FATAL: TEST_API_URL is required and must NOT point to production.');
    process.exit(1);
}
// ============================

let authToken = null;
let testOrderId = null;
let testProductId = null;

const api = axios.create({
    baseURL: TEST_API_URL, // <-- Changed from BASE_URL fallback
    headers: { 'Content-Type': 'application/json' }
});


api.interceptors.request.use(config => {
    if (authToken) {
        config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
});

describe('EthioPOS API Tests', () => {
    
    describe('Authentication', () => {
        
        it('should login as admin', async () => {
            const res = await api.post('/auth/login', {
                email: 'admin@example.com',
                password: 'admin123'
            });
            assert.strictEqual(res.status, 200);
            assert(res.data.success === true);
            assert(res.data.token);
            authToken = res.data.token;
            console.log('✅ Login successful');
        });

        it('should reject invalid credentials', async () => {
            try {
                await api.post('/auth/login', {
                    email: 'wrong@example.com',
                    password: 'wrong123'
                });
                assert.fail('Should have thrown error');
            } catch (err) {
                assert.strictEqual(err.response.status, 401);
                console.log('✅ Invalid credentials rejected');
            }
        });
    });

    describe('Products', () => {
        
        it('should get products', async () => {
            const res = await api.get('/products');
            assert.strictEqual(res.status, 200);
            assert(res.data.success === true);
            console.log(`✅ Got ${res.data.data.length} products`);
        });

        it('should create a product', async () => {
            const res = await api.post('/products', {
                name: 'Test Product',
                price: 99.99,
                category: 'Test'
            });
            assert.strictEqual(res.status, 201);
            assert(res.data.success === true);
            testProductId = res.data.data.id;
            console.log(`✅ Product created: ${testProductId}`);
        });
    });

    describe('Orders', () => {
        
        it('should get orders', async () => {
            const res = await api.get('/orders');
            assert.strictEqual(res.status, 200);
            assert(res.data.success === true);
            console.log('✅ Got orders');
        });

        it('should create an order', async () => {
            const res = await api.post('/orders', {
                items: [{ product_id: testProductId, quantity: 2 }],
                order_type: 'dine_in'
            }, {
                headers: {
                    'Idempotency-Key': `test_${Date.now()}`
                }
            });
            assert.strictEqual(res.status, 201);
            assert(res.data.success === true);
            testOrderId = res.data.data.order_id;
            console.log(`✅ Order created: ${testOrderId}`);
        });
    });

    describe('Idempotency', () => {
        
        it('should handle duplicate with same key', async () => {
            const idempotencyKey = `duplicate_${Date.now()}`;
            
            const res1 = await api.post('/orders', {
                items: [{ product_id: testProductId, quantity: 1 }]
            }, {
                headers: {
                    'Idempotency-Key': idempotencyKey
                }
            });
            assert.strictEqual(res1.status, 201);
            
            const res2 = await api.post('/orders', {
                items: [{ product_id: testProductId, quantity: 1 }]
            }, {
                headers: {
                    'Idempotency-Key': idempotencyKey
                }
            });
            assert.strictEqual(res2.status, 200);
            console.log('✅ Idempotency working');
        });
    });

    describe('Tables', () => {
        
        it('should get tables', async () => {
            const res = await api.get('/tables');
            assert.strictEqual(res.status, 200);
            assert(res.data.success === true);
            console.log(`✅ Got ${res.data.data.length} tables`);
        });
    });

    describe('Dashboard', () => {
        
        it('should get dashboard data', async () => {
            const res = await api.get('/dashboard');
            assert.strictEqual(res.status, 200);
            assert(res.data.success === true);
            console.log('✅ Dashboard data retrieved');
        });
    });
});

console.log('\n========================================');
console.log('✅ All tests completed');
console.log('========================================');