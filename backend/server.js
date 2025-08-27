const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Importar configuración de base de datos
const { testConnection, syncDatabase } = require('./config/database');

// Importar middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Importar rutas
const productsRoutes = require('./routes/products');

// Crear aplicación Express
const app = express();

// Configuración del puerto
const PORT = process.env.PORT || 3001;

// Configuración de CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
};

// Middlewares globales
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
})); // Seguridad
app.use(cors(corsOptions)); // CORS
app.use(morgan('combined')); // Logging de requests
app.use(express.json({ limit: '10mb' })); // Parser JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parser URL-encoded

// Middleware para agregar headers de respuesta
app.use((req, res, next) => {
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Powered-By', 'Inventory Management System');
  next();
});

// Ruta de health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API funcionando correctamente',
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime()
    }
  });
});

// Ruta raíz con información de la API
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Bienvenido al API de Gestión de Inventarios',
    data: {
      api_name: 'Inventory Management API',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      endpoints: {
        products: '/api/products',
        health: '/health',
        documentation: '/api/docs'
      },
      features: [
        'CRUD de productos',
        'Búsqueda y filtrado avanzado',
        'Gestión de stock',
        'Reportes de inventario',
        'Validación de datos',
        'Paginación',
        'Soft deletes',
        'Estadísticas de inventario'
      ]
    }
  });
});

// Rutas de la API
app.use('/api/products', productsRoutes);

// Ruta para documentación (placeholder)
app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    message: 'Documentación de la API',
    data: {
      title: 'Inventory Management API Documentation',
      version: '1.0.0',
      description: 'API RESTful para gestión de inventarios',
      base_url: `${req.protocol}://${req.get('host')}`,
      endpoints: {
        'GET /api/products': 'Obtener todos los productos con paginación y filtros',
        'GET /api/products/:id': 'Obtener un producto específico',
        'POST /api/products': 'Crear un nuevo producto',
        'PUT /api/products/:id': 'Actualizar un producto completamente',
        'PATCH /api/products/:id': 'Actualizar un producto parcialmente',
        'PATCH /api/products/:id/stock': 'Actualizar stock de un producto',
        'DELETE /api/products/:id': 'Eliminar un producto (soft delete)',
        'POST /api/products/:id/restore': 'Restaurar un producto eliminado',
        'GET /api/products/stats': 'Obtener estadísticas del inventario',
        'GET /api/products/reports/:type': 'Generar reportes',
        'GET /api/products/search': 'Búsqueda avanzada',
        'GET /health': 'Verificar estado de la API'
      },
      query_parameters: {
        page: 'Número de página (default: 1)',
        limit: 'Elementos por página (default: 10, max: 100)',
        search: 'Término de búsqueda',
        category: 'Filtrar por categoría',
        brand: 'Filtrar por marca',
        is_active: 'Filtrar por estado activo (true/false)',
        low_stock: 'Filtrar productos con stock bajo (true/false)',
        sort_by: 'Campo para ordenar (name, sku, price, stock, created_at, updated_at)',
        sort_order: 'Orden de clasificación (ASC, DESC)',
        include_stats: 'Incluir estadísticas en la respuesta (true/false)'
      },
      status_codes: {
        200: 'Operación exitosa',
        201: 'Recurso creado exitosamente',
        400: 'Solicitud incorrecta',
        404: 'Recurso no encontrado',
        409: 'Conflicto (ej: SKU duplicado)',
        422: 'Error de validación',
        500: 'Error interno del servidor'
      }
    }
  });
});

// Middleware para rutas no encontradas
app.use(notFound);

// Middleware de manejo de errores
app.use(errorHandler);

// Función para iniciar el servidor
const startServer = async () => {
  try {
    console.log('🚀 Iniciando servidor...');
    
    // Probar conexión a la base de datos
    await testConnection();
    
    // Sincronizar modelos con la base de datos
    const shouldReset = process.env.NODE_ENV === 'development' && process.argv.includes('--reset-db');
    await syncDatabase(shouldReset);
    
    if (shouldReset) {
      console.log('🔄 Base de datos reiniciada (modo desarrollo)');
    }

    // Iniciar servidor
    const server = app.listen(PORT, () => {
      console.log(`✅ Servidor iniciado en puerto ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`📚 Documentación: http://localhost:${PORT}/api/docs`);
      console.log(`❤️  Health check: http://localhost:${PORT}/health`);
      console.log(`📦 API Productos: http://localhost:${PORT}/api/products`);
      console.log(`🛠️  Ambiente: ${process.env.NODE_ENV || 'development'}`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('\n💡 Comandos útiles:');
        console.log('   npm run dev     - Ejecutar en modo desarrollo');
        console.log('   npm test        - Ejecutar pruebas');
        console.log('   npm run test:coverage - Ejecutar pruebas con cobertura');
      }
    });

    // Manejo graceful de cierre del servidor
    const gracefulShutdown = (signal) => {
      console.log(`\n📴 Recibida señal ${signal}, cerrando servidor...`);
      
      server.close(() => {
        console.log('✅ Servidor HTTP cerrado.');
        
        // Cerrar conexión a la base de datos
        require('./config/database').sequelize.close().then(() => {
          console.log('✅ Conexión a la base de datos cerrada.');
          process.exit(0);
        }).catch((error) => {
          console.error('❌ Error al cerrar la conexión a la base de datos:', error);
          process.exit(1);
        });
      });
    };

    // Escuchar señales de terminación
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
};

// Iniciar el servidor solo si no estamos en modo de prueba
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

// Exportar app para pruebas
module.exports = app;