const { Op } = require('sequelize');

// Función para crear respuestas estandarizadas
const createResponse = (success = true, message = '', data = null, errors = null, meta = null) => {
  const response = {
    success,
    message
  };

  if (data !== null) {
    response.data = data;
  }

  if (errors !== null) {
    response.errors = errors;
  }

  if (meta !== null) {
    response.meta = meta;
  }

  return response;
};

// Función para crear metadatos de paginación
const createPaginationMeta = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    pagination: {
      current_page: page,
      per_page: limit,
      total_items: total,
      total_pages: totalPages,
      has_next_page: page < totalPages,
      has_prev_page: page > 1,
      next_page: page < totalPages ? page + 1 : null,
      prev_page: page > 1 ? page - 1 : null
    }
  };
};

// Función para construir filtros de búsqueda
const buildSearchFilters = (searchParams) => {
  const where = {};
  
  // Filtro por búsqueda general (nombre, SKU, descripción)
  if (searchParams.search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${searchParams.search}%` } },
      { sku: { [Op.iLike]: `%${searchParams.search}%` } },
      { description: { [Op.iLike]: `%${searchParams.search}%` } }
    ];
  }

  // Filtro por categoría
  if (searchParams.category) {
    where.category = { [Op.iLike]: `%${searchParams.category}%` };
  }

  // Filtro por marca
  if (searchParams.brand) {
    where.brand = { [Op.iLike]: `%${searchParams.brand}%` };
  }

  // Filtro por estado activo
  if (searchParams.is_active !== undefined) {
    where.is_active = searchParams.is_active;
  }

  // Filtro por stock bajo
  if (searchParams.low_stock) {
    where[Op.or] = [
      { stock: { [Op.lte]: { [Op.col]: 'min_stock' } } },
      { stock: { [Op.lte]: 10 } } // Stock menor a 10 por defecto
    ];
  }

  return where;
};

// Función para construir opciones de ordenamiento
const buildSortOptions = (sortBy = 'created_at', sortOrder = 'DESC') => {
  const validSortFields = ['name', 'sku', 'price', 'stock', 'created_at', 'updated_at'];
  const field = validSortFields.includes(sortBy) ? sortBy : 'created_at';
  const order = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
  
  return [[field, order]];
};

// Función para generar SKU automático
const generateSKU = (name, category = '', suffix = '') => {
  const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase();
  const cleanCategory = category ? category.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() : '';
  const timestamp = Date.now().toString().slice(-4);
  const randomSuffix = suffix || Math.random().toString(36).substring(2, 5).toUpperCase();
  
  return `${cleanCategory}${cleanName}${timestamp}${randomSuffix}`.substring(0, 20);
};

// Función para validar y limpiar datos de entrada
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remover caracteres potencialmente peligrosos
    .substring(0, 1000); // Limitar longitud
};

// Función para calcular estadísticas de inventario
const calculateInventoryStats = (products) => {
  if (!Array.isArray(products) || products.length === 0) {
    return {
      total_products: 0,
      total_value: 0,
      low_stock_count: 0,
      out_of_stock_count: 0,
      categories: 0,
      brands: 0
    };
  }

  const stats = {
    total_products: products.length,
    total_value: 0,
    low_stock_count: 0,
    out_of_stock_count: 0,
    categories: new Set(),
    brands: new Set()
  };

  products.forEach(product => {
    // Calcular valor total del inventario
    stats.total_value += (product.price * product.stock);
    
    // Contar productos con stock bajo
    if (product.stock <= (product.min_stock || 5)) {
      stats.low_stock_count++;
    }
    
    // Contar productos sin stock
    if (product.stock === 0) {
      stats.out_of_stock_count++;
    }
    
    // Agregar categorías y marcas únicas
    if (product.category) {
      stats.categories.add(product.category);
    }
    if (product.brand) {
      stats.brands.add(product.brand);
    }
  });

  // Convertir Sets a números
  stats.categories = stats.categories.size;
  stats.brands = stats.brands.size;
  
  // Redondear valor total a 2 decimales
  stats.total_value = Math.round(stats.total_value * 100) / 100;

  return stats;
};

// Función para formatear productos para respuesta
const formatProductResponse = (product) => {
  if (!product) return null;

  const formatted = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    price: parseFloat(product.price),
    cost: product.cost ? parseFloat(product.cost) : null,
    stock: product.stock,
    min_stock: product.min_stock,
    category: product.category,
    brand: product.brand,
    is_active: product.is_active,
    image_url: product.image_url,
    created_at: product.created_at,
    updated_at: product.updated_at
  };

  // Agregar campos calculados
  formatted.needs_restock = product.stock <= (product.min_stock || 5);
  formatted.is_out_of_stock = product.stock === 0;
  formatted.stock_value = parseFloat(product.price) * product.stock;

  return formatted;
};

// Función para formatear lista de productos
const formatProductsList = (products) => {
  if (!Array.isArray(products)) return [];
  
  return products.map(product => formatProductResponse(product));
};

// Función para validar operaciones de stock
const validateStockOperation = (currentStock, operation, quantity) => {
  if (operation === 'subtract' && currentStock < quantity) {
    throw new Error(`Stock insuficiente. Stock actual: ${currentStock}, cantidad solicitada: ${quantity}`);
  }
  
  if (quantity <= 0) {
    throw new Error('La cantidad debe ser mayor a 0');
  }
  
  return true;
};

// Función para generar reportes simples
const generateSimpleReport = (products, type = 'inventory') => {
  const report = {
    generated_at: new Date().toISOString(),
    type,
    data: []
  };

  switch (type) {
    case 'low_stock':
      report.data = products.filter(p => p.stock <= (p.min_stock || 5));
      report.title = 'Productos con Stock Bajo';
      break;
      
    case 'out_of_stock':
      report.data = products.filter(p => p.stock === 0);
      report.title = 'Productos Agotados';
      break;
      
    case 'high_value':
      report.data = products
        .filter(p => p.price * p.stock > 1000)
        .sort((a, b) => (b.price * b.stock) - (a.price * a.stock));
      report.title = 'Productos de Alto Valor en Inventario';
      break;
      
    default:
      report.data = products;
      report.title = 'Inventario General';
  }

  report.total_items = report.data.length;
  report.stats = calculateInventoryStats(report.data);

  return report;
};

// Función para normalizar texto para búsquedas
const normalizeSearchText = (text) => {
  if (typeof text !== 'string') return '';
  
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^a-z0-9\s]/g, '') // Solo letras, números y espacios
    .trim();
};

module.exports = {
  createResponse,
  createPaginationMeta,
  buildSearchFilters,
  buildSortOptions,
  generateSKU,
  sanitizeInput,
  calculateInventoryStats,
  formatProductResponse,
  formatProductsList,
  validateStockOperation,
  generateSimpleReport,
  normalizeSearchText
};