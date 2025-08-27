const express = require('express');
const { Op } = require('sequelize');
const Product = require('../models/Product');
const { 
  validateProduct, 
  validateProductUpdate, 
  validateQuery, 
  validateUUID,
  validateStockOperation 
} = require('../middleware/validation');
const { catchAsync, createError } = require('../middleware/errorHandler');
const {
  createResponse,
  createPaginationMeta,
  buildSearchFilters,
  buildSortOptions,
  formatProductResponse,
  formatProductsList,
  calculateInventoryStats,
  generateSimpleReport
} = require('../utils/helpers');

const router = express.Router();

// GET /api/products - Obtener todos los productos con paginación y filtros
router.get('/', validateQuery, catchAsync(async (req, res) => {
  const { 
    page, 
    limit, 
    search, 
    category, 
    brand, 
    is_active, 
    low_stock, 
    sort_by, 
    sort_order 
  } = req.query;

  // Construir filtros de búsqueda
  const where = buildSearchFilters({ search, category, brand, is_active, low_stock });
  
  // Construir opciones de ordenamiento
  const order = buildSortOptions(sort_by, sort_order);

  // Opciones de consulta
  const options = {
    where,
    order,
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
    attributes: [
      'id', 'name', 'sku', 'description', 'price', 'cost', 
      'stock', 'min_stock', 'category', 'brand', 'is_active', 
      'image_url', 'created_at', 'updated_at'
    ]
  };

  // Ejecutar consulta con conteo total
  const { count, rows: products } = await Product.findAndCountAll(options);

  // Formatear productos
  const formattedProducts = formatProductsList(products);

  // Crear metadatos de paginación
  const meta = createPaginationMeta(parseInt(page), parseInt(limit), count);

  // Agregar estadísticas si se solicita
  if (req.query.include_stats) {
    meta.stats = calculateInventoryStats(products);
  }

  res.json(createResponse(
    true,
    count > 0 ? `Se encontraron ${count} productos` : 'No se encontraron productos',
    formattedProducts,
    null,
    meta
  ));
}));

// GET /api/products/stats - Obtener estadísticas del inventario
router.get('/stats', catchAsync(async (req, res) => {
  const products = await Product.findAll({
    attributes: ['price', 'cost', 'stock', 'min_stock', 'category', 'brand', 'is_active']
  });

  const stats = calculateInventoryStats(products);
  
  // Estadísticas adicionales
  const additionalStats = {
    active_products: await Product.count({ where: { is_active: true } }),
    inactive_products: await Product.count({ where: { is_active: false } }),
    total_products: await Product.count(),
    products_by_category: await Product.findAll({
      attributes: [
        'category',
        [Product.sequelize.fn('COUNT', Product.sequelize.col('id')), 'count']
      ],
      where: { category: { [Op.not]: null } },
      group: ['category'],
      order: [[Product.sequelize.fn('COUNT', Product.sequelize.col('id')), 'DESC']]
    })
  };

  res.json(createResponse(
    true,
    'Estadísticas del inventario obtenidas correctamente',
    { ...stats, ...additionalStats }
  ));
}));

// GET /api/products/reports/:type - Generar reportes
router.get('/reports/:type', catchAsync(async (req, res) => {
  const { type } = req.params;
  const validTypes = ['inventory', 'low_stock', 'out_of_stock', 'high_value'];

  if (!validTypes.includes(type)) {
    throw createError('Tipo de reporte inválido', 400);
  }

  const products = await Product.findAll({
    where: { is_active: true },
    order: [['name', 'ASC']]
  });

  const report = generateSimpleReport(products, type);

  res.json(createResponse(
    true,
    `Reporte de ${type} generado correctamente`,
    report
  ));
}));

// GET /api/products/search - Búsqueda avanzada
router.get('/search', validateQuery, catchAsync(async (req, res) => {
  const { search } = req.query;

  if (!search || search.trim().length < 2) {
    throw createError('El término de búsqueda debe tener al menos 2 caracteres', 400);
  }

  const searchTerm = search.trim();
  
  const products = await Product.findAll({
    where: {
      [Op.or]: [
        { name: { [Op.iLike]: `%${searchTerm}%` } },
        { sku: { [Op.iLike]: `%${searchTerm}%` } },
        { description: { [Op.iLike]: `%${searchTerm}%` } },
        { category: { [Op.iLike]: `%${searchTerm}%` } },
        { brand: { [Op.iLike]: `%${searchTerm}%` } }
      ],
      is_active: true
    },
    order: [['name', 'ASC']],
    limit: 20
  });

  const formattedProducts = formatProductsList(products);

  res.json(createResponse(
    true,
    `Se encontraron ${products.length} productos`,
    formattedProducts
  ));
}));

// GET /api/products/:id - Obtener un producto por ID
router.get('/:id', validateUUID, catchAsync(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findByPk(id);

  if (!product) {
    throw createError('Producto no encontrado', 404);
  }

  const formattedProduct = formatProductResponse(product);

  res.json(createResponse(
    true,
    'Producto obtenido correctamente',
    formattedProduct
  ));
}));

// POST /api/products - Crear un nuevo producto
router.post('/', validateProduct, catchAsync(async (req, res) => {
  const productData = req.body;

  // Verificar si el SKU ya existe
  const existingProduct = await Product.findOne({ where: { sku: productData.sku } });
  if (existingProduct) {
    throw createError('El SKU ya existe', 409);
  }

  const product = await Product.create(productData);
  const formattedProduct = formatProductResponse(product);

  res.status(201).json(createResponse(
    true,
    'Producto creado correctamente',
    formattedProduct
  ));
}));

// PUT /api/products/:id - Actualizar un producto completamente
router.put('/:id', validateUUID, validateProduct, catchAsync(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const product = await Product.findByPk(id);
  if (!product) {
    throw createError('Producto no encontrado', 404);
  }

  // Verificar si el SKU ya existe en otro producto
  if (updateData.sku && updateData.sku !== product.sku) {
    const existingProduct = await Product.findOne({ 
      where: { 
        sku: updateData.sku,
        id: { [Op.ne]: id }
      } 
    });
    if (existingProduct) {
      throw createError('El SKU ya existe', 409);
    }
  }

  await product.update(updateData);
  const formattedProduct = formatProductResponse(product);

  res.json(createResponse(
    true,
    'Producto actualizado correctamente',
    formattedProduct
  ));
}));

// PATCH /api/products/:id - Actualizar un producto parcialmente
router.patch('/:id', validateUUID, validateProductUpdate, catchAsync(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (Object.keys(updateData).length === 0) {
    throw createError('No se proporcionaron datos para actualizar', 400);
  }

  const product = await Product.findByPk(id);
  if (!product) {
    throw createError('Producto no encontrado', 404);
  }

  // Verificar si el SKU ya existe en otro producto
  if (updateData.sku && updateData.sku !== product.sku) {
    const existingProduct = await Product.findOne({ 
      where: { 
        sku: updateData.sku,
        id: { [Op.ne]: id }
      } 
    });
    if (existingProduct) {
      throw createError('El SKU ya existe', 409);
    }
  }

  await product.update(updateData);
  const formattedProduct = formatProductResponse(product);

  res.json(createResponse(
    true,
    'Producto actualizado correctamente',
    formattedProduct
  ));
}));

// PATCH /api/products/:id/stock - Actualizar stock de un producto
router.patch('/:id/stock', validateUUID, validateStockOperation, catchAsync(async (req, res) => {
  const { id } = req.params;
  const { quantity, operation, reason } = req.body;

  const product = await Product.findByPk(id);
  if (!product) {
    throw createError('Producto no encontrado', 404);
  }

  const previousStock = product.stock;
  
  try {
    await product.updateStock(quantity, operation);
  } catch (error) {
    throw createError(error.message, 400);
  }

  const formattedProduct = formatProductResponse(product);

  // Agregar información del movimiento de stock
  const stockMovement = {
    previous_stock: previousStock,
    current_stock: product.stock,
    operation,
    quantity,
    reason: reason || null,
    timestamp: new Date().toISOString()
  };

  res.json(createResponse(
    true,
    `Stock ${operation === 'add' ? 'aumentado' : 'reducido'} correctamente`,
    {
      product: formattedProduct,
      stock_movement: stockMovement
    }
  ));
}));

// DELETE /api/products/:id - Eliminar un producto (soft delete)
router.delete('/:id', validateUUID, catchAsync(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findByPk(id);
  if (!product) {
    throw createError('Producto no encontrado', 404);
  }

  await product.destroy(); // Soft delete gracias a paranoid: true

  res.json(createResponse(
    true,
    'Producto eliminado correctamente'
  ));
}));

// POST /api/products/:id/restore - Restaurar un producto eliminado
router.post('/:id/restore', validateUUID, catchAsync(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findByPk(id, { paranoid: false });
  if (!product) {
    throw createError('Producto no encontrado', 404);
  }

  if (!product.deleted_at) {
    throw createError('El producto no está eliminado', 400);
  }

  await product.restore();
  const formattedProduct = formatProductResponse(product);

  res.json(createResponse(
    true,
    'Producto restaurado correctamente',
    formattedProduct
  ));
}));

// GET /api/products/:id/history - Obtener historial de un producto (placeholder)
router.get('/:id/history', validateUUID, catchAsync(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findByPk(id);
  if (!product) {
    throw createError('Producto no encontrado', 404);
  }

  // Placeholder para futuro sistema de auditoría
  const history = {
    product_id: id,
    message: 'Sistema de historial no implementado aún',
    events: []
  };

  res.json(createResponse(
    true,
    'Historial del producto (funcionalidad pendiente)',
    history
  ));
}));

module.exports = router;