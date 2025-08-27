const { ValidationError, UniqueConstraintError, ForeignKeyConstraintError } = require('sequelize');

// Clase para errores personalizados
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Función para manejar errores de Sequelize
const handleSequelizeError = (error) => {
  let message = 'Error en la base de datos';
  let statusCode = 500;

  if (error instanceof ValidationError) {
    // Errores de validación de Sequelize
    statusCode = 400;
    const errors = error.errors.map(err => ({
      field: err.path,
      message: err.message,
      value: err.value
    }));
    
    return {
      statusCode,
      message: 'Errores de validación',
      errors
    };
  }

  if (error instanceof UniqueConstraintError) {
    // Errores de restricción única
    statusCode = 409;
    const field = error.errors[0]?.path || 'campo';
    message = `El ${field} ya existe`;
    
    return {
      statusCode,
      message,
      field: error.errors[0]?.path,
      value: error.errors[0]?.value
    };
  }

  if (error instanceof ForeignKeyConstraintError) {
    // Errores de clave foránea
    statusCode = 400;
    message = 'Referencia inválida a registro relacionado';
    
    return {
      statusCode,
      message
    };
  }

  // Error genérico de Sequelize
  return {
    statusCode: 500,
    message: 'Error interno en la base de datos'
  };
};

// Función para manejar errores en desarrollo
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    error: {
      status: err.status,
      message: err.message,
      stack: err.stack,
      details: err.details || null,
      errors: err.errors || null
    }
  });
};

// Función para manejar errores en producción
const sendErrorProd = (err, res) => {
  // Error operacional confiable: enviar mensaje al cliente
  if (err.isOperational) {
    const response = {
      success: false,
      message: err.message
    };

    // Agregar errores adicionales si existen
    if (err.errors) {
      response.errors = err.errors;
    }
    
    if (err.field) {
      response.field = err.field;
    }

    res.status(err.statusCode).json(response);
  } else {
    // Error de programación: no filtrar detalles
    console.error('ERROR 💥:', err);
    
    res.status(500).json({
      success: false,
      message: 'Algo salió mal en el servidor'
    });
  }
};

// Middleware principal de manejo de errores
const errorHandler = (err, req, res, next) => {
  // Establecer valores por defecto
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log del error
  if (process.env.NODE_ENV === 'development') {
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode,
      url: req.url,
      method: req.method,
      body: req.body,
      params: req.params,
      query: req.query
    });
  }

  // Manejar errores específicos de Sequelize
  if (err.name === 'SequelizeValidationError' || 
      err.name === 'SequelizeUniqueConstraintError' || 
      err.name === 'SequelizeForeignKeyConstraintError') {
    
    const sequelizeError = handleSequelizeError(err);
    err = new AppError(sequelizeError.message, sequelizeError.statusCode);
    err.errors = sequelizeError.errors;
    err.field = sequelizeError.field;
  }

  // Manejar errores de conexión a la base de datos
  if (err.name === 'SequelizeConnectionError') {
    err = new AppError('Error de conexión a la base de datos', 503);
  }

  // Manejar errores de timeout
  if (err.name === 'SequelizeTimeoutError') {
    err = new AppError('Tiempo de espera agotado en la base de datos', 408);
  }

  // Manejar errores de sintaxis JSON
  if (err.name === 'SyntaxError' && err.message.includes('JSON')) {
    err = new AppError('Formato JSON inválido', 400);
  }

  // Manejar errores de cast (conversión de tipos)
  if (err.name === 'CastError') {
    err = new AppError('Formato de dato inválido', 400);
  }

  // Enviar respuesta de error
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    sendErrorProd(err, res);
  }
};

// Middleware para manejar rutas no encontradas
const notFound = (req, res, next) => {
  const err = new AppError(`Ruta ${req.originalUrl} no encontrada`, 404);
  next(err);
};

// Función para capturar errores asíncronos
const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Función para crear errores personalizados
const createError = (message, statusCode = 500) => {
  return new AppError(message, statusCode);
};

// Manejador de errores no capturados
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
});

// Manejador de promesas rechazadas no capturadas
process.on('unhandledRejection', (err, promise) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error('Error:', err.message);
  console.error('Promise:', promise);
  process.exit(1);
});

module.exports = {
  AppError,
  errorHandler,
  notFound,
  catchAsync,
  createError,
  handleSequelizeError
};