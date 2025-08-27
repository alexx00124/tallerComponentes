const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Product extends Model {
  // Método para obtener información básica del producto
  getBasicInfo() {
    return {
      id: this.id,
      name: this.name,
      sku: this.sku,
      price: this.price,
      stock: this.stock
    };
  }

  // Método para verificar si hay stock disponible
  hasStock(quantity = 1) {
    return this.stock >= quantity;
  }

  // Método para actualizar stock
  async updateStock(quantity, operation = 'subtract') {
    if (operation === 'subtract') {
      if (this.stock < quantity) {
        throw new Error('Stock insuficiente');
      }
      this.stock -= quantity;
    } else if (operation === 'add') {
      this.stock += quantity;
    }
    
    return await this.save();
  }

  // Método estático para buscar productos con stock bajo
  static async findLowStock(threshold = 10) {
    return await this.findAll({
      where: {
        stock: {
          [require('sequelize').Op.lte]: threshold
        }
      },
      order: [['stock', 'ASC']]
    });
  }
}

// Definición del modelo
Product.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'El nombre del producto no puede estar vacío'
      },
      len: {
        args: [2, 255],
        msg: 'El nombre debe tener entre 2 y 255 caracteres'
      }
    }
  },
  sku: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: {
      name: 'unique_sku',
      msg: 'El SKU ya existe'
    },
    validate: {
      notEmpty: {
        msg: 'El SKU no puede estar vacío'
      },
      is: {
        args: /^[A-Z0-9-_]+$/,
        msg: 'El SKU solo puede contener letras mayúsculas, números, guiones y guiones bajos'
      }
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    validate: {
      len: {
        args: [0, 1000],
        msg: 'La descripción no puede exceder los 1000 caracteres'
      }
    }
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      isDecimal: {
        msg: 'El precio debe ser un número decimal válido'
      },
      min: {
        args: 0,
        msg: 'El precio no puede ser negativo'
      }
    },
    get() {
      const value = this.getDataValue('price');
      return value ? parseFloat(value) : 0;
    }
  },
  cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      isDecimal: {
        msg: 'El costo debe ser un número decimal válido'
      },
      min: {
        args: 0,
        msg: 'El costo no puede ser negativo'
      }
    },
    get() {
      const value = this.getDataValue('cost');
      return value ? parseFloat(value) : 0;
    }
  },
  stock: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      isInt: {
        msg: 'El stock debe ser un número entero'
      },
      min: {
        args: 0,
        msg: 'El stock no puede ser negativo'
      }
    }
  },
  min_stock: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 5,
    validate: {
      isInt: {
        msg: 'El stock mínimo debe ser un número entero'
      },
      min: {
        args: 0,
        msg: 'El stock mínimo no puede ser negativo'
      }
    }
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
    validate: {
      len: {
        args: [0, 100],
        msg: 'La categoría no puede exceder los 100 caracteres'
      }
    }
  },
  brand: {
    type: DataTypes.STRING(100),
    allowNull: true,
    validate: {
      len: {
        args: [0, 100],
        msg: 'La marca no puede exceder los 100 caracteres'
      }
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  image_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    validate: {
      isUrl: {
        msg: 'La URL de la imagen debe ser válida'
      }
    }
  }
}, {
  sequelize,
  modelName: 'Product',
  tableName: 'products',
  timestamps: true,
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['sku']
    },
    {
      fields: ['category']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['stock']
    }
  ],
  hooks: {
    beforeValidate: (product) => {
      // Convertir SKU a mayúsculas
      if (product.sku) {
        product.sku = product.sku.toUpperCase().trim();
      }
      // Limpiar espacios en el nombre
      if (product.name) {
        product.name = product.name.trim();
      }
    }
  }
});

module.exports = Product;