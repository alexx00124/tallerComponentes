const request = require('supertest');
const { Sequelize } = require('sequelize');
const { app, sequelize, Product } = require('../server');

// Configurar base de datos de prueba en memoria
const testSequelize = new Sequelize('sqlite::memory:', {
  dialect: 'sqlite',
  logging: false
});

// Mock del sequelize original con el de prueba
jest.mock('../server', () => {
  const originalModule = jest.requireActual('../server');
  return {
    ...originalModule,
    sequelize: testSequelize
  };
});

describe('API de Gestión de Inventarios', () => {
  let testProduct;

  beforeAll(async () => {
    // Configurar base de datos de prueba
    await testSequelize.authenticate();
    
    // Redefinir modelo para SQLite
    const TestProduct = testSequelize.define('Product', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      category: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      sku: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      }
    }, {
      timestamps: true,
      tableName: 'products'
    });

    await testSequelize.sync({ force: true });
    
    // Crear datos de prueba
    testProduct = await TestProduct.create({
      name: 'Producto Test',
      description: 'Descripción de prueba',
      price: 99.99,
      quantity: 10,
      category: 'Test',
      sku: 'TEST-001'
    });
  });

  afterAll(async () => {
    await testSequelize.close();
  });

  describe('GET /api/health', () => {
    test('Debería retornar estado de salud del API', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('GET /api/products', () => {
    test('Debería obtener lista de productos con paginación', async () => {
      const response = await request(app)
        .get('/api/products')
        .expect(200);

      expect(response.body).toHaveProperty('products');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.products)).toBe(true);
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('pages');
    });

    test('Debería filtrar productos por categoría', async () => {
      const response = await request(app)
        .get('/api/products?category=Test')
        .expect(200);

      expect(response.body.products).toBeDefined();
      response.body.products.forEach(product => {
        expect(product.category).toBe('Test');
      });
    });

    test('Debería buscar productos por término', async () => {
      const response = await request(app)
        .get('/api/products?search=Test')
        .expect(200);

      expect(response.body.products).toBeDefined();
      expect(response.body.products.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/products/:id', () => {
    test('Debería obtener un producto específico por ID', async () => {
      const response = await request(app)
        .get(`/api/products/${testProduct.id}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', testProduct.id);
      expect(response.body).toHaveProperty('name', 'Producto Test');
      expect(response.body).toHaveProperty('sku', 'TEST-001');
    });

    test('Debería retornar 404 para producto inexistente', async () => {
      const response = await request(app)
        .get('/api/products/999999')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Producto no encontrado');
    });

    test('Debería retornar 400 para ID inválido', async () => {
      const response = await request(app)
        .get('/api/products/invalid-id')
        .expect(400);

      expect(response.body).toHaveProperty('error', 'ID inválido');
    });
  });

  describe('POST /api/products', () => {
    test('Debería crear un nuevo producto exitosamente', async () => {
      const newProduct = {
        name: 'Nuevo Producto',
        description: 'Descripción del nuevo producto',
        price: 150.00,
        quantity: 25,
        category: 'Electrónicos',
        sku: 'NEW-001'
      };

      const response = await request(app)
        .post('/api/products')
        .send(newProduct)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(newProduct.name);
      expect(response.body.price).toBe(newProduct.price.toString());
      expect(response.body.quantity).toBe(newProduct.quantity);
      expect(response.body.sku).toBe(newProduct.sku);
    });

    test('Debería retornar error 400 para datos faltantes', async () => {
      const incompleteProduct = {
        name: 'Producto Incompleto'
        // Faltan campos requeridos
      };

      const response = await request(app)
        .post('/api/products')
        .send(incompleteProduct)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Campos requeridos');
    });

    test('Debería retornar error 400 para precio inválido', async () => {
      const invalidProduct = {
        name: 'Producto Precio Inválido',
        price: -10,
        quantity: 5,
        sku: 'INVALID-001'
      };

      const response = await request(app)
        .post('/api/products')
        .send(invalidProduct)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('precio debe ser un número positivo');
    });

    test('Debería retornar error 400 para cantidad inválida', async () => {
      const invalidProduct = {
        name: 'Producto Cantidad Inválida',
        price: 50.00,
        quantity: -5,
        sku: 'INVALID-002'
      };

      const response = await request(app)
        .post('/api/products')
        .send(invalidProduct)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('cantidad debe ser un número entero positivo');
    });
  });

  describe('PUT /api/products/:id', () => {
    test('Debería actualizar un producto existente', async () => {
      const updatedData = {
        name: 'Producto Actualizado',
        description: 'Descripción actualizada',
        price: 199.99,
        quantity: 15,
        category: 'Test Updated',
        sku: 'TEST-001-UPDATED'
      };

      const response = await request(app)
        .put(`/api/products/${testProduct.id}`)
        .send(updatedData)
        .expect(200);

      expect(response.body.name).toBe(updatedData.name);
      expect(response.body.price).toBe(updatedData.price.toString());
      expect(response.body.quantity).toBe(updatedData.quantity);
    });

    test('Debería retornar 404 para producto inexistente', async () => {
      const updateData = {
        name: 'Producto No Existe',
        price: 100.00,
        quantity: 5,
        sku: 'NOT-EXISTS'
      };

      const response = await request(app)
        .put('/api/products/999999')
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Producto no encontrado');
    });
  });

  describe('DELETE /api/products/:id', () => {
    test('Debería eliminar un producto (soft delete)', async () => {
      // Crear producto para eliminar
      const TestProduct = testSequelize.models.Product;
      const productToDelete = await TestProduct.create({
        name: 'Producto para Eliminar',
        price: 50.00,
        quantity: 3,
        sku: 'DELETE-001'
      });

      const response = await request(app)
        .delete(`/api/products/${productToDelete.id}`)
        .expect(204);

      // Verificar que el producto fue marcado como inactivo
      const deletedProduct = await TestProduct.findByPk(productToDelete.id);
      expect(deletedProduct.isActive).toBe(false);
    });

    test('Debería retornar 404 para producto inexistente', async () => {
      const response = await request(app)
        .delete('/api/products/999999')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Producto no encontrado');
    });
  });

  describe('Casos de integración avanzados', () => {
    test('Debería manejar operaciones CRUD completas', async () => {
      // 1. Crear producto
      const createResponse = await request(app)
        .post('/api/products')
        .send({
          name: 'Producto CRUD Test',
          description: 'Test de operaciones CRUD',
          price: 75.50,
          quantity: 20,
          category: 'CRUD',
          sku: 'CRUD-TEST-001'
        })
        .expect(201);

      const productId = createResponse.body.id;

      // 2. Leer producto
      await request(app)
        .get(`/api/products/${productId}`)
        .expect(200);

      // 3. Actualizar producto
      await request(app)
        .put(`/api/products/${productId}`)
        .send({
          name: 'Producto CRUD Actualizado',
          description: 'Descripción actualizada',
          price: 85.75,
          quantity: 25,
          category: 'CRUD Updated',
          sku: 'CRUD-TEST-001-UPD'
        })
        .expect(200);

      // 4. Eliminar producto
      await request(app)
        .delete(`/api/products/${productId}`)
        .expect(204);

      // 5. Verificar que no se puede acceder al producto eliminado
      await request(app)
        .get(`/api/products/${productId}`)
        .expect(404);
    });

    test('Debería manejar paginación correctamente', async () => {
      // Crear varios productos para probar paginación
      const TestProduct = testSequelize.models.Product;
      const products = [];
      
      for (let i = 0; i < 15; i++) {
        products.push({
          name: `Producto Paginación ${i}`,
          price: 10.00 + i,
          quantity: i + 1,
          sku: `PAG-${i.toString().padStart(3, '0')}`
        });
      }
      
      await TestProduct.bulkCreate(products);

      // Probar primera página
      const page1 = await request(app)
        .get('/api/products?page=1&limit=5')
        .expect(200);

      expect(page1.body.products).toHaveLength(5);
      expect(page1.body.pagination.page).toBe(1);
      expect(page1.body.pagination.hasNext).toBe(true);
      expect(page1.body.pagination.hasPrev).toBe(false);

      // Probar segunda página
      const page2 = await request(app)
        .get('/api/products?page=2&limit=5')
        .expect(200);

      expect(page2.body.products).toHaveLength(5);
      expect(page2.body.pagination.page).toBe(2);
      expect(page2.body.pagination.hasNext).toBe(true);
      expect(page2.body.pagination.hasPrev).toBe(true);
    });
  });

  describe('Manejo de errores', () => {
    test('Debería retornar 404 para rutas inexistentes', async () => {
      const response = await request(app)
        .get('/api/ruta-inexistente')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Ruta no encontrada');
    });

    test('Debería manejar errores de base de datos', async () => {
      // Intentar crear producto con SKU duplicado
      const duplicateProduct = {
        name: 'Producto Duplicado',
        price: 100.00,
        quantity: 5,
        sku: 'TEST-001' // SKU que ya existe
      };

      const response = await request(app)
        .post('/api/products')
        .send(duplicateProduct)
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('SKU ya existe');
    });
  });
});