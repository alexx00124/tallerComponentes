const Joi = require('joi');

// Esquemas de validación
const productSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .required()
    .messages({
      'string.empty': 'El nombre es requerido',
      'string.min': 'El nombre debe tener al menos 2 caracteres',
      'string.max': 'El nombre no puede exceder 255 caracteres',
      'any.required': 'El nombre es requerido'
    }),
  
  sku: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9-_]+$/)
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.empty': 'El SKU es requerido',
      'string.pattern.base': 'El SKU solo puede contener letras mayúsculas, números, guiones y guiones bajos',
      'string.min': 'El SKU debe tener al menos 2 caracteres',
      'string.max': 'El SKU no puede exceder 50 caracteres',
      'any.required': 'El SKU es requerido'
    }),
  
  description: Joi.string()
    .trim()
    .max(1000)
    .allow('')
    .optional()
    .messages({
      'string.max': 'La descripción no puede exceder 1000 caracteres'
    }),
  
  price: Joi.number()
    .positive()
    .precision(2)
    .required()
    .messages({
      'number.positive': 'El precio debe ser mayor a 0',
      'number.precision': 'El precio puede tener máximo 2 decimales',
      'any.required': 'El precio es requerido'
    }),
  
  cost: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .messages({
      'number.min': 'El costo no puede ser negativo',
      'number.precision': 'El costo puede tener máximo 2 decimales'
    }),
  
  stock: Joi.number()
    .integer()
    .min(0)
    .required()
    .messages({
      'number.integer': 'El stock debe ser un número entero',
      'number.min': 'El stock no puede ser negativo',
      'any.required': 'El stock es requerido'
    }),
  
  min_stock: Joi.number()
    .integer()
    .min(0)
    .optional()
    .messages({
      'number.integer': 'El stock mínimo debe ser un número entero',
      'number.min': 'El stock mínimo no puede ser negativo'
    }),
  
  category: Joi.string()
    .trim()
    .max(100)
    .allow('')
    .optional()
    .messages({
      'string.max': 'La categoría no puede exceder 100 caracteres'
    }),
  
  brand: Joi.string()
    .trim()
    .max(100)
    .allow('')
    .optional()
    .messages({
      'string.max': 'La marca no puede exceder 100 caracteres'
    }),
  
  is_active: Joi.boolean()
    .optional()
    .messages({
      'boolean.base': 'is_active debe ser true o false'
    }),
  
  image_url: Joi.string()
    .uri()
    .max(500)
    .allow('')
    .optional()
    .messages({
      'string.uri': 'La URL de la imagen debe ser válida',
      'string.max': 'La URL de la imagen no puede exceder 500 caracteres'
    })
});

// Esquema para actualización (todos los campos opcionales excepto validaciones específicas)
const productUpdateSchema = productSchema.fork(
  ['name', 'sku', 'price', 'stock'],
  (schema) => schema.optional()
);

// Esquema para consultas
const querySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .optional()
    .default(1)
    .messages({
      'number.integer': 'La página debe ser un número entero',
      'number.min': 'La página debe ser mayor a 0'
    }),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .messages({
      'number.integer': 'El límite debe ser un número entero',
      'number.min': 'El límite debe ser mayor a 0',
      'number.max': 'El límite no puede exceder 100'
    }),
  
  search: Joi.string()
    .trim()
    .max(255)
    .optional()
    .messages({
      'string.max': 'El término de búsqueda no puede exceder 255 caracteres'
    }),
  
  category: Joi.string()
    .trim()
    .max(100)
    .optional()
    .messages({
      'string.max': 'La categoría no puede exceder 100 caracteres'
    }),
  
  brand: Joi.string()
    .trim()
    .max(100)
    .optional()
    .messages({
      'string.max': 'La marca no puede exceder 100 caracteres'
    }),
  
  is_active: Joi.boolean()
    .optional()
    .messages({
      'boolean.base': 'is_active debe ser true o false'
    }),
  
  sort_by: Joi.string()
    .valid('name', 'sku', 'price', 'stock', 'created_at', 'updated_at')
    .optional()
    .default('created_at')
    .messages({
      'any.only': 'sort_by debe ser uno de: name, sku, price, stock, created_at, updated_at'
    }),
  
  sort_order: Joi.string()
    .valid('ASC', 'DESC', 'asc', 'desc')
    .optional()
    .default('DESC')
    .messages({
      'any.only': 'sort_order debe ser ASC o DESC'
    }),
  
  low_stock: Joi.boolean()
    .optional()
    .messages({
      'boolean.base': 'low_stock debe ser true o false'
    })
});

// Middleware de validación genérico
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      return res.status(400).json({
        success: false,
        message: 'Errores de validación',
        errors
      });
    }

    // Reemplazar el objeto original con el valor validado y limpio
    req[property] = value;
    next();
  };
};

// Middleware específicos
const validateProduct = validate(productSchema, 'body');
const validateProductUpdate = validate(productUpdateSchema, 'body');
const validateQuery = validate(querySchema, 'query');

// Middleware para validar UUID
const validateUUID = (req, res, next) => {
  const { id } = req.params;
  
  const uuidSchema = Joi.string()
    .uuid({ version: 'uuidv4' })
    .required()
    .messages({
      'string.guid': 'El ID debe ser un UUID válido',
      'any.required': 'El ID es requerido'
    });

  const { error } = uuidSchema.validate(id);

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'ID inválido',
      error: error.details[0].message
    });
  }

  next();
};

// Middleware para validar operaciones de stock
const validateStockOperation = (req, res, next) => {
  const stockSchema = Joi.object({
    quantity: Joi.number()
      .integer()
      .positive()
      .required()
      .messages({
        'number.integer': 'La cantidad debe ser un número entero',
        'number.positive': 'La cantidad debe ser mayor a 0',
        'any.required': 'La cantidad es requerida'
      }),
    
    operation: Joi.string()
      .valid('add', 'subtract')
      .required()
      .messages({
        'any.only': 'La operación debe ser "add" o "subtract"',
        'any.required': 'La operación es requerida'
      }),
    
    reason: Joi.string()
      .trim()
      .max(255)
      .optional()
      .messages({
        'string.max': 'La razón no puede exceder 255 caracteres'
      })
  });

  const { error, value } = stockSchema.validate(req.body);

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Errores de validación en operación de stock',
      errors
    });
  }

  req.body = value;
  next();
};

module.exports = {
  validate,
  validateProduct,
  validateProductUpdate,
  validateQuery,
  validateUUID,
  validateStockOperation,
  productSchema,
  productUpdateSchema,
  querySchema
};