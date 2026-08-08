import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Product', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  category: { type: DataTypes.STRING },
  sellingPrice: { type: DataTypes.DECIMAL(14, 2), allowNull: false, field: 'selling_price' },
  costPrice: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0, field: 'cost_price' },
  stockUnit: { type: DataTypes.STRING, defaultValue: 'unit', field: 'stock_unit' },
  lowStockThreshold: { type: DataTypes.DECIMAL(14, 3), defaultValue: 0, field: 'low_stock_threshold' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'products', timestamps: true, createdAt: 'created_at', updatedAt: false })
